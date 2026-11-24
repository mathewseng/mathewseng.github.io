"""Apply a review file (tile ranges -> label) for a sheet set; tiles in 'reviewed' ranges keep the sheet label."""
import json, os, re, sys
from pseudo import track_means, CODES
sheetdir, review = sys.argv[1], sys.argv[2]
tag = sys.argv[3] if len(sys.argv) > 3 else 'v1'
mp = {int(k): v for k, v in json.load(open(sheetdir + '/map.json')).items()}
def rng(s):
    a, _, b = s.partition('-'); return range(int(a), int(b or a) + 1)
reviewed, fix = set(), {}
for line in open(review):
    line = line.split('#')[0].strip()
    if not line: continue
    if line.startswith('reviewed'):
        for part in line.split()[1:]: reviewed.update(rng(part))
        continue
    r, lab = line.split(); assert lab in CODES or lab in ('?',), line
    for n in rng(r): fix[n] = lab
pred = {}
for s in {v.rsplit('-', 1)[0] for v in mp.values()}:
    tr, P, M = track_means(s, tag)
    for t, m in zip(tr, M): pred[t['id']] = CODES[int(m.argmax())]
by = {}
for n, tid in mp.items():
    if n not in reviewed and n not in fix: continue
    by.setdefault(tid.rsplit('-', 1)[0], {})[tid] = fix.get(n, pred[tid])
for s, labs in by.items():
    path = f'../labels/{s}.json'; cur = json.load(open(path)) if os.path.exists(path) else {}
    cur.update(labs); json.dump(cur, open(path, 'w'), indent=0); print(s, len(labs), 'labels ->', len(cur))
