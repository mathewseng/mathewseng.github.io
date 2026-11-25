"""stripnames.py SIM T0 T1: slots named by the corner reader (src strip, or hidden table names no body had) in a window, with labels if known."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import sys, json
from collections import defaultdict, Counter
sim = json.load(open(sys.argv[1])); t0, t1 = float(sys.argv[2]), float(sys.argv[3])
lab = {}
for s in json.load(open(REPO + '/labels/n1532-jumbo-slots.json'))['slots']:
    for c in s['crops']: lab[c] = s['label']
c2s = {}; slotlab = defaultdict(Counter); names = defaultdict(Counter); first = {}; pos = {}
for f in sim:
    if not t0 <= f['t'] <= t1: continue
    for b in f['bodies']:
        if b['crop'] in lab: slotlab[b['slot']][lab[b['crop']]] += 1
        if b['src'] == 'strip': names[b['slot']][b['hand']] += 1; first.setdefault(b['slot'], f['t']); pos[b['slot']] = (round(b['x']), round(b['y']))
    for s in f['table']:
        if not s['detected'] and s['card'] and s['slotId'] in names: names[s['slotId']][s['card'] + '(hidden)'] += 1
for sl, c in sorted(names.items(), key=lambda kv: first[kv[0]]):
    print(sl, first[sl], pos[sl], dict(c), 'label', dict(slotlab.get(sl, {})) or '-')
print(len(names), 'slots')
