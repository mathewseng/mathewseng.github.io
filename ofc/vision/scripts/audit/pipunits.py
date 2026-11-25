"""pipunits.py SIMPREFIX OUT: pip counts on every gate-pass crop (classic, number cards) per (sess, slot, name)."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import json, sys, cv2, numpy as np
from ofc_card_vision import pip_count
from collections import Counter, defaultdict
RK = {r: i + 2 for i, r in enumerate('23456789T')}
deckh=json.load(open(RT + '/labels/n1532-deck-hands.json'))['hands']
def jumbo(s,t): return s=='n1532' and any(h['deck']=='jumbo' and h['t'][0]<=t<h['t'][1] for h in deckh)
out = defaultdict(list)
for s in ['s1836', 's0023', 'n1501', 'n1532']:
    for fr in json.load(open(f'{sys.argv[1]}-{s}.json')):
        if jumbo(s, fr['t']): continue
        for b in fr['bodies']:
            if b['card'] and b['card'][1] in RK:
                out[f"{s}|{b['slot']}|{b['card']}"].append((fr['t'], pip_count(cv2.imread(f'scan/{s}/crops/{b["crop"]}'))))
json.dump(out, open(sys.argv[2], 'w')); print(len(out))
