#!/usr/bin/env python3
"""Held-out scores of a dice and cube detector, per recording session.

Held-out frames are every tenth training frame (objects.held_out). A die counts
as found when a detection of its colour lies within 8 px; detections with no
label nearby are counted as extra. The cube counts when the best cube peak is
within 12 px of the label (or no peak scores 0.5 where the cube is absent).
usage: objects_eval.py MODEL [MODEL...] [--thresh 0.4]
"""
import argparse, collections, json
import numpy as np, torch
import objects as ob


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('models', nargs='+'); ap.add_argument('--thresh', type=float, default=.4)
    a = ap.parse_args()
    keys, jp = ob.load_frames(); frames = dict(zip(keys, jp))
    labels = ob.load_labels()
    cubes = json.loads((ob.OBJ_DIR / 'cube-labels.json').read_text())
    held = ob.held_out(keys)
    for m in a.models:
        net = ob.load(m); stats = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
        for k in held:
            lab = labels[k]; s = stats[k.split(':')[0]]
            with torch.no_grad(): det = ob.peaks(net(ob.to_tensor(ob.decode(frames[k]))[None].to(ob.dev)), a.thresh)[0]
            for c, px, py, sc in det:
                if c < 2 and not any(c == d[2] and abs(d[0] - px) < 8 and abs(d[1] - py) < 8 for d in lab['dice']): s[2] += 1
            for d in lab['dice']:
                s[1] += 1; s[0] += any(c == d[2] and abs(d[0] - px) < 8 and abs(d[1] - py) < 8 for c, px, py, sc in det)
            cube = ('absent' if lab.get('cubeAbsent') else lab.get('cube')) if 'view' in lab else cubes.get(k)
            if cube is None: continue
            best = max([d for d in det if d[0] == 2], key=lambda d: d[3], default=None)
            ok = (best is None or best[3] < .5) if cube == 'absent' else (best is not None and best[3] >= .5 and np.hypot(best[1] - cube[0], best[2] - cube[1]) < 12)
            s[3] += ok; s[4] += 1
        for name, (hit, tot, extra, cok, ctot) in sorted(stats.items()):
            print(f'{m.split("/")[-1]:14s} {name}: dice {hit}/{tot} ({hit / max(tot, 1):.1%}) extra {extra}  cube {cok}/{ctot}')


if __name__ == '__main__':
    main()
