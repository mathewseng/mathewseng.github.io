"""namecover.py OLD NEW DIFF: for each diff item that lost a name (X->None), at each of its frames, is the same name reported
in NEW by another box or hidden slot within 12 px (the same card still named through another object)?"""
import sys, json, math
old, new, diff = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))
byt = {round(f['t'], 2): f for f in new}
for d in diff:
    lost = {a for a, b, n in d['pairs'] if a and not b}
    if not lost: continue
    fr = [f for t, f in byt.items() if d['t0'] - 0.01 <= t <= d['t1'] + 0.01]
    cov = 0
    for f in fr:
        reps = [(b['x'], b['y'], b['hand']) for b in f['bodies'] if b['hand']] + [(s['x'], s['y'], s['card']) for s in f['table'] if not s['detected'] and s['card']]
        if any(n in lost and math.hypot(x - d['x'], y - d['y']) < 12 for x, y, n in reps): cov += 1
    print(d['slot'], f"{d['t0']:.1f}-{d['t1']:.1f}", lost, f'still named nearby in {cov}/{len(fr)} frames')
