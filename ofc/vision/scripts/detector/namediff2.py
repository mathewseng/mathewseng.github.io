"""namediff2.py OLD.json NEW.json [OUT.json] [R]: name changes between sims of DIFFERENT scans (detectors). Per keyframe every reported
name with its position (boxed body hand name, or hidden slot card). A new report with no old report of the same name within R px (15)
is 'added'; an old one with no new one within R is 'lost'. Grouped into units by (kind, name, spot within 20 px), time-contiguous
within 8 s. Prints one line per unit."""
import sys, json, math
from collections import defaultdict
old, new = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
R = float(sys.argv[4]) if len(sys.argv) > 4 else 15
def reps(f):
    out = [(b['hand'], b['x'], b['y'], 'box') for b in f['bodies'] if b['hand']]
    out += [(s['card'], s['x'], s['y'], 'hid') for s in f['table'] if not s['detected'] and s['card']]
    return out
units = []
open_ = {}
def add(kind, name, x, y, t, where, alt):
    key = None
    for k, u in open_.items():
        if u['kind'] == kind and u['name'] == name and math.hypot(u['x'] - x, u['y'] - y) < 20 and t - u['t1'] < 8: key = k; break
    if key is None:
        u = dict(kind=kind, name=name, x=x, y=y, t0=t, t1=t, n=0, where=set(), alt=set()); key = len(units); units.append(u); open_[key] = u
    u = open_[key]; u['t1'] = t; u['n'] += 1; u['where'].add(where); u['x'], u['y'] = x, y
    if alt: u['alt'].add(alt)
oi = 0
for fn in new:
    while oi < len(old) - 1 and old[oi]['t'] < fn['t'] - 1e-3: oi += 1
    fo = old[oi]
    if abs(fo['t'] - fn['t']) > 0.01: continue
    ro, rn = reps(fo), reps(fn)
    for nm, x, y, w in rn:
        if not any(n2 == nm and math.hypot(x - x2, y - y2) < R for n2, x2, y2, _ in ro):
            near = [n2 for n2, x2, y2, _ in ro if math.hypot(x - x2, y - y2) < 8]
            add('added', nm, x, y, fn['t'], w, near[0] if near else None)
    for nm, x, y, w in ro:
        if not any(n2 == nm and math.hypot(x - x2, y - y2) < R for n2, x2, y2, _ in rn):
            near = [n2 for n2, x2, y2, _ in rn if math.hypot(x - x2, y - y2) < 8]
            add('lost', nm, x, y, fn['t'], w, near[0] if near else None)
for u in units: u['where'] = sorted(u['where']); u['alt'] = sorted(u['alt'])
for i, u in enumerate(units):
    print(f"{i} {u['kind']} {u['name']} t {u['t0']:.1f}-{u['t1']:.1f} ({u['x']:.0f},{u['y']:.0f}) n {u['n']} {'/'.join(u['where'])} alt {u['alt']}")
if len(sys.argv) > 3: json.dump(units, open(sys.argv[3], 'w'))
import collections
print(collections.Counter(u['kind'] for u in units), 'units;', sum(u['n'] for u in units if u['kind'] == 'added'), 'added reports')
