#!/usr/bin/env python3
"""Pack a later recording's checker labels with their frames for the slot classifier.

Input is build_labels.py output for the session in BG_WORK_DIR (frames and points
on its rectified board). Frames are stored in the Nov 21 view the classifier
learned (turned or mirrored boards turned back) with the points, occluded slots
and ignored slots renumbered to match. Part is held out from
training: one 3-minute block in five (train_slots.held_block), scored by slots_eval.py.
usage: slots_add.py labels.json out.npz
"""
import json, sys
import cv2, numpy as np
import frames
from session import board_view, reader_view, reader_points


def main():
    src, out = sys.argv[1], sys.argv[2]
    entries = json.loads(open(src).read())
    view = board_view(); order = reader_points(view)
    inv = np.argsort(order)  # reader index -> canonical index
    imgs = dict(frames.read([e['frame'] for e in entries]))
    jpegs, labels = [], []
    for e in entries:
        img = reader_view(imgs[e['frame']], view)
        f = dict(e)
        f['points'] = {str(int(order[int(k) - 1]) + 1): v for k, v in e['points'].items()}
        for key in ('occluded', 'ignore_slots'):
            if key in e: f[key] = np.array(e[key])[inv].tolist()
        if 'ignore' in e: f['ignore'] = [int(order[p - 1]) + 1 for p in e['ignore']]
        jpegs.append(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes()); labels.append(f)
    arr = np.empty(len(jpegs), object); arr[:] = jpegs
    np.savez(out, jpegs=arr, labels=json.dumps(labels))
    from train_slots import held_block
    print(out, len(labels), 'entries', sum(held_block(e['frame']) for e in labels), 'held out')


if __name__ == '__main__':
    main()
