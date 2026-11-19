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
BG = "#101723"
CARD = "#1A2639"
ROW = "#202E44"
LINE = "#3B4B65"
TEXT = "#F1F5FA"
MUTED = "#B6C3D9"
WHITE = "#F5E6C8"
BLACK = "#BCD2FD"
GREEN = "#9CE4C6"
SELECTED = "#304A70"
BEST_ROW = "#243E43"
PAD, HEADLINE, SECTION, BODY, META = 28, 41, 28, 24, 18
COLUMNS = (81, 115, 152, 187, 222, 256, 316, 350, 386, 421, 456, 491)
PLAYER_NAME = {"white": "White", "dark": "Black"}
PLAYER_TONE = {"white": WHITE, "dark": BLACK}
TOP_MOVES = 5
# The rectified source is low-contrast. Grade only the camera rectangle, before
# drawing the checker labels, and leave the game's graphics palette intact.
CAMERA_TONE = np.clip((np.arange(256, dtype=np.float32) - 16) * (255 / 226), 0, 255).astype(np.uint8)


def write(draw, x, y, text, size, fill=TEXT, bold=False, anchor=None):
    draw.text((x, y), str(text), font=face(size, bold), fill=fill, anchor=anchor)


def card(width, height):
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=12, fill=CARD, outline=LINE)
    return canvas, draw


def bgr(image):
    return cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2BGR)


def percent(probability):
    return f"{probability * 100:.1f}%"


def loss_color(value):
    return (GREEN if value <= 1e-7 else "#A9DCCF" if value < .020 else
            "#F1CF88" if value < .050 else "#FFAD7D" if value < .100 else "#FF918C")


def equity_panel(equities, basis, loss, closed, pips=None):
    image, draw = card(BW, 256)
    write(draw, 28, 20, "Final EV loss" if closed else "Game equity", SECTION, bold=True)
    context = "Scored decisions only" if closed else basis
    write(draw, BW - 28, 26, context, META, MUTED, anchor="ra")
    losses = [(794, "Checker EVL"), (899, "Cube EVL")]
    cols = losses if closed else [(156, "Pips"), (250, "Equity"), (340, "Win"), (432, "Single"),
                                  (531, "Gammon"), (661, "Backgammon"), *losses]
    for column, label in cols:
        write(draw, column, 84, label, META, MUTED, True, "ra")
    draw.line((28, 115, BW - 28, 115), fill=LINE)
    for index, player in enumerate(("white", "dark")):
        y = 132 + index * 57
        draw.rounded_rectangle((15, y - 5, BW - 15, y + 44), radius=7, fill=ROW if index == 0 else BG)
        draw.rounded_rectangle((23, y + 10, 29, y + 28), radius=3, fill=PLAYER_TONE[player])
        write(draw, 39, y + 3, PLAYER_NAME[player], BODY, PLAYER_TONE[player], True)
        if not closed:
            values = ["—"] * 5
            if equities:
                row = equities[index]
                values = [f"{row['equity']:+.3f}", percent(sum(row["chances"])),
                          *(percent(chance) for chance in row["chances"])]
            for (column, _), result in zip(cols, [pips[index] if pips is not None else "—", *values]):
                write(draw, column, y + 4, result, BODY, anchor="ra")
        for (column, _), category in zip(losses, ("checkerLoss", "cubeLoss")):
            value = loss[player].get(category, 0)
            write(draw, column, y + 4, f"{value:.3f}", BODY, loss_color(value), True, "ra")
    return bgr(image)


def notation(value, fan=False):
    if value in ("Pass", "Pass — no legal move"):
        return "No legal entry" if fan else "No legal move"
    return value


def dice_label(dice):
    return "–".join(str(die) if die is not None else "?" for die in dice)


def draw_dice(draw, x, y, dice, player, size=44):
    pips = {1: (4,), 2: (0, 8), 3: (0, 4, 8), 4: (0, 2, 6, 8),
            5: (0, 2, 4, 6, 8), 6: (0, 2, 3, 5, 6, 8)}
    fill, ink, rim = (WHITE, BG, WHITE) if player == "white" else (SELECTED, TEXT, BLACK)
    scale = size / 44
    for i, die in enumerate(dice):
        left = x + i * 53 * scale
        draw.rounded_rectangle((left, y, left + size, y + size), radius=8 * scale, fill=fill, outline=rim, width=2)
        if die not in pips:
            write(draw, left + size / 2, y + size / 2, "?", round(SECTION * scale), ink, True, "mm")
        for dot in pips.get(die, ()):
            cx, cy = left + (10 + 12 * (dot % 3)) * scale, y + (10 + 12 * (dot // 3)) * scale
            radius = 3 * scale
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=ink)


def draw_table(draw, y, title, choices, actual=None, row_height=52, numbers=False):
    write(draw, PAD, y, title, META, MUTED, True)
    write(draw, RW - 176, y, "EV", META, MUTED, True, "ra")
    write(draw, RW - PAD, y, "EV loss", META, MUTED, True, "ra")
    draw.line((PAD, y + 28, RW - PAD, y + 28), fill=LINE)
    best = max(value for _, _, value in choices)
    for index, (key, label, value) in enumerate(choices):
        top = y + 37 + index * row_height
        optimal, selected = abs(best - value) < 1e-7, actual == key
        color = SELECTED if selected else BEST_ROW if optimal else ROW if index % 2 == 0 else CARD
        draw.rounded_rectangle((PAD - 7, top, RW - PAD + 7, top + row_height - 5), radius=7, fill=color)
        if selected:
            draw.rounded_rectangle((PAD - 3, top + 6, PAD + 2, top + row_height - 11), radius=2, fill=BLACK)
        x = PAD + 13
        if numbers:
            write(draw, x, top + 8, index + 1, META, MUTED, True)
            x += 31
        write(draw, x, top + 6, label, BODY, TEXT, optimal or selected)
        badge = "PLAYED · BEST" if selected and optimal else "PLAYED" if selected else "BEST" if optimal else ""
        if badge:
            write(draw, RW - 309, top + 9, badge, META, BLACK if selected else GREEN, True, "ra")
        write(draw, RW - 176, top + 6, f"{value:+.3f}", BODY, anchor="ra")
        loss = max(0, best - value)
        write(draw, RW - PAD, top + 6, f"{loss:.3f}", BODY, loss_color(loss), True, "ra")


def cube_choices(cube):
    options = cube["options"]
    return [("roll", "No double", options["noDouble"]),
            ("double", "Double", -max(value for _, _, value in cube_replies(cube)))]


def cube_replies(cube):
    return [(key, label, -cube["options"][key]) for key, label in
            (("take", "Take"), ("pass", "Pass"), ("beaver", "Beaver")) if key in cube["options"]]


def recent_actions(draw, actions):
    if not actions:
        return
    draw.line((PAD, 742, RW - PAD, 742), fill=LINE)
    write(draw, PAD, 755, "Recent actions", META, MUTED, True)
    write(draw, RW - 176, 755, "EV", META, MUTED, True, "ra")
    write(draw, RW - PAD, 755, "EV loss", META, MUTED, True, "ra")
    for i, event in enumerate(actions):
        y = 794 + i * 39
        player, action = event["player"], event["label"]
        rank = f"  ·  Rank {event['rank']}" if event.get("rank", 0) > TOP_MOVES else ""
        title = f"{PLAYER_NAME[player]} {action}{rank}"
        write(draw, PAD, y, title, BODY, PLAYER_TONE[player])
        if event.get("fan") or event["kind"] == "roll" and event["roll"].get("fan"):
            draw_dice(draw, PAD + draw.textlength(title, font=face(BODY)) + 16, y - 1,
                      event["roll"]["dice"], player, size=28)
        equity, loss = event.get("equity"), event.get("loss")
        write(draw, RW - 176, y, "—" if equity is None else f"{equity:+.3f}", BODY, anchor="ra")
        write(draw, RW - PAD, y, "—" if loss is None else f"{loss:.3f}", BODY,
              MUTED if loss is None else loss_color(loss), True, "ra")


def cube_panel(draw, cube, phase, result=None):
    player = cube.get("offerer", cube.get("player"))
    responder = cube.get("responder") or ("white" if player == "dark" else "dark")
    reply = None
    if phase == "before-roll":
        title, subtitle = f"{PLAYER_NAME[player]}’s cube decision", "Before the roll"
    elif phase == "rolled":
        title, subtitle = f"{PLAYER_NAME[player]} rolls without doubling", "Cube decision"
    elif phase == "cube-take":
        title = f"{PLAYER_NAME[responder]} takes"
        subtitle = f"Cube at {cube['offeredFace']}"
        reply = "take"
    elif phase == "cube-pass":
        title = f"{PLAYER_NAME[responder]} passes"
        points = result["points"]
        outcome = f"{PLAYER_NAME[result['winner']]} wins {points} {'point' if points == 1 else 'points'}"
        subtitle = f"{outcome} · Pass inferred from pack-up" if result.get("inferred") else outcome
        reply = "pass"
    else:
        title = f"{PLAYER_NAME[player]} doubles to {cube['offeredFace']}"
        subtitle = f"{PLAYER_NAME[responder]} to respond"
    write(draw, PAD, 79, title, HEADLINE, TEXT, True)
    write(draw, PAD, 134, subtitle, BODY, MUTED)
    options = cube.get("options")
    if not options:
        write(draw, PAD, 202, "Cube analysis unavailable", BODY, MUTED)
        return
    actual = "roll" if phase == "rolled" else None if phase == "before-roll" else "double"
    draw_table(draw, 205, f"{PLAYER_NAME[player]}’s cube decision", cube_choices(cube), actual, 57)
    if phase not in ("before-roll", "rolled"):
        draw_table(draw, 420, f"{PLAYER_NAME[responder]}’s response", cube_replies(cube), reply, 57)


def checker_choices(entry, fan=False):
    return [(move["key"], notation(move["notation"], fan), move["equity4"])
            for move in entry["actions"][:TOP_MOVES]]


def checker_progress(draw, progress, entry, selected, chosen):
    if selected:
        if not any(row["key"] == selected for row in entry["actions"][:TOP_MOVES]):
            write(draw, PAD, 514, f"Played {chosen['notation']}", META, BLACK, True)
            write(draw, RW - PAD, 514, f"EV {chosen['equity']:+.3f}", META, BLACK, True, "ra")
        return
    if not progress:
        return
    candidate = next((row for row in entry["actions"] if row["key"] == progress.get("candidate")), None)
    moves = " ".join(progress["moves"]) or (candidate["notation"] if candidate else "")
    if moves:
        draw.rounded_rectangle((PAD - 7, 505, RW - PAD + 7, 541), radius=7, fill=ROW)
        write(draw, PAD + 5, 513, f"So far   {moves}", META, TEXT, True)
        if candidate:
            write(draw, RW - PAD, 513, f"Tentative EV {candidate['equity4']:+.3f}", META, BLACK, True, "ra")


def action_panel(state, roll, entry, cube, cube_mode, cube_roll, opening):
    image, draw = card(RW, RH)
    x = PAD
    write(draw, x, 23, "Decision analysis", SECTION, bold=True)
    draw.line((x, 64, RW - x, 64), fill=LINE)
    result = state.get("result")
    frame = state["frame"]
    featured = None
    decision_roll = roll or state.get("pendingRoll")
    if cube_mode == "cube-pass":
        cube_panel(draw, cube, cube_mode, result)
    elif state.get("postGamePlay"):
        write(draw, x, 86, "Post-game play", HEADLINE, TEXT, True)
        points = result["points"]
        write(draw, x, 143, f"{PLAYER_NAME[result['winner']]} won {points} {'point' if points == 1 else 'points'}", BODY, MUTED)
    elif state["phase"] == "game-closed" and result and result["reason"] == "bearoff":
        winner = PLAYER_NAME[result["winner"]]
        points = result["points"]
        outcome = {1: "Single", 2: "Gammon", 3: "Backgammon"}[result["level"]]
        write(draw, x, 86, f"{winner} wins {points} {'point' if points == 1 else 'points'}", HEADLINE, TEXT, True)
        write(draw, x, 143, f"{outcome} · Inferred from final roll and reset", BODY, MUTED)
    elif state["phase"] == "game-closed":
        title = "Board reset" if state.get("actorEvidence") == "board-reset" else "Game finished"
        write(draw, x, 86, title, HEADLINE, TEXT, True)
        write(draw, x, 143, "Result unconfirmed", BODY, MUTED)
    elif cube_mode == "cube-offer":
        cube_panel(draw, cube, cube_mode)
    elif decision_roll:
        player = decision_roll["player"]
        title = f"{PLAYER_NAME[player]}’s {'roll' if roll else 'move'}"
        write(draw, x, 79, title, HEADLINE, PLAYER_TONE[player], True)
        if roll:
            draw_dice(draw, x + draw.textlength(title, font=face(HEADLINE, True)) + 25, 78, roll["dice"], player)
        if entry:
            if roll and roll.get("sourceMismatch"):
                write(draw, x, 135, "Visible dice and checker result disagree", META, MUTED)
            elif roll and ("inferred" in roll["evidence"] or "unique-legal-roll" in roll["evidence"]):
                write(draw, x, 135, "Roll inferred from play", META, MUTED)
            chosen = state.get("previousChecker")
            selected = chosen["played"] if chosen and chosen.get("decision") == decision_roll["decision"] else None
            draw_table(draw, 182, "Top checker moves", checker_choices(entry, decision_roll.get("fan")),
                       selected, 58, numbers=True)
            checker_progress(draw, state.get("moveProgress"), entry, selected, chosen)
        elif not roll:
            write(draw, x, 145, "Confirming the checker result", BODY, MUTED)
        elif roll.get("fan"):
            write(draw, x, 145, "Fanned · no checker entered", BODY, MUTED)
        elif forced := roll.get("forcedPlay"):
            write(draw, x, 145, f"Forced play · {forced['notation']}", BODY, TEXT, True)
            write(draw, x, 184, "One die unreadable", META, MUTED)
        elif roll["evidence"] == "reviewed-roll-with-confirmed-board" and roll.get("sourceMismatch"):
            write(draw, x, 145, "Visible dice and checker result disagree", BODY, MUTED)
        elif roll["evidence"] == "reviewed-roll-with-confirmed-board":
            write(draw, x, 145, "Dice partly unreadable", BODY, MUTED)
        else:
            write(draw, x, 145, "Checker analysis unavailable", BODY, MUTED)
        if cube_roll:
            draw_table(draw, 554 if entry else 225, f"{PLAYER_NAME[cube_roll['player']]}’s cube decision",
                       cube_choices(cube_roll), "roll" if frame >= cube_roll["frame"] else None)
    elif cube_mode == "cube-take":
        cube_panel(draw, cube, cube_mode)
    elif cube_roll:
        cube_panel(draw, cube_roll, "rolled" if frame >= cube_roll["frame"] else "before-roll")
    elif (featured := state.get("previousChecker")):
        player = featured["player"]
        fan = featured.get("fan")
        forced = featured.get("forcedPlay")
        title = f"{PLAYER_NAME[player]} " + ("fanned" if fan else
                                            "finished moving" if featured["kind"] == "board-result" and not forced else "played")
        write(draw, x, 79, title, HEADLINE, PLAYER_TONE[player], True)
        if fan:
            draw_dice(draw, x + draw.textlength(title, font=face(HEADLINE, True)) + 25,
                      78, featured["roll"]["dice"], player)
        if forced:
            write(draw, x, 135, forced["notation"], BODY, TEXT)
            write(draw, x, 183, "Forced play · EV loss 0.000", BODY, loss_color(forced["evLoss"]))
        elif featured["kind"] == "board-result":
            write(draw, x, 135, "No checker entered" if fan else "Checker position confirmed", BODY, MUTED)
        else:
            rank = featured["rank"]
            write(draw, x, 135, f"{featured['notation']}  ·  Rank {rank}", BODY, MUTED)
            draw_table(draw, 182, "Top checker moves", featured["choices"], featured["played"], 58, numbers=True)
            if rank > TOP_MOVES:
                write(draw, RW - PAD, 514, f"Played EV {featured['equity']:+.3f}", META, BLACK, True, "ra")
    elif opening:
        write(draw, x, 86, "Opening toss", HEADLINE, TEXT, True)
    else:
        write(draw, x, 86, "Between rolls", HEADLINE, TEXT, True)
    recent_actions(draw, state.get("recentActions", ()))
    return bgr(image)


def viewer_frames(data, states):
    """Yield independently timed roll, cube and action layers for each camera frame."""
    rolls = iter(data["presentation"]["rolls"])
    cube_rolls = iter(data["presentation"]["cubeRolls"])
    cubes_at_roll = {choice["frame"]: choice for choice in data["presentation"]["cubeRolls"]}
    roll = next(rolls, None)
    upcoming_cube_roll = next(cube_rolls, None)
    shown_cube_roll = None
    decisions = data["decisions"]
    cube = decisions.get("cube")
    post_game = data.get("postGamePlay")
    opening_until = roll["start"] if roll and data["game"] > 1 else 0
    played_rolls = {entry["decision"]: entry for entry in data["presentation"]["rolls"] if entry["decision"]}
    actions = []
    for event in data["losses"]:
        if event["kind"] == "checker":
            decision = decisions[str(event["decision"])]
            plays = decision["actions"]
            rank = next(i for i, move in enumerate(plays) if move["isPlayed"])
            played = plays[rank]
            played_roll = played_rolls.get(event["decision"])
            fan = bool(played_roll and played_roll.get("fan"))
            choices = checker_choices(decision, fan)
            label = notation(played["notation"], fan)
            # Show a committed choice once the legal result and pickup agree.
            confirmed = max(event["frame"], (played_roll or {}).get("pickup") or 0)
            actions.append({**event, "frame": confirmed, "label": "fanned" if fan else f"played   {label}",
                            "notation": label, "fan": fan, "roll": played_roll, "rank": rank + 1,
                            "choices": choices, "played": played["key"], "equity": played["equity4"]})
    for item in data["presentation"]["rolls"]:
        if item["evidence"] == "reviewed-roll-with-confirmed-board":
            turn = data["turns"][item["sourceTurns"][0] - 1]
            event = {"frame": turn["resultFrame"], "kind": "board-result", "player": item["player"],
                     "label": "fanned" if item.get("fan") else "finished moving", "fan": item.get("fan", False), "roll": item}
            if forced := item.get("forcedPlay"):
                event.update(label=f"played   {forced['notation']}", loss=forced["evLoss"], forcedPlay=forced)
            actions.append(event)
        if item["end"] - item["start"] < ACTION_HOLD:
            actions.append({"frame": item["start"], "kind": "roll", "player": item["player"], "roll": item,
                            "label": "rolled" if item.get("fan") else f"rolled   {dice_label(item['dice'])}"})
    for item in data["presentation"]["cubeRolls"]:
        loss = item["evLoss"]
        actions.append({"frame": item["frame"], "kind": "no-double", "player": item["player"],
                        "label": "rolls without doubling", "loss": loss, "equity": item["options"]["noDouble"]})
    if cube:
        actions.append({"frame": cube["startFrame"], "kind": "cube-offer", "player": cube["offerer"],
                        "label": f"doubles to {cube['offeredFace']}", "loss": cube.get("offerEvLoss"),
                            "equity": cube_choices(cube)[1][2]})
        if cube.get("reply") in ("take", "pass"):
            kind = "cube-" + cube["reply"]
            label = f"takes   ·   cube at {cube['offeredFace']}" if kind == "cube-take" else "passes"
            loss = next((event["loss"] for event in data["losses"] if event.get("action") == cube["reply"]), None)
            actions.append({"frame": cube["endFrame"], "kind": kind, "player": cube["responder"],
                            "label": label, "loss": loss, "equity": -cube["options"][cube["reply"]]})
    actions.sort(key=lambda event: event["frame"])
    pending = iter(actions)
    upcoming = next(pending, None)
    live = []
    recent = []
    previous_checker = None
    pending_result = None
    for state in states:
        frame = state["frame"]
        while roll and frame >= roll["end"]:
            turn = data["turns"][(roll["decision"] or roll["sourceTurns"][0]) - 1]
            result, pickup = turn.get("resultFrame"), roll.get("pickup")
            if result is not None and pickup is not None and result > pickup:
                pending_result = (result, roll)
            roll = next(rolls, None)
        while upcoming_cube_roll and upcoming_cube_roll["start"] <= frame:
            shown_cube_roll = upcoming_cube_roll
            upcoming_cube_roll = next(cube_rolls, None)
        while upcoming and upcoming["frame"] <= frame:
            live.append(upcoming)
            if upcoming["kind"] != "roll":
                recent = (recent + [upcoming])[-3:]
            if upcoming["kind"] in ("checker", "board-result"):
                previous_checker = upcoming
            upcoming = next(pending, None)
        live = [event for event in live if frame < event["frame"] + ACTION_HOLD]
        cube_mode = None
        if post_game and frame >= post_game["frame"]:
            state = {**state, "postGamePlay": True}
        elif cube and frame >= cube["startFrame"]:
            if frame < cube["endFrame"] or (not cube.get("reply") and state["phase"] == "cube-response"):
                cube_mode = "cube-offer"
            elif state.get("result", {}).get("reason") == "pass":
                cube_mode = "cube-pass"
            elif cube.get("reply") == "take" and frame < cube["endFrame"] + ACTION_HOLD:
                cube_mode = "cube-take"
        active_roll = roll if roll and roll["start"] <= frame else None
        if pending_result and (active_roll or frame >= pending_result[0] or cube_mode in ("cube-offer", "cube-pass")):
            pending_result = None
        if pending_result:
            state = {**state, "pendingChecker": pending_result[1]["player"], "pendingRoll": pending_result[1]}
        cube_roll = shown_cube_roll if shown_cube_roll and frame < shown_cube_roll["frame"] else None
        if active_roll:
            cube_roll = cubes_at_roll.get(active_roll["start"])
        elif pending_result:
            cube_roll = None
        completed_fans = {event["roll"]["start"] for event in recent if event.get("fan")}
        brief_rolls = [event for event in live if event["kind"] == "roll" and event["roll"] is not active_roll
                       and event["frame"] not in completed_fans]
        recent_with_roll = sorted(recent + brief_rolls, key=lambda event: event["frame"])[-3:]
        state = {**state, "previousChecker": previous_checker, "recentActions": tuple(recent_with_roll)}
        yield state, active_roll, cube_roll, cube_mode, tuple(live), frame < opening_until


def move_equity(move, player):
    chances = move["outcomeProbabilities"]
    sides = [{"equity": direction * move["equity"],
              "chances": [chances[prefix + name] for name in ("Single", "Gammon", "Backgammon")]}
             for prefix, direction in (("win", 1), ("lose", -1))]
    return sides if player == "white" else sides[::-1]


def equity_frames(data, frames):
    positions = data["positions"]
    decisions = data["decisions"]
    played_at = {str(event["decision"]): event["frame"] for event in data["losses"] if event["kind"] == "checker"}
    move_scores = {key: (move_equity(entry["best"], entry["player"]),
                         move_equity(entry["played"], entry["player"]) if key in played_at else None)
                   for key, entry in decisions.items() if key != "cube"}
    last = None
    for items in frames:
        state, roll, _, mode, events, _ = items
        position = positions.get(str(state["position"]))
        estimate = position.get("equities") if position else None
        if estimate:
            last = estimate["players"]
        closed = state["phase"] == "game-closed"
        decision_roll = roll or state.get("pendingRoll")
        key = str(decision_roll["decision"]) if decision_roll else None
        if closed:
            equity, basis = None, ""
        elif key in move_scores and mode != "cube-offer":
            best, played = move_scores[key]
            complete = played is not None and played_at[key] <= state["frame"]
            turn = data["turns"][decision_roll["decision"] - 1]
            if complete and turn.get("adjustment") and estimate:
                equity, basis = estimate["players"], "After move and board adjustment"
            else:
                equity, basis = (played, "After played move") if complete else (best, "After best play")
        elif not roll and not mode and (latest := next((event for event in reversed(events)
                                                       if event["kind"] == "checker"), None)):
            equity, basis = move_scores[str(latest["decision"])][1], "After played move"
        elif estimate:
            equity, basis = estimate["players"], "Position estimate"
        elif last:
            equity, basis = last, "Last scored position"
        else:
            equity, basis = None, "Waiting for a scored position"
        yield items, position, equity, basis, closed


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


def grade_camera(pixels):
    pixels = cv2.LUT(pixels, CAMERA_TONE)
    hsv = cv2.cvtColor(pixels, cv2.COLOR_BGR2HSV)
    hsv[:, :, 1] = cv2.multiply(hsv[:, :, 1], 1.22)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)


def board_image(frame, points):
    pixels = cv2.resize(frame.to_ndarray(format="bgr24"), (BW, BH), interpolation=cv2.INTER_LINEAR)
    if pixels[::24, ::24].max() < 32:
        return unavailable_board()
    pixels = grade_camera(pixels)
    if points is not None:
        y, x, color = point_marks(tuple(points))
        pixels[y, x] = color
    return pixels


@lru_cache(maxsize=1)
def unavailable_board():
    image, draw = card(BW, BH)
    write(draw, BW // 2, BH // 2, "Camera feed unavailable", HEADLINE, MUTED, anchor="mm")
    return bgr(image)


def header(number, frame, description=None):
    image = Image.new("RGB", (WIDTH, BY), BG)
    draw = ImageDraw.Draw(image)
    seconds = frame // FPS
    write(draw, 32, 23, "Office-3 Backgammon", SECTION, bold=True)
    write(draw, 392, 26, f"Game {number:02}", BODY, MUTED)
    label = description or f"{seconds // 60:02}:{seconds % 60:02}"
    write(draw, WIDTH - 32, 26, label, BODY, BLACK, True, "ra")
    draw.line((32, 69, WIDTH - 32, 69), fill=LINE)
    return bgr(image)


def rows(file):
    with gzip.open(file, "rt") as stream:
        yield from map(json.loads, stream)


def overlay_states(number):
    exporter = Path(__file__).with_name("export-frame-data.mjs")
    data = subprocess.check_output(["bun", str(exporter), "--overlay-state", str(number)], text=True)
    return iter(json.loads(data))


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


def render(number, limit, software, crf):
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
        frame_count = render_frames(muxer.stdin, data, game, number, footage, software, crf=crf)
    finally:
        muxer.stdin.close()
        status = muxer.wait()
    if status:
        raise RuntimeError(f"Game {number} audio mux failed with exit code {status}")
    staging.replace(final)
    print(json.dumps({"game": number, "footageFrames": footage, "outputFrames": frame_count,
                      "video": str(final)}), flush=True)


def render_frames(output, data, game, number, footage, software, start=0, *, crf=21):
    prefix = f"game-{number:02}"
    writer = FrameWriter(output, software, bitrate=2_450_000, software_preset="veryfast", software_crf=crf)
    canvas = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    canvas[:] = (35, 23, 16)
    board_region = canvas[BY:BY + BH, BX:BX + BW]
    equity_region = canvas[792:1048, BX:BX + BW]
    right_region = canvas[RY:RY + RH, RX:RX + RW]
    right_key = equity_key = None
    decisions = data["decisions"]

    states = equity_frames(data, viewer_frames(data, rows(OUT / f"{prefix}-state.jsonl.gz")))
    overlay = overlay_states(number)
    upcoming_overlay = next(overlay, None)
    pips, progress = None, None
    for _ in range(start):
        next(states)
    for (index, frame), (items, position, equity, basis, closed) in zip(game_frames(game, start), states):
        state, roll, wait, cube_mode, _, opening = items
        if index >= footage:
            break
        if state["frame"] != index:
            raise RuntimeError("Board footage and timeline frame mismatch")
        while upcoming_overlay and upcoming_overlay[0] <= index:
            _, pips, progress = upcoming_overlay
            upcoming_overlay = next(overlay, None)
        points = state.get("displayPoints")
        if points is None and position:
            points = [white - black for white, black in position["points"]]
        board_region[:] = board_image(frame, None if closed else points)
        if index == start or index % FPS == 0:
            canvas[:BY] = header(number, index)
        key = id(equity), basis, closed, state["loss"], pips
        if key != equity_key:
            equity_region[:] = equity_panel(equity, basis, state["loss"], closed, pips)
            equity_key = key
        # Frame detector changes do not independently invalidate a stable panel.
        pending_roll = state.get("pendingRoll")
        key = (id(roll), id(wait), bool(wait and index >= wait["frame"]), cube_mode,
               tuple(id(event) for event in state["recentActions"]), id(state["previousChecker"]), progress,
               opening, closed, id(pending_roll), state.get("postGamePlay"))
        if key != right_key:
            decision_roll = roll or pending_roll
            entry = decisions.get(str(decision_roll["decision"])) if decision_roll else None
            right_region[:] = action_panel({**state, "moveProgress": progress}, roll, entry, decisions.get("cube"),
                                           cube_mode, wait, opening)
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
    parser.add_argument("--crf", type=int, help="Constant rate factor for software encoding (default 21)")
    args = parser.parse_args()
    if args.crf is not None and (not args.software or not 0 <= args.crf <= 51):
        parser.error("--crf requires --software and a value from 0 to 51")
    cv2.setNumThreads(1)
    with ThreadPoolExecutor(max_workers=args.jobs) as workers:
        crf = args.crf if args.crf is not None else 21
        list(workers.map(lambda game: render(game, args.preview, args.software, crf), args.games))


if __name__ == "__main__":
    main()
