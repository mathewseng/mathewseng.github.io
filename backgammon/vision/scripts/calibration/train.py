"""Fine-tune the Office-3 readers from independently reviewed source patches."""
import json
from pathlib import Path
import sys

import cv2
import numpy as np
import torch
from torch.nn import functional as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from train_vision import FaceReader
from v2.train_slots import SlotNet, jitter


def target(label):
    if label.startswith(('w', 'b')):
        return int(label[1:]) + (10 if label[0] == 'b' else 0)
    return int(label)


def tensor(images):
    return torch.from_numpy(np.stack(images).transpose(0, 3, 1, 2).copy()).float() / 255


def dice_jitter(image, rng):
    matrix = cv2.getRotationMatrix2D((15.5, 15.5), float(rng.uniform(-180, 180)), float(rng.uniform(.94, 1.08)))
    matrix[:, 2] += rng.uniform(-1.2, 1.2, size=2)
    return cv2.warpAffine(image, matrix, (32, 32), borderMode=cv2.BORDER_REFLECT_101)


def face_views(patch):
    return [patch, np.rot90(patch, 2), np.roll(patch, 2, axis=1), np.roll(patch, -2, axis=0)]


def probabilities(model, patches, is_dice):
    with torch.inference_mode():
        if not is_dice:
            return model(tensor(patches)).softmax(1).numpy()
        views = [view for patch in patches for view in face_views(patch)]
        logits = model(tensor(views)).softmax(1).reshape(len(patches), 4, -1)
        return (logits * torch.tensor([.58, .14, .14, .14])[None, :, None]).sum(dim=1).numpy()


def train(kind, rows, directory):
    is_dice = kind == 'dice'
    source = ARTIFACT_DIR / ('models/dice_real.pt' if is_dice else 'v2/slots.pt')
    architecture = FaceReader if is_dice else SlotNet
    baseline, candidate = architecture().eval(), architecture()
    weights = torch.load(source, map_location='cpu', weights_only=True)
    baseline.load_state_dict(weights)
    candidate.load_state_dict(weights)
    fitted = [(i, target(row['label'])) for i, row in enumerate(rows)
              if row['split'] == 'train' and row['label'] != '?']
    held = [(i, target(row['label'])) for i, row in enumerate(rows)
            if row['split'] == 'test' and row['label'] != '?']
    assert not ({rows[i]['clip'] for i, _ in fitted} & {rows[i]['clip'] for i, _ in held})
    patches = np.load(directory / f'{kind}.npy')
    rng = np.random.default_rng(20261117)
    augment = dice_jitter if is_dice else jitter
    X = tensor([augment(patches[i], rng) if repeat else patches[i]
                for i, _ in fitted for repeat in range(16)])
    labels = torch.tensor([value for _, value in fitted for _ in range(16)])
    class_count = 7 if is_dice else 21
    class_weights = torch.bincount(labels, minlength=class_count).clamp_min(1).float().pow(-.35)
    # Keep pretrained features stable and fine-tune the classification head.
    for layer in list(candidate.children())[:-4 if not is_dice else -3]:
        layer.requires_grad_(False)
    reference = tuple(parameter.detach().clone() for parameter in candidate.parameters() if parameter.requires_grad)
    trainable = tuple(parameter for parameter in candidate.parameters() if parameter.requires_grad)
    optimizer = torch.optim.AdamW(trainable, lr=.00045)
    with torch.inference_mode():
        teacher = baseline(X).softmax(1).clone()
    teacher = teacher.clone()
    for _ in range(18):
        candidate.eval()
        for batch in torch.randperm(len(X)).split(48):
            logits = candidate(X[batch])
            loss = F.cross_entropy(logits, labels[batch], weight=class_weights)
            loss += .12 * F.kl_div(logits.log_softmax(1), teacher[batch], reduction='batchmean')
            loss += .06 * sum((a - b).square().mean() for a, b in zip(trainable, reference))
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
    examples = patches[[i for i, _ in held]]
    old, new = probabilities(baseline, examples, is_dice), probabilities(candidate, examples, is_dice)
    tests = [dict(index=i, game=rows[i]['game'], clip=rows[i]['clip'], expected=expected,
                  baseline=int(prior.argmax()), candidate=int(trial.argmax()),
                  priorConfidence=round(float(prior.max()), 4), candidateConfidence=round(float(trial.max()), 4))
             for (i, expected), prior, trial in zip(held, old, new)]
    torch.save(candidate.state_dict(), directory / f'{kind}-candidate.pt')
    shape = (1, 3, *patches.shape[1:3])
    torch.onnx.export(candidate, torch.zeros(shape), directory / f'{kind}-candidate.onnx',
                      input_names=['patches'], output_names=['logits'], opset_version=17,
                      dynamic_axes={'patches': {0: 'batch'}, 'logits': {0: 'batch'}}, dynamo=False)
    return dict(reviewed=len(rows), unreadable=sum(row['label'] == '?' for row in rows),
                training=len(fitted), heldOut=len(held),
                baselineCorrect=sum(item['baseline'] == item['expected'] for item in tests),
                candidateCorrect=sum(item['candidate'] == item['expected'] for item in tests),
                tests=tests)


def main():
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(371)
    directory = ARTIFACT_DIR / 'calibration'
    labels = json.loads(Path(__file__).with_name('labels.json').read_text())
    samples = json.loads((directory / 'samples.json').read_text())
    for kind, rows in labels.items():
        assert [{k: v for k, v in row.items() if k != 'label'} for row in rows] == samples[kind]
    metrics = {kind: train(kind, rows, directory) for kind, rows in labels.items()}
    (directory / 'validation.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print({kind: {k: v for k, v in result.items() if k != 'tests'} for kind, result in metrics.items()}, flush=True)


if __name__ == '__main__':
    main()
