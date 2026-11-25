"""firstz.py PREFIX ids [S]: for each object, its neighbourhood (2.2x the box, upright on the box angle) at the slot's
first box + 0.7 / 2 / 5 s and at the truth frame, S x (default 4), with the object's box drawn thin. No model names.
Shows which card a fan or column box sat on when it was first boxed."""
import sys, json, cv2, numpy as np
from src import frame_at, REPO
sys.path.insert(0, REPO)
from ofc_card_vision import card_quad
pre = sys.argv[1]; d = json.load(open(pre + '-objects.json')); ids = [int(i) for i in sys.argv[2].split(',')]
S = float(sys.argv[3]) if len(sys.argv) > 3 else 4
cache = {}
def fr(t):
    t = round(t, 2)
    if t not in cache: cache[t] = frame_at(d['session'], t)
    return cache[t]
rows = []
for o in d['objects']:
    if o['id'] not in ids: continue
    ts = ([o['first'] + dt for dt in (0.7, 2, 5)] if o['first'] else []) + [d['t']]
    W, H = int(max(o['w'], o['h']) * 2.2 * S), int(max(o['w'], o['h']) * 2.2 * S)
    q = card_quad(o['x'], o['y'], max(o['w'], o['h']) * 2.2, max(o['w'], o['h']) * 2.2, o['deg'])
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    tl = []
    for t in ts:
        im = cv2.warpPerspective(fr(t), M, (W, H), flags=cv2.INTER_CUBIC)
        b = cv2.perspectiveTransform(card_quad(o['x'], o['y'], o['w'], o['h'], o['deg']).reshape(-1, 1, 2), M).astype(np.int32)
        cv2.polylines(im, [b], True, (0, 0, 255), 1)
        cv2.putText(im, f"#{o['id']} {t:.1f}", (3, 16), 0, 0.5, (0, 0, 255), 2); tl.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
    while len(tl) < 4: tl.append(np.zeros_like(tl[0]))
    rows.append(np.hstack(tl))
Wm = max(r.shape[1] for r in rows)
rows = [np.pad(r, ((0, 0), (0, Wm - r.shape[1]), (0, 0))) for r in rows]
for k in range(0, len(rows), 3):
    cv2.imwrite(f'{pre}-first{k // 3}.jpg', np.vstack(rows[k:k + 3]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(rows), 'rows')
