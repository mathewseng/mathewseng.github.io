"""Train dice faces on visible frames around independently reviewed stationary dice."""
import argparse
from collections import defaultdict
import gzip
import json
from math import dist
from pathlib import Path
import sys

import cv2
import numpy as np
import torch
from torch.nn import functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import center_crop
from project_paths import ARTIFACT_DIR
from train_vision import FaceReader
from train import dice_jitter, probabilities, tensor
from verify_spots import SPOTS

SAMPLE_OFFSETS = (-15, -10, -5, -2, 0, 2, 5, 10, 15)


def source_patches(samples):
    groups = defaultdict(list)
    for index, item in enumerate(samples):
        groups[item["source"]].append((index, item))
    result = {}
    for source, examples in groups.items():
        archive = ARTIFACT_DIR / "v2/state" / Path(source).with_suffix(".jsonl.gz").name
        with gzip.open(archive, "rt") as handle:
            frames = [json.loads(line)["state"] for line in handle]
        capture = cv2.VideoCapture(str(ARTIFACT_DIR / "board" / source))
        for index, item in examples:
            anchor = item["frame"]
            x, y = item["target"]
            centers = [(anchor, x, y)]
            for offset in SAMPLE_OFFSETS:
                f = anchor + offset
                if not offset or not 0 <= f < len(frames) or not frames[f] or item["label"] == "0":
                    continue
                reading = frames[f]
                if any(left - 14 <= x <= right + 14 and top - 14 <= y <= bottom + 14
                       for left, top, right, bottom in reading["handRegions"]):
                    continue
                die = min((d for d in reading["dice"] if d["locationScore"] >= .22),
                          key=lambda d: dist(d["center"], (x, y)), default=None)
                if die and dist(die["center"], (x, y)) <= 4:
                    centers.append((f, *die["center"]))
            patches = []
            for f, px, py in centers:
                capture.set(cv2.CAP_PROP_POS_FRAMES, f)
                ok, image = capture.read()
                if not ok:
                    raise ValueError(f"Could not read {source} frame {f}")
                patches.append(center_crop(image, px, py))
            result[index] = patches
        capture.release()
    return [result[index] for index in range(len(samples))]


def test_spots():
    spots = []
    held = [*SPOTS, (4, 6500, 6575, [(384, 256, 5), (496, 318, 4)]),
            (5, 11800, 11880, [(196, 106, 4), (246, 212, 5)]),
            (5, 16825, 16915, [(106, 338, 5), (124, 364, 1)])]
    for game, start, stop, dice in held:
        recording = json.loads((ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json").read_text())
        f = (start + stop) // 2
        source = next(part for part in reversed(recording["segments"]) if part["firstGameFrame"] <= f)
        for x, y, face in dice:
            spots.append(dict(game=game, source=source["source"], clip=source["clip"],
                              frame=source["firstFrame"] + f - source["firstGameFrame"],
                              target=[x, y], label=str(face), rollFrame=start, split="spot"))
    return spots


def reviewed_tracks(file):
    rows = []
    for item in json.loads(file.read_text()):
        game, split = item["game"], item["split"]
        assert split in ("train", "spotExtra")
        frame = round(25 * item["seconds"])
        recording = json.loads((ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json").read_text())
        source = next(part for part in reversed(recording["segments"]) if part["firstGameFrame"] <= frame)
        local = source["firstFrame"] + frame - source["firstGameFrame"]
        assert local < source["lastExclusive"]
        for x, y, face in item["dice"]:
            rows.append(dict(game=game, source=source["source"], clip=source["clip"],
                             frame=local, target=[x, y], label=str(face), split=split))
    return rows


def fit(baseline, candidate, patches, labels, rng):
    examples, targets = [], []
    for group, label in zip(patches, labels):
        for i in range(14):
            patch = group[i % len(group)]
            examples.append(dice_jitter(patch, rng) if i else patch)
            targets.append(label)
    inputs = tensor(examples)
    expected = torch.tensor(targets)
    weights = torch.bincount(expected, minlength=7).clamp_min(1).float().pow(-.35)
    for layer in list(candidate.children())[:-3]:
        layer.requires_grad_(False)
    optimizer = torch.optim.AdamW((p for p in candidate.parameters() if p.requires_grad), lr=.00035)
    with torch.no_grad():
        prior = baseline(inputs).softmax(1)
    candidate.eval()
    for _ in range(18):
        for batch in torch.randperm(len(inputs)).split(48):
            logits = candidate(inputs[batch])
            loss = F.cross_entropy(logits, expected[batch], weight=weights)
            loss += .24 * F.kl_div(logits.log_softmax(1), prior[batch], reduction="batchmean")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", type=Path, help="Additional labeled dice tracks")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(372)
    rng = np.random.default_rng(372)
    reviewed = json.loads(Path(__file__).with_name("labels.json").read_text())["dice"]
    extra = reviewed_tracks(args.reviewed) if args.reviewed else []
    extra_training = [item for item in extra if item["split"] == "train"]
    spots = [item for item in extra if item["split"] == "spotExtra"] + test_spots()
    held_clips = {item["clip"] for item in spots}
    training = [item for item in reviewed + extra_training if item["split"] == "train" and item["label"] != "?"
                and item["clip"] not in held_clips]
    held = [item for item in reviewed if item["split"] == "test" and item["label"] != "?"]
    assert not ({item["clip"] for item in training} & {item["clip"] for item in held + spots})
    groups = source_patches(training + held + spots)
    baseline, candidate = FaceReader().eval(), FaceReader().eval()
    weights = torch.load(ARTIFACT_DIR / "models/dice_real.pt", map_location="cpu", weights_only=True)
    baseline.load_state_dict(weights)
    candidate.load_state_dict(weights)
    fit(baseline, candidate, groups[:len(training)], [int(row["label"]) for row in training], rng)
    tests = {kind: [] for kind in (["test", "spot", "spotExtra"] if extra else ["test", "spot"])}
    for item, group in zip(held + spots, groups[len(training):]):
        old, new = probabilities(baseline, group, True), probabilities(candidate, group, True)
        tests[item["split"]].append(dict(game=item["game"], clip=item["clip"], patches=len(group),
            expected=int(item["label"]), baselineFrame=int(old[0].argmax()),
            baselineTrack=int(old.mean(axis=0).argmax()), candidateTrack=int(new.mean(axis=0).argmax())))
    summary = {kind: dict(tracks=len(rows), **{
        key: sum(row[key] == row["expected"] for row in rows)
        for key in ("baselineFrame", "baselineTrack", "candidateTrack")
    }) for kind, rows in tests.items()}
    directory = args.output or ARTIFACT_DIR / "calibration"
    if args.output is None and extra:
        directory /= "extra-dice-tracks"
    directory.mkdir(parents=True, exist_ok=True)
    torch.save(candidate.state_dict(), directory / "dice-track-candidate.pt")
    result = dict(trainingTracks=len(training), trainingFrames=sum(map(len, groups[:len(training)])),
                  summary=summary, tests=tests)
    if extra:
        result["extraTrainingTracks"] = sum(item in extra_training for item in training)
    (directory / "dice-track-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "tests"}), flush=True)


if __name__ == "__main__":
    main()
