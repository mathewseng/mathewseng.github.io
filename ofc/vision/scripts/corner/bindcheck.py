"""bindcheck.py SIM CORNER.onnx NAME...: fan-strip slot binding check (measurement only, nothing is tuned on it).
For every legible truth object that is boxed at its truth frame and left unnamed, read the 4 corners of its box and mark
each corner `own` when its centre lies outside every live slot placed after this one (a later card lies on top there,
so that corner shows the later card's index). Prints the corner reads split into own / covered, and tallies whether the
own corners' best read is the truth card."""
import os, sys, re, json, math
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import cv2, numpy as np, onnxruntime as ort
from collections import Counter
from ofc_card_vision import corner_patches, CODES, card_quad, _inside
C = CODES + ['none']; T = REPO + '/eval/eye-truth'
sim = json.load(open(sys.argv[1])); cm = ort.InferenceSession(sys.argv[2], providers=['CPUExecutionProvider'])
scan = {}
tally = Counter()
for name in sys.argv[3:]:
    sess = name[:5]; d = json.load(open(f'{T}/objects/{name}.json')); t = d['t']
    if sess not in scan: scan[sess] = {round(json.loads(l)['t'], 2): json.loads(l) for l in open(f'../scan/{sess}/state.jsonl')}
    lab = {int(m[1]): m[2] for m in (re.match(r'(\d+) (\S+)', l) for l in open(f'{T}/labels/{name}.txt')) if m}
    fr = min(sim, key=lambda f: abs(f['t'] - t)); dets = [x for x in scan[sess][round(fr['t'], 2)]['dets'] if x['conf'] >= 0.25]
    placed = {s['slotId']: s for s in fr['table']}
    for o in d['objects']:
        l = lab.get(o['id'], '?')
        if not re.fullmatch(r'[SHCD][A2-9TJQK]', l): continue
        hit = [(i, b) for i, b in enumerate(fr['bodies']) if math.hypot(b['x'] - (o.get('bx') or o['x']), b['y'] - (o.get('by') or o['y'])) < 6]
        if not hit: continue
        i, b = hit[0]
        if b['hand']: continue
        det = dets[i]; me = placed.get(b['slot'])
        later = [s for s in fr['table'] if me and s['slotId'] != b['slot'] and s['placedSeconds'] > me['placedSeconds'] + 0.3]
        crop = cv2.imread(f"../scan/{sess}/crops/{b['crop']}")
        x = np.stack(corner_patches(crop)).astype(np.float32) / 255
        pc = np.exp(cm.run(None, {'images': np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0])
        # corner centres in frame coordinates: the crop spans the box scaled by 1.1 (cropMargin 0.1)
        q = card_quad(det['x'], det['y'], det['w'] * 1.1, det['h'] * 1.1, det['deg'])
        H = cv2.getPerspectiveTransform(np.float32([[0, 0], [64, 0], [64, 96], [0, 96]]), q)
        cs = cv2.perspectiveTransform(np.float32([[[18, 18]], [[46, 18]], [[46, 78]], [[18, 78]]]), H).reshape(-1, 2)
        own = [not any(_inside(cx, cy, dict(x=s['x'], y=s['y'], width=s['width'], height=s['height'], angleDegrees=s['angleDegrees']), 1.0)
                       for s in later) for cx, cy in cs]
        reads = [f"{C[int(p.argmax())]}:{p.max():.2f}" + ('' if ow else '(cov)') for p, ow in zip(pc, own)]
        op = [p for p, ow in zip(pc, own) if ow and p.argmax() < 52 and p.max() >= 0.5]
        best = C[int(max(op, key=lambda p: p.max()).argmax())] if op else None
        allbest = C[int(max(pc, key=lambda p: p[:52].max())[:52].argmax())]
        tally['objects'] += 1; tally['own_read'] += best is not None; tally['own_right'] += best == l
        tally['own_wrong'] += best is not None and best != l; tally['any_corner_right'] += allbest == l
        print(f"{name} #{o['id']:2d} {l}: own {sum(own)}/4 best-own={best} best-any={allbest} | {' '.join(reads)}")
print(dict(tally))
