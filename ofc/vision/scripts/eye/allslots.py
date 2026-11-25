"""allslots.py SIM SESS TAG T0:T1 ...: every slot named in the intervals (box views), 3 named crops each at 2x, sheets ../look/TAG-N.jpg;
writes ../TAG-slots.json [{k, slot, name, t0, t1, n}]."""
import sys, json, cv2, numpy as np
from collections import Counter
sim = json.load(open(sys.argv[1])); sess, tag = sys.argv[2], sys.argv[3]
iv = [tuple(map(float, a.split(':'))) for a in sys.argv[4:]]
sl = {}
for f in sim:
    if not any(a <= f['t'] < b for a, b in iv): continue
    for b in f['bodies']:
        if b['hand'] and b['crop']:
            d = sl.setdefault((b['slot'], b['hand']), []); d.append((f['t'], b['crop']))
tiles, meta = [], []
for k, ((slot, name), v) in enumerate(sorted(sl.items(), key=lambda kv: kv[1][0][0])):
    pick = [v[0], v[len(v) // 2], v[-1]]
    ims = [cv2.resize(cv2.imread(f'../scan/{sess}/crops/{c}'), (96, 144), interpolation=cv2.INTER_CUBIC) for _, c in pick]
    t = np.hstack([np.pad(i, ((0, 0), (0, 2), (0, 0))) for i in ims]); lab = np.zeros((20, t.shape[1], 3), np.uint8)
    cv2.putText(lab, f'{k} {name} n{len(v)}', (3, 15), 0, 0.5, (0, 255, 255), 1)
    tiles.append(np.pad(np.vstack([lab, t]), ((2, 2), (2, 2), (0, 0)))); meta.append(dict(k=k, slot=slot, name=name, t0=v[0][0], t1=v[-1][0], n=len(v)))
per = 30
for s in range(0, len(tiles), per):
    ch = tiles[s:s + per]; ch += [np.zeros_like(ch[0])] * ((-len(ch)) % 5)
    cv2.imwrite(f'../look/{tag}-{s // per}.jpg', np.vstack([np.hstack(ch[r:r + 5]) for r in range(0, len(ch), 5)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
json.dump(meta, open(f'../{tag}-slots.json', 'w')); print(len(tiles), 'slots', (len(tiles) + per - 1) // per, 'sheets')
