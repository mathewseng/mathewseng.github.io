"""slotcorner.py SIM MODEL T0 T1 [OUT]: every slot in the window never reported named: corner-reader stats over its crops
(mean of the 53-vectors over views, agreement of view tops), the label if a training slot."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import sys, json, cv2, numpy as np, onnxruntime as ort
from collections import defaultdict, Counter
from ofc_card_vision import corner_patches, CODES
sim = json.load(open(sys.argv[1])); m = ort.InferenceSession(sys.argv[2], providers=['CPUExecutionProvider']); t0, t1 = float(sys.argv[3]), float(sys.argv[4])
lab = {}
for s in json.load(open(REPO + '/labels/n1532-jumbo-slots.json'))['slots']:
    for c in s['crops']: lab[c] = s['label']
crops = defaultdict(list); named = set(); pos = {}; slotlab = defaultdict(Counter)
for f in sim:
    if not t0 <= f['t'] <= t1: continue
    for b in f['bodies']:
        if b['hand']: named.add(b['slot'])
        if b['crop']: crops[b['slot']].append((f['t'], b['crop'])); pos[b['slot']] = (round(b['x']), round(b['y']))
        if b['crop'] in lab: slotlab[b['slot']][lab[b['crop']]] += 1
    for s in f['table']:
        if s['card']: named.add(s['slotId'])
out = []
for sl, cs in crops.items():
    if sl in named or len(cs) < 3: continue
    ims = [cv2.imread('../scan/n1532/crops/' + c) for _, c in cs]
    x = np.stack([q for im in ims for q in corner_patches(im)]).astype(np.float32) / 255
    pc = np.exp(m.run(None, {'images': np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]).reshape(len(ims), 4, 53)
    v = np.concatenate([pc[:, :, :52].max(1), pc[:, :, 52:].min(1)], 1)[-60:]
    mm = v.mean(0); o = np.argsort(-mm); top = int(o[0])
    agree = float(np.mean(v.argmax(1) == top))
    out.append(dict(slot=sl, t=cs[0][0], pos=pos[sl], n=len(v), top=(CODES + ['none'])[top], p=round(float(mm[top]), 3), margin=round(float(mm[top] - mm[o[1]]), 3), agree=round(agree, 2), label=dict(slotlab.get(sl, {}))))
out.sort(key=lambda r: -r['p'])
for r in out:
    if r['top'] != 'none' and r['p'] >= 0.4: print(r)
if len(sys.argv) > 5: json.dump(out, open(sys.argv[5], 'w'))
