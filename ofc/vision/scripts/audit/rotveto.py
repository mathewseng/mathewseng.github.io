"""rotveto.py ASPECT PMIN: per (sess, slot, name) classic gate passes with box aspect >= ASPECT whose 90-deg turn tops another card >= PMIN."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import json, sys, numpy as np
from collections import Counter, defaultdict
C=[s+r for s in 'SHCD' for r in 'A23456789TJQK']+['none']
A, PM = float(sys.argv[1]), float(sys.argv[2])
deckh=json.load(open(RT + '/labels/n1532-deck-hands.json'))['hands']
def jumbo(s,t): return s=='n1532' and any(h['deck']=='jumbo' and h['t'][0]<=t<h['t'][1] for h in deckh)
agg=defaultdict(lambda: dict(n=0,amb=0,veto=Counter(),t=[]))
for s in ['s1836','s0023','n1501','n1532']:
    rz=np.load(f'scan-rot/{s}-v3.npz'); R=(rz['p1']+rz['p2'])/2; idx={n:i for i,n in enumerate(rz['names'])}
    st={}
    for l in open(f'scan/{s}/state.jsonl'):
        for d in json.loads(l)['dets']:
            if d.get('crop'): st[d['crop']]=d
    for fr in json.load(open(f'sim-base-{s}.json')):
        if jumbo(s,fr['t']): continue
        for b in fr['bodies']:
            if not b['card']: continue
            d=st[b['crop']]; a=agg[(s,b['slot'],b['card'])]; a['n']+=1
            if d['w']/d['h'] < A: continue
            a['amb']+=1; r=R[idx[b['crop']]]; k=int(r.argmax())
            if k<52 and C[k]!=b['card'] and r[k]>=PM: a['veto'][C[k]]+=1; a['t'].append(fr['t'])
rows=[(k,a['n'],a['amb'],sum(a['veto'].values()),a['veto'].most_common(2),round(min(a['t']))) for k,a in agg.items() if a['veto']]
rows.sort(key=lambda r:-r[3])
for r in rows: print(r)
print('slots', len(rows), 'all-vetoed', sum(1 for r in rows if r[1]-r[3] < 2))
