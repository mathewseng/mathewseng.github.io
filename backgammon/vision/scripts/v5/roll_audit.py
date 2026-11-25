#!/usr/bin/env python3
"""Roll audit: every published turn's roll against the roll its dice show, read over time.

For each published game (PUBLISHED: the analysis files the pages were exported from) and each turn
with a roll, the roller's two most persistent dice in the turn's window (dice_faces.tracks on a
session's scan, as dice_evidence.py finds them; the opening roll takes one die of each colour) are
read by the face reader and pooled over their frames (dice_faces.read_track). The turn is

  confirmed   the dice's most likely roll (of all 21) is the published roll
  disagrees   the dice read another roll (eye-check these: crop strips, roll_strip.py)
  unseen      fewer than two of the roller's dice were tracked in the window
  stale       the two dice found were already lying there 2-4 s before the window opened (an earlier roll's dice:
              this roll was not seen)

and "pick" is what analyze.mjs would choose among the move's candidate rolls from these dice (the
published roll when the move fixes it), so a 'dice' or 'ambiguous' turn whose pick changes is a roll
the scan would publish differently.

usage: roll_audit.py [--scan objects-scan-track] [--faces s1=M ...] [--sessions s1 s4] [--min-score .3] [--json out.json] [-v]
"""
import argparse, collections, json
from pathlib import Path
import numpy as np
import heldout as H, dice_faces as df

D = H.D
ALL = D / 'office-3-backgammon-20261121-all/analysis'
# (page, game, analysis file, session) for every published game
PUBLISHED = []
for p in sorted(ALL.glob('game-*.json')):
    A = json.loads(p.read_text()); w = (A.get('session') or {}).get('work')
    s = next((k for k, v in H.WORK.items() if v.name == w), 's1') if w else 's1'
    PUBLISHED.append(('2026-11-21', A['game'], p, s))
PUBLISHED.append(('2026-11-23', 1, D / 'office-3-backgammon-20261123/analysis-v8/game-01.json', 's4'))
for g in range(1, 5): PUBLISHED.append(('2026-11-24', g, D / f'office-3-backgammon-20261124/analysis/game-{g:02d}.json', 's5'))
for g in range(1, 3): PUBLISHED.append(('2026-11-24-pm', g, D / f'office-3-backgammon-20261124-1531/analysis/game-{g:02d}.json', 's6'))

FACES = {s: D / 'office-3-backgammon-20261121/models/faces-v6.pt' for s in H.WORK}
FACES['s6'] = D / 'office-3-backgammon-20261124-1531/models/faces-v8.pt'


def key(r): return f'{max(r)}-{min(r)}'


def in_game(A, t):
    """Turns after the game's result (Nov 23: the position played out after the pass) are not published."""
    res = A.get('result') or {}
    return not (res.get('reason') == 'pass' and res.get('frame') is not None and t['resultFrame'] > res['frame'])


def audit(sessions, scan, faces, min_score=.3, verbose=False):
    rows = []; nets = {}
    by_s = collections.defaultdict(list)
    for page, g, p, s in PUBLISHED:
        if s in sessions: by_s[s].append((page, g, p))
    for s, games in by_s.items():
        work = H.WORK[s]; df.SCAN = scan
        meta, patches = df.load_scan(work); score = np.load(work / scan / 'die-score.npy')
        if min_score != .3: score = np.where(score >= min_score, np.maximum(score, .31), score)
        fpath = str(faces.get(s, FACES[s]))
        if fpath not in nets: nets[fpath] = df.load_net(fpath)
        net = nets[fpath]; red_side = H.red_player(s)
        for page, g, p in games:
            A = json.loads(p.read_text())
            prev = start = A['startFrame']
            for i, t in enumerate(A['turns']):
                if t.get('cubeOnly') or not t.get('roll') or not in_game(A, t):
                    if not t.get('cubeOnly'): prev = t['resultFrame']
                    continue
                red = 1 if t['player'] == red_side else 0
                start = df.window_start(prev, start, t['resultFrame'])
                opening = i == 0 and not A['turns'][0].get('gapBefore') and A['turns'][0]['before']['points'] == OPENING
                if opening: tr = df.tracks(meta, start, t['resultFrame'], 0, score)[:1] + df.tracks(meta, start, t['resultFrame'], 1, score)[:1]
                else: tr = df.tracks(meta, start, t['resultFrame'], red, score)
                pub = key(t['roll']); cands = t.get('rollCandidates') or [pub]
                row = {'page': page, 'game': g, 'turn': i + 1, 'session': s, 'player': t['player'], 'red': red, 'opening': opening,
                       'resultFrame': t['resultFrame'], 'windowStart': int(start), 'published': pub, 'source': t.get('rollSource'),
                       'candidates': cands, 'dance': bool(t.get('dance')), 'tracks': len(tr)}
                before = meta[(meta[:, 0] >= start - 100) & (meta[:, 0] < start - 50) & (meta[:, 4] == red) & (score > .3), 1:3]
                stale = not opening and len(tr) >= 2 and len(before) > 0 and all(
                    np.abs(before - np.median(meta[a, 1:3], 0)).max(1).min() <= 12 for a in tr[:2])
                if stale:  # both dice lay there before the window opened: an earlier roll's dice, this roll unseen
                    row.update(read=None, pick=None, status='stale', dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr[:2]])
                elif len(tr) >= 2:
                    pp = df.pair_prob(df.read_track(net, patches, tr[0][:20]), df.read_track(net, patches, tr[1][:20]))
                    best = max(pp, key=pp.get); pick = max(cands, key=lambda c: pp.get(c, -1e9))
                    row.update(read=best, margin=round(pp[best] - pp[pub], 2), pick=pick,
                               status='confirmed' if best == pub else 'disagrees',
                               dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr[:2]])
                else:
                    row.update(read=None, pick=None, status='unseen', dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr])
                rows.append(row); prev = t['resultFrame']
                if verbose and row['status'] != 'confirmed':
                    print(f"  {page} G{g} T{i + 1} {t['player']} @{t['resultFrame']} pub {pub} ({row['source']}) {row['status']} read {row['read']} margin {row.get('margin')} pick {row['pick']} cands {cands}")
    return rows


OPENING = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2]


def summary(rows):
    C = collections.defaultdict(collections.Counter)
    for r in rows:
        for k in (r['page'], 'all'):
            C[k][r['status']] += 1; C[k]['turns'] += 1
            if r['source'] in ('dice', 'ambiguous') and r['pick'] and r['pick'] != r['published']: C[k]['pick changes'] += 1
    for k, c in C.items():
        print(f"{k}: {c['turns']} rolls, {c['confirmed']} confirmed by the dice, {c['disagrees']} disagree, {c['unseen']} without two dice, {c['stale']} only earlier dice; "
              f"{c['pick changes']} dice/ambiguous picks change")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scan', default='objects-scan-track')
    ap.add_argument('--faces', nargs='*', default=[], help='SESSION=model')
    ap.add_argument('--sessions', nargs='*', default=list(H.WORK)); ap.add_argument('--min-score', type=float, default=.3)
    ap.add_argument('--json'); ap.add_argument('-v', action='store_true')
    a = ap.parse_args()
    faces = dict(x.split('=', 1) for x in a.faces)
    rows = audit(a.sessions, a.scan, faces, a.min_score, a.v)
    summary(rows)
    if a.json: Path(a.json).write_text(json.dumps(rows, indent=0))


if __name__ == '__main__':
    main()
