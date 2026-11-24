#!/usr/bin/env python3
"""Vision pass: read checker slots on every 5th rectified frame of each clip.

Writes obs/clip-NNN.json with one row per sampled frame:
  f: global frame, m: motion (% changed pixels over +-0.4 s), pos: signed counts per point,
  conf: minimum slot confidence per point (24 floats).
"""
import argparse, json
from concurrent.futures import ProcessPoolExecutor
import av, numpy as np, torch
import frames, read_slots as rs
from session import RECT, WORK, board_view, reader_view, reader_points

STEP = 5


def run_clip(clip, reader, outdir):
    out = outdir / f'clip-{clip:03d}.json'
    if out.exists(): return clip, 'exists'
    motion = json.loads((RECT / f'clip-{clip:03d}.motion.json').read_text())
    m = np.array([x[1] if x else 0 for x in motion])
    base = int(frames.offsets()[clip]); rows = []
    batch = []
    view = board_view(); order = reader_points(view)
    def flush():
        # A turned or mirrored board is read in the Nov 21 view, then the points are mapped back.
        prs = reader.probs_batch([reader_view(img, view) for _, img in batch])
        if view: prs = [pr[order] for pr in prs]
        for (i, _), pr in zip(batch, prs):
            cls = pr.argmax(-1); conf = pr.max(-1).min(-1)
            if pr.shape[-1] > 3:
                conf = np.where((cls == 3).any(-1), 0.0, conf)
            pos = [0] * 24
            for p in range(24):
                w, d = int((cls[p] == 1).sum()), int((cls[p] == 2).sum())
                pos[p] = w if w >= d else -d
            rows.append({'f': base + i, 'm': round(float(m[max(0, i - 10):i + 11].max()), 2), 'pos': pos,
                         'conf': [round(float(x), 3) for x in conf]})
        batch.clear()
    with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as c:
        c.streams.video[0].thread_type = 'AUTO'
        for i, f in enumerate(c.decode(video=0)):
            if i % STEP: continue
            batch.append((i, f.to_ndarray(format='bgr24')))
            if len(batch) == 32: flush()
    if batch: flush()
    out.write_text(json.dumps(rows, separators=(',', ':')))
    return clip, len(rows)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('weights'); ap.add_argument('outdir')
    ap.add_argument('clips', type=int, nargs='+')
    a = ap.parse_args()
    from pathlib import Path
    outdir = Path(a.outdir); outdir.mkdir(parents=True, exist_ok=True)
    reader = rs.Reader(a.weights, 'mps')
    for c in a.clips: print(run_clip(c, reader, outdir), flush=True)
