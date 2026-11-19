"""Train a local checker detector on reviewed discs, occlusions, dice, and cube crops."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import center_crop
from project_paths import ARTIFACT_DIR
from train_vision import FaceReader

CLASSES = ('other', 'white', 'dark')
HOLDOUT = {11, 17, 26, 33, 36, 42, 47, 56, 63, 71}


def source_patches(labels):
    recordings = {game: json.loads((ARTIFACT_DIR / 'v2' / f'game-{game}-analysis.json').read_text())
                  for game in range(1, 6)}
    by_clip = defaultdict(list)
    for i, label in enumerate(labels):
        frame = label['sourceFrame']
        segment = next(p for p in recordings[label['game']]['segments']
                       if p['clip'] == label['clip'] and p['firstFrame'] <= frame < p['lastExclusive'])
        assert label['frame'] == segment['firstGameFrame'] + frame - segment['firstFrame']
        by_clip[segment['source']].append((i, label))
    crops = [None] * len(labels)
    for source, samples in by_clip.items():
        camera = cv2.VideoCapture(str(ARTIFACT_DIR / 'board' / source))
        try:
            for i, sample in samples:
                camera.set(cv2.CAP_PROP_POS_FRAMES, sample['sourceFrame'])
                found, pixels = camera.read()
                if not found:
                    raise ValueError(f'Missing camera frame {source} {sample["sourceFrame"]}')
                crops[i] = center_crop(pixels, *sample['center'])
        finally:
            camera.release()
    return crops


def augment(image, random):
    matrix = cv2.getRotationMatrix2D((15.5, 15.5), float(random.uniform(-16, 16)), float(random.uniform(.88, 1.12)))
    matrix[:, 2] += random.uniform(-2.6, 2.6, size=2)
    warped = cv2.warpAffine(image, matrix, (32, 32), borderMode=cv2.BORDER_REFLECT_101)
    if random.random() < .5:
        warped = warped[:, ::-1]
    shifted = warped * random.uniform(.78, 1.2) + random.uniform(-12, 12, (1, 1, 3))
    return np.clip(shifted, 0, 255).astype(np.uint8)


def tensor(images):
    return torch.from_numpy(np.stack(images).transpose(0, 3, 1, 2).copy()).float() / 255


def category(label):
    return CLASSES.index(label) if label in CLASSES else 0


def train(labels, crops, output):
    fit = [(r, crop) for r, crop in zip(labels, crops, strict=True) if r['clip'] not in HOLDOUT]
    held = [(r, crop) for r, crop in zip(labels, crops, strict=True) if r['clip'] in HOLDOUT]
    assert fit and held and len({category(row['label']) for row, _ in fit}) == len(CLASSES)
    random = np.random.default_rng(6333)
    images = tensor([augment(crop, random) if i else crop for _, crop in fit for i in range(12)])
    targets = torch.tensor([category(row['label']) for row, _ in fit for _ in range(12)])
    weights = torch.bincount(targets, minlength=len(CLASSES)).float().rsqrt()
    reader = FaceReader()
    reader[-1] = torch.nn.Linear(64, len(CLASSES))
    optimizer = torch.optim.AdamW(reader.parameters(), lr=.001)
    for _ in range(24):
        for batch in torch.randperm(len(images)).split(32):
            loss = torch.nn.functional.cross_entropy(reader(images[batch]), targets[batch], weight=weights)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
    reader.eval()
    with torch.inference_mode():
        predictions = reader(tensor([crop for _, crop in held])).softmax(dim=1)
    checks = [dict(row, read=CLASSES[int(probs.argmax())], confidence=round(float(probs.max()), 4))
              for (row, _), probs in zip(held, predictions, strict=True)]
    output.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(reader, torch.zeros(1, 3, 32, 32), output / 'checker-centers.onnx',
                      input_names=['patches'], output_names=['logits'], opset_version=17,
                      dynamic_axes={'patches': {0: 'batch'}, 'logits': {0: 'batch'}}, dynamo=False)
    (output / 'checker-center-validation.json').write_text(json.dumps({
        'training': len(fit), 'holdoutClips': sorted(HOLDOUT), 'held': checks,
    }) + '\n')
    print('Training images', len(fit), 'Held-out images', len(held), 'Correct',
          sum(check['read'] == CLASSES[category(check['label'])] for check in checks), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(20261117)
    labels = [r for r in json.loads(Path(__file__).with_name('reviewed-checker-centers.json').read_text())
              if r['label'] != '?']
    train(labels, source_patches(labels), args.output)
