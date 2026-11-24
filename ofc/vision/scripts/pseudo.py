"""Track-level pseudo-labels from a classifier's per-crop probabilities (mean over the track)."""
import json, sys, numpy as np, collections
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK'] + ['none']
TRAIN = ['s1524', 's1931', 's1953', 's2310', 'stud']
def track_means(s, tag):
    tr = json.load(open(f'../scan/{s}/tracks.json')); z = np.load(f'../scan/{s}/probs-{tag}.npz')
    P = dict(zip(z['names'], z['p'].astype(np.float32)))
    return tr, P, [np.mean([P[c] for c in t['crops']], 0) for t in tr]
if __name__ == '__main__':
    tag, thr = sys.argv[1], float(sys.argv[2])
    c = collections.Counter(); tot = 0
    for s in TRAIN:
        tr, P, M = track_means(s, tag)
        for t, m in zip(tr, M):
            tot += 1
            if m.max() >= thr: c[CODES[int(m.argmax())]] += 1
    print(tot, sum(c.values())); print(sorted(c.items()))
