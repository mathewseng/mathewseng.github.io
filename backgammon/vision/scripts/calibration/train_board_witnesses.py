"""Train a trial checker reader from source-witness boards with disjoint clip holdouts."""
import argparse
from collections import defaultdict
import gzip
import json
from pathlib import Path
import sys

import cv2
import numpy as np
import torch

script = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(script))
from game_state import GameVision
from project_paths import ARTIFACT_DIR
from train import train
from v2.vision import strips


def train_witnesses(output, files, extra_holdout):
    path = ARTIFACT_DIR / 'calibration'
    output.mkdir(parents=True, exist_ok=True)
    review = json.loads((script / 'calibration/labels.json').read_text())['checkers']
    review = [{**row, 'split': 'test'} if row['clip'] in extra_holdout else row for row in review]
    images = list(np.load(path / 'checkers.npy'))
    held = {row['clip'] for row in review if row['split'] == 'test'} | set(extra_holdout)
    added = defaultdict(int)
    covered = set()
    manifest = {g: json.loads((ARTIFACT_DIR / 'v2' / f'game-{g}-analysis.json').read_text())['segments'] for g in range(1, 6)}
    for file in files:
        for game, notes in json.loads(file.read_text()).items():
            game = int(game)
            for note in notes:
                for which in ('beforeBoard', 'afterBoard'):
                    board = note.get(which)
                    if not board:
                        continue
                    clip, frame = board['clip'], board['sourceFrame']
                    if (clip, frame) in covered:
                        continue
                    covered.add((clip, frame))
                    point_counts = {int(point): count for point, count in board['points'].items()}
                    assert sum(n for n in point_counts.values() if n > 0) + board['bar'][0] + board['off'][0] == 15
                    assert sum(-n for n in point_counts.values() if n < 0) + board['bar'][1] + board['off'][1] == 15
                    part = next(part for part in manifest[game] if part['clip'] == clip and part['firstFrame'] <= frame < part['lastExclusive'])
                    assert frame == round(25 * board['seconds']) - part['firstGameFrame'] + part['firstFrame']
                    source = part['source']
                    archive = ARTIFACT_DIR / 'v2/state' / Path(source).with_suffix('.jsonl.gz').name
                    with gzip.open(archive, 'rt') as stream:
                        state = next(json.loads(line)['state'] for i,line in enumerate(stream) if i == frame)
                    if not state:
                        continue
                    cap = cv2.VideoCapture(str(ARTIFACT_DIR / 'board' / source))
                    cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
                    ok, pixels = cap.read()
                    cap.release()
                    if not ok:
                        raise RuntimeError((source, frame))
                    split = 'test' if clip in held else 'train'
                    for point, image in enumerate(strips(pixels), 1):
                        if GameVision.occluded(point, state['handRegions']):
                            continue
                        count = point_counts.get(point, 0)
                        label = f'w{count}' if count > 0 else f'b{-count}' if count < 0 else '0'
                        review.append(dict(game=game, clip=clip, frame=frame, label=label, split=split, target=point - 1))
                        images.append(image)
                        added[split] += 1
    np.save(output / 'checkers.npy', np.stack(images))
    (output / 'labels.json').write_text(json.dumps(review, indent=2)+'\n')
    print('new labels from source-reviewed boards', dict(added), flush=True)
    result = train('checkers', review, output)
    print({k: v for k, v in result.items() if k != 'tests'}, flush=True)
    cutoff = len(review) - sum(added.values())
    result['extraLabels'] = dict(added)
    summaries = {}
    for kind, tests in [('original', [t for t in result['tests'] if t['index'] < cutoff]),
                        ('verified-board', [t for t in result['tests'] if t['index'] >= cutoff])]:
        summaries[kind] = { 'count': len(tests), **{
            reader: sum(test[reader] == test['expected'] for test in tests) for reader in ('baseline', 'candidate')
        } }
    result['witnessSummary'] = summaries
    (output / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(summaries, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('notes', type=Path, nargs='+')
    parser.add_argument('--holdout', action='append', type=int, default=[], help='Hold out an additional source clip')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(371)
    train_witnesses(args.output, args.notes, args.holdout)
