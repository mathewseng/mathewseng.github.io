#!/usr/bin/env python3
"""Scan every 5th rectified frame for dice candidates; save positions and 40x40 patches."""
import json, sys
from concurrent.futures import ProcessPoolExecutor
import av, numpy as np, cv2
import dice, frames
from session import RECT, WORK

OUT = WORK / 'dice-scan'


def run(clip):
    out = OUT / f'clip-{clip:03d}.npz'
    if out.exists(): return clip
    cv2.setNumThreads(1)
    dice.load_static(WORK / 'ref/dice-static.npz')
    base = int(frames.offsets()[clip]); meta = []; patches = []
    with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as c:
        for i, f in enumerate(c.decode(video=0)):
            if i % 5: continue
            img = f.to_ndarray(format='bgr24')
            for d in dice.candidates(img):
                if d['area'] < 25: continue
                meta.append([base + i, d['x'], d['y'], d['area'], d['colour'] == 'red'])
                patches.append(dice.patch(img, d['x'], d['y'], 40))
    np.savez_compressed(out, meta=np.array(meta, np.float32).reshape(-1, 5), patches=np.array(patches, np.uint8).reshape(-1, 40, 40, 3))
    return clip

if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    with ProcessPoolExecutor(8) as pool:
        for c in pool.map(run, range(len(frames.offsets()) - 1)): pass
    print('done')
