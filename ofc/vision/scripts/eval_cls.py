"""Held-out identity eval: every crop of every labelled held-out track; accept rule sweep; confusion of wrong reads."""
import json, sys, collections, cv2, numpy as np
from classify import load, CODES
HELD = ['s1836', 's0023']
def rows(model):
    run = load(model); out = []
    for s in HELD:
        lab = json.load(open(f'../labels/{s}.json'))
        for t in json.load(open(f'../scan/{s}/tracks.json')):
            g = lab.get(t['id'])
            if g is None or g == '?': continue
            ims = [cv2.imread(f'../scan/{s}/crops/{c}') for c in t['crops']]
            x = np.stack(ims).astype(np.float32) / 255
            p1, p2 = run(x), run(np.ascontiguousarray(x[:, ::-1, ::-1]))
            for c, a, b, cf in zip(t['crops'], p1, p2, t['cropConf']):
                out.append(dict(s=s, track=t['id'], crop=c, gt=g, p1=a, p2=b, det=cf))
    return out
def decide(r, P, M, agree=True):
    p = (r['p1'] + r['p2']) / 2; o = np.argsort(-p); top = int(o[0])
    if top == 52 or p[top] < P or p[top] - p[o[1]] < M: return None
    if agree and (int(r['p1'].argmax()) != top or int(r['p2'].argmax()) != top): return None
    if agree and min(r['p1'][top], r['p2'][top]) < P: return None
    return CODES[top]
def score(R, P, M, agree=True):
    st = collections.Counter(); wrong = collections.Counter()
    for r in R:
        d = decide(r, P, M, agree)
        if r['gt'] == 'none':
            st['none_crops'] += 1; st['none_read'] += d is not None
            if d: wrong[('none', d)] += 1
            continue
        st['card_crops'] += 1
        if d is None: st['unknown'] += 1
        elif d == r['gt']: st['right'] += 1
        else: st['wrong'] += 1; wrong[(r['gt'], d)] += 1
    return st, wrong
if __name__ == '__main__':
    R = rows(sys.argv[1])
    for P in (0.5, 0.7, 0.8, 0.9, 0.95):
        st, w = score(R, P, 0.3)
        n = st['card_crops']
        print(f"P={P} M=0.3 read {st['right']+st['wrong']}/{n} ({(st['right']+st['wrong'])/n:.3f}) right {st['right']} wrong {st['wrong']} none-reads {st['none_read']}/{st['none_crops']}  wrong: {w.most_common(8)}")
