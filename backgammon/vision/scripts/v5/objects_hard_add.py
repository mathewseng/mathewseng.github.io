#!/usr/bin/env python3
"""Add reviewed hard-dice frames (objects_hard.py) to the detector's training set as extra/frames-hard.npz
and extra/labels-hard.json (keys "sN:frame", stored in the readers' view).

Each frame is labelled with the model's merged die peaks scoring 0.5 or more, then the review of its
items (verdicts.json: {item index: verdict}):
  N        not a die where the peak is (a rail edge, a checker gap, a hand) or a second peak on a
           die that already has its strong peak: a negative there (background)
  Y / R    a die of that colour the model scored under 0.5: a die label at the strongest peak of that
           colour within 26 px of the item (else the item's place)
  ?        a die whose colour cannot be decided by eye: the place is ignored in training
Items the review left out are negatives when a peak of 0.5 or more lies within 26 px (a second
peak on a die already labelled), else ignored. The cube is the best cube peak of 0.5 or more (a
frame without one leaves the cube unknown).
A frame already in the training set keeps its labels; the review is added to them (labels-hard.json
then overrides that frame's labels, objects.load_labels).

usage: objects_hard_add.py HARD_DIR verdicts.json MODEL
"""
import json, math, sys
from pathlib import Path
import numpy as np, torch
import heldout as H, objects as ob

NEAR = 26


def main():
    hard, verdicts, model = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text()), sys.argv[3]
    z = np.load(hard / 'frames.npz', allow_pickle=True); keys, jpegs = list(z['keys']), z['jpegs']
    items = json.loads((hard / 'items.json').read_text())
    for f in ('frames-hard.npz', 'labels-hard.json'): (ob.OBJ_DIR / 'extra' / f).unlink(missing_ok=True)  # rebuilt below
    known = ob.load_labels(); known_frames = dict(zip(*ob.load_frames()))
    net = ob.load(model); labels = {}; out_keys, out_jpegs = [], []
    for k, jp in zip(keys, jpegs):
        if k in known: jp = known_frames[k]  # the training set's own copy of the frame
        with torch.no_grad(): det = ob.peaks(net(ob.to_tensor(ob.decode(jp))[None].to(ob.dev)), .15)[0]
        dice = [[round(x, 1), round(y, 1), c] for c, x, y, s in ob.merge_dice(det, .5)]
        cubes = sorted([d for d in det if d[0] == 2 and d[3] >= .5], key=lambda d: -d[3])
        # without a strong cube peak the cube is left unknown (reviewed False: not trained as absent)
        lab = {'dice': dice, 'cube': [round(cubes[0][1], 1), round(cubes[0][2], 1)] if cubes else None,
               'reviewed': bool(cubes), 'negatives': [], 'ignore': [], 'hard': True, 'view': H.board_view(k.split(':')[0])}
        if k in known:
            old = known[k]
            lab = {**old, 'dice': [list(d) for d in old.get('dice', [])], 'negatives': list(old.get('negatives', [])),
                   'ignore': list(old.get('ignore', [])), 'reviewed': True, 'hard': True}
        for n, (key, x, y, cap) in enumerate(items):
            if key != k: continue
            v = verdicts.get(str(n))
            strong = [d for d in det if d[0] < 2 and d[3] >= .5 and math.hypot(d[1] - x, d[2] - y) <= NEAR]
            if v is None: v = 'N' if strong else '?'
            if v == 'N': lab['negatives'].append([x, y])
            elif v == '?': lab['ignore'].append([x, y])
            else:
                c = 'YR'.index(v)
                same = [d for d in det if d[0] == c and math.hypot(d[1] - x, d[2] - y) <= NEAR]
                px, py = (max(same, key=lambda d: d[3])[1:3]) if same else (x, y)
                if not any(math.hypot(d[0] - px, d[1] - py) < 12 for d in lab['dice']): lab['dice'].append([round(px, 1), round(py, 1), c])
                # the other peaks on this die are not dice
                for d in det:
                    if d[0] < 2 and d[3] < .5 and 4 < math.hypot(d[1] - px, d[2] - py) <= NEAR: lab['negatives'].append([d[1], d[2]])
        labels[k] = lab; out_keys.append(k); out_jpegs.append(jp)
    arr = np.empty(len(out_jpegs), object); arr[:] = out_jpegs
    np.savez(ob.OBJ_DIR / 'extra' / 'frames-hard.npz', keys=np.array(out_keys), jpegs=arr)
    (ob.OBJ_DIR / 'extra' / 'labels-hard.json').write_text(json.dumps(labels))
    print('frames', len(labels), 'dice', sum(len(v['dice']) for v in labels.values()),
          'negatives', sum(len(v['negatives']) for v in labels.values()), 'ignored', sum(len(v['ignore']) for v in labels.values()))


if __name__ == '__main__':
    main()
