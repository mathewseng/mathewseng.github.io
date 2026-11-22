#!/usr/bin/env python3
"""Rectify every source clip to the canonical 800x590 board image."""
import argparse, gzip, json, os
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
import av, cv2, numpy as np
import board_track as bt
from session import RECT, REFERENCE, clips

TRACK_EVERY = 5


def run(job):
    index, path = job
    out_video = RECT / f'clip-{index:03d}.mp4'
    out_track = RECT / f'clip-{index:03d}.jsonl.gz'
    if out_video.exists() and out_track.exists():
        return {'clip': index, 'status': 'exists'}
    cv2.setNumThreads(1)
    tracker = bt.load_reference(REFERENCE)
    part_v = out_video.with_suffix('.part.mp4'); part_t = out_track.with_suffix('.part.gz')
    with av.open(str(path)) as reader, av.open(str(part_v), 'w', options={'movflags': '+faststart'}) as writer, gzip.open(part_t, 'wt') as log:
        stream_in = reader.streams.video[0]; stream_in.thread_type = 'AUTO'
        stream = writer.add_stream('libx264', rate=25)
        stream.width, stream.height = bt.W, bt.H; stream.pix_fmt = 'yuv420p'
        stream.options = {'crf': '15', 'preset': 'veryfast', 'threads': '2'}
        H = None; age = None; tracked = 0
        for n, frame in enumerate(reader.decode(stream_in)):
            img = frame.to_ndarray(format='bgr24')
            row = {'frame': n}
            if n % TRACK_EVERY == 0 or H is None:
                found, meta = tracker.find(img)
                if found is not None:
                    H = found; age = 0; tracked += 1
                    row.update(inliers=meta['inliers'], corners=meta['corners'])
                else:
                    row['untracked'] = True
            if age is not None:
                row['age'] = age; age += 1
            log.write(json.dumps(row, separators=(',', ':')) + '\n')
            rect = bt.rectify(img, H) if H is not None else np.zeros((bt.H, bt.W, 3), np.uint8)
            out = av.VideoFrame.from_ndarray(rect, format='bgr24')
            out.pts = n; out.time_base = Fraction(1, 25)
            for p in stream.encode(out): writer.mux(p)
        for p in stream.encode(): writer.mux(p)
    os.replace(part_v, out_video); os.replace(part_t, out_track)
    return {'clip': index, 'frames': n + 1, 'tracked': tracked}


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--jobs', type=int, default=8)
    ap.add_argument('--only', type=int, nargs='*')
    a = ap.parse_args(); RECT.mkdir(parents=True, exist_ok=True)
    jobs = [(i, p) for i, p in enumerate(clips()) if not a.only or i in a.only]
    with ProcessPoolExecutor(a.jobs) as pool:
        for r in pool.map(run, jobs): print(json.dumps(r), flush=True)
