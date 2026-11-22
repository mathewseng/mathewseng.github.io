#!/usr/bin/env python3
"""Copy roll and pickup times from newer dice evidence into analysed games (no re-scoring).

usage: refresh_timing.py <analysis-dir> <dice-evidence.json> <game...>
"""
import json, sys
from pathlib import Path
d, ev = Path(sys.argv[1]), json.load(open(sys.argv[2]))
for g in map(int, sys.argv[3:]):
    p = d / f'game-{g:02d}.json'; a = json.loads(p.read_text()); e = ev[g - 1]; n = 0
    for t in a['turns']:
        m = next((x for x in e if x['frame'] == t.get('resultFrame') and x['player'] == t['player']), None)
        if m:
            for k in ('rollFrame', 'pickupFrame'):
                if m.get(k) is not None and m.get(k) != t.get(k): t[k] = m[k]; n += 1
    p.write_text(json.dumps(a, indent=1)); print(g, 'updated', n)
