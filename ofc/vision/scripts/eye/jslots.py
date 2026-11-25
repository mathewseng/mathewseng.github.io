"""jslots.py T0 T1 TAG SIM: hand-state slots in [T0, T1] of n1532 with >= 3 crops taken before any later card overlaps them;
writes ../TAG-slots.json and 3x full-resolution tiles ../look/TAG-N.jpg (numbered) for eye labelling."""
import json, math, sys, cv2, numpy as np
sys.path.insert(0, '.')
from src import frames, warp
T0, T1, TAG = float(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
sim = json.load(open(sys.argv[4])); slots = {}
for f in sim:
    if not T0 <= f['t'] <= T1: continue
    tab = {s['slotId']: s for s in f['table']}
    for b in f['bodies']:
        s = tab.get(b['slot'])
        if s is None: continue
        d = slots.setdefault(b['slot'], dict(first=s['placedSeconds'], views=[]))
        d.update(x=s['x'], y=s['y'], h=s['height']); d['views'].append((f['t'], b['crop']))
for i, a in slots.items():
    cov = min([b['first'] for j, b in slots.items() if j != i and b['first'] > a['first'] + 0.3
               and math.hypot(a['x'] - b['x'], a['y'] - b['y']) < 0.9 * (a['h'] + b['h']) / 2] or [1e9])
    a['clean'] = [c for t, c in a['views'] if t < cov]
good = sorted([a for a in slots.values() if len(a['clean']) >= 3], key=lambda a: a['first'])
rows = [json.loads(l) for l in open('../scan/n1532/state.jsonl')]
bydet = {d['crop']: (r['t'], d) for r in rows for d in r['dets'] if 'crop' in d}
need = {}
for k, a in enumerate(good):
    a['k'] = k; t, d = bydet[a['clean'][len(a['clean']) // 2]]; need.setdefault(round(t, 2), []).append((k, d))
tiles = {}; ts = sorted(need)
for t, fr in frames('n1532', ts[0] - 0.1, ts[-1] + 0.1, keyonly=True):
    items = need.get(round(t, 2))
    if not items: continue
    im = fr.to_ndarray(format='bgr24')
    for k, d in items:
        w = cv2.resize(warp(im, d['x'], d['y'], d['w'], d['h'], d['deg'], 3.2, 1.2), (180, 270), interpolation=cv2.INTER_CUBIC)
        lab = np.zeros((22, 180, 3), np.uint8); cv2.putText(lab, str(k), (3, 17), 0, 0.6, (0, 255, 255), 2)
        tiles[k] = np.pad(np.vstack([lab, w]), ((2, 2), (2, 2), (0, 0)))
json.dump([dict(k=a['k'], first=a['first'], clean=a['clean'], x=a['x'], y=a['y']) for a in good], open(f'../{TAG}-slots.json', 'w'))
ks = sorted(tiles); per = 24
for s in range(0, len(ks), per):
    ch = [tiles[k] for k in ks[s:s + per]]; ch += [np.zeros_like(ch[0])] * ((-len(ch)) % 8)
    cv2.imwrite(f'../look/{TAG}-{s // per}.jpg', np.vstack([np.hstack(ch[r:r + 8]) for r in range(0, len(ch), 8)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(good), 'slots', sum(len(a['clean']) for a in good), 'clean crops', (len(ks) + per - 1) // per, 'sheets')
