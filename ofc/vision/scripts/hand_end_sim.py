"""Hand-end completeness from a sim JSON: for each hand, the keyframe with the most placed cards in the 20 s before the
table empties. Cards = boxes on placed slots (>= 2.5 s old) plus named slots still covered but not boxed."""
import sys, json
for f in sys.argv[1:]:
    sim = json.load(open(f)); ends, st = [], None
    for fr in sim + [dict(t=1e9, bodies=[0, 0])]:
        if len(fr['bodies']) <= 1: st = fr['t'] if st is None else st
        else:
            if st is not None and fr['t'] - st >= 3: ends.append(st)
            st = None
    ends.append(sim[-1]['t'] + 0.1)
    T = [0] * 5
    for e in ends:
        win = [fr for fr in sim if e - 20 <= fr['t'] < e]
        def stats(fr):
            placed = {s['slotId']: s for s in fr['table'] if fr['t'] - s['placedSeconds'] >= 2.5}
            boxed = [b for b in fr['bodies'] if b['slot'] in placed]
            hidden = [s for s in placed.values() if not s['detected'] and s['card']]
            return len(boxed), sum(1 for b in boxed if b['card']), sum(1 for b in boxed if b['hand']), len(hidden)
        if not win: continue
        fr = max(win, key=lambda f: stats(f)[0]); n, single, hand, hidden = stats(fr)
        if n < 4: continue
        T = [a + b for a, b in zip(T, (n, single, hand, hidden, 1))]
    print(f"{f.split('sim-')[-1]}: {T[4]} hands, {T[0]} boxed cards at hand end: single view names {T[1]} ({100*T[1]/T[0]:.0f}%), "
          f"hand state {T[2]} ({100*T[2]/T[0]:.0f}%), plus {T[3]} covered cards named but no longer boxed")
