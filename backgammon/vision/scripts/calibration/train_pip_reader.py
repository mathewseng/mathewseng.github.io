"""Compare the dice reader with training on tracked source crops and synthetic pips."""
import argparse
from collections import defaultdict
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.nn import functional as F

from train import dice_jitter, probabilities, tensor
from train_face_tracks import camera_jitter
from train_native_face_tracks import sample
from train_vision import FaceReader, render_face
from project_paths import ARTIFACT_DIR


def reviewed_anchors(file):
    games = {}
    for roll in json.loads(file.read_text()):
        game = roll["game"]
        if game not in games:
            source = ARTIFACT_DIR / "v2" / f"game-{game}-analysis.json"
            games[game] = json.loads(source.read_text())["segments"]
        for frame, *faces in roll["frames"]:
            part = next(item for item in reversed(games[game]) if item["firstGameFrame"] <= frame)
            local = part["firstFrame"] + frame - part["firstGameFrame"]
            assert local < part["lastExclusive"]
            for index, (center, face) in enumerate(zip(roll["centers"], faces, strict=True)):
                if face is not None:
                    yield dict(game=game, source=part["source"], clip=part["clip"], frame=local,
                               gameFrame=frame, target=center, label=str(face), split=roll["split"],
                               rollFrame=roll["start"], die=index, views=1)


def synthetic_face(face, background, color, rng):
    pixels, alpha = render_face(color, face, rng)
    pixels, alpha = pixels[4:36, 4:36], alpha[4:36, 4:36, None]
    base = cv2.GaussianBlur(background, (0, 0), 3.2)
    view = base * (1 - alpha) + pixels * alpha
    noise = rng.normal(0, rng.uniform(1, 5), (32, 32, 1))
    view = np.uint8(np.clip(view + noise, 0, 255))
    return camera_jitter(view, rng) if rng.random() < .8 else view


def fit(candidate, real, backgrounds, rng):
    views = []
    labels = []
    for patch, face in real:
        for index in range(9):
            view = dice_jitter(patch, rng) if index else patch
            views.append(camera_jitter(view, rng) if index in (2, 5, 8) else view)
            labels.append(face)
    real_count = len(labels)
    for face in range(1, 7):
        for index in range(260):
            background = backgrounds[rng.integers(len(backgrounds))]
            views.append(synthetic_face(face, background, 2 + index % 2, rng))
            labels.append(face)

    inputs, targets = tensor(views), torch.tensor(labels)
    weights = torch.bincount(targets[:real_count], minlength=7).clamp_min(1).float().pow(-.30)
    weights /= weights.mean()
    candidate[0].requires_grad_(False)
    candidate[1].requires_grad_(False)
    optimizer = torch.optim.AdamW((p for p in candidate.parameters() if p.requires_grad), lr=.00048)
    for epoch in range(24):
        stop = len(targets) if epoch < 16 else real_count
        for batch in torch.randperm(stop).split(64):
            loss = F.cross_entropy(candidate(inputs[batch]), targets[batch], reduction="none")
            attention = torch.where(batch < real_count, 1.0, .42) * weights[targets[batch]]
            optimizer.zero_grad(set_to_none=True)
            (loss * attention).mean().backward()
            optimizer.step()
    return len(labels) - real_count


def evaluate(baseline, candidate, patches, rows, group_by_die):
    reference = probabilities(baseline, patches[:, 0], True)
    alternate = probabilities(candidate, patches.reshape(-1, 32, 32, 3), True).reshape(len(rows), 3, 7).mean(axis=1)
    groups = defaultdict(list)
    for index, row in enumerate(rows):
        key = (row["game"], row["rollFrame"], row["die"]) if group_by_die else index
        groups[key].append(index)
    tests = []
    for indexes in groups.values():
        first = rows[indexes[0]]
        assert all(rows[index]["label"] == first["label"] for index in indexes)
        old, new = reference[indexes].mean(axis=0), alternate[indexes].mean(axis=0)
        tests.append(dict(game=first["game"], clip=first["clip"], frame=first.get("rollFrame"),
                          die=first.get("die"), expected=int(first["label"]), views=len(indexes),
                          baseline=int(old.argmax()), candidate=int(new.argmax()), blend=int((old + new).argmax())))
    return {
        "tracks": len(tests), "clips": len({row["clip"] for row in rows}),
        "correct": {field: sum(row[field] == row["expected"] for row in tests)
                    for field in ("baseline", "candidate", "blend")},
        "tests": tests,
    }


def run(cached, output):
    cached_rows = json.loads((cached / "samples.json").read_text())
    patches = np.load(cached / "patches.npy")
    anchors = list(reviewed_anchors(Path(__file__).with_name("reviewed-native-pip-frames.json")))
    fresh, fresh_rows = sample(anchors, output, offsets=(0,))
    assert len(fresh_rows) == len(anchors), "Every manually labeled source frame must be sampled."

    training = [index for index, row in enumerate(cached_rows) if row["split"] == "train"]
    control = [index for index, row in enumerate(cached_rows) if index not in training and row["cohort"] != "unresolved"]
    fresh_train = [index for index, row in enumerate(fresh_rows) if row["split"] == "train"]
    fresh_held = [index for index, row in enumerate(fresh_rows) if row["split"] == "holdout"]
    train_clips = {cached_rows[index]["clip"] for index in training} | {fresh_rows[index]["clip"] for index in fresh_train}
    held_clips = {cached_rows[index]["clip"] for index in control} | {fresh_rows[index]["clip"] for index in fresh_held}
    assert not train_clips & held_clips

    weights = torch.load(ARTIFACT_DIR / "models/dice_real.pt", map_location="cpu", weights_only=True)
    baseline, candidate = FaceReader().eval(), FaceReader().eval()
    baseline.load_state_dict(weights)
    candidate.load_state_dict(weights)
    real = [(patch, int(cached_rows[index]["label"])) for index in training for patch in patches[index]]
    real += [(fresh[index, 1], int(fresh_rows[index]["label"])) for index in fresh_train]
    backgrounds = [patches[index, 0] for index in training if cached_rows[index]["label"] == "0"]
    synthetic_count = fit(candidate, real, backgrounds, np.random.default_rng(38))

    previous = evaluate(baseline, candidate, patches[control], [cached_rows[i] for i in control], False)
    added = evaluate(baseline, candidate, fresh[fresh_held], [fresh_rows[i] for i in fresh_held], True)
    result = dict(trainingClips=len(train_clips), priorTrainingTracks=len(training),
                  addedTrainingFaces=len(fresh_train), addedHeldFaces=len(fresh_held),
                  syntheticFaces=synthetic_count, previous=previous, added=added)
    (output / "pip-reader-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    torch.save(candidate.state_dict(), output / "dice-pip-candidate.pt")
    torch.onnx.export(candidate, torch.zeros(1, 3, 32, 32), output / "dice-pip-candidate.onnx",
                      input_names=["patches"], output_names=["logits"], opset_version=17,
                      dynamic_axes={"patches": {0: "batch"}, "logits": {0: "batch"}}, dynamo=False)
    for cohort in (previous, added):
        print({key: value for key, value in cohort.items() if key != "tests"}, flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("native_cache", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.native_cache.resolve() == args.output.resolve():
        parser.error("The trial output must be separate from the original native crop cache.")
    args.output.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(1)
    torch.set_num_threads(3)
    torch.manual_seed(38)
    run(args.native_cache, args.output)
