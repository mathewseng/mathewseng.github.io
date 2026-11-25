"""runs.py SIMPREFIX OUT.json : every named run (slot reports one name over consecutive keyframes) in sim-SIMPREFIX-SESS.json, with strata."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import json, sys, numpy as np
from collections import defaultdict
C = [s + r for s in 'SHCD' for r in 'A23456789TJQK'] + ['none']
pref, outp = sys.argv[1], sys.argv[2]
deckh = json.load(open(RT + '/labels/n1532-deck-hands.json'))['hands']
def deck(s, t):
    if s != 'n1532': return 'classic'
    for h in deckh:
        if h['t'][0] <= t < h['t'][1]: return h['deck']
    return 'classic'
CONF = {'7': '68', '6': '7', '8': '79', '9': '8T', 'T': '9', '2': '3', '3': '24', '4': '3'}
runs = []
for s in ['s1836', 's0023', 'n1501', 'n1532']:
    sim = json.load(open(f'{pref}-{s}.json'))
    pz = np.load(f'scan/{s}/probs-v3.npz'); P = (pz['p1'] + pz['p2']) / 2; idx = {n: i for i, n in enumerate(pz['names'])}
    cur = {}; slotcrops = defaultdict(list)
    for k, fr in enumerate(sim):
        t = fr['t']
        for b in fr['bodies']:
            if b['crop']: slotcrops[b['slot']].append((t, b['crop'], b['card']))
        seen = set()
        for e in fr['table']:
            sid, c = e['slotId'], e['card']
            if not c: continue
            seen.add(sid)
            r = cur.get(sid)
            if r and r['name'] == c and r['k1'] == k - 1:
                r['k1'] = k; r['t1'] = t; r['n'] += 1; r['geo'].append((e['width'], e['height'], e['angleDegrees'], e['x'], e['y'])); r['det'] += e['detected']
            else:
                if r: runs.append(r)
                cur[sid] = dict(sess=s, slot=sid, name=c, k0=k, k1=k, t0=t, t1=t, n=1, det=int(e['detected']), geo=[(e['width'], e['height'], e['angleDegrees'], e['x'], e['y'])])
        for sid in [x for x in cur if x not in seen and cur[x]['k1'] < k]:
            runs.append(cur.pop(sid))
    runs += cur.values()
    for r in runs:
        if r['sess'] != s or 'w' in r: continue
        g = np.array(r.pop('geo')); r['w'], r['h'], r['deg'], r['x'], r['y'] = [float(np.median(g[:, i])) for i in range(5)]
        ang = abs(r['deg']); asp = r['w'] / r['h']
        r['sideways'] = bool(ang > 45 or asp > 0.8)
        r['deck'] = deck(s, r['t0'])
        ci = C.index(r['name'])
        ps = [P[idx[cr], ci] for t, cr, cd in slotcrops[r['slot']] if r['t0'] - 30 <= t <= r['t1'] and cr in idx]
        r['pmed'] = float(np.median(ps)) if ps else None
        r['views'] = len(ps); r['gate'] = sum(1 for t, cr, cd in slotcrops[r['slot']] if cd == r['name'])
        r['confusable'] = r['name'][1] in CONF
json.dump(runs, open(outp, 'w'))
from collections import Counter
print(len(runs), Counter((r['sess'], r['sideways'], r['deck']) for r in runs))
