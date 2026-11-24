"""Training index from hand state: every view of a named slot is labelled with the slot's name, whether the card
was fully visible (clean) or covered by later cards (covered). Court/ace slots are checked against the hand labels;
'none' comes from hand-labelled none tracks plus gen_none.py crops.
python3 make_strip_index.py TAG OUT.json SESSION..."""
import json, os, sys, numpy as np
from collections import defaultdict, Counter
from hand_state import run
from eval_state import truth
tag, outp, sessions = sys.argv[1], sys.argv[2], sys.argv[3:]
MASKED = os.environ.get('MASKED') == '1'
def cpath(s, c):
    m = f'../scan/{s}/crops_m/{c}'
    return os.path.abspath(m if MASKED and os.path.exists(m) else f'../scan/{s}/crops/{c}')
items = []; st = Counter()
for s in sessions:
    out = run(s, tag); f = truth(s); V = defaultdict(list)
    for fr in out:
        for b in fr['bodies']:
            if b.get('crop'): V[b['track']].append((fr['t'], b))
    for tid, vs in V.items():
        names = Counter(b['carried'] for _, b in vs if b['carried'])
        olds = Counter()
        for t, b in vs:
            l = f(t, b['x'], b['y'])
            if l: olds[l['label']] += 1
        if not names:
            if olds and olds.most_common(1)[0][0] == 'none' and olds['none'] >= 0.8 * sum(olds.values()):
                for t, b in vs[::2][:60]:
                    items.append(dict(path=cpath(s, b['crop']), label='none', kind='none', slot=f'{s}-{tid}')); st['none'] += 1
            continue
        name = names.most_common(1)[0][0]
        manual = [k for k in olds if len(k) == 2 and k[1] in 'JQKA']
        if name[1] in 'JQKA' or manual:
            if manual and name not in manual:
                st['dropped_manual_conflict'] += 1; print('conflict', s, tid, name, dict(olds)); continue
        clean = [(t, b) for t, b in vs if b['carried'] == name and b.get('read') == name]
        cov = [(t, b) for t, b in vs if b['carried'] == name and not b.get('read')]
        for kind, sel, cap in (('clean', clean[::3], 40), ('covered', cov[::2], 80)):
            for t, b in sel[:cap]:
                items.append(dict(path=cpath(s, b['crop']), label=name, kind=kind, slot=f'{s}-{tid}')); st[kind] += 1
    print(s, dict(st), flush=True)
json.dump(items, open(outp, 'w')); print(outp, len(items), dict(st), 'classes', len({i['label'] for i in items}))
