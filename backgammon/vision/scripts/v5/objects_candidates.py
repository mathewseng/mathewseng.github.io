#!/usr/bin/env python3
"""Low-score die candidates in an added session's frames, for review with objects_grid.py.

Peaks between LOW and the labelling threshold (0.5) that no label explains are
written as objects_grid items (key, x, y, caption) with their class and score.
usage: objects_candidates.py NAME MODEL out.json [--low 0.12]
"""
import argparse, json
import numpy as np, torch
import objects as ob


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('name'); ap.add_argument('model'); ap.add_argument('out'); ap.add_argument('--low', type=float, default=.12)
    a = ap.parse_args()
    labels = json.loads((ob.OBJ_DIR / 'extra' / f'labels-{a.name}.json').read_text())
    z = np.load(ob.OBJ_DIR / 'extra' / f'frames-{a.name}.npz', allow_pickle=True)
    net = ob.load(a.model); items = []
    for k, jpeg in zip(z['keys'], z['jpegs']):
        lab = labels[str(k)]
        if lab.get('reviewed'): continue
        with torch.no_grad(): det = ob.peaks(net(ob.to_tensor(ob.decode(jpeg))[None].to(ob.dev)), a.low)[0]
        for c, x, y, s in det:
            if c == 2 or s >= .5: continue
            if any(abs(d[0] - x) < 10 and abs(d[1] - y) < 10 for d in lab['dice']): continue
            items.append([str(k), round(x, 1), round(y, 1), f"{'R' if c else 'Y'}{s:.2f}"])
    json.dump(items, open(a.out, 'w')); print(len(items), 'candidates')


if __name__ == '__main__':
    main()
