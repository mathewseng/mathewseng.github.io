"""make_index4.py OUT SESS...: classifier v4 training index from training sessions only.
Labels: hand-checked tracks (labels/SESS.json) where they apply, else the runtime hand state's reported name (sim JSON
of v3 over the session: names carried onto covered and partial views). Per slot: up to 12 views the v3 gate already
reads plus up to 60 views it does not (the hard ones). none: crops v3 calls none at >= 0.9 with no name, subsampled."""
import sys, json, os, random, numpy as np
CODES = [a + r for a in 'SHCD' for r in 'A23456789TJQK']
RT = '/Users/mathewseng/Documents/GitHub/claude-worktrees/mathewseng.github.io/orange-board/ofc/vision'
out, sessions = sys.argv[1], sys.argv[2:]
random.seed(4); items = []; st = {}
for s in sessions:
    sim = json.load(open(f'../sim-card-identity-train-{s}.json'))
    lab = json.load(open(f'{RT}/labels/{s}.json'))['tracks']
    z = np.load(f'../scan/{s}/probs-v3.npz'); P = dict(zip(z['names'], (z['p1'].astype(np.float32) + z['p2'].astype(np.float32)) / 2))
    def manual(t, x, y):
        near = [(abs(tr['x'] - x) + abs(tr['y'] - y), tr['label']) for tr in lab
                if tr['firstSeconds'] - 0.1 <= t <= tr['lastSeconds'] + 0.1 and abs(tr['x'] - x) < 12 and abs(tr['y'] - y) < 12]
        return min(near)[1] if near else None
    easy, hard, none = {}, {}, []
    for f in sim:
        for b in f['bodies']:
            if not b['crop']: continue
            m = manual(f['t'], b['x'], b['y'])
            if m == '?': m = None
            name = m if m else b['hand']
            if name and name != 'none':
                p = P[b['crop']]; k = CODES.index(name); q = p.copy(); q[k] = 0
                # a covered view showing another card clearly (the card on top) would teach that card's face the
                # wrong name: keep a view only when v3 sees no other card at >= 0.3 (hand-checked tracks keep all)
                # (hand-checked track intervals also span a card laid exactly on top of another, so they are filtered
                # too, except the ornate A-spades that v3 confuses with the 7-spades)
                if q[:52].max() >= 0.3 and not (name == 'SA' and int(q.argmax()) == CODES.index('S7')): continue
                # a view the gate does not read is kept only when v3 already leans to the label among the 52 cards
                # (else the visible face is mostly the card on top) and does not call it none
                if b['card'] != name and (p[52] >= 0.6 or p[k] < 0.15 or (int(p[:52].argmax()) != k and not (name == 'SA' and int(p[:52].argmax()) == CODES.index('S7')))): continue
                (easy if b['card'] == name else hard).setdefault((name, b['slot']), []).append(b['crop'])
            elif m == 'none' or (not name and P[b['crop']][52] >= 0.9): none.append(b['crop'])
    n0 = len(items)
    if os.environ.get('HARD') == 'SA': hard = {k: v for k, v in hard.items() if k[0] == 'SA'}
    for d, k in ((easy, 30), (hard, 60)):
        for (name, slot), crops in d.items():
            for c in (crops if len(crops) <= k else crops[:: max(1, len(crops) // k)][:k]):
                items.append(dict(path=os.path.abspath(f'../scan/{s}/crops/{c}'), label=name, slot=f'{s}-{slot}'))
    random.shuffle(none)
    for c in none[:1500]: items.append(dict(path=os.path.abspath(f'../scan/{s}/crops/{c}'), label='none'))
    st[s] = dict(items=len(items) - n0, easySlots=len(easy), hardSlots=len(hard), hardViews=sum(len(v) for v in hard.values()), none=min(1500, len(none)))
json.dump(items, open(out, 'w'))
from collections import Counter
c = Counter(it['label'] for it in items)
print(st); print('total', len(items), 'min', sorted(c.items(), key=lambda kv: kv[1])[:6])
