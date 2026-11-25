"""eval_corner.py MODEL HAND SIM: corner reads on the other hand's labelled slots: whole crops, and later (covered) views of the same slot."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import sys, json, cv2, numpy as np, onnxruntime as ort
from collections import Counter, defaultdict
from corner import corners
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']
m = ort.InferenceSession(sys.argv[1], providers=['CPUExecutionProvider']); hand = sys.argv[2]
def read(crops):
    x = np.stack([p for c in crops for p in corners(c)]).astype(np.float32) / 255
    lp = m.run(None, {'images': np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
    p = np.exp(lp).reshape(len(crops), 4, 53); return p
slots = [s for s in json.load(open(REPO + '/labels/n1532-jumbo-slots.json'))['slots']
         if ((s['k'] <= 70) if hand == 'A' else (s['k'] >= 114)) and s['label'] != 'none']
sim = json.load(open(sys.argv[3]))  # a sim2.py run of n1532 (slot ids)
c2s = {}; byslot = defaultdict(list)
for f in sim:
    for b in f['bodies']:
        if b['crop']: c2s[b['crop']] = b['slot']; byslot[b['slot']].append((f['t'], b['crop']))
t1 = 3494.2 if hand == 'A' else 3937.4
res = {'whole': [], 'later': []}
for s in slots:
    ids = {c2s.get(c) for c in s['crops']} - {None}
    last = max(float(c.split('_')[0]) for c in s['crops'])
    later = [c for i in ids for t, c in byslot[i] if last < t < t1 and c not in s['crops']]
    for kind, cs in (('whole', s['crops']), ('later', later)):
        if not cs: continue
        p = read([cv2.imread('../scan/n1532/crops/' + c) for c in cs])
        for c, pc in zip(cs, p):
            best = pc[:, :52].max(0); top = int(best.argmax()); q = float(best[top])
            nc = int(sum(int(pc[i].argmax()) == top and pc[i, top] >= 0.5 for i in range(4)))
            res[kind].append((s['label'], CODES[top], q, nc, c, s['k']))
for kind, rs in res.items():
    print(kind, len(rs))
    for th in (0.5, 0.8, 0.9, 0.95, 0.98):
        ok = sum(1 for l, p, q, nc, *_ in rs if q >= th and p == l); bad = [(l, p, round(q, 3), nc, c) for l, p, q, nc, c, k in rs if q >= th and p != l]
        print(f'  p>={th}: right {ok} wrong {len(bad)}', Counter((l, p) for l, p, *_ in bad).most_common(8))
    ok2 = sum(1 for l, p, q, nc, *_ in rs if nc >= 2 and p == l); bad2 = sum(1 for l, p, q, nc, *_ in rs if nc >= 2 and p != l)
    print(f'  two corners agree (p>=.5 each): right {ok2} wrong {bad2}')
json.dump(res, open(f'../evalc-{sys.argv[1].split("/")[-1][:-5]}-{hand}.json', 'w'))
