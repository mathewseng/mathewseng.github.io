#!/usr/bin/env python3
"""Time an unseen final bear-off: just after the last frame showing the winner's remaining checkers.

usage: fix_final.py <analysis-dir> <obs-dir> <game...>
"""
import json, sys
from pathlib import Path
an, obs = Path(sys.argv[1]), Path(sys.argv[2])
rows = []
for p in sorted(obs.glob('clip-*.json')): rows += json.loads(p.read_text())
for g in map(int, sys.argv[3:]):
    p = an / f'game-{g:02d}.json'; A = json.loads(p.read_text())
    t = A['turns'][-1]
    if t.get('inferred') != 'final-bear-off': print(g, 'no inferred final'); continue
    sign = 1 if t['player'] == 'white' else -1
    pts = [i for i, v in enumerate(t['before']['points']) if v * sign > 0]
    prev = A['turns'][-2]['resultFrame']
    seen = [r['f'] for r in rows if prev <= r['f'] <= t['resultFrame'] and all(r['conf'][i] >= .9 and r['pos'][i] * sign > 0 for i in pts)]
    if not seen: print(g, 'not seen'); continue
    f = max(seen) + 25
    print(g, 'final bear-off', t['resultFrame'], '->', f)
    t['resultFrame'] = f; t['rollFrame'] = None
    if A.get('result') and A['result']['reason'] in ('bear-off', 'gammon'): A['result']['frame'] = f
    p.write_text(json.dumps(A, indent=1))
