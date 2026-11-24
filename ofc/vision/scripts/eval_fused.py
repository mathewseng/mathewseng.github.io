"""Slot-level strip reads on covered views of cards whose name v3 carried (known identity): mean of the candidate model's
probabilities over the slot's covered views, gated; optional veto of names held by other live slots."""
import sys, numpy as np
from collections import Counter, defaultdict
from hand_state import run, load, CODES
tag = sys.argv[1]; sessions = sys.argv[2].split(',')
def fused(ps, prob, margin, agree, minv):
    if len(ps) < minv: return None, None
    m = np.mean(ps, 0); o = np.argsort(-m); top = int(o[0])
    if top == 52 or m[top] < prob or m[top] - m[o[1]] < margin: return None, top
    if np.mean([int(p.argmax()) == top for p in ps]) < agree: return None, top
    return CODES[top], top
for prob in (0.6, 0.7, 0.8):
    tot = Counter(); wrong = []
    for s in sessions:
        ref = run(s, 'v3'); _, P = load(s, tag)
        cov = defaultdict(list); name = {}; span = defaultdict(list)
        for fr in ref:
            live = {b['carried'] for b in fr['bodies'] if b['carried']}
            for b in fr['bodies']:
                if b['carried'] and not b.get('read') and b.get('crop'):
                    cov[b['track']].append((P[b['crop']][0] + P[b['crop']][1]) / 2); name[b['track']] = b['carried']
                    span[b['track']].append(live - {b['carried']})
        for tid, ps in cov.items():
            v, top = fused(ps, prob, 0.3, 0.7, 5)
            if len(ps) < 5: continue
            tot['slots'] += 1; tot['views'] += len(ps)
            if v: 
                tot['named'] += 1; tot['named_views'] += len(ps)
                if v != name[tid]:
                    excl = set().union(*span[tid])
                    wrong.append((s, tid, name[tid], v, len(ps), 'vetoed' if v in excl else ''))
    print(f'p>={prob}: covered slots {tot["named"]}/{tot["slots"]} named ({tot["named_views"]}/{tot["views"]} views), wrong {len(wrong)}', wrong)
