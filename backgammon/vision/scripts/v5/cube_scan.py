#!/usr/bin/env python3
"""Locate the doubling cube every second by rotated template matching."""
import json
from concurrent.futures import ProcessPoolExecutor
import av, cv2, numpy as np
import frames
from session import RECT, WORK

ref = cv2.imread(str(WORK / 'ref/rect-5.png'))
TEMPLATE = ref[284:330, 22:70]  # cube face in the holder


def templates():
    g = cv2.cvtColor(TEMPLATE, cv2.COLOR_BGR2GRAY)
    out = []
    for ang in range(0, 90, 15):
        M = cv2.getRotationMatrix2D((24, 23), ang, 1.0)
        t = cv2.warpAffine(g, M, (48, 46), borderMode=cv2.BORDER_REFLECT)
        out.append(t[8:38, 8:40])
    return out


def run(clip):
    cv2.setNumThreads(1)
    T = templates(); base = int(frames.offsets()[clip]); res = []
    with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as c:
        for i, f in enumerate(c.decode(video=0)):
            if i % 25: continue
            g = cv2.cvtColor(f.to_ndarray(format='bgr24'), cv2.COLOR_BGR2GRAY)
            best = (-1, 0, 0)
            for t in T:
                m = cv2.matchTemplate(g, t, cv2.TM_CCOEFF_NORMED)
                _, v, _, loc = cv2.minMaxLoc(m)
                if v > best[0]: best = (v, loc[0] + 16, loc[1] + 15)
            res.append([base + i, round(best[0], 3), best[1], best[2]])
    return res

if __name__ == '__main__':
    out = []
    with ProcessPoolExecutor(8) as pool:
        for r in pool.map(run, range(len(frames.offsets()) - 1)): out += r
    (WORK / 'cube-scan.json').write_text(json.dumps(out))
    print(len(out))
