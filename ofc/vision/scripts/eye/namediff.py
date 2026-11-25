"""namediff.py OLD.json NEW.json [OUT.json]: every view whose reported name differs between two sims of one scan
(boxes by index, hidden slots by position within 6 px), grouped by the new run's slot. Prints one line per slot."""
import sys, json
from collections import defaultdict, Counter
old, new = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
g = defaultdict(lambda: dict(views=0, pairs=Counter(), t0=1e9, t1=0, x=0, y=0, crop=None, kind=set()))
for fo, fn in zip(old, new):
    assert abs(fo['t'] - fn['t']) < 1e-3
    for bo, bn in zip(fo['bodies'], fn['bodies']):
        if bo['hand'] != bn['hand']:
            d = g[('s', bn['slot'])]; d['views'] += 1; d['pairs'][(bo['hand'], bn['hand'])] += 1
            d['t0'] = min(d['t0'], fn['t']); d['t1'] = max(d['t1'], fn['t']); d['x'], d['y'] = bn['x'], bn['y']; d['kind'].add('box')
            if bn['hand'] and (d['crop'] is None): d['crop'] = bn['crop']
    ho = [s for s in fo['table'] if not s['detected']]; hn = [s for s in fn['table'] if not s['detected']]
    for s in hn:
        m = min(ho, key=lambda o: (o['x'] - s['x']) ** 2 + (o['y'] - s['y']) ** 2, default=None)
        on = m['card'] if m and ((m['x'] - s['x']) ** 2 + (m['y'] - s['y']) ** 2) ** .5 < 6 else None
        if on != s['card']:
            d = g[('s', s['slotId'])]; d['views'] += 1; d['pairs'][(on, s['card'])] += 1
            d['t0'] = min(d['t0'], fn['t']); d['t1'] = max(d['t1'], fn['t']); d['x'], d['y'] = s['x'], s['y']; d['kind'].add('hidden')
    for s in ho:  # names lost on hidden slots
        m = min(hn, key=lambda o: (o['x'] - s['x']) ** 2 + (o['y'] - s['y']) ** 2, default=None)
        if s['card'] and not (m and ((m['x'] - s['x']) ** 2 + (m['y'] - s['y']) ** 2) ** .5 < 6):
            d = g[('lost', s['slotId'])]; d['views'] += 1; d['pairs'][(s['card'], None)] += 1
            d['t0'] = min(d['t0'], fn['t']); d['t1'] = max(d['t1'], fn['t']); d['x'], d['y'] = s['x'], s['y']; d['kind'].add('hidden-lost')
out = []
for k, d in sorted(g.items(), key=lambda kv: kv[1]['t0']):
    pr = ', '.join(f'{a}->{b} x{n}' for (a, b), n in d['pairs'].most_common())
    print(f"{k[0]}{k[1]} t {d['t0']:.1f}-{d['t1']:.1f} ({d['x']:.0f},{d['y']:.0f}) {'/'.join(sorted(d['kind']))} views {d['views']}: {pr}")
    out.append(dict(slot=k[1], t0=d['t0'], t1=d['t1'], x=d['x'], y=d['y'], crop=d['crop'], pairs=[[a, b, n] for (a, b), n in d['pairs'].items()]))
if len(sys.argv) > 3: json.dump(out, open(sys.argv[3], 'w'))
print(len(out), 'slots differ')
