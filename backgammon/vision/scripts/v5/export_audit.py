#!/usr/bin/env python3
"""Frame-level detections for the page's Vision overlay (board-only, gzip JSON).

The overlay draws in a 560x420 board space placed over the video's board at
928x696, so canonical 800x590 coordinates are scaled to that space.
Each frame: [checkers [[x, y, side, 0, 0]], dice [[x, y, face, '', score]], cube [x, y, '', score] | null, hands [], stacks [[point, side, count]]]

usage: export_audit.py <obs-dir> <render-dir> <page-dir> <game...>
"""
import glob, gzip, json, sys
from pathlib import Path
import numpy as np
import geometry as g, slots
from session import WORK

SX, SY = 560 / 800, 420 / 590


def main():
    obs_dir, render_dir, page = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    rows = {}
    for p in sorted(obs_dir.glob('clip-*.json')):
        for r in json.loads(p.read_text()): rows[r['f']] = r
    keys = np.array(sorted(rows))
    dm = np.concatenate([np.load(p)['meta'] for p in sorted(glob.glob(str(WORK / 'dice-scan/clip-*.npz')))])
    ds = np.load(WORK / 'dice-scan/die-score.npy')
    keep = ds > .5; dm, ds = dm[keep], ds[keep]
    cube = {c[0]: c for c in json.loads((WORK / 'cube-scan.json').read_text())}
    cube_keys = np.array(sorted(cube))
    (page / 'audit').mkdir(parents=True, exist_ok=True)
    for gnum in map(int, sys.argv[4:]):
        rng = json.loads((render_dir / f'game-{gnum:02d}.range.json').read_text())
        out = []
        for vf in range(rng['frames']):
            f = rng['first'] + vf
            k = keys[max(0, np.searchsorted(keys, f, side='right') - 1)]
            r = rows[int(k)]
            checkers, stacks = [], []
            for p in range(1, 25):
                v = r['pos'][p - 1]
                if not v or r['conf'][p - 1] < 0.9: continue
                side = 0 if v > 0 else 1
                for s in range(min(abs(v), slots.NSLOT)):
                    off = slots.SLOT0 + slots.PITCH * s
                    y = g.TOP[0] + off if g.is_top(p) else g.BOTTOM[1] - off
                    checkers.append([round(g.point_x(p) * SX, 1), round(y * SY, 1), side, 0, 0])
                if abs(v) >= 5: stacks.append([p, side, abs(v)])
            sel = np.nonzero(np.abs(dm[:, 0] - k) < 1)[0]
            dice = [[round(float(dm[i, 1]) * SX, 1), round(float(dm[i, 2]) * SY, 1), 0, 'die', int(ds[i] * 100)] for i in sel]
            ck = cube_keys[max(0, np.searchsorted(cube_keys, f, side='right') - 1)]
            c = cube[int(ck)]
            cb = [round(c[2] * SX, 1), round(c[3] * SY, 1), 0, int(c[1] * 100)] if c[1] >= .6 else None
            out.append([checkers, dice, cb, [], stacks])
        with gzip.open(page / 'audit' / f'game-{gnum:02d}.json.gz', 'wt', compresslevel=9) as fh:
            json.dump({'fps': 25, 'frames': out}, fh, separators=(',', ':'))
        print(gnum, len(out), (page / 'audit' / f'game-{gnum:02d}.json.gz').stat().st_size)

if __name__ == '__main__':
    main()
