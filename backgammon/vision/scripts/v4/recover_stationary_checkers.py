"""Restore brief checker dropouts using two-sided camera evidence."""
import argparse
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
import gzip
import json
from pathlib import Path
import shutil
import sys

import av
import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from game_state import CHECKER_COLORS, center_crop, evaluate_patches, within_hand
from project_paths import ARTIFACT_DIR
from v2.vision import point_strip, slot_decode

DY, DX = np.ogrid[-15:16, -15:16]
DISC = DX * DX + DY * DY <= 15**2
SOURCE = 'stationary-checker-recovery'


def nearby(a, b, radius):
    return (a[0] - b[0])**2 + (a[1] - b[1])**2 <= radius**2


def gaps(states, first, end):
    detections = defaultdict(list)
    for frame in range(first, end):
        state = states[frame]
        if not state:
            continue
        for checker in state['checkers']:
            point = checker['zone']
            if not isinstance(point, int) or checker['score'] < .46:
                continue
            color = CHECKER_COLORS.index(checker['color'])
            pair = state['points'][point - 1]
            if pair[color] == 1 and not pair[1 - color]:
                detections[point, color].append((frame, checker['center']))
    for (point, color), views in detections.items():
        for i, ((before, center), (after, following)) in enumerate(zip(views, views[1:])):
            if not 1 < after - before <= 36 or not nearby(center, following, 7):
                continue
            older = sum(before - f <= 14 and nearby(center, c, 7) for f, c in views[max(0, i - 8):i + 1])
            newer = sum(f - after <= 14 and nearby(center, c, 7) for f, c in views[i + 1:i + 10])
            if min(older, newer) < 3:
                continue
            if any(state and state['points'][point - 1] != [0, 0] for state in states[before + 1:after]):
                continue
            yield before, after, point, color, center


def may_restore(state, point, color, center):
    if (not state or state.get('position') or state['checkerStatus'] == 'ambiguous'
            or state['points'][point - 1] != [0, 0] or state['visibleCheckerTotals'][color] >= 15
            or any(total > 15 for total in state['visibleCheckerTotals'])
            or any(white and dark for white, dark in state['points'])
            or within_hand(*center, state['handRegions'], 8)):
        return False
    objects = state['checkers'] + state['dice'] + ([state['cube']] if state['cube'] else [])
    return not any(nearby(obj['center'], center, 18) for obj in objects)


def footprint(image, center):
    x, y = center
    return image[y - 15:y + 16, x - 15:x + 16][DISC].astype(np.int16)


def read_frames(video, rows, requested):
    images = {}
    if not requested:
        return images
    with av.open(str(video)) as camera:
        track = camera.streams.video[0]
        track.codec_context.thread_count = 1
        for frame, pixels in enumerate(camera.decode(track)):
            if frame not in requested:
                continue
            if abs(float(pixels.pts * pixels.time_base) - rows[frame]['outputPts90k'] / 90000) > .0002:
                raise ValueError(f'Camera timestamp mismatch in {video.name} at frame {frame}')
            images[frame] = pixels.to_ndarray(format='bgr24')
            if len(images) == len(requested):
                break
    if images.keys() != requested:
        raise ValueError(f'Missing reference images in {video.name}')
    return images


def initialize(center_reader):
    global slot, center_net
    cv2.setNumThreads(1)
    slot = cv2.dnn.readNetFromONNX(str(ARTIFACT_DIR / 'v2/slots.onnx'))
    center_net = cv2.dnn.readNetFromONNX(str(center_reader)) if center_reader else None


def camera_matches(groups, states, images):
    for before, after, point, color, center in groups:
        x, y = center
        if not (15 <= x < 545 and 15 <= y < 405):
            continue
        anchors = [footprint(images[f], center) for f in (before, after)]
        matched = []
        for frame in range(before + 1, after):
            if not may_restore(states[frame], point, color, center):
                continue
            appearance = footprint(images[frame], center)
            if all(float(np.mean(np.abs(anchor - appearance))) <= 8 for anchor in anchors):
                matched.append(frame)
        patches = [point_strip(images[f], point) for f in matched]
        odds = evaluate_patches(slot, patches)
        local = evaluate_patches(center_net, [center_crop(images[f], *center) for f in matched]) if center_net else None
        for i, (frame, probabilities) in enumerate(zip(matched, odds, strict=True)):
            best = int(probabilities.argmax())
            if slot_decode(best) != (color, 1) or probabilities[best] < .9:
                continue
            confidence = float(probabilities[best])
            if local is not None:
                if local[i, color + 1] < .85:
                    continue
                confidence = min(confidence, float(local[i, color + 1]))
            yield frame, point, color, center, confidence


def apply(state, point, color, center, confidence):
    if not may_restore(state, point, color, center):
        return False
    state['points'][point - 1][color] = 1
    state['visibleCheckerTotals'][color] += 1
    state['checkers'].append(dict(color=CHECKER_COLORS[color], center=center, zone=point,
                                 score=round(confidence, 4), source=SOURCE))
    if state['visibleCheckerTotals'] == [15, 15] and not state['handRegions'] and not any(
            c['zone'] == 'loose' for c in state['checkers']):
        state['checkerStatus'] = 'complete-with-stationary-checker'
        state['borneOff'] = [0, 0]
        state['position'] = {'points': state['points'], 'bar': state['bar'], 'borneOff': state['borneOff']}
    return True


def recover(job):
    primary, destination, sections = job
    with gzip.open(primary, 'rt') as stream:
        lines = stream.readlines()
    rows = [json.loads(line) for line in lines]
    states = [row['state'] for row in rows]
    groups = [gap for first, end in sections for gap in gaps(states, first, end)]
    requested = {frame for before, after, *_ in groups for frame in range(before, after + 1)}
    video = ARTIFACT_DIR / 'board' / primary.name.replace('.jsonl.gz', '.mp4')
    images = read_frames(video, rows, requested)
    changed, recovered = set(), 0
    predictions = sorted(camera_matches(groups, states, images), key=lambda item: item[-1], reverse=True)
    for frame, point, color, center, confidence in predictions:
        if apply(states[frame], point, color, center, confidence):
            changed.add(frame)
            recovered += 1
    if changed:
        staged = destination.with_suffix('.part.gz')
        with gzip.open(staged, 'wt', compresslevel=2) as stream:
            for frame, line in enumerate(lines):
                stream.write(json.dumps(rows[frame], separators=(',', ':')) + '\n' if frame in changed else line)
        staged.replace(destination)
    else:
        shutil.copyfile(primary, destination)
    return dict(source=primary.name, frames=len(rows), gaps=len(groups), recovered=recovered, framesChanged=len(changed))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input_dir', type=Path)
    parser.add_argument('output_dir', type=Path)
    parser.add_argument('--center-reader', type=Path)
    parser.add_argument('--jobs', type=int, default=6)
    args = parser.parse_args()
    if args.output_dir.resolve() in (args.input_dir.resolve(), (ARTIFACT_DIR / 'state').resolve(),
                                    (ARTIFACT_DIR / 'v2/state').resolve()):
        parser.error('Use a separate directory for recovered observations.')
    sections = defaultdict(list)
    for game in range(1, 6):
        recording = json.loads((ARTIFACT_DIR / 'v2' / f'game-{game}-analysis.json').read_text())
        for part in recording['segments']:
            name = Path(part['source']).with_suffix('.jsonl.gz').name
            sections[name].append((part['firstFrame'], part['lastExclusive']))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    jobs = [(args.input_dir / name, args.output_dir / name, spans) for name, spans in sections.items()]
    summaries = []
    with ProcessPoolExecutor(max_workers=args.jobs, initializer=initialize, initargs=(args.center_reader,)) as pool:
        for result in pool.map(recover, jobs):
            print(json.dumps(result), flush=True)
            summaries.append(result)
    (args.output_dir / 'stationary-checker-summary.json').write_text(json.dumps(summaries) + '\n')


if __name__ == '__main__':
    main()
