"""qsheet.py NAME...: for every '?' object, its spot 0.7 s, 2 s and 4 s after the slot was first boxed (4x, upright)."""
import sys, json, re, cv2, numpy as np
sys.path.insert(0, '.')
from render_truth import frame_at
from zoom import warp
for name in sys.argv[1:]:
    d = json.load(open(f'../truth/{name}-objects.json')); lab = {}
    for line in open(f'../truth/labels/{name}.txt'):
        m = re.match(r'(\d+) (\S+)', line)
        if m: lab[int(m[1])] = m[2]
    rows = []
    for o in d['objects']:
        if not lab.get(o['id'], '?').startswith('?') or o['first'] is None: continue
        ts = [o['first'] + dt for dt in (0.7, 2, 4)]
        tl = []
        for t in ts:
            im = cv2.resize(warp(frame_at(d['session'], t), o['x'], o['y'], o['w'], o['h'], o['deg'], 3, 1.2), (110, 165))
            cv2.putText(im, f"#{o['id']} {t:.0f}", (2, 12), 0, 0.4, (0, 0, 255), 1); tl.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
        rows.append(np.hstack(tl))
    if not rows: continue
    rows += [np.zeros_like(rows[0])] * ((-len(rows)) % 4)
    sheet = np.vstack([np.hstack(rows[k:k + 4]) for k in range(0, len(rows), 4)])
    cv2.imwrite(f'../truth/{name}-q.jpg', sheet); print(name, len(rows))
