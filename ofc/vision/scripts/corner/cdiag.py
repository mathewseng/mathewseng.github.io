"""cdiag.py SIM CORNER NAME...: per unnamed legible truth object, its slot's corner pair votes, corner mean top and jumbo-reader median top."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import sys, json, re, cv2, numpy as np, onnxruntime as ort
from collections import Counter
R = REPO
from ofc_card_vision import corner_patches, CODES, OfcCardReader
T = R + '/eval/eye-truth'; sim = json.load(open(sys.argv[1])); cm = ort.InferenceSession(sys.argv[2], providers=['CPUExecutionProvider'])
jm = ort.InferenceSession(R + '/models/card-identity-jumbo.onnx', providers=['CPUExecutionProvider'])
C = CODES + ['none']
for name in sys.argv[3:]:
    d = json.load(open(f'{T}/objects/{name}.json')); t = d['t']
    lab = {int(m[1]): m[2] for m in (re.match(r'(\d+) (\S+)', l) for l in open(f'{T}/labels/{name}.txt')) if m}
    fr = min(sim, key=lambda f: abs(f['t'] - t))
    for o in d['objects']:
        l = lab.get(o['id'], '?')
        if not re.fullmatch(r'[SHCD][A2-9TJQK]', l) or o['kind'] == 'weak': continue
        best = None
        for b in fr['bodies']:
            dd = ((b['x'] - (o.get('bx') or o['x'])) ** 2 + (b['y'] - (o.get('by') or o['y'])) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, b['slot'], b['hand'])
        for s in fr['table']:
            if s['detected']: continue
            dd = ((s['x'] - o['x']) ** 2 + (s['y'] - o['y']) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, s['slotId'], s['card'])
        if best is None or best[2]: continue
        crops = [b['crop'] for f in sim if t - 300 < f['t'] <= t + 0.1 for b in f['bodies'] if b['slot'] == best[1] and b['crop']][-20:]
        if not crops: print(name, o['id'], l, 'no crops'); continue
        ims = [cv2.imread('../scan/n1532/crops/' + c) for c in crops]
        x = np.stack([q for im in ims for q in corner_patches(im)]).astype(np.float32) / 255
        pc = np.exp(cm.run(None, {'images': np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]).reshape(len(ims), 4, 53)
        pairs = Counter(OfcCardReader.corner_pair(q) for q in pc); v = np.concatenate([pc[:, :, :52].max(1), pc[:, :, 52:].min(1)], 1).mean(0)
        xf = np.stack(ims).astype(np.float32) / 255; xf = np.concatenate([xf, xf[:, ::-1, ::-1]])
        pj = np.exp(jm.run(None, {jm.get_inputs()[0].name: np.ascontiguousarray(xf.transpose(0, 3, 1, 2))})[0]); n = len(ims); pj = np.median((pj[:n] + pj[n:]) / 2, 0)
        print(f"{name} {o['id']:2d} {l} views={n} pairs={dict(pairs)} cornerMean={C[int(v.argmax())]}:{v.max():.2f} jumboMed={C[int(pj.argmax())]}:{pj.max():.2f}")
