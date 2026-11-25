"""Classic training crops (v4b whole views, training sessions only) -> corner records like corner-whole.json (hand = session)."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import json, cv2, numpy as np, random
from corner import corners, ink
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else '../data/idx4b.json')); random.seed(0)
by = {}
for it in d: by.setdefault(it.get('slot') or it['path'].split('/')[-3] + '-' + it['label'] + '-' + it['path'][-12:-7], []).append(it)
out = []
for slot, its in by.items():
    for it in random.sample(its, min(len(its), 12)):  # at most 12 crops per track
        c = cv2.imread(it['path']);
        if c is None: continue
        k = [ink(p) for p in corners(c)]
        out.append(dict(path=it['path'], label=it['label'], k=slot, hand=it['path'].split('/')[-3], ink=[round(x, 3) for x in k]))
json.dump(out, open('../corner-classic.json', 'w')); print(len(out), len(by))
