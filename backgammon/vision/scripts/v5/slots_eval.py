#!/usr/bin/env python3
"""Score slot classifiers on labelled frames: slot accuracy and whole-point accuracy.

A point is right when every one of its six slots is classed right, and a frame
when all 24 points are. Hand-covered slots (occluded) count as right when the
model calls them occluded; ignored slots are skipped. Packed sets (.npz from
slots_add.py) are scored on their held-out blocks only.
usage: slots_eval.py --models A.pt B.pt -- labels...
"""
import argparse
import numpy as np
import read_slots as rs, slots
from train_slots import load


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--models', nargs='+'); ap.add_argument('labels', nargs='+')
    ap.add_argument('--json', default='all', choices=['all', 'held', 'train'], help='which part of JSON label lists to score (held: train_slots.held_block)')
    a = ap.parse_args()
    data = load(a.labels, packed_role='held', json_role=a.json)
    for m in a.models:
        reader = rs.Reader(m, 'mps'); slot_ok = slot_n = pt_ok = pt_n = fr_ok = 0
        for s in range(0, len(data), 32):
            chunk = data[s:s + 32]
            for (img, pts, ign, occ, isl), pr in zip(chunk, reader.probs_batch([d[0] for d in chunk])):
                L = slots.slot_labels(pts)
                if occ is not None: L = np.where(np.array(occ) == 1, 3, L)
                pred = pr.argmax(-1)
                valid = np.ones_like(L, bool)
                if isl is not None: valid &= np.array(isl) == 0
                for p in ign: valid[p - 1] = False
                right = (pred == L) | ~valid
                slot_ok += int(((pred == L) & valid).sum()); slot_n += int(valid.sum())
                pts_right = right.all(-1); pt_ok += int(pts_right.sum()); pt_n += 24; fr_ok += bool(pts_right.all())
        print(f'{m.split("/")[-1]:16s} frames {len(data)}: slots {slot_ok / slot_n:.2%}  points {pt_ok / pt_n:.2%}  whole frames {fr_ok}/{len(data)}')


if __name__ == '__main__':
    main()
