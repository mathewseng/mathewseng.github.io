"""Check a fixed-weight dice reader blend on newly reviewed camera clips."""
import argparse
import json
from pathlib import Path

import cv2
import torch

from train_face_tracks import ARTIFACT_DIR, FaceReader, probabilities, reviewed_tracks, source_patches, test_spots


def reader(path):
    model = FaceReader().eval()
    model.load_state_dict(torch.load(path, map_location="cpu", weights_only=True))
    return model


def validate(controls, checkpoint):
    directory = Path(__file__).parent
    samples = reviewed_tracks(controls)
    earlier = json.loads((directory / "labels.json").read_text())["dice"]
    earlier += test_spots() + reviewed_tracks(directory / "reviewed-dice-tracks.json")
    assert not ({row["clip"] for row in samples} & {row["clip"] for row in earlier})
    baseline = reader(ARTIFACT_DIR / "models/dice_real.pt")
    candidate = reader(checkpoint)
    results = []
    for sample, patches in zip(samples, source_patches(samples), strict=True):
        old = probabilities(baseline, patches, True).mean(axis=0)
        trial = probabilities(candidate, patches, True).mean(axis=0)
        results.append({**sample, "label": int(sample["label"]), "baseline": int(old.argmax()),
                        "candidate": int(trial.argmax()), "blend": int((old + trial).argmax())})
    metrics = {key: sum(row[key] == row["label"] for row in results) for key in ("baseline", "candidate", "blend")}
    return {"faces": len(results), "clips": len({row["clip"] for row in results}), "metrics": metrics, "tests": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("controls", type=Path)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    result = validate(args.controls, args.checkpoint)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(result["faces"], result["clips"], result["metrics"], flush=True)
