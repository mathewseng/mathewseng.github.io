#!/usr/bin/env python3
"""Crop strips of a turn's dice for an eye check (roll_audit.py rows).

One row per die track in the turn's window (the roller's tracks, most persistent first, then the
other colour's strongest), eight crops along each track at 5x with the frame, the scan score and
the face reader's read; a last row shows the dice area at the track starts and ends at 2x.

usage: roll_strip.py AUDIT.json OUT_DIR PAGE:G:T ... [--scan objects-scan-track4] [--faces SESSION=MODEL ...] [--all-disagreements]
"""
import argparse, json
from pathlib import Path
import numpy as np, cv2, torch
import heldout as H, dice_faces as df
from testset_build import read
from roll_audit import FACES


def strip(row, scan, net, out):
    s = row['session']; work = H.WORK[s]; df.SCAN = scan
    meta, patches = df.load_scan(work); score = np.load(work / scan / 'die-score.npy')
    f0, f1 = row['windowStart'], row.get('windowEnd', row['resultFrame']); df.SPLIT_TOUCHING = df.JOIN_GROUPS = True
    mine = df.tracks(meta, f0, f1, row['red'], score)[:4]
    other = df.tracks(meta, f0, f1, 1 - row['red'], score)[:2]
    trs = [(t, row['red']) for t in mine] + [(t, 1 - row['red']) for t in other]
    want = {}
    for k, (t, c) in enumerate(trs):
        t = t[np.argsort(meta[t, 0])]; pick = t[np.linspace(0, len(t) - 1, min(8, len(t))).astype(int)]
        trs[k] = (t, c, pick)
        for i in pick: want.setdefault(int(meta[i, 0]), []).append(i)
    ctx = sorted({int(meta[t[0], 0]) for t, _, _ in trs[:2]} | {int(meta[t[-1], 0]) for t, _, _ in trs[:2]})[:4]
    frames = dict(read(s, sorted(set(want) | set(ctx))))
    rows = []
    for k, (t, c, pick) in enumerate(trs):
        with torch.no_grad():
            lp = df.read_track(net, patches, t[:20])
        tiles = []
        for i in pick:
            n = int(meta[i, 0]); x, y = float(meta[i, 1]), float(meta[i, 2])
            im = cv2.getRectSubPix(frames[n], (60, 60), (x, y)); im = cv2.resize(im, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            with torch.no_grad(): r = int(net(df.prep(patches[i], False)[None].to(df.dev))[0].argmax()) + 1
            cv2.putText(im, f'{n} {score[i]:.2f} r{r}', (3, 16), 0, .5, (0, 255, 255), 1)
            cv2.putText(im, f'{x:.0f},{y:.0f}', (3, 234), 0, .45, (0, 255, 255), 1); tiles.append(im)
        while len(tiles) < 8: tiles.append(np.zeros((240, 240, 3), np.uint8))
        lab = np.zeros((240, 120, 3), np.uint8)
        who = ('roller ' if c == row['red'] else 'other ') + 'YR'[c]
        for j, txt in enumerate([f'#{k + 1} {who}', f'n {len(t)}', f'pooled {int(lp.argmax()) + 1}',
                                 f'{int(meta[t[0], 0])}', f'..{int(meta[t[-1], 0])}']):
            cv2.putText(lab, txt, (4, 30 + 30 * j), 0, .5, (255, 255, 255), 1)
        rows.append(np.hstack([lab] + tiles))
    if row.get('secondDie'):  # the second opinion's die (second_die.py), eight crops over its rest
        sx, sy, a0, a1, n = row['secondDie']
        pick = sorted({int(v) - int(v) % 5 for v in np.linspace(a0, a1, 8)}); got = dict(read(s, pick)); tiles = []
        for m in pick:
            im = cv2.getRectSubPix(got[m], (60, 60), (float(sx), float(sy))); im = cv2.resize(im, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            cv2.putText(im, f'{m}', (3, 16), 0, .5, (0, 255, 255), 1); tiles.append(im)
        while len(tiles) < 8: tiles.append(np.zeros((240, 240, 3), np.uint8))
        lab = np.zeros((240, 120, 3), np.uint8)
        for j, txt in enumerate(['second die', '(obj-v11)', f'n {n}', f'{a0}', f'..{a1}']): cv2.putText(lab, txt, (4, 30 + 30 * j), 0, .5, (255, 255, 255), 1)
        rows.append(np.hstack([lab] + tiles[:8]))
    if trs:
        xs = [float(np.median(meta[t, 1])) for t, _, _ in trs[:2]]; ys = [float(np.median(meta[t, 2])) for t, _, _ in trs[:2]]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        cw, ch = max(240, max(xs) - min(xs) + 80), max(170, max(ys) - min(ys) + 80); k = min(2, 340 / ch)
        tiles = []
        for n in ctx:
            im = cv2.getRectSubPix(frames[n], (int(cw), int(ch)), (cx, cy)); im = cv2.resize(im, (int(cw * k), 340), interpolation=cv2.INTER_CUBIC)
            cv2.putText(im, str(n), (3, 16), 0, .5, (0, 255, 255), 1); tiles.append(im)
        ctxrow = np.hstack(tiles); w = rows[0].shape[1]
        ctxrow = ctxrow[:, :w] if ctxrow.shape[1] >= w else np.hstack([ctxrow, np.zeros((340, w - ctxrow.shape[1], 3), np.uint8)])
        rows.append(ctxrow)
    head = np.zeros((40, rows[0].shape[1] if rows else 800, 3), np.uint8)
    cv2.putText(head, f"{row['page']} G{row['game']} T{row['turn']} {row['player']} ({'YR'[row['red']]}) @{row['resultFrame']} window {f0}-{f1}: "
                f"published {row['published']} ({row['source']}), dice read {row['read']}, candidates {' '.join(row['candidates'][:10])}",
                (4, 26), 0, .6, (255, 255, 255), 1)
    cv2.imwrite(str(out), np.vstack([head] + rows), [cv2.IMWRITE_JPEG_QUALITY, 82])


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('audit'); ap.add_argument('out'); ap.add_argument('turns', nargs='*')
    ap.add_argument('--scan', default='objects-scan-track4'); ap.add_argument('--all-disagreements', action='store_true')
    ap.add_argument('--faces', nargs='*', default=[], help='SESSION=model (default roll_audit.FACES)')
    a = ap.parse_args(); faces = {**FACES, **dict(x.split('=', 1) for x in a.faces)}
    rows = json.loads(Path(a.audit).read_text()); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    sel = [r for r in rows if f"{r['page']}:{r['game']}:{r['turn']}" in a.turns or (a.all_disagreements and r['status'] == 'disagrees')]
    nets = {}
    for r in sel:
        f = str(faces[r['session']])
        if f not in nets: nets[f] = df.load_net(f)
        p = out / f"{r['page']}-g{r['game']}-t{r['turn']:02d}.jpg"; strip(r, a.scan, nets[f], p); print(p)


if __name__ == '__main__':
    main()
