#!/usr/bin/env python3
"""Train the board object detector and dice/cube face readers."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from project_paths import ARTIFACT_DIR

WORK = ARTIFACT_DIR
CLASSES = ('white-checker', 'dark-checker', 'white-die', 'dark-die', 'cube')
FACES = (2, 4, 8, 16, 32, 64)
PATTERNS = {
    1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)],
    4: [(-1, -1), (1, -1), (-1, 1), (1, 1)],
    5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)],
    6: [(-1, -1), (-1, 0), (-1, 1), (1, -1), (1, 0), (1, 1)],
}
COLUMNS = [81, 115, 152, 187, 222, 256, 316, 350, 386, 421, 456, 491]
PATCH = 128
FACE_PATCH = 32


def sample(key):
    path = WORK / 'samples' / f'{key}.jpg'
    result = cv2.imread(str(path))
    if result is None:
        raise ValueError(f'Missing {path}')
    return result


def clean_board():
    board = sample('073_00000')
    open_bar = sample('074_00750')
    trays = sample('000_00000')
    cube_at_top = sample('004_01001')
    board[228:282, 253:294] = open_bar[228:282, 253:294]
    board[:, 510:] = trays[:, 510:]
    board[165:220, :52] = cube_at_top[165:220, :52]
    return board


def convolution(cin, cout, stride=1):
    return nn.Sequential(nn.Conv2d(cin, cout, 3, stride, 1), nn.BatchNorm2d(cout), nn.ReLU())


class Locator(nn.Sequential):
    def __init__(self):
        super().__init__(convolution(3, 16, 2), convolution(16, 24, 2),
                         convolution(24, 24), convolution(24, 24),
                         convolution(24, 24), nn.Conv2d(24, len(CLASSES), 1))


class FaceReader(nn.Sequential):
    def __init__(self):
        super().__init__(convolution(3, 16), convolution(16, 24, 2), convolution(24, 32, 2),
                         convolution(32, 48, 2), nn.Flatten(), nn.Linear(48 * 4 * 4, 64),
                         nn.ReLU(), nn.Linear(64, 7))


def overlay(image, patch, mask, x, y):
    height, width = patch.shape[:2]
    left, top = x - width // 2, y - height // 2
    x0, y0 = max(0, left), max(0, top)
    x1, y1 = min(image.shape[1], left + width), min(image.shape[0], top + height)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = slice(y0-top, y1-top), slice(x0-left, x1-left)
    target = image[y0:y1, x0:x1]
    weight = mask[ys, xs, None]
    target[:] = patch[ys, xs] * weight + target * (1-weight)


class Assets:
    def __init__(self):
        self.background = clean_board()
        source = sample('000_00000')
        self.checkers = [
            [self.checker_stamp(source, x, y) for x, y in ((79, 356), (316, 67), (315, 102), (419, 390), (221, 66))],
            [self.checker_stamp(source, x, y) for x, y in ((220, 322), (223, 390), (316, 289), (82, 66), (115, 390))],
        ]

    @staticmethod
    def checker_stamp(image, x, y):
        radius = 18
        return image[y-radius:y+radius+1, x-radius:x+radius+1].copy()

    def checker(self, color, rng):
        side = 43
        yy, xx = np.mgrid[:side, :side] - side // 2
        radius_x = rng.uniform(15.6, 18.7)
        radius_y = rng.uniform(15.0, 18.5)
        if rng.random() < .65:
            stamp = self.checkers[color][rng.integers(len(self.checkers[color]))]
            patch = cv2.resize(stamp, (side, side))
            patch = cv2.warpAffine(patch, cv2.getRotationMatrix2D((21, 21), float(rng.uniform(-180, 180)), .91),
                                   (side, side), borderMode=cv2.BORDER_REFLECT_101)
            patch = patch.astype(np.float32)
        else:
            core = np.array([235, 246, 244] if color == 0 else [89, 94, 94], np.float32)
            patch = np.broadcast_to(core, (side, side, 3)).copy()
            patch += (xx + yy)[..., None] * rng.uniform(-.22, .15)
        ellipse = np.sqrt((xx / radius_x) ** 2 + (yy / radius_y) ** 2)
        patch *= (1 - .11 * np.exp(-((ellipse - .97) / .08) ** 2))[..., None]
        patch = np.clip(patch + rng.normal(0, 6), 0, 255)
        alpha = np.clip((1 - ellipse) * 17 + .22, 0, 1)
        shadow = .23 * np.clip((1 - np.sqrt(((xx - 2) / (radius_x + 1)) ** 2 +
                                             ((yy - 2) / (radius_y + 1)) ** 2)) * 10, 0, 1)
        mask = np.maximum(alpha, shadow)
        patch *= (alpha / np.maximum(mask, .001))[..., None]
        return patch, mask


def render_face(kind, value, rng):
    """Randomized printed face, 3D side, orientation, sampling and blur."""
    scale, size = 3, 40
    bg = np.zeros((size*scale, size*scale, 4), np.uint8)
    center = np.array([size*scale//2, size*scale//2], np.float32)
    cube = kind == 4
    half = rng.uniform(8.4, 12.4) if cube else rng.uniform(4.6, 7.2)
    aspect = rng.uniform(.76, 1.11)
    angle = rng.uniform(-np.pi, np.pi)
    if cube:
        angle = rng.choice([0, np.pi/2, np.pi, -np.pi/2]) + rng.uniform(-.28, .28)
    rotation = np.array([[np.cos(angle), -np.sin(angle)],
                         [np.sin(angle), np.cos(angle)]], np.float32)
    src = np.array([[-1,-1],[1,-1],[1,1],[-1,1]], np.float32)
    src[:, 1] *= aspect
    corners = ((src @ rotation.T) * half + rng.normal(0, .45, (4, 2))) * scale + center
    p = np.round(corners).astype(np.int32)
    shift = np.array([rng.uniform(.2, 4.3), rng.uniform(-.5, 3)]) * scale
    shadow = np.round(corners + shift + (2, 1)).astype(np.int32)
    cv2.fillConvexPoly(bg, shadow, (15, 18, 19, 82), cv2.LINE_AA)
    side = np.round(corners + shift).astype(np.int32)
    dark = kind == 3
    shade = int(rng.uniform(43, 88) if dark else rng.uniform(110, 185))
    cv2.fillConvexPoly(bg, side, (shade, shade+3, shade+6, 255), cv2.LINE_AA)
    texture = np.full((64, 64, 3), 0, np.uint8)
    face = int(rng.uniform(53, 103) if dark else rng.uniform(220, 254))
    texture[:] = (max(0, face-4), face, face)
    pip_color = int(rng.uniform(210, 253) if dark else rng.uniform(78 if cube else 116, 180))
    if cube:
        text = str(value)
        font = cv2.FONT_HERSHEY_DUPLEX
        fs = rng.uniform(1.02, 1.26) if len(text) == 1 else rng.uniform(.75, .98)
        weight = int(rng.integers(2, 5))
        (tw, th), _ = cv2.getTextSize(text, font, fs, weight)
        cv2.putText(texture, text, ((64-tw)//2, (64+th)//2), font, fs, (pip_color,)*3, weight, cv2.LINE_AA)
    else:
        spacing = rng.uniform(12, 16)
        radius = int(rng.integers(5, 8))
        for x, y in PATTERNS[value]:
            cv2.circle(texture, (round(32+x*spacing), round(32+y*spacing)), radius,
                       (pip_color,)*3, cv2.FILLED, cv2.LINE_AA)
    matrix = cv2.getPerspectiveTransform(np.float32([[0,0],[63,0],[63,63],[0,63]]), corners.astype(np.float32))
    painted = cv2.warpPerspective(texture, matrix, (size*scale, size*scale), borderMode=cv2.BORDER_REPLICATE)
    shape = np.zeros(bg.shape[:2], np.uint8)
    cv2.fillConvexPoly(shape, p, 255, cv2.LINE_AA)
    bg[shape > 200, :3] = painted[shape > 200]
    bg[shape > 200, 3] = 255
    rgba = cv2.resize(bg.astype(np.float32), (size, size), interpolation=cv2.INTER_AREA)
    rgba = cv2.GaussianBlur(rgba, (0, 0), rng.uniform(.4, 1.05))
    return rgba[:, :, :3], rgba[:, :, 3] / 255


def add_heatmap(grid, kind, x, y, sigma):
    if 0 <= x < PATCH and 0 <= y < PATCH:
        column, row = round(x / 4), round(y / 4)
        column = min(grid.shape[2] - 1, column)
        row = min(grid.shape[1] - 1, row)
        yy, xx = np.mgrid[:grid.shape[1], :grid.shape[2]]
        peak = np.exp(-((xx-column)**2 + (yy-row)**2)/(2*sigma**2))
        np.maximum(grid[kind], peak, out=grid[kind])


def detector_data(assets, count, seed):
    rng = np.random.default_rng(seed)
    data, targets = [], []
    pad = 23
    background = cv2.copyMakeBorder(assets.background, pad, pad, pad, pad, cv2.BORDER_REFLECT_101)
    for _ in range(count):
        x0 = int(rng.integers(-pad, 560-PATCH+pad))
        y0 = int(rng.integers(-pad, 420-PATCH+pad))
        pixels = background[y0+pad:y0+pad+PATCH, x0+pad:x0+pad+PATCH].copy()
        grid = np.zeros((len(CLASSES), PATCH//4, PATCH//4), np.float32)
        objects = []
        for bx in COLUMNS + [275, 25, 534]:
            if not -21 <= bx - x0 < PATCH+21:
                continue
            for bottom in (False, True):
                if rng.random() < .52:
                    continue
                n = int(rng.choice([1, 2, 3, 4, 5, 6], p=[.29,.23,.18,.14,.12,.04]))
                color = int(rng.integers(2))
                for j in range(n):
                    by = 32 + 34.4*j if not bottom else 390 - 34.4*j
                    if bx in (25, 275, 534):
                        if j > 1 or rng.random() < .67:
                            continue
                        by = rng.uniform(65, 350)
                    dx = round(bx - x0 + rng.normal(0, 2.1))
                    dy = round(by - y0 + rng.normal(0, 2.0))
                    if -21 <= dx < PATCH+21 and -21 <= dy < PATCH+21:
                        objects.append((dx, dy, color))
        # A hand or loose checker can break the lattice. Train it as a visible
        # object, and leave board-state interpretation to the point mapper.
        if rng.random() < .28:
            objects.append((int(rng.integers(PATCH)), int(rng.integers(PATCH)), int(rng.integers(2))))
        for x,y,kind in objects:
            sprite, mask = assets.checker(kind, rng)
            overlay(pixels, sprite, mask, x, y)
            add_heatmap(grid, kind, x, y, 1.05)
        for _ in range(int(rng.integers(5))):
            x, y = map(int, rng.integers(7, PATCH-7, 2))
            if any((a-x)**2+(b-y)**2 < 22**2 for a,b,_ in objects):
                continue
            kind = int(rng.choice([2,3,4], p=[.40,.43,.17]))
            if kind == 4 and 60 < x+x0 < 500 and rng.random() < .75:
                continue
            value = int(rng.choice(FACES)) if kind == 4 else int(rng.integers(1, 7))
            face, mask = render_face(kind, value, rng)
            overlay(pixels, face, mask, x, y)
            add_heatmap(grid, kind, x, y, .78)
        data.append(perturb(pixels, rng))
        targets.append(np.round(grid*255).astype(np.uint8))
    return torch.from_numpy(np.transpose(np.array(data), (0,3,1,2)).copy()), torch.from_numpy(np.array(targets))


def perturb(pixels, rng):
    pixels = pixels.astype(np.float32) * rng.uniform(.90, 1.08)
    pixels += rng.uniform(-9, 8) + rng.normal(0, 1.2, pixels.shape)
    if rng.random() < .28:
        pixels = cv2.GaussianBlur(pixels, (0,0), rng.uniform(.4, 1.1))
    return np.clip(pixels, 0, 255).astype(np.uint8)


def face_data(assets, count, seed, cube):
    rng = np.random.default_rng(seed)
    images, labels = [], []
    for _ in range(count):
        x, y = int(rng.integers(0, 526)), int(rng.integers(0, 386))
        pixels = assets.background[y:y+FACE_PATCH,x:x+FACE_PATCH].copy()
        label = int(rng.integers(7))
        if label:
            kind = 4 if cube else int(rng.integers(2,4))
            value = FACES[label-1] if cube else label
            face, mask = render_face(kind, value, rng)
            yx = rng.normal(FACE_PATCH/2, 1.6, 2).astype(int)
            overlay(pixels, face, mask, *yx)
        elif rng.random() < .52:
            if cube:
                kind = int(rng.integers(2,4))
                face, mask = render_face(kind, int(rng.integers(1,7)), rng)
            else:
                face, mask = assets.checker(int(rng.integers(2)), rng)
            overlay(pixels, face, mask, *rng.integers(2,30,2))
        images.append(perturb(pixels, rng))
        labels.append(label)
    return torch.from_numpy(np.transpose(np.array(images), (0,3,1,2)).copy()), torch.tensor(labels)


def dense_loss(logits, y):
    prediction = logits.sigmoid().clamp(1e-5, 1 - 1e-5)
    positive = y.eq(1.0)
    pos_loss = -(1-prediction).square() * prediction.log() * positive
    neg_loss = -prediction.square() * (1-prediction).log() * (1-y).pow(4) * (~positive)
    return (pos_loss + neg_loss).sum() / positive.sum().clamp_min(1)


def fit(name, model, train, valid, device, epochs, dense=False):
    model = model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=.002)
    train_x, train_y = [t.to(device) for t in train]
    val_x, val_y = [t.to(device) for t in valid]
    stats = []
    for epoch in range(epochs):
        model.train()
        for index in torch.randperm(len(train_x), device=device).split(64):
            x = train_x[index].float() / 255
            y = train_y[index]
            logits = model(x)
            loss = dense_loss(logits, y.float()/255) if dense else F.cross_entropy(logits, y)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        model.eval()
        with torch.inference_mode():
            logits = torch.cat([model(x.float()/255) for x in val_x.split(64)])
            if dense:
                ref = val_y.eq(255)
                probability = logits.sigmoid()
                peaks = (probability == F.max_pool2d(probability, 3, 1, 1)) & (probability > .32)
                close = F.max_pool2d(ref.float(), 3, 1, 1).bool()
                metric = {'peakPrecision': (peaks & close).sum().item() / max(peaks.sum().item(),1),
                          'peakRecall': (F.max_pool2d(peaks.float(),3,1,1).bool() & ref).sum().item()/max(ref.sum().item(),1)}
            else:
                metric = {'accuracy': (logits.argmax(1) == val_y).float().mean().item()}
        stats.append(metric)
        print(name, epoch+1, {k: round(v, 4) for k,v in metric.items()}, flush=True)
    cpu = model.to('cpu').eval()
    models = WORK / 'models'
    models.mkdir(exist_ok=True)
    torch.save(cpu.state_dict(), models/f'{name}.pt')
    side = PATCH if dense else FACE_PATCH
    axes = {'pixels':{0:'batch',2:'height',3:'width'},'logits':{0:'batch',2:'height4',3:'width4'}} if dense else {'pixels':{0:'batch'},'logits':{0:'batch'}}
    torch.onnx.export(cpu, torch.zeros(1,3,side,side), models/f'{name}.onnx',
                      input_names=['pixels'], output_names=['logits'], dynamic_axes=axes,
                      opset_version=17, dynamo=False)
    return stats


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--epochs', type=int, default=15)
    p.add_argument('--count', type=int, default=4800)
    p.add_argument('--only', choices=['locator','dice','cube'])
    args = p.parse_args()
    torch.manual_seed(77)
    torch.set_num_threads(2)
    cv2.setNumThreads(1)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    print('Device', device, flush=True)
    assets = Assets()
    results = {}
    cv2.imwrite(str(WORK/'review/clean-board.jpg'), assets.background)
    for i, name in enumerate(('locator','dice','cube')):
        if args.only and args.only != name:
            continue
        if name == 'locator':
            train, valid = detector_data(assets,args.count,300), detector_data(assets,400,819)
            model = Locator()
        else:
            train = face_data(assets,args.count*2,430+i,name=='cube')
            valid = face_data(assets,850,876+i,name=='cube')
            model = FaceReader()
        results[name] = fit(name,model,train,valid,device,args.epochs,name=='locator')
        (WORK/'models'/'training.json').write_text(json.dumps(results,indent=2))


if __name__ == '__main__':
    main()
