"""cardsize.py: fit the expected card box size at each table position from confident whole views of the shipped scans.
Model: card W0 x H0, local lens scale sx(x,y), sy(x,y) (log-quadratic in x, y); a card whose long axis is at angle th from
vertical projects to long = H0*hypot(sx sin th, sy cos th), short = W0*hypot(sx cos th, sy sin th). Writes cardsize.json."""
import json, numpy as np, sys
from scipy.optimize import least_squares
rows = []
for s in ['n1501', 'n1532', 's1836', 's0023']:
    for i, l in enumerate(open(f'/private/tmp/claude-501/ofc-vision2/scan/{s}/state.jsonl')):
        r = json.loads(l)
        for d in r['dets']:
            if d['conf'] >= 0.85: rows.append((d['x'], d['y'], d['w'], d['h'], d['deg']))
a = np.array(rows)
# one row per still card per ~6 s: dedupe on rounded pose
key = np.round(a[:, :2] / 4).astype(int); _, idx = np.unique(key, axis=0, return_index=True); a = a[idx]
print('views', len(a))
def feats(x, y):
    u, v = (x - 1000) / 1000, (y - 600) / 1000
    return np.stack([u, v, u * u, u * v, v * v], -1)
def pred(q, x, y, deg):
    F = feats(x, y); lw0, lh0 = q[0], q[1]; sx = np.exp(F @ q[2:7]); sy = np.exp(F @ q[7:12]); th = np.radians(deg)
    return np.exp(lw0) * np.hypot(sx * np.cos(th), sy * np.sin(th)), np.exp(lh0) * np.hypot(sx * np.sin(th), sy * np.cos(th))
def res(q):
    w, h = pred(q, a[:, 0], a[:, 1], a[:, 4]); return np.concatenate([np.log(a[:, 2] / w), np.log(a[:, 3] / h)])
q = least_squares(res, np.r_[np.log(39), np.log(61), np.zeros(10)], loss='soft_l1', f_scale=0.05).x
w, h = pred(q, a[:, 0], a[:, 1], a[:, 4]); rw, rh = a[:, 2] / w, a[:, 3] / h
print('W0 H0', np.exp(q[:2]), 'coef', np.round(q[2:], 3))
for nm, m in (('upright', np.abs(a[:, 4]) < 20), ('sideways', np.abs(a[:, 4]) > 70), ('tilted', (np.abs(a[:, 4]) >= 20) & (np.abs(a[:, 4]) <= 70))):
    print(nm, m.sum(), 'w/exp pct 1 5 50 95 99', np.round(np.percentile(rw[m], [1, 5, 50, 95, 99]), 3), 'h/exp', np.round(np.percentile(rh[m], [1, 5, 50, 95, 99]), 3))
json.dump(dict(q=q.tolist(), note='cardsize.py'), open('cardsize.json', 'w'))
