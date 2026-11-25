#!/usr/bin/env python3
"""Detector training frames from verified roll positions (Nov 25 PM): the dice of every roll the audit confirms
(roll_audit.py --json, status 'confirmed') and the pale second dice found by eye (hard-pale JSON: each die's
session, place in the readers' view, colour and rest span, from the eye check of the rolls without two dice).

Frames (every 5th, as the scans):
  - one frame per confirmed roll, 40% into the time both of its dice lie still;
  - up to six frames per eye-found die, spread over the inner 80% of its rest span.
Frames in the old test games (heldout.held, with its 10 s margin) and every frame of the Nov 24 15:31 recording (s6) are
never used.

Labels per frame, in the readers' view: every die of the session's tracked scan at that frame (objects-scan-track3: the
tracker's dice, no false die in either test set) and every eye-found die whose span covers the frame. A raw detector peak
(the scan's .raw.pkl, from 0.1) that no label explains is:
  - from 0.15, a review item (contact sheets, verdicts N not a die / Y or R a die of that colour / ? unknown);
    N is left as background, a hard negative (checker emblems, fingertips, a die in a hand);
  - under 0.15, or '?', ignored in training.

usage: objects_rolls.py candidates AUDIT.json EYE.json OUT_DIR       items.json + sheets-N.jpg for the review
       objects_rolls.py build AUDIT.json EYE.json OUT_DIR VERDICTS.json  extra sets in BG_OBJECT_DIR/extra:
           frames-rolls-GROUP.npz / labels-rolls-GROUP.json, one per group (n21a = s1+s2, n21b = s3, n2324 = s4+s5), so a
           fold can leave a session out (BG_OBJ_SKIP=rolls-n21a)
"""
import argparse, json, math, pickle
from pathlib import Path
import numpy as np, cv2
import heldout as H, objects as ob, dice_faces as df
from testset_build import read
from session import reader_view, reader_xy

SCAN = 'objects-scan-track3'
GROUPS = {'s1': 'n21a', 's2': 'n21a', 's3': 'n21b', 's4': 'n2324', 's5': 'n2324'}
EXPLAIN = 14     # px: a raw peak this close to a label is that die
REVIEW = .15     # unexplained raw peaks from here are reviewed; weaker ones are ignored


def wanted(audit, eye):
    """{session: {frame: [eye dice (x, y, red) covering it]}} of the frames to label."""
    out = {}
    for r in audit:
        s = r['session']
        if r['status'] != 'confirmed' or s not in GROUPS or len(r.get('dice') or []) < 2: continue
        a, b = (max(d[2] for d in r['dice'][:2]), min(d[3] for d in r['dice'][:2]))
        if b - a < 20: continue
        n = int(a + .4 * (b - a)); n -= n % 5
        if not H.held(s, n): out.setdefault(s, {}).setdefault(n, [])
    for e in eye:
        s = e['s']
        if s not in GROUPS: continue
        fr = e['frames']; k = len(fr); inner = fr[int(.1 * k):max(int(.1 * k) + 1, int(.9 * k))]
        pick = sorted({inner[int(q * (len(inner) - 1))] for q in np.linspace(0, 1, min(6, len(inner)))})
        for n in pick:
            if not H.held(s, n): out.setdefault(s, {}).setdefault(n, [])
    for s, frames in out.items():  # every eye die lying at each chosen frame
        for n in frames:
            frames[n] = [(e['x'], e['y'], e['red']) for e in eye if e['s'] == s and e['frames'][0] <= n <= e['frames'][-1]]
    return out


def frame_labels(s, frames):
    """Per frame: scan dice (readers' view) + eye dice, and the unexplained raw peaks."""
    view = H.board_view(s); work = H.WORK[s]; df.SCAN = SCAN
    meta, _ = df.load_scan(work)
    raw = pickle.load(open(work / 'objects-scan-track.raw.pkl', 'rb'))
    out = {}
    for n, eyed in frames.items():
        dice = []
        for f, x, y, sc, c in meta[meta[:, 0] == n]:
            rx, ry = reader_xy(float(x), float(y), 800, 590, view); dice.append([round(rx, 1), round(ry, 1), int(c)])
        for x, y, c in eyed:
            if not any(math.hypot(d[0] - x, d[1] - y) < 12 for d in dice): dice.append([float(x), float(y), int(c)])
        peaks = [(q[0], q[1], q[2], q[3]) for q in (raw.get(n) or {}).get('dice', [])]
        free = [p for p in peaks if not any(math.hypot(d[0] - p[1], d[1] - p[2]) < EXPLAIN for d in dice)]
        out[n] = {'dice': dice, 'review': [p for p in free if p[3] >= REVIEW], 'weak': [p for p in free if p[3] < REVIEW]}
    return out


def candidates(a):
    audit, eye = json.loads(Path(a.audit).read_text()), json.loads(Path(a.eye).read_text())
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True); items, tiles = [], []
    for s, frames in sorted(wanted(audit, eye).items()):
        labs = frame_labels(s, frames); view = H.board_view(s)
        need = sorted(n for n in labs if labs[n]['review'])
        ims = {n: reader_view(im, view) for n, im in read(s, need)}
        for n in need:
            for c, x, y, sc in labs[n]['review']:
                z = cv2.resize(cv2.getRectSubPix(ims[n], (64, 64), (float(x), float(y))), (192, 192), interpolation=cv2.INTER_CUBIC)
                for dx, dy, dc in labs[n]['dice']:  # labelled dice: green (yellow die) or magenta (red) ring
                    u, v = int(96 + 3 * (dx - x)), int(96 + 3 * (dy - y))
                    if -30 < u < 222 and -30 < v < 222: cv2.circle(z, (u, v), 27, (255, 0, 255) if dc else (0, 255, 0), 1)
                cv2.line(z, (96, 84), (96, 108), (0, 255, 255), 1); cv2.line(z, (84, 96), (108, 96), (0, 255, 255), 1)
                cv2.putText(z, f'{len(items)}', (2, 14), 0, .45, (0, 255, 255), 1); cv2.putText(z, f'{"YR"[int(c)]}{sc:.2f}', (2, 188), 0, .4, (0, 255, 255), 1)
                items.append([f'{s}:{n}', round(x, 1), round(y, 1), int(c), round(sc, 3)]); tiles.append(z)
    (out / 'items.json').write_text(json.dumps(items))
    per = 48
    for k in range(0, len(tiles), per):
        t = tiles[k:k + per] + [np.zeros((192, 192, 3), np.uint8)] * (-len(tiles[k:k + per]) % 8)
        cv2.imwrite(str(out / f'sheet-{k // per}.jpg'), np.vstack([np.hstack(t[i:i + 8]) for i in range(0, len(t), 8)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
    print('frames', sum(len(f) for f in wanted(audit, eye).values()), 'review items', len(items))


def build(a):
    audit, eye = json.loads(Path(a.audit).read_text()), json.loads(Path(a.eye).read_text())
    items = json.loads((Path(a.out) / 'items.json').read_text()); verdicts = json.loads(Path(a.verdicts).read_text())
    by = {}
    for i, (k, x, y, c, sc) in enumerate(items): by.setdefault(k, []).append((x, y, verdicts.get(str(i), 'N')))
    known = set(ob.load_frames()[0]); groups = {}
    for s, frames in sorted(wanted(audit, eye).items()):
        labs = frame_labels(s, frames); view = H.board_view(s)
        ims = {n: reader_view(im, view) for n, im in read(s, sorted(labs))}
        for n, L in labs.items():
            key = f'{s}:{n}'
            if key in known: continue
            lab = {'dice': list(L['dice']), 'cube': None, 'reviewed': False, 'negatives': [], 'ignore': [[p[1], p[2]] for p in L['weak']],
                   'rolls': True, 'view': view}
            for x, y, v in by.get(key, []):
                if v == 'N': lab['negatives'].append([x, y])
                elif v in 'YR': lab['dice'].append([x, y, 'YR'.index(v)])
                else: lab['ignore'].append([x, y])
            g = groups.setdefault(GROUPS[s], ([], [], {}))
            g[0].append(key); g[1].append(cv2.imencode('.jpg', ims[n], [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes()); g[2][key] = lab
    ex = ob.OBJ_DIR / 'extra'; ex.mkdir(exist_ok=True)
    for name, (keys, jpegs, labels) in groups.items():
        arr = np.empty(len(jpegs), object); arr[:] = jpegs
        np.savez(ex / f'frames-rolls-{name}.npz', keys=np.array(keys), jpegs=arr)
        (ex / f'labels-rolls-{name}.json').write_text(json.dumps(labels))
        print(name, 'frames', len(keys), 'dice', sum(len(v['dice']) for v in labels.values()),
              'negatives', sum(len(v['negatives']) for v in labels.values()), 'ignored', sum(len(v['ignore']) for v in labels.values()))


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('candidates', 'build'):
        p = sub.add_parser(c); p.add_argument('audit'); p.add_argument('eye'); p.add_argument('out')
        if c == 'build': p.add_argument('verdicts')
    a = ap.parse_args(); {'candidates': candidates, 'build': build}[a.cmd](a)


if __name__ == '__main__':
    main()
