"""Compare face readers using the production detector gates near reviewed dice."""
import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import gzip
import json
from math import dist
from pathlib import Path

import cv2

from train_face_tracks import ARTIFACT_DIR, reviewed_tracks
from v2.vision import CameraReader, within_hand


def result_for(observations, center, expected):
    nearest = min(observations, key=lambda item: dist(item["center"], center), default=None)
    if nearest is None or dist(nearest["center"], center) > 8:
        return "missing"
    if nearest["value"] is None:
        return "uncertain"
    return "correct" if nearest["value"] == expected else "wrong"


def compare(controls, checkpoint):
    samples = [sample for sample in reviewed_tracks(controls) if sample["split"] == "spotExtra"]
    if not samples:
        raise ValueError("At least one held-out face is required.")
    grouped = defaultdict(list)
    for sample in samples:
        grouped[sample["source"]].append(sample)
    readers = {"current": CameraReader(), "candidate": CameraReader(face_reader=checkpoint)}
    total = {name: Counter() for name in readers}
    tests = []
    for source, labels in grouped.items():
        archive = ARTIFACT_DIR / "state" / Path(source).with_suffix(".jsonl.gz").name
        with gzip.open(archive, "rt") as stream:
            states = [json.loads(line)["state"] for line in stream]
        capture = cv2.VideoCapture(str(ARTIFACT_DIR / "board" / source))
        try:
            for sample in labels:
                counts = {name: Counter() for name in readers}
                anchor = sample["frame"]
                x, y = sample["target"]
                expected = int(sample["label"])
                for frame in range(max(0, anchor - 12), min(len(states), anchor + 13)):
                    state = states[frame]
                    if state is None or within_hand(x, y, state["handRegions"], 12):
                        continue
                    capture.set(cv2.CAP_PROP_POS_FRAMES, frame)
                    ok, pixels = capture.read()
                    if not ok:
                        raise ValueError(f"Cannot read {source} frame {frame}")
                    for name, reader in readers.items():
                        detected = reader.refine(pixels, deepcopy(state))["dice"]
                        counts[name][result_for(detected, (x, y), expected)] += 1
                for name, count in counts.items():
                    total[name].update(count)
                tests.append({**sample, "label": expected, **counts})
        finally:
            capture.release()
    return {"counts": total, "tests": tests}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("controls", type=Path)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    result = compare(args.controls, args.checkpoint)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(result["counts"], flush=True)
