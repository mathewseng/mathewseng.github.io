"""units.py TAG: namediff3 of shipped (ofc-vision7 sim-fin) vs r-add0.3/sim-TAG for all 4 sessions -> diff/TAG-SESS.json, with each
added unit classed 'shifted' (the shipped runtime lost the same name within 40 px, times within 3 s) or 'new'. Prints counts."""
import sys, json, math, subprocess, collections
tag = sys.argv[1]; tot = collections.Counter()
for s in ['n1501', 'n1532', 's1836', 's0023']:
    out = f'diff/{tag}-{s}.json'
    subprocess.run(['python3', 'tools/namediff3.py', f'/private/tmp/claude-501/ofc-vision7/sim-fin-{s}.json', f'r-add0.3/sim-{tag}-{s}.json', out], capture_output=True)
    U = json.load(open(out)); lost = [u for u in U if u['kind'] == 'lost']
    for u in U:
        if u['kind'] != 'added': continue
        sh = any(l['name'] == u['name'] and min(math.hypot(l['x'] - u['x'], l['y'] - u['y']), math.hypot(l['x0'] - u['x0'], l['y0'] - u['y0'])) < 40
                 and l['t0'] - 3 <= u['t1'] and u['t0'] <= l['t1'] + 3 for l in lost)
        u['cls'] = 'shifted' if sh else 'new'; tot[s, u['cls']] += 1; tot[s, 'added'] += 1
    tot[s, 'lost'] = len(lost)
    json.dump(U, open(out, 'w'))
for k, v in sorted(tot.items()): print(k, v)
print('added', sum(v for k, v in tot.items() if k[1] == 'added'), 'new', sum(v for k, v in tot.items() if k[1] == 'new'))
