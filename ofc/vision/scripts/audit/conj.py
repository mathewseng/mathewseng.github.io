"""conj.py ASPECT PROT: classic gate passes with box aspect >= ASPECT where the 90-deg turned crop tops another number card
(p >= PROT) and the pip count equals that card's rank. Per unit counts."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import json, sys, cv2, numpy as np
from ofc_card_vision import pip_count
from collections import Counter, defaultdict
C=[s+r for s in 'SHCD' for r in 'A23456789TJQK']+['none']; RK={r:i+2 for i,r in enumerate('23456789T')}
A, PR = float(sys.argv[1]), float(sys.argv[2])
deckh=json.load(open(RT + '/labels/n1532-deck-hands.json'))['hands']
def jumbo(s,t): return s=='n1532' and any(h['deck']=='jumbo' and h['t'][0]<=t<h['t'][1] for h in deckh)
agg=defaultdict(Counter)
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
            k=(s,b['slot'],b['card']); agg[k]['n']+=1
            d=st[b['crop']]
            if d['w']/d['h']<A: continue
            agg[k]['amb']+=1
            r=R[idx[b['crop']]]; j=int(r.argmax())
            if j>=52 or C[j]==b['card'] or r[j]<PR: continue
            agg[k]['rot']+=1
            if C[j][1] in RK:
                pc=pip_count(cv2.imread(f'scan/{s}/crops/{b["crop"]}'))
                if pc==RK[C[j][1]] and (b['card'][1] not in RK or pc!=RK[b['card'][1]]): agg[k]['veto']+=1; agg[k]['to_'+C[j]]+=1
for k,c in sorted(agg.items(), key=lambda kv:-kv[1]['veto']):
    if c['veto']: print(k, dict(c))
