"""Collect temporal dice candidates and cube observations without changing older outputs."""
import argparse
from collections import Counter
from math import hypot
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from v3.reconcile import combine_dice, direct_pairs, verified_cube_events

OUT = ARTIFACT_DIR / "v4"


def half(x):
    # Leave margin on either side of the center bar in the rectified 560 px image.
    if x <= 260:
        return "white"
    if x >= 310:
        return "dark"
    return None


def stationary_tracks(tracks, breaks):
    """Group repeated reads of a die in one physical resting pose."""
    merged = []
    for track in sorted(tracks, key=lambda t: t["start"]):
        if track["location"] < .235 or track["samples"] < 7:
            continue
        match = next((t for t in reversed(merged)
                      if -12 <= track["start"] - t["end"] <= 72
                      and hypot(track["x"] - t["x"], track["y"] - t["y"]) < 7
                      and not any(t["end"] < cut <= track["start"] for cut in breaks)), None)
        if match is None:
            match = {**track, "reads": [], "witnesses": []}
            merged.append(match)
        match["end"] = max(match["end"], track["end"])
        match["reads"].append(track)
        match["witnesses"].append(track["id"])
    for track in merged:
        votes = Counter()
        for read in track["reads"]:
            if read["value"]:
                votes[read["value"]] += read["samples"] * read["quality"]
        best = votes.most_common(1)
        strongest = max((r["quality"] for r in track["reads"] if r["value"]), default=0)
        track["samples"] = sum(r["samples"] for r in track["reads"])
        supported = best and strongest >= .73 and best[0][1] >= sum(votes.values()) * .67
        track["value"] = best[0][0] if supported else 0
        track["quality"] = max(.67, strongest) if track["samples"] >= 16 else strongest
        body = {read["bodyColor"] for read in track["reads"]
                if read.get("bodyConfidence", 0) >= .85 and read.get("bodySamples", 0) >= 5}
        # Both dice need independent corroboration. Suppress this channel
        # when a track joins incompatible observations.
        track["bodyColor"] = next(iter(body)) if len(body) == 1 else None
        located = {read["locationBody"] for read in track["reads"] if read.get("locationBody")}
        track["locationBody"] = next(iter(located)) if len(located) == 1 else None
    return [t for t in merged if t["samples"] >= 13 and t["end"] - t["start"] >= 15]


def gather(game, tracks, corrections, verify_roller_color=False):
    dice, presence, cube, breaks, reviewed = [], [], [], [], []
    for section in game["segments"]:
        clip = section["clip"]
        first, last = section["firstFrame"], section["lastExclusive"]
        at = section["firstGameFrame"]
        shift = at - first
        if section["discontinuity"]:
            breaks.append(at)
        for key, output in (("dice", dice), ("presence", presence), ("cube", cube)):
            for candidate in tracks[clip].get(key, []):
                if candidate["end"] < first or candidate["start"] >= last:
                    continue
                output.append({
                    **candidate, "start": max(first, candidate["start"]) + shift,
                    "end": min(last - 1, candidate["end"]) + shift, "clip": clip,
                })
        for correction in corrections:
            if correction["clip"] == clip and correction["last"] >= first and correction["first"] < last:
                reviewed.append({
                    **correction, "start": max(first, correction["first"]) + shift,
                    "end": min(last - 1, correction["last"]) + shift,
                })
    individual = combine_dice(dice, breaks)

    def compatible(a, b):
        # In ordinary play both dice land in the roller's right half.
        if half(a["x"]) == half(b["x"]) and half(a["x"]):
            return True
        # The opening toss can use one die from each side. Legal move and
        # standard opening checks later decide whether to use these candidates.
        return (
            game["number"] > 1 and max(a["start"], b["start"]) <= 450
            and bool(half(a["x"])) and bool(half(b["x"])) and a["value"] != b["value"]
        )

    physical = stationary_tracks(dice, breaks)
    pairs = direct_pairs(physical, breaks, compatible)
    if presence:
        locations = stationary_tracks(presence, breaks)
        # Keep existing pairs. An unread die can add a proposal only if two
        # stationary bodies agree on the roller.
        def compatible_presence(a, b):
            return bool((a.get("physicalOnly") or b.get("physicalOnly"))
                        and a.get("locationBody") and a.get("locationBody") == b.get("locationBody")
                        and half(a["x"]) and half(a["x"]) == half(b["x"]))
        extra = direct_pairs(physical + locations, breaks, compatible_presence)
        pairs.extend(pair for pair in extra if not any(
            min(old["end"], pair["end"]) - max(old["start"], pair["start"]) >= 0 for old in pairs))
        pairs.sort(key=lambda pair: pair["start"])
    events = []
    for pair in pairs:
        a, b = pair["tracks"]
        common = half(a["x"])
        opening = common != half(b["x"])
        body = a["bodyColor"] if a["bodyColor"] == b["bodyColor"] else None
        if (verify_roller_color or a.get("physicalOnly") or b.get("physicalOnly")) and (
                a["locationBody"] and a["locationBody"] == b["locationBody"]):
            body = a["locationBody"]

        if opening:
            if not a["value"] or not b["value"]:
                continue
            common = half(a["x"] if a["value"] > b["value"] else b["x"])
        elif body:
            common = body
        events.append({
            "start": pair["start"], "end": pair["end"],
            "dice": (sorted([v for v in pair["dice"] if v]) + [None, None])[:2],
            "quality": pair["quality"], "player": common,
            "opening": opening, "actorEvidence": "dice-body-agreement" if body and not opening else "landing-side",
            "tracks": [a["id"], b["id"]],
            "centers": [[a["x"], a["y"]], [b["x"], b["y"]]],
        })
    for track in individual:
        if half(track["x"]) and track["quality"] >= .6:
            track["player"] = half(track["x"])
    return {
        "pairs": events, "individual": [
            {k: t[k] for k in ("start", "end", "quality", "player", "value", "id")}
            for t in individual if "player" in t
        ],
        "reviewed": reviewed, "cube": verified_cube_events(game, cube), "breaks": breaks,
    }


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("games", nargs="*", type=int, default=range(1, 6))
    args.add_argument("--tracks", type=Path, default=ARTIFACT_DIR / "v3/value-tracks.json")
    args.add_argument("--output", type=Path, default=OUT)
    args.add_argument("--verify-roller-color", action="store_true",
                      help="Use agreeing die body readings to identify the roller on either half.")
    options = args.parse_args()
    tracks = json.loads(options.tracks.read_text())
    corrections = json.loads((ARTIFACT_DIR / "v3/reviewed-corrections.json").read_text())
    corrections.extend(json.loads(Path(__file__).with_name("reviewed_rolls.json").read_text()))
    options.output.mkdir(parents=True, exist_ok=True)
    for number in options.games:
        game = json.loads((ARTIFACT_DIR / "v2" / f"game-{number}-analysis.json").read_text())
        content = gather(game, tracks, corrections, options.verify_roller_color)
        (options.output / f"game-{number:02}-observations.json").write_text(json.dumps(content) + "\n")
        print(number, len(content["pairs"]), "paired dice episodes", flush=True)


if __name__ == "__main__":
    main()
