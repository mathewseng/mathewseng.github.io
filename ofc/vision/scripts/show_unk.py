"""Accepted reads on held-out tracks labelled '?' (unreadable by eye at review): sheet for eye check."""
import json, sys, cv2, numpy as np
from classify import load, CODES
from eval_cls import decide
from sheet import sheet
run = load(sys.argv[1]); P = float(sys.argv[3]); out = []
for s in ['s1836', 's0023']:
    lab = json.load(open(f'../labels/{s}.json'))
    for t in json.load(open(f'../scan/{s}/tracks.json')):
        if lab.get(t['id']) != '?': continue
        for c in t['crops']:
            im = cv2.imread(f'../scan/{s}/crops/{c}'); x = im[None].astype(np.float32) / 255
            r = dict(p1=run(x)[0], p2=run(np.ascontiguousarray(x[:, ::-1, ::-1]))[0])
            d = decide(r, P, 0.3)
            if d: out.append((im, f"{t['id'][-7:]} {d}"))
print(len(out), 'reads on ? tracks')
step = max(1, len(out) // int(sys.argv[4]))
sel = out[::step]
sheet([o[0] for o in sel], [o[1] for o in sel], sys.argv[2], cols=12)
print(len(sel), 'shown')
