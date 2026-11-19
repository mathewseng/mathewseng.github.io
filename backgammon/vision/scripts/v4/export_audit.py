"""Export frame-matched, board-only detection data for the website audit view."""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR, local_path

BASE = ARTIFACT_DIR / "v2"
STATES = local_path("OFFICE3_VISION_STATE_DIR", BASE / "state")


def confidence(score):
    return round(100 * score)


def pack(state):
    if not state:
        return None
    checkers = [
        [*reading["center"], int(reading["color"] == "dark"), confidence(reading["score"])]
        for reading in state.get("checkers", [])
    ]
    dice = [
        [*reading["center"], reading["value"] or 0, reading["candidateValue"],
         confidence(reading["score"])]
        for reading in state.get("dice", [])
    ]
    cube = state.get("cube")
    if cube:
        cube = [*cube["center"], cube["face"] or 0, confidence(cube["score"])]
    packed = [checkers, dice, cube, state.get("handRegions", [])]
    counts = []
    for reading in state.get("stackReadings", []):
        if reading["method"] == "supplemental-tall-stack-reader":
            point = reading["point"]
            color = int(reading["color"] == "dark")
            counts.append([point, color, state["points"][point - 1][color]])
    if counts:
        packed.append(counts)
    return packed


def export(number, directory):
    game = json.loads((BASE / f"game-{number}-analysis.json").read_text())
    destination = directory / f"game-{number:02}.json.gz"
    count = 0
    with gzip.open(destination, "wt", compresslevel=5) as output:
        output.write('{"fps":25,"frames":[')
        for part in game["segments"]:
            source = Path(part["source"]).with_suffix(".jsonl.gz").name
            with gzip.open(STATES / source, "rt") as clip:
                for i, line in enumerate(clip):
                    if i >= part["lastExclusive"]:
                        break
                    if i < part["firstFrame"]:
                        continue
                    if count:
                        output.write(",")
                    json.dump(pack(json.loads(line)["state"]), output, separators=(",", ":"))
                    count += 1
        output.write("]}")
    assert count == game["frames"]
    print(destination.name, count, destination.stat().st_size, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("games", nargs="*", type=int, choices=range(1, 6))
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for number in args.games or range(1, 6):
        export(number, args.directory)


if __name__ == "__main__":
    main()
