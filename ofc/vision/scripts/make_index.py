"""Write a training index from track labels: labels/<s>.json maps track id -> code / none / ?; or pseudo labels."""
import json, os, sys, numpy as np
from pseudo import track_means, CODES, TRAIN
def build(tag, thr, out, label_files=True, crop_tag=None):
    items = []
    for s in TRAIN:
        tr, P, M = track_means(s, tag)
        manual = json.load(open(f'../labels/{s}.json')) if label_files and os.path.exists(f'../labels/{s}.json') else {}
        for t, m in zip(tr, M):
            lab = manual.get(t['id'])
            if lab is None:
                if m.max() < thr: continue
                lab = CODES[int(m.argmax())]
            if lab == '?': continue
            k = CODES.index(lab)
            for c in t['crops']:
                p = P[c]
                if lab != 'none' and int(p.argmax()) != k and p.max() > 0.6 and p[k] < 0.2: continue
                items.append(dict(path=os.path.abspath(f'../scan/{s}/crops/{c}'), label=lab, track=t['id']))
    json.dump(items, open(out, 'w')); print(out, len(items))
if __name__ == '__main__':
    build(sys.argv[1], float(sys.argv[2]), sys.argv[3])
