"""Score single-view reads vs hand-state carried names on held-out sessions, per keyframe observation."""
import json, os, sys, numpy as np
from collections import Counter, defaultdict
from hand_state import run
LAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'labels') + '/'
def truth(session):
    L = json.load(open(LAB + session + '.json'))['tracks']
    def f(t, x, y):
        best = None
        for l in L:
            if l['firstSeconds'] - 0.7 <= t <= l['lastSeconds'] + 0.7:
                e = np.hypot(x - l['x'], y - l['y'])
                if e < 15 and (best is None or e < best[0]): best = (e, l)
        if not best: return None
        b = best[1]; base = b['id'].split('.')[0]
        sib = [l for l in L if l['id'].split('.')[0] == base]  # split segments share the parent's span
        labs = {l['label'] for l in sib}
        cards = {x for x in labs if len(x) == 2}
        return dict(b, label=('|'.join(sorted(cards)) if cards else b['label']), ok=cards, id=base)
    return f
def score(session, out, key):
    f = truth(session); c = Counter(); wrong = Counter(); qnamed = Counter()
    for fr in out:
        for b in fr['bodies']:
            l = f(fr['t'], b['x'], b['y']); g = l['label'] if l else 'unmatched'
            v = b.get(key); kind = 'card' if l and l['ok'] else g
            c[kind] += 1; c[kind + '_named'] += bool(v)
            if kind == 'card' and v and v not in l['ok']: wrong[(g, v)] += 1
            if kind == '?' and v: qnamed[l['id']] += 1
    return c, wrong, qnamed
if __name__ == '__main__':
    kw = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    for s in sys.argv[1].split(','):
        out = run(s, **kw)
        for key in ('read', 'carried'):
            c, w, q = score(s, out, key)
            print(s, key, f"card {c['card_named']}/{c['card']} ({100*c['card_named']/max(c['card'],1):.1f}%) wrong {sum(w.values())}",
                  f"| none named {c['none_named']}/{c['none']} | ? named {c['?_named']}/{c['?']} on {len(q)} tracks | unmatched named {c['unmatched_named']}/{c['unmatched']}")
            if w: print('   wrong', w.most_common(12))
