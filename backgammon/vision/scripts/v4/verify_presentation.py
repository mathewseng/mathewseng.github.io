"""Verify each replay's displayed rolls, held actions, and cube waits frame by frame."""
import json
from collections import Counter

from render import ACTION_HOLD, OUT, RH, RW, action_panel, rows, viewer_frames


def verify(number):
    prefix = f"game-{number:02}"
    game = json.loads((OUT / f"{prefix}-game.json").read_text())
    presentation = game["presentation"]
    rolls = presentation["rolls"]
    waits = presentation["waits"]
    assert all(a["end"] <= b["start"] for a, b in zip(rolls, rolls[1:]))
    assert all(0 <= roll["start"] < roll["end"] <= game["frames"] for roll in rolls)
    assert all(roll["pickup"] is None or roll["pickup"] == roll["end"] for roll in rolls)
    assert all(not roll["dice"][1] or roll["dice"][0] >= roll["dice"][1] for roll in rolls)
    for wait in waits:
        incoming = next(i for i, roll in enumerate(rolls) if roll["start"] == wait["end"])
        previous = rolls[incoming - 1]
        assert wait["start"] == previous["pickup"] + ACTION_HOLD < wait["end"]
        assert rolls[incoming]["player"] == wait["player"] != previous["player"]
    counts = Counter()
    drawn_rolls = Counter()
    drawn_waits = Counter()
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
            drawn_waits[wait["start"]] += 1
            assert wait["start"] <= frame < wait["end"]
            assert not roll and cube_mode is None
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
    assert dict(drawn_waits) == {w["start"]: w["end"] - w["start"] for w in waits
                               if w["end"] - w["start"] >= ACTION_HOLD}
    assert all(count == min(ACTION_HOLD, game["frames"] - start) for (_, start), count in counts.items())
    for loss in game["losses"]:
        if loss["kind"] == "checker":
            assert counts["checker", loss["frame"]] == ACTION_HOLD
    assert counts["cube-offer", cube["startFrame"]] == ACTION_HOLD
    assert all(counts["no-double", wait["end"]] == ACTION_HOLD for wait in waits)
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
        roll = next(r for r in rolls if r["sourceTurns"] == [2, 3])
        assert roll["start"] < 29 * 25 < roll["end"]
        assert modes["cube-take"] == ACTION_HOLD
    if number == 5:
        roll = next(r for r in rolls if r["sourceTurns"] == [3, 4])
        assert roll["start"] < 73 * 25 < roll["end"]
        assert roll["dice"] == [6, 4] and roll["decision"] is None
    return {"game": number, "rolls": len(rolls), "longCubeWaits": len(waits),
            "heldActions": len(counts), "cubeFrames": dict(modes)}


if __name__ == "__main__":
    results = [verify(game) for game in range(1, 6)]
    (OUT / "presentation-validation.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
