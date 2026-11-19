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
ACTION_HOLD = 2 * FPS
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


def equity_panel(position, loss):
    image, draw = card(BW, 256)
    write(draw, 20, 23, "Game equity", 30, bold=True)
    columns = [(207, "Equity"), (310, "Win"), (424, "Single"), (539, "Gammon"),
               (658, "Backgammon"), (792, "Total EV loss")]
    for x, label in columns:
        write(draw, x, 84, label, 16, MUTED, bold=True)
    draw.line((20, 114, BW - 20, 114), fill=LINE)
    equities = position.get("equities") if position else None
    for i, player in enumerate(("white", "dark")):
        y = 135 + i * 57
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


def dice_label(dice):
    return "–".join(str(die) if die is not None else "?" for die in dice)


def recent_actions(draw, events, active_roll, cube_mode):
    shown = [
        event for event in events
        if (event["kind"] != "roll" or event["roll"] is not active_roll)
        and (event["kind"] != cube_mode)
    ]
    if not shown:
        return
    draw.line((24, 714, RW - 24, 714), fill=LINE)
    write(draw, 24, 738, "Recent actions", 18, MUTED, True)
    for i, event in enumerate(shown):
        y = 773 + i * 44
        player, action = event["player"], event["label"]
        write(draw, 24, y, f"{PLAYER_NAME[player]} {action}", 25, PLAYER_TONE[player])
        if event.get("loss") is not None:
            write(draw, RW - 24, y, f"EV loss   {event['loss']:.3f}", 23, AMBER, True, "ra")


def cube_actions(draw, x, y, player, choices):
    write(draw, x, y, f"{PLAYER_NAME[player]}’s options", 20, MUTED, True)
    write(draw, RW - 185, y, "EV", 20, MUTED, True, "ra")
    write(draw, RW - x, y, "EV loss", 20, MUTED, True, "ra")
    draw.line((x, y + 34, RW - x, y + 34), fill=LINE)
    best = max(value for _, value in choices)
    for i, (label, value) in enumerate(choices):
        y_row = y + 55 + i * 65
        optimal = abs(best - value) < 1e-7
        tone = GREEN if optimal else TEXT
        if optimal:
            draw.rounded_rectangle((x - 5, y_row - 9, RW - x + 5, y_row + 41), radius=6, fill="#25413d")
        write(draw, x + 8, y_row, label, 27, tone, optimal)
        write(draw, RW - 185, y_row, f"{value:+.3f}", 26, tone, optimal, "ra")
        write(draw, RW - x, y_row, f"{max(0, best - value):.3f}", 25, tone, optimal, "ra")


def cube_panel(draw, cube, phase, x, result=None):
    player = cube.get("offerer", cube.get("player"))
    responder = cube.get("responder") or ("white" if player == "dark" else "dark")
    offer = "doubles" if cube["preOfferStake"] == 1 else "redoubles"
    if phase == "wait":
        title, subtitle = f"{PLAYER_NAME[player]}’s cube decision", "Before the roll"
    elif phase == "cube-take":
        title = f"{PLAYER_NAME[responder]} takes"
        subtitle = f"Cube at {cube['offeredFace']}"
    elif phase == "cube-pass":
        title = f"{PLAYER_NAME[responder]} passes"
        points = result["points"]
        subtitle = f"{PLAYER_NAME[result['winner']]} wins {points} {'point' if points == 1 else 'points'}"
    else:
        title = f"{PLAYER_NAME[player]} {offer} to {cube['offeredFace']}"
        subtitle = f"{PLAYER_NAME[responder]} to respond"
    write(draw, x, 82, title, 39, TEXT, True)
    write(draw, x, 146, subtitle, 24, MUTED)
    options = cube.get("options")
    if not options:
        write(draw, x, 227, "Cube analysis unavailable", 25, MUTED)
        return
    action = "Double" if cube["preOfferStake"] == 1 else "Redouble"
    cube_actions(draw, x, 215, player, [
        (f"No {action.lower()}", options["noDouble"]), (action, min(options["take"], options["pass"])),
    ])
    if phase != "wait":
        cube_actions(draw, x, 450, responder, [
            ("Take", -options["take"]), ("Pass", -options["pass"]),
        ])


def action_panel(state, roll, entry, cube, cube_mode, wait, events, opening):
    image, draw = card(RW, RH)
    x = 24
    write(draw, x, 23, "Decision analysis", 25, bold=True)
    result = state.get("result")
    if cube_mode == "cube-pass":
        cube_panel(draw, cube, cube_mode, x, result)
    elif state["phase"] == "game-closed":
        write(draw, x, 86, "Game finished", 40, TEXT, True)
        if cube and not cube.get("reply"):
            write(draw, x, 153, "Cube response unconfirmed", 24, MUTED)
    elif cube_mode == "cube-offer":
        cube_panel(draw, cube, cube_mode, x)
    elif roll:
        player = roll["player"]
        write(draw, x, 77, f"{PLAYER_NAME[player]}’s roll   {dice_label(roll['dice'])}", 39,
              PLAYER_TONE[player], True)
        if entry:
            if "inferred" in roll["evidence"] or "unique-legal-roll" in roll["evidence"]:
                write(draw, x, 127, "Roll inferred from play", 19, MUTED)
            played = any(event.get("decision") == roll["decision"] for event in events)
            moves_panel(draw, entry, played, x)
        else:
            write(draw, x, 153, "Move analysis unavailable", 23, MUTED)
    elif cube_mode == "cube-take":
        cube_panel(draw, cube, cube_mode, x)
    elif wait:
        cube_panel(draw, wait, "wait", x)
    elif opening:
        write(draw, x, 86, "Opening toss", 40, TEXT, True)
    else:
        write(draw, x, 86, "Between rolls", 40, TEXT, True)
    recent_actions(draw, events, roll, cube_mode if not roll else None)
    return bgr(image)


def moves_panel(draw, entry, played, x):
    moves = entry["actions"][:TOP_MOVES]
    draw.line((x, 187, RW - x, 187), fill=LINE)
    write(draw, x, 219, "Top moves", 24, MUTED, True)
    write(draw, RW - 185, 219, "EV", 24, MUTED, True, "ra")
    write(draw, RW - x, 219, "EV loss", 24, MUTED, True, "ra")
    for rank, move in enumerate(moves, 1):
        y = 287 + (rank - 1) * 78
        is_played = move["isPlayed"] and played
        if rank == 1 or is_played:
            fill = "#25413d" if rank == 1 else "#443d35"
            draw.rounded_rectangle((x - 5, y - 10, RW - x + 5, y + 43), radius=6, fill=fill)
        tone = GREEN if rank == 1 else AMBER if is_played else TEXT
        write(draw, x + 8, y, rank, 24, tone, True)
        write(draw, x + 63, y, notation(move["notation"]), 29, tone, rank == 1)
        write(draw, RW - 185, y, f"{move['equity4']:+.3f}", 29, tone, rank == 1, "ra")
        write(draw, RW - x, y, f"{max(0, entry['best']['equity'] - move['equity4']):.3f}",
              26, tone, rank == 1, "ra")


def viewer_frames(data, states):
    """Yield independently timed roll, cube and action layers for each camera frame."""
    rolls = iter(data["presentation"]["rolls"])
    waits = iter(data["presentation"]["waits"])
    roll = next(rolls, None)
    wait = next(waits, None)
    decisions = data["decisions"]
    cube = decisions.get("cube")
    opening_until = roll["start"] if roll and data["game"] > 1 else 0
    actions = []
    for event in data["losses"]:
        if event["kind"] == "checker":
            decision = decisions[str(event["decision"])]
            actions.append({**event, "label": f"played   {notation(decision['played']['notation'])}"})
    for item in data["presentation"]["rolls"]:
        if item["end"] - item["start"] < ACTION_HOLD:
            actions.append({"frame": item["start"], "kind": "roll", "player": item["player"], "roll": item,
                            "label": f"rolled   {dice_label(item['dice'])}"})
    for item in data["presentation"]["waits"]:
        options = item["options"]
        loss = max(0, min(options["take"], options["pass"]) - options["noDouble"])
        label = "rolls without doubling" if item["preOfferStake"] == 1 else "rolls without redoubling"
        actions.append({"frame": item["end"], "kind": "no-double", "player": item["player"],
                        "label": label, "loss": loss})
    if cube:
        label = "doubles" if cube["preOfferStake"] == 1 else "redoubles"
        actions.append({"frame": cube["startFrame"], "kind": "cube-offer", "player": cube["offerer"],
                        "label": f"{label} to {cube['offeredFace']}", "loss": cube.get("offerEvLoss")})
        if cube.get("reply") in ("take", "pass"):
            kind = "cube-" + cube["reply"]
            label = f"takes   ·   cube at {cube['offeredFace']}" if kind == "cube-take" else "passes"
            loss = next((event["loss"] for event in data["losses"] if event.get("action") == cube["reply"]), None)
            actions.append({"frame": cube["endFrame"], "kind": kind, "player": cube["responder"],
                            "label": label, "loss": loss})
    actions.sort(key=lambda event: event["frame"])
    pending = iter(actions)
    upcoming = next(pending, None)
    live = []
    for state in states:
        frame = state["frame"]
        while roll and frame >= roll["end"]:
            roll = next(rolls, None)
        while wait and frame >= wait["end"]:
            wait = next(waits, None)
        while upcoming and upcoming["frame"] <= frame:
            live.append(upcoming)
            upcoming = next(pending, None)
        live = [event for event in live if frame < event["frame"] + ACTION_HOLD]
        cube_mode = None
        if cube and frame >= cube["startFrame"]:
            if frame < cube["endFrame"] or (not cube.get("reply") and state["phase"] == "cube-response"):
                cube_mode = "cube-offer"
            elif state.get("result", {}).get("reason") == "pass":
                cube_mode = "cube-pass"
            elif cube.get("reply") == "take" and frame < cube["endFrame"] + ACTION_HOLD:
                cube_mode = "cube-take"
        yield (state, roll if roll and roll["start"] <= frame else None,
               wait if wait and wait["start"] <= frame and wait["end"] - wait["start"] >= ACTION_HOLD else None,
               cube_mode, tuple(live), frame < opening_until)


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
    equity_region = canvas[792:1048, BX:BX + BW]
    right_region = canvas[RY:RY + RH, RX:RX + RW]
    right_key = equity_key = None
    evaluated_position = None
    decisions = data["decisions"]

    states = viewer_frames(data, rows(OUT / f"{prefix}-state.jsonl.gz"))
    for _ in range(start):
        state, *_ = next(states)
        position = data["positions"].get(str(state["position"]))
        if position and position["equities"]:
            evaluated_position = position
        if position is None or state["phase"] == "game-closed":
            evaluated_position = None
    for (index, frame), (state, roll, wait, cube_mode, events, opening) in zip(game_frames(game, start), states):
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
        key = id(evaluated_position), state["loss"]
        if key != equity_key:
            equity_region[:] = equity_panel(evaluated_position, state["loss"])
            equity_key = key
        # Frame detector changes do not independently invalidate a stable panel.
        closed = state["phase"] == "game-closed"
        key = id(roll), id(wait), cube_mode, tuple(id(event) for event in events), opening, closed
        if key != right_key:
            entry = decisions.get(str(roll["decision"])) if roll else None
            right_region[:] = action_panel(state, roll, entry, decisions.get("cube"), cube_mode, wait, events, opening)
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
