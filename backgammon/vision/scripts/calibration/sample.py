"""Sample source frames for a blind dice-face and point-count review."""
import gzip
import json
from pathlib import Path
import random
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import center_crop
from project_paths import ARTIFACT_DIR
from v2.vision import strips

HOLDOUT = {11, 17, 26, 33, 42, 47, 56, 63, 71, 76}
EXTRA_HOLDOUT = {1, 16, 27, 39, 50, 60, 68}
EXTRA_TRAIN = {2, 3, 5, 7, 18, 20, 22, 28, 31, 34, 41, 43, 45, 49, 53, 55, 58, 62, 66, 73}
TILES = {'dice': (100, 100, 8), 'checkers': (64, 172, 12)}


def candidates(rng):
    catalog = {'dice': [], 'checkers': []}
    for number in range(1, 6):
        game = json.loads((ARTIFACT_DIR / 'v2' / f'game-{number}-analysis.json').read_text())
        eligible = [segment for segment in game['segments'] if segment['lastExclusive'] - segment['firstFrame'] > 200]
        held = [segment for segment in eligible if segment['clip'] in HOLDOUT]
        train = [segment for segment in eligible if segment['clip'] not in HOLDOUT]
        for segment in held + rng.sample(train, min(6, len(train))):
            clip = segment['clip']
            source = segment['source']
            with gzip.open(ARTIFACT_DIR / 'v2' / 'state' / Path(source).with_suffix('.jsonl.gz').name, 'rt') as handle:
                rows = [json.loads(line)['state'] for line in handle]
            used = set()
            for kind in catalog:
                for part in range(4):
                    span = (segment['lastExclusive'] - segment['firstFrame']) // 4
                    a = segment['firstFrame'] + part * span
                    frames = list(range(a + 4, a + span - 4, 7))
                    rng.shuffle(frames)
                    selected = []
                    for frame in frames:
                        state = rows[frame]
                        if not state or frame in used:
                            continue
                        if kind == 'dice':
                            for die in state['dice']:
                                if part % 2 == 0 and die['value'] is not None and die['score'] > .92:
                                    continue
                                selected.append((frame, die['center']))
                        elif not state['handRegions']:
                            for i, pair in enumerate(state['points']):
                                target = (0, 1, 2, 4)[part]
                                if sum(pair) >= target and (target != 0 or not sum(pair)):
                                    selected.append((frame, i))
                    if not selected:
                        continue
                    frame, target = rng.choice(selected)
                    used.add(frame)
                    catalog[kind].append(dict(game=number, clip=clip, source=source, frame=frame,
                                              target=target, split='test' if clip in HOLDOUT else 'train'))
    return catalog


def additional_dice(rng):
    catalog = []
    for number in range(1, 6):
        game = json.loads((ARTIFACT_DIR / 'v2' / f'game-{number}-analysis.json').read_text())
        for segment in game['segments']:
            clip, source = segment['clip'], segment['source']
            if clip not in EXTRA_HOLDOUT | EXTRA_TRAIN:
                continue
            with gzip.open(ARTIFACT_DIR / 'v2' / 'state' / Path(source).with_suffix('.jsonl.gz').name, 'rt') as handle:
                rows = [json.loads(line)['state'] for line in handle]
            lower, upper = segment['firstFrame'] + 175, segment['lastExclusive'] - 175
            used_centers = set()
            for i in range(4):
                a, b = lower + (upper - lower) * i // 4, lower + (upper - lower) * (i + 1) // 4
                proposals = []
                for frame in range(a, b, 3):
                    reading = rows[frame]
                    if not reading:
                        continue
                    for die in reading['dice']:
                        x, y = die['center']
                        cell = x // 12, y // 12
                        if die['locationScore'] < .23 or cell in used_centers:
                            continue
                        if any(l-7 <= x <= r+7 and t-7 <= y <= b+7 for l, t, r, b in reading['handRegions']):
                            continue
                        proposals.append((frame, die, cell))
                if not proposals:
                    continue
                # Sample low-margin and high-confidence patches in either color.
                proposals = [(f, die, cell) for f, die, cell in proposals if (die['score'] < .8) == (i % 2 == 0)] or proposals
                frame, die, cell = rng.choice(proposals)
                used_centers.add(cell)
                catalog.append(dict(game=number, clip=clip, source=source, frame=frame, target=die['center'],
                                    split='test' if clip in EXTRA_HOLDOUT else 'train'))
    return catalog


def write_sheets(directory, kind, rows, images):
    width, height, columns = TILES[kind]
    for start in range(0, len(rows), 48):
        count = min(len(rows) - start, 48)
        sheet = np.full(((count + columns - 1) // columns * height, columns * width, 3), 24, np.uint8)
        for offset in range(count):
            index = start + offset
            row, col = divmod(offset, columns)
            x, y = col * width, row * height
            patch = images[index]
            photo = cv2.resize(patch, (width - 10, height - 24), interpolation=cv2.INTER_NEAREST)
            sheet[y + 1:y + height - 23, x + 5:x + width - 5] = photo
            cv2.putText(sheet, f'{index:03}', (x + 7, y + height - 7), 0, .51, (245,) * 3, 1, cv2.LINE_AA)
        cv2.imwrite(str(directory / f'{kind}-{start // 48}.png'), sheet)


def main(directory):
    cv2.setNumThreads(1)
    rng = random.Random(371)
    directory.mkdir(parents=True, exist_ok=True)
    catalog = candidates(rng)
    catalog['dice'].extend(additional_dice(rng))
    by_clip = {}
    photos = {}
    for kind, rows in catalog.items():
        for index, row in enumerate(rows):
            by_clip.setdefault(row['source'], []).append((row['frame'], kind, index, row['target']))
    for source, targets in by_clip.items():
        capture = cv2.VideoCapture(str(ARTIFACT_DIR / 'board' / source))
        for frame, kind, index, target in sorted(targets):
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, pixels = capture.read()
            if not ok:
                raise ValueError(f'Cannot decode {source} frame {frame}')
            photos[kind, index] = center_crop(pixels, *target) if kind == 'dice' else list(strips(pixels))[target]
        capture.release()
    for kind, rows in catalog.items():
        images = np.stack([photos[kind, i] for i in range(len(rows))])
        np.save(directory / f'{kind}.npy', images)
        write_sheets(directory, kind, rows, images)
    (directory / 'samples.json').write_text(json.dumps(catalog, indent=2) + '\n')
    print({kind: len(rows) for kind, rows in catalog.items()}, flush=True)


if __name__ == '__main__':
    main(ARTIFACT_DIR / 'calibration')
