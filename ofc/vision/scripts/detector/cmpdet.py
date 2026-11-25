"""cmpdet.py EVAL_A EVAL_B OUT [cat]: tiles of legible cards matched in A but not in B (and B not A): GT green, A boxes blue, B boxes red."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
A, B = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])); out = sys.argv[3]; cat = sys.argv[4] if len(sys.argv) > 4 else None
tiles = []; R, sc = 55, 3
for n in A:
    ca = {c['id']: c for c in A[n]['cards']}; cb = {c['id']: c for c in B[n]['cards']}
    for i, c in ca.items():
        if c['kind'] not in ('card', 'cq') or (cat and c['cat'] != cat): continue
        da, db = c['box'] is not None, cb[i]['box'] is not None
        if da == db: continue
        im = frame_at(A[n]['session'], A[n]['t']); x0, y0 = max(int(c['x'] - R), 0), max(int(c['y'] - R), 0)
        t = cv2.resize(im[y0:y0 + 2 * R, x0:x0 + 2 * R], (2 * R * sc, 2 * R * sc), interpolation=cv2.INTER_CUBIC)
        def draw(bs, col):
            for b in bs: cv2.polylines(t, [((quad(b['x'], b['y'], b['w'], b['h'], b['deg']) - [x0, y0]) * sc).astype(np.int32)], True, col, 1)
        draw(A[n]['boxes'], (255, 120, 0)); draw(B[n]['boxes'], (60, 60, 255))
        cv2.polylines(t, [((quad(c['x'], c['y'], c['w'], c['h'], c['deg']) - [x0, y0]) * sc).astype(np.int32)], True, (60, 230, 60), 2)
        cv2.rectangle(t, (0, 0), (t.shape[1], 18), (0, 0, 0), -1)
        cv2.putText(t, f"{n} {i}:{c['code']} {c['cat']} {'A only' if da else 'B only'}", (3, 13), 0, 0.45, (255, 255, 255), 1)
        tiles.append(cv2.copyMakeBorder(t, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
for k in range(0, len(tiles), 12):
    ch = tiles[k:k + 12]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 4)
    cv2.imwrite(f'{out}-{k // 12}.jpg', np.vstack([np.hstack(ch[j:j + 4]) for j in range(0, len(ch), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(tiles))
