"""Fine-tune the die locator on visible dice and their empty-board controls."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys

import cv2
import numpy as np
import torch
from torch.nn import functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import center_crop
from project_paths import ARTIFACT_DIR
from v2.train_dice_locator import DiceLocator, GRID, SIDE, camera_data, heat, real_example, tensors


def reviewed_crops(rows):
    splits = {"train": [], "test": []}
    clip_groups = {key: set() for key in splits}
    for row in rows:
        game = row["game"]
        recording = json.loads((ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json").read_text())
        for when, visible in [(row["visible"], True), *((value, False) for value in row["empty"])]:
            anchor = round(when * 25)
            section = next(part for part in reversed(recording["segments"]) if part["firstGameFrame"] <= anchor)
            clip_groups[row["split"]].add(section["clip"])
            capture = cv2.VideoCapture(str(ARTIFACT_DIR / "board" / section["source"]))
            # Empty controls are tightly centered so a later throw cannot contaminate them.
            offsets = range(-12, 13, 2) if visible else [-1, 0, 1]
            for offset in offsets:
                local = anchor + offset - section["firstGameFrame"] + section["firstFrame"]
                if not section["firstFrame"] <= local < section["lastExclusive"]:
                    continue
                capture.set(cv2.CAP_PROP_POS_FRAMES, local)
                ok, frame = capture.read()
                if not ok:
                    raise ValueError((game, local))
                for x, y in row["centers"]:
                    pixels = center_crop(frame, x, y, SIDE // 2)
                    target = np.zeros((GRID, GRID), dtype=np.float32)
                    if visible:
                        for a, b in row["centers"]:
                            heat(target, SIDE // 2 + a - x, SIDE // 2 + b - y)
                    splits[row["split"]].append((pixels, target))
            capture.release()
    assert not (clip_groups["train"] & clip_groups["test"])
    return splits, clip_groups


def evaluate(model, data):
    images, _ = tensors(data, "cpu")
    with torch.inference_mode():
        near = model(images.float() / 255).sigmoid()[:, 0, 13:20, 13:20].amax(dim=(1, 2)).numpy()
    visible = np.array([heatmap[16, 16] >= .5 for _, heatmap in data])
    called = near > .39
    return {"visible": int(visible.sum()), "empty": int((~visible).sum()),
            "located": int((called & visible).sum()), "falseLeads": int((called & ~visible).sum())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("labels", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(490)
    rng = np.random.default_rng(490)
    split, clips = reviewed_crops(json.loads(args.labels.read_text()))
    reference = camera_data()
    train = split["train"] + [real_example(item, rng, augmented)
                              for item in reference if item[1]["split"] == "train"
                              and int(item[1]["image"].split("_")[0]) not in clips["test"]
                              for augmented in (False, True)]
    old_test = [real_example(item, rng, False) for item in reference if item[1]["split"] == "test"]
    baseline = DiceLocator().eval()
    weights = torch.load(ARTIFACT_DIR / "v2/dice-locator.pt", map_location="cpu", weights_only=True)
    baseline.load_state_dict(weights)
    trial = deepcopy(baseline)
    for layer in list(trial.children())[:-2]:
        layer.requires_grad_(False)
    inputs, masks = tensors(train, "cpu")
    inputs = inputs.float() / 255
    masks = masks.float() / 255
    with torch.no_grad():
        prior = baseline(inputs).sigmoid()
    optimizer = torch.optim.AdamW((p for p in trial.parameters() if p.requires_grad), lr=.0006)
    for _ in range(7):
        for items in torch.randperm(len(inputs)).split(32):
            scores = trial(inputs[items])
            loss = F.binary_cross_entropy_with_logits(scores, masks[items], pos_weight=torch.tensor(18.))
            loss += .20 * F.binary_cross_entropy_with_logits(scores, prior[items])
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"reviewedTrainingCrops": len(split["train"]), "heldClips": sorted(clips["test"]),
              "runtimeThreshold": .39, "tests": {
        name: {"current": evaluate(baseline, samples), "trial": evaluate(trial, samples)}
        for name, samples in [("newCamera", split["test"]), ("priorLabels", old_test)]
    }}
    torch.save(trial.state_dict(), args.output / "dice-locator-candidate.pt")
    torch.onnx.export(trial, torch.zeros(1, 3, SIDE, SIDE), args.output / "dice-locator-candidate.onnx",
        opset_version=17, input_names=["pixels"], output_names=["scores"],
        dynamic_axes={"pixels": {0: "batch", 2: "h", 3: "w"}, "scores": {0: "batch", 2: "h2", 3: "w2"}},
        dynamo=False)
    (args.output / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    print(report, flush=True)


if __name__ == "__main__":
    main()
