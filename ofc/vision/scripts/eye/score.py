"""score.py SIM... [--detail]: score sim.py output against the eye-checked hand-end truth
(eval/eye-truth: labels/*.txt written by eye from 4x crops, objects/*.json = the objects at each truth keyframe).
Each SIM file ends in -SESSION.json (sim-card-identity-s1836.json); truth frames of sessions with no SIM are skipped.
Objects = hand-state slots (boxed or hidden) + weak boxes at the truth keyframe."""
import sys, json, re, glob, os
from collections import Counter
T = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eval', 'eye-truth')
if '--truth' in sys.argv: T = sys.argv[sys.argv.index('--truth') + 1]  # another truth folder (labels/ + objects/)
sims = {re.search(r'-(\w+?)(-m)?\.json$', a)[1]: json.load(open(a)) for a in sys.argv[1:] if a.endswith('.json') and a != T}
detail = '--detail' in sys.argv
tot = {}
for lf in sorted(glob.glob(f'{T}/labels/*.txt')):
    name = os.path.basename(lf)[:-4]; sess = name[:5]
    if sess not in sims: continue
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
    # a card with several objects (dup:N) counts as named when any of its objects carries its name
    dupname = {}
    for o in d['objects']:
        l = lab.get(o['id'], '?')
        if l.startswith('dup:') and o['kind'] != 'weak' and report(o) and report(o)[2]:
            dupname.setdefault(int(l[4:].split()[0]), set()).add(report(o)[2])
    for o in d['objects']:
        l = lab.get(o['id'], '?'); r = report(o)
        name_ = r[2] if r else None
        if o['kind'] == 'weak': name_ = None
        if re.fullmatch(r'[SHCD][A2-9TJQK]', l):
            c['legible'] += 1
            if r is None and o['kind'] != 'weak': c['legible_lost'] += 1
            if name_ is None and l in dupname.get(o['id'], ()): name_ = l
            if name_ == l: c['named_right'] += 1
            elif name_: c['named_WRONG'] += 1; print('WRONG', name, o['id'], l, '->', name_)
            else:
                c['unnamed_legible'] += 1
                if detail: print('unnamed', name, o['id'], l, o['kind'])
        elif l.startswith('dup'):
            c['dup_objects'] += 1
            main = lab.get(int(l[4:].split()[0]), '?')
            if name_ and name_ != main: c['dup_named_other'] += 1; print('DUP-NAMED-OTHER', name, o['id'], l, main, '->', name_)
            elif name_: c['dup_named'] += 1
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
    # named objects the runtime has now that the truth file has no object for (a card in the `missed:` line, or new)
    pos = [((o.get('bx') or o['x']), (o.get('by') or o['y'])) for o in d['objects']] + [(o['x'], o['y']) for o in d['objects']]
    extra = [(b['x'], b['y'], b['hand']) for b in fr['bodies'] if b['hand']] + \
            [(s_['x'], s_['y'], s_['card']) for s_ in fr['table'] if not s_['detected'] and s_['card']]
    for x, y, nm in extra:
        if all(((x - a) ** 2 + (y - b) ** 2) ** .5 >= 6 for a, b in pos):
            c['extra_named'] += 1; print('EXTRA', name, nm, round(x), round(y), '| missed:', missed[:60])
    m = re.match(r'(\d+)', missed)
    if m: c['missed_cards'] += int(m[1])
    if missed.startswith('H4') or missed.startswith('S2') : c['missed_cards'] += missed.count(';') + 1
    if missed.startswith('?'): c['frames_miss_uncounted'] += 1
for s, c in tot.items():
    print(s, dict(c))
