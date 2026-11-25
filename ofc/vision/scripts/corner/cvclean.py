"""cvclean.py: 4-fold (by slot) cross-validated cleaning of corner positives. Writes ../corner-cv.json (per positive:
crop, corner, k, label, p(rank), p(suit) from the fold that did not train on its slot)."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import json, numpy as np, torch, sys
sys.argv = ['x']
from train_corner import load, fit, CODES
keys = []; pos, neg = load(['A', 'B'], keys=keys)
ks = sorted({k for _, _, k in keys}); rng = np.random.default_rng(3); rng.shuffle(ks); fold = {k: i % 4 for i, k in enumerate(ks)}
out = []
for f in range(4):
    tr = [p for p, key in zip(pos, keys) if fold[key[2]] != f]; te = [(p, key) for p, key in zip(pos, keys) if fold[key[2]] == f]
    m = fit(tr, neg, 8, 250).cpu(); seen = {y % 13 for _, y in tr}
    x = torch.from_numpy(np.stack([p for (p, _), _ in te]).astype(np.float32).transpose(0, 3, 1, 2) / 255)
    with torch.no_grad(): r, s = m.parts(x); pr, ps = torch.softmax(r, 1).numpy(), torch.softmax(s, 1).numpy()
    for ((p, y), key), a, b in zip(te, pr, ps):
        out.append(dict(crop=key[0], corner=key[1], k=key[2], label=CODES[y], pr=float(a[y % 13]), ps=float(b[y // 13]),
                        rtop='A23456789TJQK-'[int(a.argmax())], stop='SHCD'[int(b.argmax())], rank_seen=(y % 13) in seen))
    print('fold', f, len(te), flush=True)
json.dump(out, open('../corner-cv.json', 'w'))
