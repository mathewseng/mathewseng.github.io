#!/usr/bin/env python3
"""Compare the detector with the sampled-frame labels and write review grids.

usage: objects_review.py MODEL out-dir [--thresh 0.3]
Writes detections.json ({key: [[class, x, y, score], ...]}), new.json (dice
the labels lack), missed.json (labels the detector lacks), and grids.
"""
import argparse, json
from pathlib import Path
import numpy as np, torch
import objects as ob


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('model'); ap.add_argument('out'); ap.add_argument('--thresh', type=float, default=.3)
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    net = ob.load(a.model)
    keys, jp = ob.load_frames()
    labels = json.loads((ob.OBJ_DIR / 'labels.json').read_text())
    det = {}
    with torch.no_grad():
        for s in range(0, len(keys), 16):
            ks = keys[s:s + 16]
            x = torch.stack([ob.to_tensor(ob.decode(jp[s + i])) for i, k in enumerate(ks)]).to(ob.dev)
            for k, rows in zip(ks, ob.peaks(net(x), a.thresh)): det[k] = [[c, round(px, 1), round(py, 1), round(sc, 3)] for c, px, py, sc in rows]
    (out / 'detections.json').write_text(json.dumps(det))
    new, missed = [], []
    for k in keys:
        lab = labels[k]['dice']
        for c, px, py, sc in det[k]:
            if c < 2 and not any(d[2] == c and abs(d[0] - px) < 8 and abs(d[1] - py) < 8 for d in lab):
                new.append([k, px, py, f"{'YR'[c]}{sc:.2f}"])
        for d in lab:
            if not any(c == d[2] and abs(d[0] - px) < 8 and abs(d[1] - py) < 8 for c, px, py, sc in det[k]):
                missed.append([k, d[0], d[1], 'YR'[d[2]]])
    new.sort(key=lambda r: float(r[3][1:]))
    (out / 'new.json').write_text(json.dumps(new)); (out / 'missed.json').write_text(json.dumps(missed))
    print('new', len(new), 'missed', len(missed))


if __name__ == '__main__':
    main()
