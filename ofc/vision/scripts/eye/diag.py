"""diag.py SIM SESS NAME ID CODE: history of the runtime slot at a truth object: views, gated reads, truth-code probs."""
import sys, json, numpy as np
sim = json.load(open(sys.argv[1])); sess, name, oid, code = sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']
d = json.load(open(f'../truth/{name}-objects.json')); o = next(o for o in d['objects'] if o['id'] == oid)
z = np.load(f'../scan/{sess}/probs-v3.npz'); idx = {n: i for i, n in enumerate(z['names'])}
P = (z['p1'].astype(np.float32) + z['p2'].astype(np.float32)) / 2
rows = []
for f in sim:
    if f['t'] > d['t'] or f['t'] < d['t'] - 300: continue
    for b in f['bodies']:
        if abs(b['x'] - o['x']) < 8 and abs(b['y'] - o['y']) < 8 and b['crop'] in idx:
            p = P[idx[b['crop']]]; top = int(p.argmax())
            rows.append((f['t'], b['slot'], b['card'], b['hand'], round(float(p[CODES.index(code)]), 2), (CODES + ['none'])[top], round(float(p[top]), 2)))
print(len(rows), 'views near the object')
from collections import Counter
print('slots', Counter(r[1] for r in rows).most_common(5), 'reads', Counter(r[2] for r in rows).most_common(5), 'tops', Counter(r[5] for r in rows).most_common(5))
print('median p(truth)', np.median([r[4] for r in rows]) if rows else None)
for r in rows[:: max(1, len(rows) // 12)]: print(r)
