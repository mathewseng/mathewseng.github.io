#!/usr/bin/env python3
"""Verified die-face crops from the published rolls (training data for the face reader).

Every published roll whose truth is solid gives its two dice's crops a face: the rolls that
roll_audit.py confirms (the dice read the published roll) and the disagreements whose published roll
was eye-checked (EYE_OK below: the reader misread a face, the published roll stands). Each of the
two dice tracked in the turn's window (dice_faces.tracks, as the audit finds them) is labelled over
every frame of its track:

  double      both dice show the roll's value
  opening     one die of each colour; the player who starts rolled the higher one
  otherwise   the two values go to the two dice in the order the shipped reader prefers, pooled over
              each track (LABEL_FACES: faces-v6, faces-v8 for s6); when the two orders are within --margin (log-prob) the
              pair is kept as an order-free pair (dice_faces.pair_loss) instead

Two dice of one colour in one tracked group are split first (roll_audit splits touching dice).
Two tracks less than 18 px apart are one die seen twice (its pip face and its side) and the roll is
left out. Frames in the old test set's held-out games (heldout.held) are marked, so training can leave
them out. One file per session: OUT/faces-SESSION.npz (patches 40x40, face 1-6 or 0 for a pair die,
pair values, die and roll ids, frame, x, y, held, red, status) and OUT/rolls-SESSION.json.

usage: face_labels.py OUT [--sessions s1 ... s6] [--margin 3] [--max-per-die 60]
"""
import argparse, json
from pathlib import Path
import numpy as np
import heldout as H, dice_faces as df, roll_audit as ra

# Disagreements whose published roll is right (eye-checked on roll_strip.py strips, Nov 25) and whose
# two tracks are the roll's two dice, each showing one face throughout. Left out: duplicate peaks of
# one die (Nov 21 G9 T29, Nov 24 G1 T34), touching dice (Nov 24 G4 T31), a dance and a move sharing
# one window (Nov 21 G9 T46/T47), a die pushed over after landing (Nov 24 PM G1 T8), a merged turn's
# dice (Nov 24 PM G1 T9), the irregular turn (Nov 24 PM G2 T50) and Nov 21 G9 T13 (both tracked dice show six:
# the second track is not the roll's one).
EYE_OK = json.loads((Path(__file__).parent / 'face-labels-eye.json').read_text())


def scan_of(s): return 'objects-scan' if s == 's6' else 'objects-scan-track'


# The readers that confirmed the rolls and order the two values (the readers shipped before faces-v9;
# the Nov 25 data set, ~/Downloads/office-3-backgammon-20261121/faces-labels-20261125, was built with them).
LABEL_FACES = {s: H.D / 'office-3-backgammon-20261121/models/faces-v6.pt' for s in H.WORK}
LABEL_FACES['s6'] = H.D / 'office-3-backgammon-20261124-1531/models/faces-v8.pt'


def build(s, margin, max_per_die):
    rows = ra.audit([s], scan_of(s), LABEL_FACES, mask=False)  # touching dice split (dice_faces.split_touching)
    df.SCAN = scan_of(s); meta, patches = df.load_scan(H.WORK[s])
    net = df.load_net(str(LABEL_FACES[s]))
    out = {k: [] for k in ('patch', 'face', 'pair', 'die', 'roll', 'frame', 'x', 'y', 'held', 'red', 'status')}
    kept = []; rid = 0
    for r in rows:
        name = f"{r['page']}:{r['game']}:{r['turn']}"
        if r['status'] == 'confirmed': status = 0
        elif r['status'] == 'disagrees' and name in EYE_OK: status = 1
        else: continue
        tr = r['_tr']
        if len(tr) < 2: continue
        p0, p1 = (np.median(meta[t, 1:3], 0) for t in tr)
        if np.hypot(*(p0 - p1)) < 18: kept.append({**ra.public([r])[0], 'labels': None, 'why': 'one die twice'}); continue
        hi, lo = map(int, r['published'].split('-'))
        if hi == lo: faces, how = (hi, hi), 'double'
        elif r['opening']:
            # tr = [yellow, red]; the roller (colour r['red']) rolled the higher die
            faces, how = ((hi, lo) if r['red'] == 0 else (lo, hi)), 'opening'
        else:
            l0, l1 = df.read_track(net, patches, tr[0][:20]), df.read_track(net, patches, tr[1][:20])
            a, b = l0[hi - 1] + l1[lo - 1], l0[lo - 1] + l1[hi - 1]
            if abs(a - b) >= margin: faces, how = ((hi, lo) if a > b else (lo, hi)), 'order'
            else: faces, how = (0, 0), 'pair'
        for k, t in enumerate(tr):
            t = np.sort(t)
            if len(t) > max_per_die: t = t[np.linspace(0, len(t) - 1, max_per_die).astype(int)]
            for i in t:
                out['patch'].append(patches[i]); out['face'].append(faces[k]); out['pair'].append((hi, lo))
                out['die'].append(2 * rid + k); out['roll'].append(rid); out['frame'].append(int(meta[i, 0]))
                out['x'].append(float(meta[i, 1])); out['y'].append(float(meta[i, 2]))
                out['held'].append(H.held(s, int(meta[i, 0]))); out['red'].append(int(meta[i, 4])); out['status'].append(status)
        kept.append({**ra.public([r])[0], 'rollId': rid, 'labels': list(faces), 'how': how}); rid += 1
    arr = {k: np.array(v) for k, v in out.items()}
    arr['patch'] = arr['patch'].astype(np.uint8)
    return arr, kept


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out')
    ap.add_argument('--sessions', nargs='*', default=list(H.WORK))
    ap.add_argument('--margin', type=float, default=3.); ap.add_argument('--max-per-die', type=int, default=60)
    a = ap.parse_args(); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for s in a.sessions:
        arr, kept = build(s, a.margin, a.max_per_die)
        np.savez_compressed(out / f'faces-{s}.npz', **arr)
        (out / f'rolls-{s}.json').write_text(json.dumps(kept, indent=0))
        how = {}
        for k in kept: how[k.get('how', k.get('why'))] = how.get(k.get('how', k.get('why')), 0) + 1
        print(s, 'rolls', sum('rollId' in k for k in kept), how, 'crops', len(arr['face']), 'held', int(arr['held'].sum()), flush=True)


if __name__ == '__main__':
    main()
