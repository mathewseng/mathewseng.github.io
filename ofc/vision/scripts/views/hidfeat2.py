"""hidfeat2.py TAG: add to hid-TAG.json: cov = slot centre inside a detected box now (conf >= 0.1, shrink .8: what keeps a slot alive),
still = share of the footprint unchanged (<= 25) since the slot's last boxed keyframe, age = seconds since last boxed."""
import sys, os, json, math, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from ofc_card_vision import footprint, card_quad
tag = sys.argv[1]; H = json.load(open(f'hid-{tag}.json'))
def inside(px, py, d, shrink=0.8):
    a = math.radians(d['deg']); dx, dy = px - d['x'], py - d['y']
    u = dx * math.cos(a) + dy * math.sin(a); v = -dx * math.sin(a) + dy * math.cos(a)
    return abs(u) <= d['w'] / 2 * shrink and abs(v) <= d['h'] / 2 * shrink
for s in ['n1501', 'n1532', 's1836', 's0023']:
    F = json.load(open(f'r/sim-{tag}-{s}.json')); dets = {}
    for line in open(f'scan/{s}/state.jsonl'):
        row = json.loads(line); dets[row['t']] = row['dets']
    lastbox = {}; refs = {}
    idx = {f['t']: i for i, f in enumerate(F)}
    hs = [h for h in H if h['s'] == s]; byt = {}
    for h in hs: byt.setdefault(h['t'], []).append(h)
    thumbs = {}
    def th(t):
        if t not in thumbs: thumbs.clear(); thumbs[t] = cv2.imread(f"scan/{s}/thumbs/{t:08.3f}.png")
        return thumbs[t]
    for f in F:
        for b in f['bodies']: lastbox[b['slot']] = f['t']
        for h in byt.get(f['t'], []):
            h['cov'] = any(inside(h['x'], h['y'], d) for d in dets[f['t']] if d['conf'] >= 0.1)
            lb = lastbox.get(h['slot']); h['age'] = round(f['t'] - lb, 2) if lb is not None else None
            sl = dict(x=h['x'], y=h['y'], width=None, height=None, angle=None)
            e = next(e for e in f['table'] if e['slotId'] == h['slot'])
            sl = dict(x=e['x'], y=e['y'], width=e['width'], height=e['height'], angle=e['angleDegrees'])
            if lb is not None:
                r0 = cv2.imread(f"scan/{s}/thumbs/{lb:08.3f}.png"); r1 = th(f['t'])
                h['still'] = round(float(np.mean(np.abs(footprint(r1, sl) - footprint(r0, sl)).max(2) <= 25)), 2)
json.dump(H, open(f'hid-{tag}.json', 'w'))
for k in ('stale', 'need'):
    xs = [o for o in H if o[k]]
    print(k, 'cov', sum(o['cov'] for o in xs), '/', len(xs), 'still>=.6', sum((o.get('still') or 0) >= 0.6 for o in xs), 'cov|still', sum(o['cov'] or (o.get('still') or 0) >= 0.6 for o in xs))
    print('   ', sorted((o['cov'], o.get('still'), o['age'], o['white'], o['skin']) for o in xs)[:20])
o = [h for h in H if not h['stale'] and not h['need']]
print('other', len(o), 'cov|still', sum(h['cov'] or (h.get('still') or 0) >= 0.6 for h in o))
