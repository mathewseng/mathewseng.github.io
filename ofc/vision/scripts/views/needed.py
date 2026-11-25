"""needed.py TAG: truth cards (fresh + eye) whose only report within 35 px at the truth frame is a single-view report (src view).
Prints them with the body's crop features (hand cover, sharpness)."""
import sys, json, re, glob, os, math, cv2
from cf import hand_cover, sharp
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); tag = sys.argv[1]; out = []
for T in ('fresh-truth', 'eye-truth'):
    sims = {}
    for lf in sorted(glob.glob(f'{W}/eval/{T}/labels/*.txt')):
        name = os.path.basename(lf)[:-4]; s = name[:5]
        if s not in sims: sims[s] = json.load(open(f'r/sim-{tag}-{s}.json'))
        obj = json.load(open(f'{W}/eval/{T}/objects/{name}.json')); fr = min(sims[s], key=lambda f: abs(f['t'] - obj['t']))
        lab = {int(m[1]): m[2] for line in open(lf) for m in [re.match(r'(\d+) (\S+)', line)] if m}
        for o in obj['objects']:
            l = lab.get(o['id'], '?')
            if not re.fullmatch(r'[SHCD][A2-9TJQK]', l): continue
            x, y = (o.get('bx') or o['x']), (o.get('by') or o['y'])
            reps = [(b, 'view' if b['src'] == 'view' else 'other') for b in fr['bodies'] if b['hand'] == l and math.hypot(b['x'] - x, b['y'] - y) <= 35]
            reps += [(e, 'other') for e in fr['table'] if not e['detected'] and e['card'] == l and math.hypot(e['x'] - x, e['y'] - y) <= 35]
            if reps and all(k == 'view' for _, k in reps):
                b = reps[0][0]; c = cv2.imread(f"scan/{s}/crops/{b['crop']}")
                out.append(dict(frame=name, t=fr['t'], name=l, x=b['x'], y=b['y'], slot=b['slot'], crop=b['crop'], hc=round(hand_cover(c), 3), sh=round(sharp(c))))
for r in out: print(r)
json.dump(out, open(f'needed-{tag}.json', 'w'))
