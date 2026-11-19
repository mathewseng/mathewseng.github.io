"""Verify each replay's displayed rolls, held actions, and cube decisions frame by frame."""
import json
from collections import Counter

from render import ACTION_HOLD, BW, OUT, RH, RW, action_panel, equity_frames, equity_panel, rows, viewer_frames


def verify(number):
    prefix = f"game-{number:02}"
    game = json.loads((OUT / f"{prefix}-game.json").read_text())
    presentation = game["presentation"]
    rolls = presentation["rolls"]
    cube_rolls = presentation["cubeRolls"]
    cubes_at_roll = {entry["frame"]: entry for entry in cube_rolls}
    assert all(a["end"] <= b["start"] for a, b in zip(rolls, rolls[1:]))
    assert all(0 <= roll["start"] < roll["end"] <= game["frames"] for roll in rolls)
    assert all(roll["pickup"] is None or roll["pickup"] == roll["end"] for roll in rolls)
    assert all(not roll["dice"][1] or roll["dice"][0] >= roll["dice"][1] for roll in rolls)
    assert set(cubes_at_roll) <= {roll["start"] for roll in rolls}
    for cube_roll in cube_rolls:
        assert cube_roll["start"] <= cube_roll["frame"] < cube_roll["end"]
    counts = Counter()
    drawn_rolls = Counter()
    shown_at_roll = set()
    modes = Counter()
    rendered = set()
    equity_rendered = set()
    cube = game["decisions"]["cube"]
    frames = viewer_frames(game, rows(OUT / f"{prefix}-state.jsonl.gz"))
    for items, position, equity, basis, closed in equity_frames(game, frames):
        state, roll, wait, cube_mode, actions, opening = items
        frame = state["frame"]
        if closed:
            assert not (position or equity or roll or wait)
        elif roll and roll["decision"] and cube_mode != "cube-offer":
            assert equity and basis in ("After best play", "After played move")
            if roll["start"] == frame:
                assert basis == "After best play"
        if number == 3 and frame == 1025:
            assert basis == "After played move"
            assert equity[1]["equity"] == game["decisions"]["1"]["played"]["equity"]
        if number == 3 and frame == 4030 and state.get("pendingChecker"):
            assert state["pendingChecker"] == "white" and not roll and not wait
        if number == 1 and frame == 11340 and roll and roll.get("fan"):
            assert basis == "Position estimate"
            assert equity == position["equities"]["players"]
        equity_key = id(equity), basis, closed
        if equity_key not in equity_rendered:
            assert equity_panel(equity, basis, state["loss"], closed).shape == (256, BW, 3)
            equity_rendered.add(equity_key)
        if opening:
            assert number > 1 and frame < rolls[0]["start"]
        if roll:
            drawn_rolls[roll["start"]] += 1
            assert roll["start"] <= frame < roll["end"]
            assert not opening and state["phase"] != "game-closed"
        if wait:
            assert wait["start"] <= frame < wait["end"]
        if roll and roll["start"] in cubes_at_roll:
            assert wait == cubes_at_roll[roll["start"]]
            shown_at_roll.add(roll["start"])
        for action in actions:
            counts[action["kind"], action["frame"]] += 1
            assert action["frame"] <= frame < action["frame"] + ACTION_HOLD
            if action.get("fan"):
                assert action["label"] == "fanned"
        if cube_mode:
            modes[cube_mode] += 1
        key = (id(roll), id(wait), cube_mode, opening, state["phase"] == "game-closed", state.get("pendingChecker"),
               tuple((action["kind"], action["frame"]) for action in actions))
        if key not in rendered:
            entry = game["decisions"].get(str(roll["decision"])) if roll else None
            panel = action_panel(state, roll, entry, cube, cube_mode, wait, actions, opening)
            assert panel.shape == (RH, RW, 3)
            rendered.add(key)
    assert dict(drawn_rolls) == {r["start"]: r["end"] - r["start"] for r in rolls}
    assert shown_at_roll == set(cubes_at_roll)
    assert all(count == min(ACTION_HOLD, game["frames"] - start) for (_, start), count in counts.items())
    for loss in game["losses"]:
        if loss["kind"] == "checker":
            assert counts["checker", loss["frame"]] == ACTION_HOLD
    for roll in rolls:
        if roll["evidence"] == "reviewed-roll-with-confirmed-board":
            result = game["turns"][roll["sourceTurns"][0] - 1]["resultFrame"]
            assert counts["board-result", result] == ACTION_HOLD
    assert counts["cube-offer", cube["startFrame"]] == ACTION_HOLD
    assert all(counts["no-double", wait["frame"]] == ACTION_HOLD for wait in cube_rolls)
    if cube.get("reply") in ("take", "pass"):
        assert counts["cube-" + cube["reply"], cube["endFrame"]] == ACTION_HOLD
    # These are the gaps identified by watching the prior exports.
    if number == 1:
        roll = next(r for r in rolls if r["sourceTurns"] == [3])
        assert roll["start"] < 55 * 25 < roll["end"] == 1531
        assert next(r for r in rolls if r["start"] == 6426)["pickup"] == 6486
        assert next(r for r in rolls if r["start"] == 6518)["dice"] == [6, 6]
        entry, fan, twos = [next(r for r in rolls if r["start"] == frame) for frame in (11833, 11993, 12047)]
        assert (entry["player"], entry["dice"], entry["pickup"]) == ("white", [5, 3], 11958)
        assert (fan["player"], fan["dice"], fan["fan"]) == ("dark", [5, 3], True)
        assert (twos["player"], twos["dice"]) == ("white", [2, 2])
        entry_turn, fan_turn, twos_turn = [game["turns"][r["decision"] - 1] for r in (entry, fan, twos)]
        assert entry_turn["before"]["bar"] == [1, 0] and entry_turn["after"]["bar"] == [0, 1]
        assert entry_turn["after"] == fan_turn["before"] == fan_turn["after"] == twos_turn["before"]
        assert twos_turn["resultFrame"] == 12176
        assert game["decisions"][str(twos["decision"])]["played"]["notation"] == "20/18 18/16 16/14 14/12"
        handoff = [next(r for r in rolls if r["start"] == frame)
                   for frame in (12221, 12269, 13053, 13165, 14287, 14374)]
        corrected = any(entry["frame"] == 13165 and entry.get("superseded") for entry in game["contextRecovery"])
        assert [r["dice"] for r in handoff] == [[2, 1], [5, 1], [6, 1], [6, 3 if corrected else None], [4, 3], [5, 3]]
        turns = [game["turns"][(r["decision"] or r["sourceTurns"][0]) - 1] for r in handoff]
        assert twos_turn["after"] == turns[0]["before"]
        assert all(a["after"] == b["before"] for a, b in zip(turns, turns[1:]))
        if corrected:
            assert game["decisions"][str(handoff[3]["decision"])]["countedInGameLoss"]
            assert counts["checker", turns[3]["resultFrame"]] == ACTION_HOLD
        else:
            assert handoff[3]["sourceMismatch"] and handoff[3]["decision"] is None
            assert counts["board-result", turns[3]["resultFrame"]] == ACTION_HOLD
    if number == 2:
        roll = next(r for r in rolls if r["sourceTurns"] == [4, 5, 6, 7])
        assert roll["start"] <= 1064 < 62 * 25 < roll["end"] == 2443
        assert roll["dice"] == [3, 2] and roll["decision"] == 7
        assert modes["cube-pass"] == game["frames"] - cube["endFrame"]
        dark = next(r for r in rolls if r["start"] == 3117)
        white = next(r for r in rolls if r["start"] == 3247)
        assert dark["pickup"] == 3233 and white["pickup"] == 3749
        assert game["turns"][dark["decision"] - 1]["resultFrame"] == 3243
        choice = game["decisions"][str(white["decision"])]
        assert choice["countedInGameLoss"] and choice["played"]["notation"] == "13/9 13/8"
    if number == 3:
        opening = rolls[0]
        assert opening["start"] == 86 and opening["dice"] == [6, 1]
        assert opening["player"] == "white" and 86 not in cubes_at_roll
        roll = next(r for r in rolls if r["sourceTurns"] == [1, 2, 3])
        assert roll["start"] == 208 and roll["start"] < 25 * 25 < roll["end"]
        assert roll["decision"] == 1 and 615 not in cubes_at_roll
        assert modes["cube-take"] == ACTION_HOLD
        assert next(r for r in rolls if r["start"] == 7519)["pickup"] == 7649
        assert next(r for r in rolls if r["start"] == 7679)["dice"] == [5, 2]
        middle = 23377 if any(r["start"] == 23377 for r in rolls) else 23528
        for start, clear in [(9703, 10030), (middle, 23913), (24536, 24741)]:
            assert next(r for r in rolls if r["start"] == start)["pickup"] == clear
    if number == 4:
        assert next(r for r in rolls if r["start"] == 6489)["dice"] == [5, 4]
        doubles = next((r for r in rolls if r["start"] == 22003), None)
        if doubles:
            assert doubles["dice"] == [5, 5]
            assert game["decisions"][str(doubles["decision"])]["played"]["notation"] == "7/2 20/15 15/10 10/5"
        for start, clear in [(6338, 6453), (19587, 19705), (22003 if doubles else 22203, 22257),
                             (25758, 25885), (26347, 26452)]:
            assert next(r for r in rolls if r["start"] == start)["pickup"] == clear
        bear_off = next(r for r in rolls if r["start"] == 25758)
        assert bear_off["dice"] == [6, 1]
        assert game["turns"][bear_off["decision"] - 1]["after"]["borneOff"] == [7, 0]
    if number == 5:
        roll = next(r for r in rolls if r["start"] == 636)
        assert roll["start"] < 73 * 25 < roll["end"] == 3213
        assert roll["dice"] == [6, 4]
        if roll["decision"] is not None:
            assert game["decisions"][str(roll["decision"])]["played"]["notation"] == "24/20 20/14"
        assert modes["cube-pass"] == game["frames"] - game["ending"]["frame"]
        assert next(r for r in rolls if r["start"] == 17055)["pickup"] == 17279
        assert next(r for r in rolls if r["start"] == 17286)["pickup"] == 17457
    return {"game": number, "rolls": len(rolls), "noDoubleDecisions": len(cube_rolls),
            "heldActions": len(counts), "cubeFrames": dict(modes)}


if __name__ == "__main__":
    results = [verify(game) for game in range(1, 6)]
    (OUT / "presentation-validation.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
