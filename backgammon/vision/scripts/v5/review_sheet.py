#!/usr/bin/env python3
"""Contact sheets: the board just after each decoded turn with the decoded counts drawn on it."""
import json, sys
from pathlib import Path
import cv2, numpy as np
import frames, geometry as g

an, out, gnum = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
per = int(sys.argv[4]) if len(sys.argv) > 4 else 12
A = json.loads((an / f'game-{gnum:02d}.json').read_text())
T = [t for t in A['turns'] if not t.get('cubeOnly')]
want = [min(t['resultFrame'] + 30, A['endFrame']) for t in T]
imgs = dict(frames.read(want))
tiles = []
for i, (t, f) in enumerate(zip(T, want)):
    im = imgs[f].copy()
    for p in range(1, 25):
        v = t['after']['points'][p - 1]
        if not v: continue
        x, y = int(g.point_x(p)), (300 if g.is_top(p) else 290)
        y = 268 if g.is_top(p) else 322
        cv2.rectangle(im, (x - 16, y - 14), (x + 16, y + 14), (255, 255, 255) if v > 0 else (60, 60, 60), -1)
        cv2.putText(im, str(abs(v)), (x - 9, y + 8), 0, .7, (0, 0, 255), 2)
    b, o = t['after']['bar'], t['after']['off']
    lab = f"{i + 1} {t['player'][0]} {'-'.join(map(str, t['roll'] or []))} {t.get('rollSource') or ''} bar{b} off{o}"
    cv2.rectangle(im, (0, 0), (800, 34), (0, 0, 0), -1); cv2.putText(im, lab, (6, 25), 0, .8, (0, 255, 255), 2)
    tiles.append(cv2.resize(im, (480, 354)))
out.mkdir(parents=True, exist_ok=True)
for s in range(0, len(tiles), per):
    chunk = tiles[s:s + per] + [np.zeros_like(tiles[0])] * (-len(tiles[s:s + per]) % 3)
    rows = [np.hstack(chunk[r:r + 3]) for r in range(0, len(chunk), 3)]
    cv2.imwrite(str(out / f'game-{gnum:02d}-{s // per:02d}.jpg'), np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(tiles))
