"""hidfeat.py TAG: every hidden report (table entry not detected, with a card) in r/sim-TAG: footprint colour shares on the 4x thumb
(white = card face, skin, felt), and whether it is a stale unit report (stale18.json) or needed at a truth frame."""
import sys, json, math, glob, os, re, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from ofc_card_vision import footprint
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'); tag = sys.argv[1]
S = json.load(open('stale18.json'))
def shares(fp):
    b, g, r = fp[..., 0].astype(int), fp[..., 1].astype(int), fp[..., 2].astype(int); mx = np.maximum(np.maximum(b, g), r); mn = np.minimum(np.minimum(b, g), r)
    white = (mn >= 140) & (mx - mn <= 45)
    felt = (b > 120) & (b - r > 60) & (b - g > 40)
    skin = (r > b + 25) & (r > g) & (r >= 90) & ~white
    return float(white.mean()), float(skin.mean()), float(felt.mean())
need = {}
for T in ('fresh-truth', 'eye-truth'):
    for lf in sorted(glob.glob(f'{W}/eval/{T}/labels/*.txt')):
        name = os.path.basename(lf)[:-4]; obj = json.load(open(f'{W}/eval/{T}/objects/{name}.json'))
        lab = {int(m[1]): m[2] for line in open(lf) for m in [re.match(r'(\d+) (\S+)', line)] if m}
        for o in obj['objects']:
            l = lab.get(o['id'], '?')
            if re.fullmatch(r'[SHCD][A2-9TJQK]', l): need.setdefault((name[:5], obj['t']), []).append((l, o.get('bx') or o['x'], o.get('by') or o['y']))
out = []
for s in ['n1501', 'n1532', 's1836', 's0023']:
    F = json.load(open(f'r/sim-{tag}-{s}.json')); tf = {}
    for (ss, t), v in need.items():
        if ss == s: tf[min(F, key=lambda f: abs(f['t'] - t))['t']] = v
    for f in F:
        hid = [e for e in f['table'] if not e['detected'] and e['card']]
        if not hid: continue
        th = cv2.imread(f"scan/{s}/thumbs/{f['t']:08.3f}.png")
        if th is None: continue
        for e in hid:
            sl = dict(x=e['x'], y=e['y'], width=e['width'], height=e['height'], angle=e['angleDegrees'])
            w, k, fe = shares(footprint(th, sl))
            st = any(u['sess'] == s and u['name'] == e['card'] and u['t0'] - 0.01 <= f['t'] <= u['t1'] + 0.01 and math.hypot(u['x'] - e['x'], u['y'] - e['y']) < 25 for u in S)
            nd = f['t'] in tf and any(l == e['card'] and math.hypot(x - e['x'], y - e['y']) <= 35 for l, x, y in tf[f['t']])
            out.append(dict(s=s, t=f['t'], card=e['card'], slot=e['slotId'], x=e['x'], y=e['y'], white=round(w, 2), skin=round(k, 2), felt=round(fe, 2), stale=st, need=nd))
json.dump(out, open(f'hid-{tag}.json', 'w'))
import collections
print(len(out), 'hidden reports;', sum(o['stale'] for o in out), 'stale;', sum(o['need'] for o in out), 'needed')
for k in ('stale', 'need'):
    xs = [o for o in out if o[k]]
    print(k, 'white', sorted(o['white'] for o in xs)); print(k, 'skin', sorted(o['skin'] for o in xs)[-15:])
