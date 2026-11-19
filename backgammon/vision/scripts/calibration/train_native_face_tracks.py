"""Trial a stationary-die face reader on one projection from original camera frames."""
import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
import gzip
import json
from pathlib import Path
import sys

import av
import cv2
import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'calibration')]
from board_video import DESTINATION, table_warp
from game_state import center_crop
from project_paths import ARTIFACT_DIR, CALIBRATION_REPO, RECORDING_DIR
from train import probabilities
from train_face_tracks import fit, reviewed_tracks, test_spots
from train_vision import FaceReader

OFFSETS = (-10, -6, -3, 0, 3, 6, 10)
AXES = np.arange(32, dtype=np.float32) - 16


def read_jsonl(path):
    with gzip.open(path, 'rt') as source:
        return [json.loads(line) for line in source]


def process_source(source, items, mx, my):
    cv2.setNumThreads(1)
    name = Path(source).with_suffix('.jsonl.gz')
    track = read_jsonl(ARTIFACT_DIR / 'tracking' / name)
    observations = read_jsonl(ARTIFACT_DIR / 'v2/state' / name)
    requests = defaultdict(list)
    for index, item in items:
        x, y = item['target']
        for offset in OFFSETS:
            f = item['frame'] + offset
            if not 0 <= f < len(track) or not track[f]['board'].get('cornersFelt'):
                continue
            state = observations[f]['state']
            if offset:
                if item['label'] == '0' or not state:
                    continue
                if any(left - 11 <= x <= right + 11 and top - 11 <= y <= bottom + 11
                       for left, top, right, bottom in state['handRegions']):
                    continue
            requests[f].append((index, x, y))
    if not requests:
        return {}
    result = defaultdict(list)
    with av.open(str(RECORDING_DIR / source)) as raw, av.open(str(ARTIFACT_DIR / 'board' / source)) as boards:
        source_track = raw.streams.video[0]
        rectified_track = boards.streams.video[0]
        source_track.codec_context.thread_count = rectified_track.codec_context.thread_count = 1
        for f, (image, board) in enumerate(zip(raw.decode(source_track), boards.decode(rectified_track), strict=True)):
            if f not in requests:
                continue
            row = track[f]
            if image.pts != row['pts'] or image.time_base != Fraction(row['timeBase']) or board.pts != row['outputPts90k']:
                raise ValueError(f'Timestamp mismatch for {source} frame {f}')
            native, rectified = image.to_ndarray(format='bgr24'), board.to_ndarray(format='bgr24')
            inverse = cv2.getPerspectiveTransform(DESTINATION, np.array(row['board']['cornersFelt'], np.float32))
            for index, x, y in requests.pop(f):
                tiled_x, tiled_y = np.meshgrid(AXES + x, AXES + y)
                mapped = cv2.perspectiveTransform(np.stack((tiled_x, tiled_y), axis=-1), inverse)
                coords = [cv2.remap(axis, mapped[:, :, 0], mapped[:, :, 1], cv2.INTER_LINEAR)
                          for axis in (mx, my)]
                patch = cv2.remap(native, *coords, cv2.INTER_CUBIC)
                result[index].append((f, patch, center_crop(rectified, x, y)))
            if not requests:
                break
    if requests:
        raise ValueError(f'Missing source frames in {source}')
    return result


def stable_stack(views, ref):
    reference = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
    window = cv2.createHanningWindow((32, 32), cv2.CV_32F)
    accepted = []
    for view in views:
        gray = cv2.cvtColor(view, cv2.COLOR_BGR2GRAY).astype(np.float32)
        (dx, dy), quality = cv2.phaseCorrelate(reference.copy(), gray, window)
        if quality < .52 or max(abs(dx), abs(dy)) > 2.0:
            continue
        registered = cv2.warpAffine(view, np.float32([[1, 0, -dx], [0, 1, -dy]]), (32, 32),
                                    flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)
        # Adjacent moving hands and changed pip layouts are not alternate views of a stationary die.
        if np.abs(registered[9:24,9:24].astype(float) - ref[9:24,9:24]).mean() <= 13:
            accepted.append(registered)
    return np.uint8(np.median(accepted or [ref], axis=0))


def label_set(local):
    basic = json.loads((ROOT / 'calibration/labels.json').read_text())['dice']
    extra = [row for path in sorted((ROOT / 'calibration').glob('reviewed-*-faces.json'))
             for row in reviewed_tracks(path)]
    held = ([row for row in basic if row['split'] == 'test'] + test_spots() +
            [row for row in extra if row['split'] == 'spotExtra'] + reviewed_tracks(local))
    held_clips = {row['clip'] for row in held}
    training = [row for row in basic + extra if row['split'] == 'train' and row['clip'] not in held_clips]
    unique = {}
    for row in training + held:
        if row['label'] != '?':
            unique[row['clip'], row['frame'], tuple(row['target'])] = {**row, 'cohort': row.get('cohort')}
    return list(unique.values())


def sample(dataset, output):
    groups = defaultdict(list)
    for index, row in enumerate(dataset):
        groups[row['source']].append((index, row))
    records = {}
    with table_warp(CALIBRATION_REPO) as warp, ProcessPoolExecutor(3) as pool:
        mx, my = cv2.convertMaps(*warp.linear, cv2.CV_32FC1)
        tasks = [pool.submit(process_source, name, items, mx, my) for name, items in groups.items()]
        for name, task in zip(groups, tasks):
            records.update(task.result())
            print('sampled', name, flush=True)
    packs = []
    used = []
    for index, row in enumerate(dataset):
        views = records.get(index, [])
        anchor = next((x for x in views if x[0] == row['frame']), None)
        if anchor is None:
            continue
        stitched = stable_stack([patch for _, patch, _ in views], anchor[1])
        packs.append(np.stack([anchor[2], anchor[1], stitched]))
        used.append({**row, 'views': len(views)})
    patches = np.stack(packs)
    np.save(output / 'patches.npy', patches)
    (output / 'samples.json').write_text(json.dumps(used))
    return patches, used


def focus(patch):
    crop = patch[5:27, 5:27]
    luminance = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY).astype(np.float32)
    local = luminance - cv2.GaussianBlur(luminance, (0, 0), 2.6)
    # Boost dark or bright ink and reduce reliance on the surrounding point colour.
    spread = max(10, np.percentile(np.abs(local[4:18, 4:18]), 82))
    contrast = 128 + local * (40 / spread)
    boosted = np.clip(crop.astype(np.float32) * .45 + contrast[:, :, None] * .55, 0, 255)
    return cv2.resize(np.uint8(boosted), (32, 32), interpolation=cv2.INTER_CUBIC)


def train(patches, rows, output, contrast):
    torch.set_num_threads(3)
    torch.manual_seed(53)
    rng = np.random.default_rng(53)
    baseline, candidate = FaceReader().eval(), FaceReader().eval()
    weights = torch.load(ARTIFACT_DIR / 'models/dice_real.pt', map_location='cpu', weights_only=True)
    baseline.load_state_dict(weights)
    candidate.load_state_dict(weights)
    indexes = [i for i, row in enumerate(rows) if row['split'] == 'train']
    assert not ({rows[i]['clip'] for i in indexes} & {row['clip'] for row in rows if row['split'] != 'train'})

    def candidate_inputs(group):
        return [focus(patch) for patch in group] if contrast else group
    fit(baseline, candidate, [candidate_inputs(patches[i, 1:]) for i in indexes],
        [int(rows[i]['label']) for i in indexes], rng, augment_camera=True)
    torch.onnx.export(candidate, torch.zeros(1, 3, 32, 32), output / 'dice-native-candidate.onnx',
                      input_names=['patches'], output_names=['logits'], opset_version=17,
                      dynamic_axes={'patches': {0: 'batch'}, 'logits': {0: 'batch'}}, dynamo=False)
    scores = []
    for row, group in zip(rows, patches, strict=True):
        if row['split'] == 'train':
            continue
        baseline_board = probabilities(baseline, group[:1], True)[0]
        baseline_native = probabilities(baseline, group[1:], True).mean(axis=0)
        candidate_native = probabilities(candidate, candidate_inputs(group[1:]), True).mean(axis=0)
        scores.append({**row, 'board': baseline_board.round(5).tolist(),
                       'native': baseline_native.round(5).tolist(), 'candidate': candidate_native.round(5).tolist()})
    held = [row for row in scores if row['cohort'] != 'unresolved']
    summary = dict(trainingTracks=len(indexes), trainingViews=sum(rows[i]['views'] for i in indexes),
                   trainingClips=len({rows[i]['clip'] for i in indexes}), heldTracks=len(held),
                   heldClips=len({row['clip'] for row in held}),
                   correct={key: sum(int(np.argmax(row[key])) == int(row['label']) for row in held)
                            for key in ('board', 'native', 'candidate')})
    (output / 'native-face-validation.json').write_text(json.dumps({'summary': summary, 'tests': scores}, indent=2) + '\n')
    print(summary, flush=True)


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--cached', action='store_true', help='Reuse previously sampled native crops.')
    parser.add_argument('--contrast', action='store_true', help='Use local pip contrast on the candidate crops.')
    args = parser.parse_args()
    cv2.setNumThreads(1)
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.cached:
        patches = np.load(args.directory / 'patches.npy')
        rows = json.loads((args.directory / 'samples.json').read_text())
    else:
        labels = label_set(Path(__file__).with_name('reviewed-native-dice-probes.json'))
        patches, rows = sample(labels, args.directory)
    train(patches, rows, args.directory, args.contrast)
