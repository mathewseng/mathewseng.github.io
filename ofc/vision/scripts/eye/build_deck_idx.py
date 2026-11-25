"""build_deck_idx.py: index for the deck gate (0 classic, 1 jumbo, 2 none) from whole-hand deck labels.
jumbo hands of n1532: A 3225.4-3494.2, C 3745.8-3937.4; classic n1532 hands 2719.8-3225.4 and 3494.2-3745.8 (never truth);
old training sessions' v4b index (classic + none)."""
import os, json, numpy as np, cv2, onnxruntime as ort, random
from src import REPO as R
S = os.path.abspath('../scan/n1532')
pr = np.load(S + '/probs-v3.npz'); names = list(pr['names']); P3 = (pr['p1'].astype(np.float32) + pr['p2'].astype(np.float32)) / 2
fb = ort.InferenceSession(R + '/models/card-identity-fallback.onnx', providers=['CPUExecutionProvider'])
def t_of(n): return float(n.split('_')[0])
J = [(3225.4, 3494.2), (3745.8, 3937.4)]; C = [(2719.8, 3225.4), (3494.2, 3745.8)]
inr = lambda t, rs: any(a <= t < b for a, b in rs)
sel = [i for i, n in enumerate(names) if inr(t_of(n), J + C)]
pf = np.zeros((len(names), 53), np.float32)
for k in range(0, len(sel), 512):
    ii = sel[k:k + 512]; x = np.stack([cv2.imread(f'{S}/crops/{names[i]}') for i in ii]).astype(np.float32) / 255
    x = np.concatenate([x, x[:, ::-1, ::-1]]); lg = fb.run(None, {fb.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
    e = np.exp(lg - lg.max(1, keepdims=True)); p = e / e.sum(1, keepdims=True); pf[ii] = (p[:len(ii)] + p[len(ii):]) / 2
out = []; cnt = {}
for i in sel:
    t = t_of(names[i]); jumbo = inr(t, J)
    pn = pf[i, 52] if jumbo else P3[i, 52]
    lab = 'none' if (pf[i, 52] >= 0.5 and P3[i, 52] >= 0.5) else (None if pn >= 0.5 else ('jumbo' if jumbo else 'classic'))
    if lab is None: continue
    out.append(dict(path=f'{S}/crops/{names[i]}', label=lab, src='n1532')); cnt[lab] = cnt.get(lab, 0) + 1
print('n1532', cnt)
old = json.load(open('../data/idx4b.json'))  # v4b whole-view index (scripts/eye/make_index4.py)
for it in old: out.append(dict(path=it['path'], label='none' if it['label'] == 'none' else 'classic', src='old'))
json.dump(out, open('../data/deck-idx.json', 'w')); print('total', len(out))
