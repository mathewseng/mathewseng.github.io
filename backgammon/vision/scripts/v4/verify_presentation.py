"""Verify each replay's displayed rolls, held actions, and cube decisions frame by frame."""
import json
from collections import Counter

from render import ACTION_HOLD, OUT, RH, RW, action_panel, rows, viewer_frames


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
    cube = game["decisions"]["cube"]
    for state, roll, wait, cube_mode, actions, opening in viewer_frames(
        game, rows(OUT / f"{prefix}-state.jsonl.gz")
    ):
        frame = state["frame"]
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
        if cube_mode:
            modes[cube_mode] += 1
        key = (id(roll), id(wait), cube_mode, opening, state["phase"] == "game-closed",
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
    assert counts["cube-offer", cube["startFrame"]] == ACTION_HOLD
    assert all(counts["no-double", wait["frame"]] == ACTION_HOLD for wait in cube_rolls)
    if cube.get("reply") in ("take", "pass"):
        assert counts["cube-" + cube["reply"], cube["endFrame"]] == ACTION_HOLD
    # These are the gaps identified by watching the prior exports.
    if number == 1:
        roll = next(r for r in rolls if r["sourceTurns"] == [3])
        assert roll["start"] < 55 * 25 < roll["end"] == 1531
    if number == 2:
        roll = next(r for r in rolls if r["sourceTurns"] == [4, 5, 6, 7])
        assert roll["start"] <= 1064 < 62 * 25 < roll["end"] == 2443
        assert roll["dice"] == [3, 2] and roll["decision"] == 7
        assert modes["cube-pass"] == game["frames"] - cube["endFrame"]
    if number == 3:
        opening = rolls[0]
        assert opening["start"] == 86 and opening["dice"] == [6, 1]
        assert opening["player"] == "white" and 86 not in cubes_at_roll
        roll = next(r for r in rolls if r["sourceTurns"] == [1, 2, 3])
        assert roll["start"] == 208 and roll["start"] < 25 * 25 < roll["end"]
        assert roll["decision"] == 1 and 615 not in cubes_at_roll
        assert modes["cube-take"] == ACTION_HOLD
    if number == 5:
        roll = next(r for r in rolls if r["sourceTurns"] == [3, 4])
        assert roll["start"] < 73 * 25 < roll["end"]
        assert roll["dice"] == [6, 4] and roll["decision"] is None
    return {"game": number, "rolls": len(rolls), "noDoubleDecisions": len(cube_rolls),
            "heldActions": len(counts), "cubeFrames": dict(modes)}


if __name__ == "__main__":
    results = [verify(game) for game in range(1, 6)]
    (OUT / "presentation-validation.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
