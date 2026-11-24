import sys, json
def hand_ends(sim):
    ends, st = [], None
    for fr in sim + [dict(t=1e9, bodies=[0, 0])]:
        if len(fr['bodies']) <= 1: st = fr['t'] if st is None else st
        else:
            if st is not None and fr['t'] - st >= 3: ends.append(st)
            st = None
    ends.append(sim[-1]['t'] + 0.1)
    out = []
    for e in ends:
        win = [fr for fr in sim if e - 20 <= fr['t'] < e]
        def n(fr):
            placed = {s['slotId'] for s in fr['table'] if fr['t'] - s['placedSeconds'] >= 2.5}
            return sum(1 for b in fr['bodies'] if b['slot'] in placed)
        if not win: continue
        fr = max(win, key=n)
        if n(fr) < 4: continue
        out.append((e, fr['t'], n(fr), len(fr['table'])))
    return out
if __name__ == '__main__':
    sim = json.load(open(sys.argv[1]))
    for e in hand_ends(sim): print(e)
