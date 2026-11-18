"""Render stable game state and single-player decisions over the clean board footage."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import gzip
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR, REPLAY_DIR
from v2.render_games import FrameWriter, face

import av
import cv2
import numpy as np
from PIL import Image, ImageDraw

OUT = REPLAY_DIR
BASE = ARTIFACT_DIR / "v2"
FPS = 25
WIDTH, HEIGHT = 1920, 1080
BX, BY, BW, BH = 32, 88, 928, 696
RX, RY, RW, RH = 984, 88, 904, 960
BG = "#10151c"
CARD = "#1a232e"
LINE = "#344353"
TEXT = "#f1f5fa"
MUTED = "#b5c3d1"
WHITE = "#f5e4be"
BLACK = "#afcfff"
GREEN = "#91dfbb"
AMBER = "#ffd291"
COLUMNS = (81, 115, 152, 187, 222, 256, 316, 350, 386, 421, 456, 491)
PLAYER_NAME = {"white": "White", "dark": "Black"}
PLAYER_TONE = {"white": WHITE, "dark": BLACK}
TOP_MOVES = 5
DIE_PIPS = {
    1: ((0, 0),),
    2: ((-1, -1), (1, 1)),
    3: ((-1, -1), (0, 0), (1, 1)),
    4: ((-1, -1), (1, -1), (-1, 1), (1, 1)),
    5: ((-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)),
    6: ((-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)),
}


def write(draw, x, y, text, size, fill=TEXT, bold=False, anchor=None):
    draw.text((x, y), str(text), font=face(size, bold), fill=fill, anchor=anchor)


def card(width, height):
    canvas = Image.new("RGB", (width, height), CARD)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, width - 1, height - 1), outline=LINE)
    return canvas, draw


def bgr(image):
    return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)


def percent(probability):
    return f"{probability * 100:.1f}%"


def activity(phase, player):
    name = PLAYER_NAME.get(player)
    if phase == "pre-roll":
        return f"{name} to roll"
    if phase == "move":
        return f"{name} on roll"
    if phase == "played":
        return f"{name} played"
    if phase == "cube-response":
        return f"{name} to respond"
    if phase == "cube-result":
        return "Cube response"
    return {"opening": "Opening toss", "game-closed": "Game finished",
            "between-rolls": "Between rolls"}[phase]


def status_panel(state):
    image, draw = card(BW, 76)
    phase, player, roll, cube = (state[k] for k in ("phase", "player", "roll", "cube"))
    write(draw, 18, 23, activity(phase, player), 26, PLAYER_TONE.get(player, TEXT), True)
    draw.line((281, 10, 281, 65), fill=LINE)
    draw.line((690, 10, 690, 65), fill=LINE)
    if roll:
        owner = PLAYER_NAME[roll["player"]]
        label = f"{owner}'s {'last roll' if roll['status'] == 'last' else 'roll'}"
        write(draw, 299, 24, label, 22, PLAYER_TONE[roll["player"]], True)
        dice = sorted(roll["dice"] or [None, None], key=lambda d: d or 0, reverse=True)
        for i, number in enumerate(dice):
            x = 557 + i * 57
            is_white = roll["player"] == "white"
            fill, ink = (WHITE, BG) if is_white else (BG, TEXT)
            draw.rounded_rectangle((x, 14, x + 50, 62), radius=8, fill=fill, outline=MUTED, width=2)
            for dx, dy in DIE_PIPS.get(number, ()):
                px, py = x + 25 + 12 * dx, 38 + 12 * dy
                draw.ellipse((px - 3.5, py - 3.5, px + 3.5, py + 3.5), fill=ink)
            if number is None:
                write(draw, x + 25, 37, "?", 25, ink, True, "mm")
    else:
        write(draw, 299, 24, "Roll pending" if phase in ("pre-roll", "opening") else "Roll", 22, MUTED)
        write(draw, 617, 23, "—", 23, MUTED, anchor="ra")
    write(draw, 709, 25, "Cube", 21, MUTED, True)
    value = str(cube["stake"] or cube.get("face") or "—") if cube else "—"
    if cube and cube["offered"]:
        value += f" → {cube['offered']}"
    write(draw, 907, 21, value, 29, AMBER if cube and cube["offered"] else TEXT, True, "ra")
    return bgr(image)


def equity_panel(position, loss, carried):
    image, draw = card(BW, 166)
    write(draw, 18, 13, "Game equity", 24, bold=True)
    if position and position["equities"]:
        write(draw, BW - 17, 20, "Last evaluated position" if carried else "Settled position",
              17, MUTED, anchor="ra")
    columns = [(207, "Equity"), (310, "Win"), (424, "Single"), (539, "Gammon"),
               (658, "Backgammon"), (792, "Total EV loss")]
    for x, label in columns:
        write(draw, x, 53, label, 16, MUTED, bold=True)
    draw.line((18, 77, BW - 18, 77), fill=LINE)
    equities = position.get("equities") if position else None
    for i, player in enumerate(("white", "dark")):
        y = 87 + i * 35
        write(draw, 18, y, PLAYER_NAME[player], 23, PLAYER_TONE[player], True)
        if equities:
            row = equities["players"][i]
            values = [f"{row['equity']:+.3f}", percent(sum(row["chances"])),
                      *(percent(chance) for chance in row["chances"])]
        else:
            values = ["—"] * 5
        for (x, _), value in zip(columns, values):
            write(draw, x, y, value, 21)
        write(draw, columns[-1][0], y, f"{loss[player]['loss']:.3f}", 21, AMBER, True)
    return bgr(image)


def notation(value):
    return value.replace("Pass — no legal move", "Pass")


def action_panel(state, entry):
    image, draw = card(RW, RH)
    x = 24
    phase, player = state["phase"], state["player"]
    roll = state.get("roll")
    write(draw, x, 23, "Decision analysis", 25, bold=True)
    if not entry:
        line = activity(phase, player)
        write(draw, x, 86, line, 40, PLAYER_TONE.get(player, TEXT), True)
        if phase in ("move", "played"):
            reason = "Waiting for a settled checker position" if roll and roll["dice"] and all(roll["dice"]) else "Roll faces unavailable"
        elif phase == "game-closed":
            reason = "Final EV loss is shown in the game equity panel."
        elif phase == "between-rolls":
            reason = "Waiting for the next identifiable roll."
        else:
            reason = "Action EVs appear when the roll settles."
        write(draw, x, 153, reason, 22, MUTED)
        return bgr(image)
    if state["decision"] == "cube":
        offerer = PLAYER_NAME[entry["offerer"]]
        write(draw, x, 85, f"{offerer} offers {entry['preOfferStake']} → {entry['offeredFace']}", 35, WHITE, True)
        label = activity(phase, player)
        if phase == "cube-result":
            label = f"{PLAYER_NAME[player]} takes" if entry.get("reply") == "take" else "Reply unconfirmed"
        write(draw, x, 143, label, 24, PLAYER_TONE.get(player, MUTED), True)
        if not entry.get("options"):
            write(draw, x, 227, "Awaiting a verified board position", 25, MUTED)
            return bgr(image)
        write(draw, x, 227, "Best cube action", 19, MUTED, True)
        write(draw, x, 263, entry["recommendation"], 40, GREEN, True)
        write(draw, x, 334, f"Best reply   {entry['bestReply']}", 25)
        write(draw, RW - x, 334, f"Offer EV loss   {entry['offerEvLoss']:.3f}", 25, AMBER, True, "ra")
        draw.line((x, 400, RW - x, 400), fill=LINE)
        write(draw, x, 424, "Action", 20, MUTED, True)
        write(draw, RW - x, 424, "EV", 20, MUTED, True, "ra")
        label = "Double" if entry["preOfferStake"] == 1 else "Redouble"
        options = [(f"No {label.lower()}", "noDouble"), (f"{label} / take", "take"), (f"{label} / pass", "pass")]
        for i, (action, key) in enumerate(options):
            write(draw, x, 474 + i * 55, action, 25)
            write(draw, RW - x, 474 + i * 55, f"{entry['options'][key]:+.3f}", 25, anchor="ra")
        return bgr(image)

    player = entry["player"]
    dice = "–".join(map(str, sorted(entry["dice"], reverse=True)))
    write(draw, x, 77, f"{PLAYER_NAME[player]} {'rolled' if phase == 'played' else 'rolls'} {dice}", 38,
          PLAYER_TONE[player], True)
    if "inferred-from-moves" in entry.get("evidence", ""):
        write(draw, x, 127, "Roll inferred from play", 19, MUTED)
    moves = entry["actions"][:TOP_MOVES]
    draw.line((x, 187, RW - x, 187), fill=LINE)
    write(draw, x, 219, "Top moves", 24, MUTED, True)
    write(draw, RW - x, 219, "EV", 24, MUTED, True, "ra")
    for rank, move in enumerate(moves, 1):
        y = 287 + (rank - 1) * 82
        played = move["isPlayed"] and phase == "played"
        if rank == 1 or played:
            fill = "#25413d" if rank == 1 else "#443d35"
            draw.rounded_rectangle((x - 5, y - 10, RW - x + 5, y + 43), radius=6, fill=fill)
        tone = GREEN if rank == 1 else AMBER if played else TEXT
        write(draw, x + 8, y, rank, 24, tone, True)
        write(draw, x + 63, y, notation(move["notation"]), 29, tone, rank == 1)
        write(draw, RW - x, y, f"{move['equity4']:+.3f}", 29, tone, rank == 1, "ra")
    if phase == "played" and entry["played"]:
        draw.line((x, 705, RW - x, 705), fill=LINE)
        played = (f"Played   {notation(entry['played']['notation'])}"
                  if any(a["isPlayed"] for a in moves) else "Played outside top five")
        write(draw, x, 733, played, 25)
        loss_label = "EV loss" if entry["countedInGameLoss"] else "Estimated EV loss"
        write(draw, RW - x, 733, f"{loss_label}   {entry['evLoss']:.3f}", 24, AMBER, True, "ra")
    return bgr(image)


@lru_cache(maxsize=256)
def point_marks(counts):
    marks = []
    for point, value in enumerate(counts, 1):
        if not value:
            continue
        x = COLUMNS[12 - point if point <= 12 else point - 13] * BW / 560
        y = 25 if point <= 12 else BH - 25
        marks.append((x, y, abs(value), value > 0))
    layer = Image.new("RGBA", (BW, BH))
    draw = ImageDraw.Draw(layer)
    for x, y, count, white in marks:
        fill, ink, outline = (WHITE, BG, "#56483b") if white else ("#172331", TEXT, BLACK)
        draw.rounded_rectangle((x - 19, y - 16, x + 19, y + 16), radius=8, fill=fill,
                               outline=outline, width=2)
        write(draw, x, y, count, 23, ink, True, "mm")
    rgba = np.asarray(layer)
    ys, xs = np.nonzero(rgba[:, :, 3])
    return ys, xs, rgba[ys, xs, :3][:, ::-1]


def board_image(frame, points):
    pixels = cv2.resize(frame.to_ndarray(format="bgr24"), (BW, BH), interpolation=cv2.INTER_LINEAR)
    if points is not None:
        y, x, color = point_marks(tuple(points))
        pixels[y, x] = color
    return pixels


def header(number, frame, description=None):
    image = Image.new("RGB", (WIDTH, BY), BG)
    draw = ImageDraw.Draw(image)
    seconds = frame // FPS
    write(draw, 32, 21, f"Office-3 Backgammon   /   Game {number:02}", 34, bold=True)
    label = description or f"{seconds // 60:02}:{seconds % 60:02}"
    write(draw, WIDTH - 32, 32, label, 21, MUTED, anchor="ra")
    return bgr(image)


def rows(file):
    with gzip.open(file, "rt") as stream:
        yield from map(json.loads, stream)


def game_frames(game, start=0):
    for seg in game["segments"]:
        first = max(seg["firstFrame"], seg["firstFrame"] + start - seg["firstGameFrame"])
        if first >= seg["lastExclusive"]:
            continue
        with av.open(str(ARTIFACT_DIR / "board" / seg["source"])) as media:
            media.streams.video[0].codec_context.thread_count = 1
            for frame, image in enumerate(media.decode(video=0)):
                if frame >= seg["lastExclusive"]:
                    break
                if frame >= first:
                    yield seg["firstGameFrame"] + frame - seg["firstFrame"], image


def render(number, limit, software):
    game = json.loads((BASE / f"game-{number}-analysis.json").read_text())
    prefix = f"game-{number:02}"
    data = json.loads((OUT / f"{prefix}-game.json").read_text())
    if data["scoringDepth"] != 4:
        raise ValueError("Replay data must have complete four-ply evaluation")
    footage = game["frames"] if limit is None else min(game["frames"], limit * FPS)
    folder = OUT / "games"
    folder.mkdir(exist_ok=True)
    name = prefix + ("-preview" if limit else "-analysis")
    staging = folder / f".{name}-mux.mp4"
    final = folder / f"{name}.mp4"
    audio = BASE / "games" / f"{prefix}-analysis.mp4"
    muxer = subprocess.Popen([
        "ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "mp4", "-i", "pipe:0",
        "-t", f"{footage / FPS:.2f}", "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
        "-movflags", "+faststart", str(staging),
    ], stdin=subprocess.PIPE)
    try:
        frame_count = render_frames(muxer.stdin, data, game, number, footage, software)
    finally:
        muxer.stdin.close()
        status = muxer.wait()
    if status:
        raise RuntimeError(f"Game {number} audio mux failed with exit code {status}")
    staging.replace(final)
    print(json.dumps({"game": number, "footageFrames": footage, "outputFrames": frame_count,
                      "video": str(final)}), flush=True)


def render_frames(output, data, game, number, footage, software, start=0):
    prefix = f"game-{number:02}"
    writer = FrameWriter(output, software, bitrate=2_450_000)
    canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    canvas[:] = (28, 21, 16)
    board_region = canvas[BY:BY + BH, BX:BX + BW]
    status_region = canvas[792:868, BX:BX + BW]
    equity_region = canvas[882:1048, BX:BX + BW]
    right_region = canvas[RY:RY + RH, RX:RX + RW]
    status_key = right_key = equity_key = None
    evaluated_position = None
    decisions = data["decisions"]

    states = rows(OUT / f"{prefix}-state.jsonl.gz")
    for _ in range(start):
        state = next(states)
        position = data["positions"].get(str(state["position"]))
        if position and position["equities"]:
            evaluated_position = position
        if position is None or state["phase"] == "game-closed":
            evaluated_position = None
    for (index, frame), state in zip(game_frames(game, start), states):
        if index >= footage:
            break
        if state["frame"] != index:
            raise RuntimeError("Board footage and timeline frame mismatch")
        position = data["positions"].get(str(state["position"]))
        if position and position["equities"]:
            evaluated_position = position
        if position is None or state["phase"] == "game-closed":
            evaluated_position = None
        points = state.get("displayPoints")
        if points is None and position:
            points = [white - black for white, black in position["points"]]
        board_region[:] = board_image(frame, None if state["phase"] == "game-closed" else points)
        if index == start or index % FPS == 0:
            canvas[:BY] = header(number, index)
        key = state["phase"], state["player"], state["roll"], state["cube"]
        if key != status_key:
            status_region[:] = status_panel(state)
            status_key = key
        key = id(evaluated_position), position is not evaluated_position, state["loss"]
        if key != equity_key:
            equity_region[:] = equity_panel(evaluated_position, state["loss"], position is not evaluated_position)
            equity_key = key
        key = state["phase"], state["player"], state["decision"], state["roll"] if state["decision"] is None else None
        if key != right_key:
            right_region[:] = action_panel(state, decisions.get(str(state["decision"])))
            right_key = key
        writer.write(canvas)
    if writer.frame_count != footage - start:
        raise RuntimeError(f"Game {number} has {writer.frame_count} of {footage - start} requested frames")
    writer.close()
    return writer.frame_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("games", nargs="*", type=int, default=range(1, 6))
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--preview", type=int, metavar="SECONDS")
    parser.add_argument("--software", action="store_true")
    args = parser.parse_args()
    cv2.setNumThreads(1)
    with ThreadPoolExecutor(max_workers=args.jobs) as workers:
        list(workers.map(lambda game: render(game, args.preview, args.software), args.games))


if __name__ == "__main__":
    main()
