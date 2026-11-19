"""Read dice near the bar from automatically tracked, unoccluded camera frames."""
import argparse
from collections import defaultdict
from functools import lru_cache
import gzip
import json
from math import dist
from pathlib import Path

import numpy as np
import torch

from train_pip_reader import FaceReader, probabilities, sample
from project_paths import ARTIFACT_DIR


@lru_cache(maxsize=12)
def read_states(path):
    with gzip.open(path, "rt") as stream:
        return [json.loads(line)["state"] for line in stream]


def clear_die(state, center):
    x, y = center
    return any(score >= .38 and dist(center, (cx, cy)) <= 8
               for cx, cy, score in state["diceLocations"]) and not any(
                   left - 3 <= x <= right + 3 and top - 3 <= y <= bottom + 3
                   for left, top, right, bottom in state["handRegions"])


def observations(plan, pose):
    for number in range(1, 6):
        game = json.loads((ARTIFACT_DIR / "v2" / f"game-{number}-analysis.json").read_text())
        turns = json.loads((plan / f"game-{number:02}-plan.json").read_text())
        for turn in turns:
            evidence = turn.get("fanEvidence")
            if not evidence or not turn.get("before") or not turn.get("after") or any(turn["dice"]):
                continue
            start = turn["start"]
            witnesses = 0
            for frame in range(start, min(evidence["lastVisibleDie"] + 1, start + 25)):
                segment = next(part for part in reversed(game["segments"]) if part["firstGameFrame"] <= frame)
                source = segment["source"]
                local = segment["firstFrame"] + frame - segment["firstGameFrame"]
                state = read_states(pose / Path(source).with_suffix(".jsonl.gz"))[local]
                if not state or not all(clear_die(state, center) for center in turn["centers"]):
                    continue
                for index, center in enumerate(turn["centers"]):
                    yield dict(game=number, rollFrame=start, die=index, target=center, label="0",
                               source=source, clip=segment["clip"], frame=local, gameFrame=frame)
                witnesses += 1
                if witnesses == 12:
                    break


def face_summary(scores):
    mean = scores.mean(axis=0)
    best, runner = np.argsort(mean)[-2:][::-1]
    return dict(face=int(best), probability=float(mean[best]), margin=float(mean[best] - mean[runner]),
                agree=int((scores.argmax(axis=1) == best).sum()))


def scan(plan, pose, weights, output):
    inputs = list(observations(plan, pose))
    if not inputs:
        return []
    patches, rows = sample(inputs, output, offsets=(0,))
    assert len(rows) == len(inputs), "The face scan must include every selected camera frame."
    reader = FaceReader().eval()
    reader.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True))
    rectified = probabilities(reader, patches[:, 0], True)
    native = probabilities(reader, patches[:, 1], True)
    groups = defaultdict(list)
    for index, row in enumerate(rows):
        groups[row["game"], row["rollFrame"], row["die"]].append(index)
    turns = defaultdict(list)
    for (game, start, _), indices in groups.items():
        turns[game, start].append(dict(center=rows[indices[0]]["target"],
                                       frames=[rows[index]["gameFrame"] for index in indices],
                                       native=face_summary(native[indices]),
                                       rectified=face_summary(rectified[indices])))
    return [dict(game=game, start=start, tracks=tracks) for (game, start), tracks in turns.items()]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plans", type=Path)
    parser.add_argument("poses", type=Path)
    parser.add_argument("weights", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    result = scan(args.plans, args.poses, args.weights, args.output)
    (args.output / "short-roll-faces.json").write_text(json.dumps(result, indent=2) + "\n")
