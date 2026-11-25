"""diffsheet.py SIM DIFF.json SESS TAG: per changed slot with a new name, 3 of its boxed crops (first/mid/last view in the
diff interval, or of the slot when it is only hidden there) at 4x with the new name; sheets ../look/TAG-N.jpg."""
import sys, json, cv2, numpy as np
sim = json.load(open(sys.argv[1])); diff = json.load(open(sys.argv[2])); sess, tag = sys.argv[3], sys.argv[4]
views = {}
for f in sim:
    for b in f['bodies']:
        if b['crop']: views.setdefault(b['slot'], []).append((f['t'], b['crop'], b['hand']))
tiles = []
for k, d in enumerate(diff):
    new = [p for p in d['pairs'] if p[1]]
    if not new: continue
    name = max(new, key=lambda p: p[2])[1]
    v = [x for x in views.get(d['slot'], []) if d['t0'] - 0.1 <= x[0] <= d['t1'] + 0.1] or views.get(d['slot'], [])
    if not v: continue
    pick = [v[0], v[len(v) // 2], v[-1]]
    ims = [cv2.resize(cv2.imread(f'../scan/{sess}/crops/{c}'), (128, 192), interpolation=cv2.INTER_CUBIC) for _, c, _ in pick]
    t = np.hstack([np.pad(i, ((0, 0), (0, 2), (0, 0))) for i in ims])
    lab = np.zeros((24, t.shape[1], 3), np.uint8)
    cv2.putText(lab, f"{k} {name} {d['t0']:.0f}s", (3, 18), 0, 0.6, (0, 255, 255), 2)
    tiles.append(np.pad(np.vstack([lab, t]), ((2, 2), (2, 2), (0, 0))))
per = 20
for s in range(0, len(tiles), per):
    ch = tiles[s:s + per]; ch += [np.zeros_like(ch[0])] * ((-len(ch)) % 4)
    cv2.imwrite(f'../look/{tag}-{s // per}.jpg', np.vstack([np.hstack(ch[r:r + 4]) for r in range(0, len(ch), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(tiles), 'tiles')
