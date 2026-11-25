#!/usr/bin/env python3
"""Second opinion on a roll with one die (Nov 25 PM): obj-v11 looks for the die that landed with it.

The shipped scans miss pale dice at the bar edge and the rails (the roll audit's rolls without two dice: 28 of 33
were such a die, eye-checked). obj-v11 (objects_rolls.py frames, objects_train.py) finds many of them but reads the
test sets worse frame by frame (Nov 24 93 -> 90/93, 15:31 222/226 1 false -> 220/226 6 false), so it is not a scan
detector. It is used only where the roll needs a die: a roll whose roller has exactly one fresh die in the window.

find() runs the model on every 5th frame of the known die's rest (up to 60 frames) and on four frames 2-6 s before it
landed. Die peaks from 0.35 (either colour: a pale die's colour is unsure; objects.merge_dice per frame) are grouped
across frames (12 px). The second die is the one group that
  - lies 24 px or more from the known die,
  - is seen in a sixth of the frames and in 5 (in all but two when the known die rests under 7 frames: a dance picked
    up after a second, Nov 23 T16),
  - first appears within 30 frames (1.2 s) of the known die's landing (the same throw),
  - was not there before the known die landed (no peak within 12 px in the earlier frames: an older roll's die, a
    checker emblem).
Two or more such groups give no answer. Its crops (40x40, the readers' view) are read by the face reader like a track.

usage (from roll_audit.py --second MODEL [--second-model s1=M ...]).
"""
import math
import numpy as np, torch
import heldout as H, objects as ob, dice
from testset_build import read
from session import reader_view, reader_xy

NETS = {}


def net(path):
    if path not in NETS: NETS[path] = ob.load(path)
    return NETS[path]


@torch.no_grad()
def _peaks(model, ims, batch=16):
    out = []
    for i in range(0, len(ims), batch):
        x = torch.stack([ob.to_tensor(im) for im in ims[i:i + batch]]).to(ob.dev)
        for rows in ob.peaks(model(x), .2):
            out.append([r for r in ob.merge_dice([r for r in rows if r[0] < 2 and ob.on_board(r[1], r[2])], .35)])
    return out


def find(session, model_path, die, near=24, same=12, land=50, frac=1 / 6, nmin=5):
    """die: [x, y, first, last, n] of the known die (rectified board, as roll_audit rows). Returns None or
    {'x', 'y' (rectified), 'first', 'last', 'n', 'patches': [40x40 crops]}."""
    view = H.board_view(session); first, last = int(die[2]), int(die[3])
    fs = list(range(first - first % 5, last + 1, 5))
    if len(fs) > 60: fs = [fs[i] for i in np.linspace(0, len(fs) - 1, 60).astype(int)]
    before = [first - first % 5 - d for d in (150, 110, 80, 50) if first - d > 0]
    ims = {n: reader_view(im, view) for n, im in read(session, sorted(set(fs + before)))}
    fs = [n for n in fs if n in ims]; before = [n for n in before if n in ims]
    if not fs: return None
    model = net(model_path)
    pk = dict(zip(fs + before, _peaks(model, [ims[n] for n in fs + before])))
    kx, ky = reader_xy(die[0], die[1], 800, 590, view)
    groups = []
    for n in fs:
        for c, x, y, s in pk[n]:
            g = next((g for g in groups if math.hypot(g['x'] - x, g['y'] - y) < same), None)
            if g is None: groups.append({'x': x, 'y': y, 'pts': [(n, x, y, s)]})
            else:
                g['pts'].append((n, x, y, s)); g['x'] = float(np.mean([p[1] for p in g['pts']])); g['y'] = float(np.mean([p[2] for p in g['pts']]))
    old = [(x, y) for n in before for c, x, y, s in pk[n]]
    need = max(min(nmin, max(3, len(fs) - 2)), frac * len(fs))  # a dance's dice may rest only a second (Nov 23 T16: 6 frames)
    cands = [g for g in groups if math.hypot(g['x'] - kx, g['y'] - ky) >= near and len({p[0] for p in g['pts']}) >= need
             and min(p[0] for p in g['pts']) <= first + land and not any(math.hypot(g['x'] - x, g['y'] - y) < same for x, y in old)]
    if len(cands) != 1: return None
    g = cands[0]; ns = sorted({p[0] for p in g['pts']})
    patches = [dice.patch(ims[n], x, y, 40) for n, x, y, s in sorted(g['pts'])[:20]]
    rx, ry = reader_xy(g['x'], g['y'], 800, 590, view)
    return {'x': round(rx, 1), 'y': round(ry, 1), 'first': ns[0], 'last': ns[-1], 'n': len(ns), 'patches': patches}
