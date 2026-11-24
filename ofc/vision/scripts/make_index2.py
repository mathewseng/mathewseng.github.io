"""Training index: manual labels where present; else pseudo label for number cards / none when model A is confident
and (optionally) model B agrees. Face cards and aces only from manual labels."""
import json, os, sys, numpy as np
from pseudo import track_means, CODES, TRAIN
tagA, thr, tagB, out = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
FACE = set(c for c in CODES[:52] if c[1] in 'JQKA')
items = []; stats = dict(manual=0, pseudo=0)
for s in TRAIN:
    tr, P, M = track_means(s, tagA)
    MB = dict(zip([t['id'] for t in tr], track_means(s, tagB)[2])) if tagB != '-' else {}
    manual = json.load(open(f'../labels/{s}.json')) if os.path.exists(f'../labels/{s}.json') else {}
    for t, m in zip(tr, M):
        lab = manual.get(t['id'])
        if lab is None:
            top = CODES[int(m.argmax())]
            if top in FACE or m.max() < thr: continue
            if MB and CODES[int(MB[t['id']].argmax())] != top and m.max() < 0.97: continue
            lab = top; stats['pseudo'] += 1
        else: stats['manual'] += 1
        is_manual = t['id'] in manual
        if lab == '?': continue
        k = CODES.index(lab)
        for c in t['crops']:
            p = P[c]
            if not is_manual and lab != 'none' and int(p.argmax()) != k and p.max() > 0.6 and p[k] < 0.2: continue
            items.append(dict(path=os.path.abspath(f'../scan/{s}/crops/{c}'), label=lab, track=t['id']))
json.dump(items, open(out, 'w')); print(out, len(items), stats)
