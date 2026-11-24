"""Split tracks where a confident identity change persists (a card swapped on the same spot).
The segment holding the original representative crop keeps the track id (and its review label); others get id+'.k'."""
import json, sys, numpy as np, os
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK'] + ['none']
def segments(preds, confs, thr=0.7):
    seg = [0] * len(preds); cur = None; k = 0
    conf_idx = [i for i in range(len(preds)) if confs[i] >= thr and preds[i] != 52]
    for j, i in enumerate(conf_idx):
        if cur is None: cur = preds[i]; continue
        if preds[i] != cur:
            nxt = conf_idx[j + 1] if j + 1 < len(conf_idx) else None
            if nxt is None or preds[nxt] == preds[i]:
                k += 1; cur = preds[i]
                for m in range(i, len(preds)): seg[m] = k
    return seg
tag = sys.argv[1]
for s in sys.argv[2:]:
    src = f'../scan/{s}/tracks-orig.json'
    if not os.path.exists(src): os.rename(f'../scan/{s}/tracks.json', src)
    tr = json.load(open(src)); z = np.load(f'../scan/{s}/probs-{tag}.npz'); P = dict(zip(z['names'], z['p'].astype(np.float32)))
    out = []; nsplit = 0
    for t in tr:
        ps = [P[c] for c in t['crops']]; seg = segments([int(p.argmax()) for p in ps], [float(p.max()) for p in ps])
        rep = int(np.argmax(t['cropConf'])); keep = seg[rep]
        for k in sorted(set(seg)):
            idx = [i for i in range(len(seg)) if seg[i] == k]
            nt = dict(t, crops=[t['crops'][i] for i in idx], cropConf=[t['cropConf'][i] for i in idx])
            if k != keep: nt['id'] = f"{t['id']}.{k}"; nsplit += 1
            out.append(nt)
    json.dump(out, open(f'../scan/{s}/tracks.json', 'w')); print(s, len(tr), '->', len(out), 'new segments', nsplit)
