#!/usr/bin/env python3
"""Run the dice and cube detector over every 5th rectified frame of one recording.

Writes, under BG_WORK_DIR:
  objects-scan/clip-NNN.npz  meta [frame, x, y, score, red] and 40x40 patches per die (peaks on
                             one die merged: objects.merge_dice)
  objects-scan/die-score.npy detector score per die row (all rows are dice)
  cube-scan.json             [frame, score, x, y] for the best cube peak per scanned frame

usage: objects_scan.py MODEL [--thresh 0.35]
"""
import argparse, json
import av, numpy as np, torch
import dice, frames, objects as ob
from session import RECT, WORK, board_view, reader_view, reader_xy

OUT = WORK / 'objects-scan'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('model'); ap.add_argument('--thresh', type=float, default=.35)
    a = ap.parse_args()
    net = ob.load(a.model)
    OUT.mkdir(exist_ok=True)
    offs = frames.offsets(); cube_rows = []; scores = []; view = board_view()
    for clip in range(len(offs) - 1):
        base = int(offs[clip]); meta, patches, batch, nums = [], [], [], []

        def flush():
            # A turned or mirrored board is read in the Nov 21 view (the detector and face reader
            # learned it, where a die's pip face shows left of its side face); positions are mapped back.
            ims = [reader_view(im, view) for im in batch]
            with torch.no_grad():
                x = torch.stack([ob.to_tensor(im) for im in ims]).to(ob.dev)
                det = ob.peaks(net(x), a.thresh)
            for im, n, rows in zip(ims, nums, det):
                h, w = im.shape[:2]
                rows = [r for r in rows if r[0] == 2] + ob.merge_dice(rows, a.thresh)
                rows = [(c, *reader_xy(px, py, w, h, view), s, px, py) for c, px, py, s in rows]
                cubes = [r for r in rows if r[0] == 2]
                if cubes:
                    c = max(cubes, key=lambda r: r[3]); cube_rows.append([n, round(c[3], 3), round(c[1], 1), round(c[2], 1)])
                else: cube_rows.append([n, 0.0, 0, 0])
                for c, px, py, s, ix, iy in rows:
                    if c == 2: continue
                    meta.append([n, px, py, s, c]); patches.append(dice.patch(im, ix, iy, 40))
            batch.clear(); nums.clear()

        with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as box:
            for i, f in enumerate(box.decode(video=0)):
                if i % 5: continue
                batch.append(f.to_ndarray(format='bgr24')); nums.append(base + i)
                if len(batch) == 16: flush()
        if batch: flush()
        m = np.array(meta, np.float32).reshape(-1, 5)
        np.savez_compressed(OUT / f'clip-{clip:03d}.npz', meta=m, patches=np.array(patches, np.uint8).reshape(-1, 40, 40, 3))
        scores.append(m[:, 3]); print(clip, len(m), flush=True)
    np.save(OUT / 'die-score.npy', np.concatenate(scores))
    (WORK / 'cube-scan.json').write_text(json.dumps(cube_rows))


if __name__ == '__main__':
    main()
