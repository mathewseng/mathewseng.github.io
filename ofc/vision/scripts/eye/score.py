"""score.py SIM_s1836 SIM_s0023 [--detail]: score sim.py output against the eye-checked hand-end truth
(eval/eye-truth: labels/*.txt written by eye from 4x crops, objects/*.json = the objects at each truth keyframe).
Objects = hand-state slots (boxed or hidden) + weak boxes at the truth keyframe."""
import sys, json, re, glob, os
from collections import Counter
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eval', 'eye-truth')
sims = {'s1836': json.load(open(sys.argv[1])), 's0023': json.load(open(sys.argv[2]))}
detail = '--detail' in sys.argv
tot = {}
for lf in sorted(glob.glob(f'{T}/labels/*.txt')):
    name = os.path.basename(lf)[:-4]; sess = name[:5]
    d = json.load(open(f'{T}/objects/{name}.json')); t = d['t']; sim = sims[sess]
    fr = min(sim, key=lambda f: abs(f['t'] - t))
    # objects are fixed by pose from the truth file; find the runtime's report at each object's pose
    lab = {}; missed = ''
    for line in open(lf):
        if line.startswith('missed:'): missed = line[7:].strip()
        m = re.match(r'(\d+) (\S+)', line)
        if m: lab[int(m[1])] = m[2]
    def report(o):
        # boxed body at this pose (same slot id in baseline) or nearest body/hidden slot within 6 px
        best = None
        for b in fr['bodies']:
            dd = ((b['x'] - (o.get('bx') or o['x'])) ** 2 + (b['y'] - (o.get('by') or o['y'])) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, 'box', b['hand'])
        for s in fr['table']:
            if s['detected']: continue
            dd = ((s['x'] - o['x']) ** 2 + (s['y'] - o['y']) ** 2) ** .5
            if dd < 6 and (best is None or dd < best[0]): best = (dd, 'hidden', s['card'])
        return best
    c = tot.setdefault(sess, Counter())
    for o in d['objects']:
        l = lab.get(o['id'], '?'); r = report(o)
        name_ = r[2] if r else None
        if o['kind'] == 'weak': name_ = None
        if re.fullmatch(r'[SHCD][A2-9TJQK]', l):
            c['legible'] += 1
            if r is None and o['kind'] != 'weak': c['legible_lost'] += 1
            if name_ == l: c['named_right'] += 1
            elif name_: c['named_WRONG'] += 1; print('WRONG', name, o['id'], l, '->', name_)
            else:
                c['unnamed_legible'] += 1
                if detail: print('unnamed', name, o['id'], l, o['kind'])
        elif l.startswith('dup'):
            c['dup_objects'] += 1
            if name_: c['dup_named'] += 1
        elif l.startswith('X'):
            c['false_objects'] += 1
            if r is not None and o['kind'] != 'weak': c['false_still_present'] += 1; print('FALSE-OBJECT', name, o['id'], l)
            if name_: c['false_named'] += 1; print('FALSE-NAMED', name, o['id'], name_)
        elif l == 'C?':
            c['covered_unverified'] += 1
            if name_: c['covered_unverified_named'] += 1
        else:
            c['illegible'] += 1
            if name_: c['illegible_named'] += 1; print('named-illegible', name, o['id'], name_)
    m = re.match(r'(\d+)', missed)
    if m: c['missed_cards'] += int(m[1])
    if missed.startswith('H4') or missed.startswith('S2') : c['missed_cards'] += missed.count(';') + 1
    if missed.startswith('?'): c['frames_miss_uncounted'] += 1
for s, c in tot.items():
    print(s, dict(c))
