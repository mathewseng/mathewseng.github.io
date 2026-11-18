#!/usr/bin/env python3
"""Track the Office-3 board in calibrated felt coordinates and export video."""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
from contextlib import contextmanager
from fractions import Fraction
import gzip
import json
import os
from pathlib import Path
import sys
import tempfile

import av
import cv2
import numpy as np

WIDTH, HEIGHT = 560, 420
FELT_ORIGIN = np.array([155, 185], np.float32)
FELT_BOUNDS = (155, 185, 865, 770)
REFERENCE_CORNERS = np.array([[247, 260], [791, 281], [777, 690], [227, 659]], np.float32)
DESTINATION = np.array([[0, 0], [WIDTH - 1, 0], [WIDTH - 1, HEIGHT - 1], [0, HEIGHT - 1]], np.float32)
# Rim corners, hinges, latches and short rail junctions. Matched independently
# against the same open-board image so hands and gaps cannot cause drift.
ANCHORS = [
    (251, 266, 13), (786, 286, 13), (771, 684, 13), (232, 654, 13),
    (510, 344, 11), (500, 600, 11), (800, 351, 11), (785, 623, 10),
    (756, 486, 13), (258, 407, 12), (254, 510, 10),
    (515, 276, 12), (496, 668, 12), (744, 538, 11),
]
from project_paths import ARTIFACT_DIR, CALIBRATION_REPO, RECORDING_DIR

WORK = ARTIFACT_DIR
DEFAULT_REPO = CALIBRATION_REPO
DEFAULT_INPUT = RECORDING_DIR
CLOCK = Fraction(1, 90000)


@contextmanager
def table_warp(repo: Path):
    sys.path.insert(0, str(repo / 'servers/poker-os/scripts'))
    from expand_inner_felt_corpus import normalization_filter
    from live_felt_unwarp import felt_unwarp

    with tempfile.TemporaryDirectory() as directory:
        maps = Path(directory)
        filters = normalization_filter(
            maps, WORK / 'office-3-calibration.json',
            whole_felt=True, source_sequence='office-3',
        ).replace('format=rgb24[out]', 'format=bgr24[out]')
        with felt_unwarp(maps, filters, mode='bilinear') as warp:
            yield warp


def highpass(pixels):
    gray = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY).astype(np.float32)
    return gray - cv2.GaussianBlur(gray, (0, 0), 3.0)


class BoardTracker:
    def __init__(self):
        x1, y1, x2, y2 = FELT_BOUNDS
        reference = cv2.imread(str(WORK / 'review/felt-43.png'))[y1:y2, x1:x2]
        self.reference = reference
        high = highpass(reference)
        self.corners = REFERENCE_CORNERS - FELT_ORIGIN
        self.templates = []
        for x, y, radius in ANCHORS:
            x -= x1
            y -= y1
            patch = high[y-radius:y+radius+1, x-radius:x+radius+1]
            self.templates.append((x, y, radius, patch))

    def find(self, pixels):
        high = highpass(pixels)
        source, target, scores = [], [], []
        for x, y, radius, template in self.templates:
            reach = 58 + radius
            left, top = max(0, x - reach), max(0, y - reach)
            window = high[top:y+reach+1, left:x+reach+1]
            result = cv2.matchTemplate(window, template, cv2.TM_CCOEFF_NORMED)
            _, score, _, (dx, dy) = cv2.minMaxLoc(result)
            if score >= .48:
                source.append((x, y))
                target.append((left + dx + radius, top + dy + radius))
                scores.append(score)
        if len(source) < 5:
            return None, {'status': 'untracked', 'matches': len(source)}
        source = np.array(source, np.float32)
        target = np.array(target, np.float32)
        transform, inliers = cv2.estimateAffinePartial2D(
            source, target, method=cv2.RANSAC, ransacReprojThreshold=3.0,
        )
        if transform is None:
            return None, {'status': 'untracked', 'matches': len(source)}
        keep = inliers.ravel().astype(bool)
        count = int(keep.sum())
        coverage = np.ptp(source[keep], axis=0)
        if count < 5 or min(coverage) < 230 or np.mean(np.array(scores)[keep]) < .58:
            return None, {'status': 'untracked', 'matches': count}
        full, _ = cv2.estimateAffine2D(source[keep], target[keep], method=cv2.RANSAC,
                                      ransacReprojThreshold=3.0)
        if full is not None:
            affine_scales = np.linalg.svd(full[:, :2], compute_uv=False)
            if np.all(np.abs(affine_scales - 1) < .10):
                transform = full
        points = cv2.transform(self.corners[None], transform)[0]
        residual = np.linalg.norm(cv2.transform(source[None, keep], transform)[0] - target[keep], axis=1)
        crop = cv2.warpPerspective(pixels, cv2.getPerspectiveTransform(points, DESTINATION),
                                   (WIDTH, HEIGHT), flags=cv2.INTER_LINEAR)
        meta = {'status': 'tracked', 'matches': count, 'railCorrelation': round(float(np.mean(np.array(scores)[keep])), 3),
                'anchorResidualPx': round(float(np.median(residual)), 2),
                'cornersFelt': (points + FELT_ORIGIN).round(2).tolist()}
        return crop, meta


def pixel_roi(felt):
    x1, y1, x2, y2 = FELT_BOUNDS
    return felt[y1:y2, x1:x2]


def output_stream(writer, size, rate, crf):
    stream = writer.add_stream('libx264', rate=rate)
    stream.width, stream.height = size
    stream.pix_fmt = 'yuv420p'
    stream.codec_context.time_base = CLOCK
    stream.options = {'crf': str(crf), 'preset': 'ultrafast', 'threads': '2'}
    return stream


def encode(writer, stream, pixels, pts):
    frame = av.VideoFrame.from_ndarray(pixels, format='bgr24')
    frame.time_base = CLOCK
    frame.pts = pts
    for packet in stream.encode(frame):
        writer.mux(packet)


def process(job):
    number, path, repo, sample_interval, render = job
    cv2.setNumThreads(1)
    tracker = BoardTracker()
    sampled, decoded, found = 0, 0, 0
    fps = 25
    if render:
        name = path.name
        final_unwarp = WORK / 'unwarped' / name
        final_board = WORK / 'board' / name
        final_tracking = WORK / 'tracking' / (path.stem + '.jsonl.gz')
        if all(p.exists() for p in (final_unwarp, final_board, final_tracking)):
            return {'clip': number, 'source': name, 'status': 'exists'}
        staged_unwarp = final_unwarp.with_suffix('.part.mp4')
        staged_board = final_board.with_suffix('.part.mp4')
        staged_tracking = final_tracking.with_suffix('.part.gz')
    with table_warp(repo) as warp, av.open(str(path)) as reader:
        input_stream = reader.streams.video[0]
        input_stream.codec_context.thread_count = 2
        roi = pixel_roi
        if not render and hasattr(warp, 'linear'):
            maps = tuple(roi(m) for m in warp.linear)
            apply = lambda pixels: cv2.remap(pixels, *maps, cv2.INTER_LINEAR)
            roi = lambda pixels: pixels
        else:
            apply = warp.apply
        next_sample = 0
        start = None
        if render:
            unwarp_writer = av.open(str(staged_unwarp), 'w', options={'movflags': '+faststart'})
            board_writer = av.open(str(staged_board), 'w', options={'movflags': '+faststart'})
            unwarp_stream = output_stream(unwarp_writer, (2236, 1000), fps, 25)
            board_stream = output_stream(board_writer, (WIDTH, HEIGHT), fps, 18)
            log = gzip.open(staged_tracking, 'wt', compresslevel=3)
            placeholder = np.zeros((HEIGHT, WIDTH, 3), np.uint8)
        try:
            for frame in reader.decode(input_stream):
                decoded += 1
                if frame.pts is None:
                    raise ValueError(f'Missing video PTS in {path}')
                exact = frame.pts * frame.time_base
                if start is None:
                    start = exact
                seconds = float(exact - start)
                take_sample = sample_interval is not None and seconds >= next_sample
                if not render and not take_sample:
                    continue
                felt = apply(frame.to_ndarray(format='bgr24'))
                crop, meta = tracker.find(roi(felt))
                found += crop is not None
                row = {'clip': number, 'source': path.name, 'frame': decoded - 1,
                       'pts': frame.pts, 'timeBase': str(frame.time_base), 'seconds': round(float(exact), 6),
                       'board': meta}
                if render:
                    pts = round((exact - start) / CLOCK)
                    encode(unwarp_writer, unwarp_stream, cv2.copyMakeBorder(
                        felt, 0, 0, 0, 1, cv2.BORDER_CONSTANT, value=0), pts)
                    encode(board_writer, board_stream, crop if crop is not None else placeholder, pts)
                    row['outputPts90k'] = pts
                    log.write(json.dumps(row, separators=(',', ':')) + '\n')
                if take_sample:
                    next_sample += sample_interval
                    key = f'{number:03}_{decoded - 1:05}'
                    (WORK / 'samples' / f'{key}.json').write_text(json.dumps(row))
                    if crop is not None:
                        cv2.imwrite(str(WORK / 'samples' / f'{key}.jpg'), crop, [cv2.IMWRITE_JPEG_QUALITY, 96])
                    sampled += 1
        finally:
            if render:
                for writer, stream in ((unwarp_writer, unwarp_stream), (board_writer, board_stream)):
                    for packet in stream.encode():
                        writer.mux(packet)
                    writer.close()
                log.close()
    if render:
        for staged, final in ((staged_unwarp, final_unwarp), (staged_board, final_board), (staged_tracking, final_tracking)):
            os.replace(staged, final)
    return {'clip': number, 'source': path.name, 'frames': decoded, 'tracked': found, 'samples': sampled}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--repo', type=Path, default=DEFAULT_REPO)
    parser.add_argument('--interval', type=float)
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--stop', type=int)
    args = parser.parse_args()
    if not args.render and args.interval is None:
        parser.error('Choose --render or --interval')
    for directory in ('samples', 'unwarped', 'board', 'tracking'):
        (WORK / directory).mkdir(exist_ok=True)
    clips = sorted(args.source.glob('*.mp4'))
    jobs = [(number, path, args.repo, args.interval, args.render)
            for number, path in list(enumerate(clips))[args.start:args.stop]]
    if not jobs:
        parser.error('No matching input clips')
    if args.jobs == 1:
        for job in jobs:
            print(json.dumps(process(job)), flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(process, jobs):
                print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
