"""nscore.py DIR TAG [--fresh] [--v]: detector-agnostic hand-end score. Per truth frame: each legible truth card counts named when a report
(boxed hand name or hidden table card) of its name lies within 35 px of its object; a report of a truth name farther away = FAR (wrong
object), a report of a name with no legible truth object = UNT (missed card or wrong: eye verdicts in verdicts.json key 'frame name x y')."""
import sys, json, re, glob, os, math
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
d, tag = sys.argv[1], sys.argv[2]; fresh = '--fresh' in sys.argv; v = '--v' in sys.argv
T = W + ('/eval/fresh-truth' if fresh else '/eval/eye-truth')
V = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'verdicts.json'))) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'verdicts.json')) else {}
tot = {}; sims = {}
for lf in sorted(glob.glob(f'{T}/labels/*.txt')):
    name = os.path.basename(lf)[:-4]; s = name[:5]
    p = f'{d}/sim-{tag}-{s}.json'
    if not os.path.exists(p): continue
    if s not in sims: sims[s] = json.load(open(p))
    obj = json.load(open(f'{T}/objects/{name}.json')); fr = min(sims[s], key=lambda f: abs(f['t'] - obj['t']))
    lab = {}
    for line in open(lf):
        m = re.match(r'(\d+) (\S+)', line)
        if m: lab[int(m[1])] = m[2]
    truth = {}
    for o in obj['objects']:
        l = lab.get(o['id'], '?')
        if re.fullmatch(r'[SHCD][A2-9TJQK]', l): truth.setdefault(l, []).append(((o.get('bx') or o['x']), (o.get('by') or o['y'])))
    reps = [(b['hand'], b['x'], b['y']) for b in fr['bodies'] if b['hand']] + [(e['card'], e['x'], e['y']) for e in fr['table'] if not e['detected'] and e['card']]
    c = tot.setdefault(s, dict(legible=0, named=0, far=0, unt=0, unt_wrong=0, unt_unchecked=0))
    c['legible'] += len(truth)
    c.setdefault('frames', {}); c['frames'][name] = [0, len(truth)]
    for nm, pts in truth.items():
        if any(n == nm and min(math.hypot(x - a, y - b) for a, b in pts) <= 35 for n, x, y in reps): c['named'] += 1; c['frames'][name][0] += 1
        elif v: print('  unnamed', name, nm, pts[0])
    seen = set()
    for n, x, y in reps:
        if (n, round(x), round(y)) in seen: continue
        seen.add((n, round(x), round(y)))
        if n in truth:
            if min(math.hypot(x - a, y - b) for a, b in truth[n]) > 35: c['far'] += 1; print('FAR', name, n, round(x), round(y), 'truth at', truth[n])
        else:
            k = f'{name} {n}'; vd = next((vv for kk, vv in V.items() if kk.startswith(k + ' ') and math.hypot(float(kk.split()[2]) - x, float(kk.split()[3]) - y) < 15), None)
            c['unt'] += 1
            if vd == 'wrong': c['unt_wrong'] += 1
            if vd is None: c['unt_unchecked'] += 1
            print('UNT', name, n, round(x), round(y), vd or 'UNCHECKED')
for s, c in tot.items(): print(s, c)
print('TOTAL', {k: sum(c[k] for c in tot.values()) for k in next(iter(tot.values())) if k != 'frames'})
