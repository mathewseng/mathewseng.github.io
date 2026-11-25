"""Whole jumbo training-slot crops -> per-corner patches; the diagonal pair with more ink holds the index."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import json, cv2, numpy as np, os
from corner import corners, ink
d = json.load(open(REPO + '/labels/n1532-jumbo-slots.json'))['slots']
out = []; amb = 0
for s in d:
    if not (s['k'] <= 70 or s['k'] >= 114): continue
    hand = 'A' if s['k'] <= 70 else 'B'
    for cn in s['crops']:
        c = cv2.imread('../scan/n1532/crops/' + cn); ps = corners(c); k = [ink(p) for p in ps]
        a, b = k[0] + k[2], k[1] + k[3]
        rec = dict(crop=cn, label=s['label'], k=s['k'], hand=hand, ink=[round(x, 3) for x in k])
        if s['label'] == 'none': rec['pair'] = None
        elif max(a, b) < 0.15 or abs(a - b) < 0.1: rec['pair'] = '?'; amb += 1
        else: rec['pair'] = 0 if a > b else 1
        out.append(rec)
json.dump(out, open('../corner-whole.json', 'w'))
from collections import Counter
print(len(out), 'ambiguous', amb, Counter((r['hand'], r['pair']) for r in out))
