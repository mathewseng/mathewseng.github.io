#!/usr/bin/env python3
"""Rolls read from the dice alone on the held-out games (heldout.BLOCKS), per turn.

For each published turn the roller's two most persistent dice in the turn's window (as
dice_evidence.py finds them in the session's objects-scan) are read by the face reader; the best
roll is compared with the published roll (fixed by the legal move, or eye-checked on the dice:
testset_labels.py). Turns where fewer than two dice of the roller were tracked are counted apart.

usage: testset_rolls.py [--faces M] [--scan objects-scan] [-v]
"""
import argparse, collections, json
import numpy as np, torch
import heldout as H, dice_faces as df

D = H.D / 'office-3-backgammon-20261121'


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--faces', default=str(D / 'models/faces-v6.pt'))
    ap.add_argument('--scan', default='objects-scan'); ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    net = df.load_net(a.faces)
    S = collections.defaultdict(collections.Counter)
    for s, f0, f1, an, label in H.BLOCKS:
        work = H.WORK[s]; df.SCAN = a.scan
        meta, patches = df.load_scan(work); score = np.load(work / a.scan / 'die-score.npy')
        A = json.loads(an.read_text()); red_side = H.red_player(s); day = H.DAY[s]
        prev = start = A['startFrame']
        for i, t in enumerate(A['turns']):
            if t.get('cubeOnly') or not t.get('roll') or not f0 <= t['resultFrame'] <= f1:
                if not t.get('cubeOnly'): prev = t['resultFrame']
                continue
            red = 1 if t['player'] == red_side else 0
            start = df.window_start(prev, start, t['resultFrame'])
            tr = df.tracks(meta, start, t['resultFrame'], red, score)
            if i == 0: tr = (df.tracks(meta, start, t['resultFrame'], 0, score)[:1] + df.tracks(meta, start, t['resultFrame'], 1, score)[:1])
            truth = f"{max(t['roll'])}-{min(t['roll'])}"
            if len(tr) < 2:
                S[day]['not seen'] += 1
                if a.v: print(f'  {label} T{i + 1} {t["player"]} {truth} ({t["rollSource"]}): {len(tr)} dice tracked')
            else:
                pp = df.pair_prob(df.read_track(net, patches, tr[0][:20]), df.read_track(net, patches, tr[1][:20]))
                best = max(pp, key=pp.get); ok = best == truth
                S[day]['right'] += ok; S[day]['read'] += 1
                if not ok and a.v: print(f'  {label} T{i + 1} {t["player"]} {truth} ({t["rollSource"]}) read {best} margin {pp[best] - pp[truth]:.1f}')
            prev = t['resultFrame']
    for day in ('nov21', 'nov23', 'nov24'):
        c = S[day]; print(f"{day}: rolls from dice {c['right']}/{c['read']} right, {c['not seen']} turns without two dice")


if __name__ == '__main__':
    main()
