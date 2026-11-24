#!/usr/bin/env python3
"""Add reviewed die candidates (objects_candidates.py items) to an added session's labels.

usage: objects_accept.py NAME items.json INDEX... (an index may end in R or Y to set the colour)
"""
import json, sys
import objects as ob

name, items = sys.argv[1], json.load(open(sys.argv[2]))
p = ob.OBJ_DIR / 'extra' / f'labels-{name}.json'; labels = json.loads(p.read_text())
for tok in sys.argv[3:]:
    i = int(tok.rstrip('RY')); key, x, y, cap = items[i]
    red = {'R': 1, 'Y': 0}.get(tok[-1], 1 if cap[0] == 'R' else 0)
    labels[key]['dice'].append([x, y, red])
p.write_text(json.dumps(labels)); print('added', len(sys.argv) - 3)
