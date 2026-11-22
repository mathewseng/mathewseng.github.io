#!/usr/bin/env python3
"""Per-frame board motion: mean abs difference to the frame 0.4 s earlier."""
import json, sys
from concurrent.futures import ProcessPoolExecutor
import av, cv2, numpy as np
from session import RECT, WORK

LAG = 10


def run(clip):
    out = RECT / f'clip-{clip:03d}.motion.json'
    if out.exists(): return clip
    cv2.setNumThreads(1)
    hist, values = [], []
    with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as c:
        for f in c.decode(video=0):
            g = cv2.resize(cv2.cvtColor(f.to_ndarray(format='bgr24'), cv2.COLOR_BGR2GRAY), (200, 148), interpolation=cv2.INTER_AREA).astype(np.float32)
            hist.append(g)
            if len(hist) > LAG:
                d = np.abs(g - hist[-1 - LAG])
                values.append([round(float(d.mean()), 2), round(float((d > 25).mean() * 100), 2)])
                hist.pop(0)
            else:
                values.append(None)
    out.write_text(json.dumps(values))
    return clip

if __name__ == '__main__':
    clips = [int(a) for a in sys.argv[1:]]
    with ProcessPoolExecutor(4) as pool:
        for c in pool.map(run, clips): print(c, flush=True)
