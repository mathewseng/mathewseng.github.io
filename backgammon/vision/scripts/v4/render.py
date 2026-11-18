"""Render stable game state and single-player decisions over the clean board footage."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import gzip
import json
import math
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from v2.render_games import FrameWriter, face

import av
import cv2
import numpy as np
from PIL import Image, ImageDraw

OUT = ARTIFACT_DIR / "v4"
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
PAGE_SIZE = 24
REVIEW_SECONDS = 4


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
        for i, number in enumerate(roll["dice"] or [None, None]):
            x = 557 + i * 57
            draw.rounded_rectangle((x, 14, x + 50, 62), radius=7, fill="#344252")
            write(draw, x + 25, 37, number if number is not None else "?", 26, TEXT, True, "mm")
    else:
        write(draw, 299, 24, "Roll pending" if phase in ("pre-roll", "opening") else "Roll", 22, MUTED)
        write(draw, 617, 23, "—", 23, MUTED, anchor="ra")
    write(draw, 709, 25, "Cube", 21, MUTED, True)
    value = "—" if not cube else str(cube["stake"])
    if cube and cube["offered"]:
        value += f" → {cube['offered']}"
    write(draw, 907, 21, value, 29, AMBER if cube and cube["offered"] else TEXT, True, "ra")
    return bgr(image)


def equity_panel(position, loss, carried):
    image, draw = card(BW, 166)
    write(draw, 18, 13, "Game equity", 24, bold=True)
    if position and position["equities"]:
        write(draw, BW - 17, 20, "Last evaluated position · 3 ply" if carried else "Settled position · 3 ply",
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


def action_panel(state, entry, page=0, review=False):
    image, draw = card(RW, RH)
    x = 24
    phase, player = state["phase"], state["player"]
    roll = state.get("roll")
    write(draw, x, 23, "Decision review" if review else "Decision analysis", 25, bold=True)
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
        write(draw, x, 143, activity(phase, player), 24, PLAYER_TONE[player], True)
        write(draw, x, 227, "Best cube action", 19, MUTED, True)
        write(draw, x, 263, entry["recommendation"], 40, GREEN, True)
        write(draw, x, 334, f"Best reply   {entry['bestReply']}", 25)
        write(draw, RW - x, 334, f"Offer EV loss   {entry['offerEvLoss']:.3f}", 25, AMBER, True, "ra")
        draw.line((x, 400, RW - x, 400), fill=LINE)
        write(draw, x, 424, "Action", 20, MUTED, True)
        write(draw, RW - x, 424, "4-ply EV", 20, MUTED, True, "ra")
        options = [("No redouble", "noDouble"), ("Redouble / take", "take"), ("Redouble / pass", "pass")]
        for i, (label, key) in enumerate(options):
            write(draw, x, 474 + i * 55, label, 25)
            write(draw, RW - x, 474 + i * 55, f"{entry['options'][key]:+.3f}", 25, anchor="ra")
        return bgr(image)

    player = entry["player"]
    dice = "–".join(map(str, entry["dice"]))
    write(draw, x, 70, f"{PLAYER_NAME[player]} {'rolled' if phase == 'played' else 'rolls'} {dice}", 36,
          PLAYER_TONE[player], True)
    write(draw, x, 130, "Best move · 4 ply", 19, MUTED, True)
    write(draw, x, 163, notation(entry["best"]["notation"]), 33, GREEN, True)
    write(draw, RW - x, 174, f"{entry['best']['equity']:+.3f} EV", 25, GREEN, True, "ra")
    if (phase == "played" or review) and entry["played"]:
        write(draw, x, 216, f"Played   {notation(entry['played']['notation'])}", 21)
        loss_label = "EV loss" if entry["countedInGameLoss"] else "Estimated EV loss"
        write(draw, RW - x, 216, f"{loss_label}   {entry['evLoss']:.3f}", 21, AMBER, True, "ra")
    draw.line((x, 260, RW - x, 260), fill=LINE)
    all_moves = entry["actions"]
    page_count = max(1, math.ceil(len(all_moves) / PAGE_SIZE))
    moves = all_moves[page * PAGE_SIZE:(page + 1) * PAGE_SIZE]
    column_width = 417
    for col in range(math.ceil(len(moves) / 12)):
        left = x + (column_width + 21) * col
        write(draw, left, 278, "Legal move", 18, MUTED, True)
        write(draw, left + 325, 278, "3 ply", 17, MUTED, True, "ra")
        write(draw, left + column_width, 278, "4 ply", 17, MUTED, True, "ra")
        for j, move in enumerate(moves[col * 12:(col + 1) * 12]):
            y = 321 + j * 42
            played = move["isPlayed"] and (phase == "played" or review)
            if move["isBest"] or played:
                draw.rounded_rectangle((left - 5, y - 4, left + column_width + 5, y + 27),
                                       radius=4, fill="#25413d" if move["isBest"] else "#443d35")
            tone = GREEN if move["isBest"] else AMBER if played else TEXT
            write(draw, left, y, notation(move["notation"]), 19, tone, move["isBest"])
            write(draw, left + 325, y, f"{move['equity3']:+.3f}", 19, anchor="ra")
            value = f"{move['equity4']:+.3f}" if "equity4" in move else "—"
            write(draw, left + column_width, y, value, 19, anchor="ra")
    write(draw, x, 858, f"{len(all_moves)} legal results   ·   Page {page + 1}/{page_count}", 19, TEXT, True)
    write(draw, x, 889, "All results at 3 ply. The top four and observed move are checked at 4 ply.", 17, MUTED)
    if page_count > 1 and not review:
        write(draw, x, 916, "Additional results follow the footage.", 17, MUTED)
    return bgr(image)


@lru_cache(maxsize=256)
def point_marks(counts):
    marks = []
    for point, (white, black) in enumerate(counts, 1):
        count = white or black
        if count == 0:
            continue
        x = COLUMNS[12 - point if point <= 12 else point - 13] * BW / 560
        y = 23 if point <= 12 else BH - 23
        marks.append((x, y, count, WHITE if white else BLACK))
    layer = Image.new("RGBA", (BW, BH))
    draw = ImageDraw.Draw(layer)
    for x, y, count, tone in marks:
        draw.rounded_rectangle((x - 15, y - 13, x + 15, y + 13), radius=6, fill="#16202b", outline=tone)
        write(draw, x, y, count, 18, tone, True, "mm")
    rgba = np.asarray(layer)
    ys, xs = np.nonzero(rgba[:, :, 3])
    return ys, xs, rgba[ys, xs, :3][:, ::-1]


def board_image(frame, position):
    pixels = cv2.resize(frame.to_ndarray(format="bgr24"), (BW, BH), interpolation=cv2.INTER_LINEAR)
    if position:
        y, x, color = point_marks(tuple(map(tuple, position["points"])))
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


def game_frames(game):
    for seg in game["segments"]:
        with av.open(str(ARTIFACT_DIR / "board" / seg["source"])) as media:
            media.streams.video[0].codec_context.thread_count = 1
            for frame, image in enumerate(media.decode(video=0)):
                if frame >= seg["lastExclusive"]:
                    break
                if frame >= seg["firstFrame"]:
                    yield seg["firstGameFrame"] + frame - seg["firstFrame"], image


def mux_audio(video, source, staging, total_frames):
    duration = f"{total_frames / FPS:.2f}"
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(video), "-t", duration,
                    "-i", str(source), "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
                    "-movflags", "+faststart", str(staging)], check=True)


def review_pages(writer, canvas, number, entries, contexts):
    for key, entry in entries.items():
        pixels, pre_state, position = contexts[entry["preMoveFrame"]]
        canvas[:BY] = header(number, entry["preMoveFrame"], f"Review · Pre-move frame {entry['preMoveFrame']:,}")
        canvas[BY:BY + BH, BX:BX + BW] = pixels
        state = {**pre_state, "phase": "played", "player": entry["player"], "decision": int(key), "roll": {
            "status": "current", "player": entry["player"], "dice": entry["dice"],
        }}
        canvas[792:868, BX:BX + BW] = status_panel(state)
        canvas[882:1048, BX:BX + BW] = equity_panel(position, pre_state["loss"], False)
        for page in range(1, math.ceil(len(entry["actions"]) / PAGE_SIZE)):
            canvas[RY:RY + RH, RX:RX + RW] = action_panel(state, entry, page, True)
            for _ in range(REVIEW_SECONDS * FPS):
                writer.write(canvas)


def render(number, limit, software):
    game = json.loads((BASE / f"game-{number}-analysis.json").read_text())
    prefix = f"game-{number:02}"
    data = json.loads((OUT / f"{prefix}-game.json").read_text())
    footage = game["frames"] if limit is None else min(game["frames"], limit * FPS)
    folder = OUT / "games"
    folder.mkdir(exist_ok=True)
    name = prefix + ("-preview" if limit else "-analysis")
    temporary = folder / f".{name}-video.mp4"
    staging = folder / f".{name}-mux.mp4"
    final = folder / f"{name}.mp4"
    writer = FrameWriter(temporary, software)
    canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    canvas[:] = (28, 21, 16)
    board_region = canvas[BY:BY + BH, BX:BX + BW]
    status_region = canvas[792:868, BX:BX + BW]
    equity_region = canvas[882:1048, BX:BX + BW]
    right_region = canvas[RY:RY + RH, RX:RX + RW]
    status_key = right_key = equity_key = None
    evaluated_position = None
    review_contexts = {}
    decisions = data["decisions"]
    extra = {key: row for key, row in decisions.items() if key != "cube" and len(row["actions"]) > PAGE_SIZE}
    capture = {row["preMoveFrame"] for row in extra.values()} if limit is None else set()

    for (index, frame), state in zip(game_frames(game), rows(OUT / f"{prefix}-state.jsonl.gz")):
        if index >= footage:
            break
        if state["frame"] != index:
            raise RuntimeError("Board footage and timeline frame mismatch")
        position = data["positions"].get(str(state["position"]))
        if position and position["equities"]:
            evaluated_position = position
        if position is None or state["phase"] == "game-closed":
            evaluated_position = None
        board_region[:] = board_image(frame, None if state["phase"] == "game-closed" else position)
        if index in capture:
            review_contexts[index] = board_region.copy(), state, position
        if index % FPS == 0:
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
    if writer.frame_count != footage:
        raise RuntimeError(f"Game {number} has {writer.frame_count} of {footage} requested frames")
    if limit is None:
        review_pages(writer, canvas, number, extra, review_contexts)
    writer.close()
    mux_audio(temporary, BASE / "games" / f"{prefix}-analysis.mp4", staging, writer.frame_count)
    staging.replace(final)
    temporary.unlink()
    print(json.dumps({"game": number, "footageFrames": footage, "outputFrames": writer.frame_count,
                      "video": str(final)}), flush=True)


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
