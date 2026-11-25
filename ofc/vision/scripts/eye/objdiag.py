"""objdiag.py SIM SESS NAME... : per legible truth object, its slot's views: v3 top, v5a/candidate top, how often the fallback is asked."""
import sys, json, re, numpy as np, cv2, onnxruntime as ort
from src import REPO
T = REPO + '/eval/eye-truth'
sim = json.load(open(sys.argv[1])); sess = sys.argv[2]
CODES = json.load(open(REPO + '/profile.json'))['classifier']['classes']
pr = np.load(f'../scan/{sess}/probs-v3.npz'); idx = {n: i for i, n in enumerate(pr['names'])}
P3 = (pr['p1'].astype(np.float32) + pr['p2'].astype(np.float32)) / 2
fbm = [a for a in sys.argv[3:] if a.endswith('.onnx')]
fb = ort.InferenceSession(fbm[0] if fbm else REPO + '/models/card-identity-fallback.onnx', providers=['CPUExecutionProvider'])
def fbp(crops):
    x = np.stack([cv2.imread(f'../scan/{sess}/crops/{c}') for c in crops]).astype(np.float32) / 255
    x = np.concatenate([x, x[:, ::-1, ::-1]]); lg = fb.run(None, {fb.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
    e = np.exp(lg - lg.max(1, keepdims=True)); p = e / e.sum(1, keepdims=True); n = len(crops); return (p[:n] + p[n:]) / 2, p[:n], p[n:]
def top(p): i = int(p.argmax()); return f'{CODES[i]}:{p[i]:.2f}'
for name in [a for a in sys.argv[3:] if not a.endswith('.onnx')]:
    d = json.load(open(f'{T}/objects/{name}.json')); t = d['t']
    lab = {int(m[1]): m[2] for m in (re.match(r'(\d+) (\S+)', l) for l in open(f'{T}/labels/{name}.txt')) if m}
    fr = min(sim, key=lambda f: abs(f['t'] - t))
    for o in d['objects']:
        l = lab.get(o['id'], '?')
        if not re.fullmatch(r'[SHCD][A2-9TJQK]', l): continue
        best = None
        for b in fr['bodies']:
            dd = ((b['x'] - (o.get('bx') or o['x'])) ** 2 + (b['y'] - (o.get('by') or o['y'])) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, b['slot'], b['hand'])
        for s in fr['table']:
            if s['detected']: continue
            dd = ((s['x'] - o['x']) ** 2 + (s['y'] - o['y']) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, s['slotId'], s['card'])
        if best is None: print(name, o['id'], l, 'NO OBJECT'); continue
        crops = [b['crop'] for f in sim if t - 300 < f['t'] <= t + 0.1 for b in f['bodies'] if b['slot'] == best[1] and b['crop'] in idx]
        if not crops: print(name, o['id'], l, 'no crops'); continue
        p3 = P3[[idx[c] for c in crops]]; asked = ((p3[:, :52].max(1) < 0.3) | (p3.argmax(1) == 52))
        pf, a1, a2 = fbp(crops)
        ok3 = np.mean([CODES[int(p.argmax())] == l for p in p3]); okf = np.mean([CODES[int(p.argmax())] == l for p in pf])
        gate = np.mean([(p.max() >= .8) and CODES[int(p.argmax())] == l and (np.sort(p)[-1] - np.sort(p)[-2] >= .3) and q.argmax() == p.argmax() == r.argmax() and q.max() >= .8 and r.max() >= .8 for p, q, r in zip(pf, a1, a2)])
        wrongf = np.mean([(p.max() >= .8) and CODES[int(p.argmax())] != l for p in pf])
        print(f'{name} {o["id"]:2d} {l} rep={best[2]} views={len(crops):3d} asked={asked.mean():.2f} v3top1={ok3:.2f} fbtop1={okf:.2f} fbgate={gate:.2f} fbwrong>=.8={wrongf:.2f} v3med={top(np.median(p3,0))} fbmed={top(np.median(pf,0))}')
