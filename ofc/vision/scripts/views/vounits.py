"""vounits.py SIMPREFIX OUT.json: single-view report units. A body reported with src 'view' whose slot never holds that name in table()
(the slot's own name) over the session. Units = (slot, name), keyframes within 8 s. cls: near = another slot within 40 px holds the name
within 10 s (holder = that report), elsewhere = a slot holds it within 60 s (the nearest in time), none = no slot holds it."""
import sys, json, math
pre, out = sys.argv[1], sys.argv[2]; U = []
for s in ['n1501', 'n1532', 's1836', 's0023']:
    F = json.load(open(f'{pre}-{s}.json'))
    held = {}
    for f in F:
        for e in f['table']:
            if e['card']: held.setdefault(e['slotId'], set()).add(e['card'])
    units = {}
    for f in F:
        tab = f['table']
        for b in f['bodies']:
            if b['src'] != 'view' or b['hand'] in held.get(b['slot'], ()): continue
            k = (b['slot'], b['hand']); u = units.get(k)
            if u is None or f['t'] - u['t1'] > 8:
                if u: U.append(u)
                u = units[k] = dict(sess=s, slot=b['slot'], name=b['hand'], t0=f['t'], t1=f['t'], x=b['x'], y=b['y'], n=0, crops=[], ts=[], cls='none')
            u['t1'] = f['t']; u['n'] += 1; u['crops'].append(b['crop']); u['ts'].append(f['t'])
    U += list(units.values())
    # cls: near = another slot within 40 px holds the name within 10 s of the unit; elsewhere = some slot holds it within 60 s
    hold = [(f['t'], e['card'], e['x'], e['y'], e['slotId']) for f in F for e in f['table'] if e['card']]
    for u in U:
        if u['sess'] != s: continue
        for t, c, x, y, sid in hold:
            if c != u['name'] or sid == u['slot']: continue
            if u['t0'] - 10 <= t <= u['t1'] + 10 and math.hypot(x - u['x'], y - u['y']) < 40:
                u['cls'] = 'near'; u['holder'] = dict(t=t, x=x, y=y, slot=sid); break
            if u['t0'] - 60 <= t <= u['t1'] + 60 and (u.get('holder') is None or abs(t - u['t0']) < abs(u['holder']['t'] - u['t0'])):
                u['cls'] = 'elsewhere'; u['holder'] = dict(t=t, x=x, y=y, slot=sid)
U = [u for i, u in enumerate(U) if u not in U[:i]]
U.sort(key=lambda u: (u['sess'], u['t0']))
json.dump(U, open(out, 'w'))
import collections
print(len(U), collections.Counter(u['cls'] for u in U), collections.Counter(u['sess'] for u in U), sum(u['n'] for u in U), 'reports')
