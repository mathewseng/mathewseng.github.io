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

Two dice of one colour in one tracked group are split (dice_faces.split_touching) and a die's
crops are read with a touching neighbour painted out (dice_faces.mask_neighbours); --no-split and
--no-mask read as before Nov 25 PM. --pool confident reads a track's 10 surest detections (tried, not
better). Every session's scan is objects-scan-track3 (die_track.py scan --raw with the one-die check, rule 5b;
the 15:31 session's published scan is objects-scan, the older ones objects-scan-track).

Window rules (Nov 25): one die in two groups is one die (dice_faces._joined: duplicate peaks seen by
turns, a die pushed after it came to rest, read from its first rest, and a short-lived die that is not
the roll's); two turns decoded from one jump (a dance and the next roll) split their shared window where the
next roll's dice land; and the roller's only fresh die that landed with one fresh die of the other colour
takes that die as its pale partner ('otherColour' in the row). --no-join, --no-split-window and
--no-pale-partner turn them off.

Second opinion (Nov 25 PM, on by default with obj-v11; --no-second turns it off): a roll whose roller has one fresh die gets its second die from
second_die.find (obj-v11 on the die's rest frames: the one die that landed with it); the row carries 'secondDie'.

usage: roll_audit.py [--scan objects-scan-track3] [--faces s1=M ...] [--sessions s1 s4] [--min-score .3] [--json out.json] [-v]
                     [--second obj-v11.pt] [--second-model s1=M ...]
"""
import argparse, collections, json
from pathlib import Path
import numpy as np, torch
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

# faces-v9: faces-v6 with two readers trained on the verified face crops (face_labels.py, face_train.py:
# lean and full crop, touching-dice augmentation), averaged (dice_faces.Ensemble). Every session.
_M = D / 'office-3-backgammon-20261121/models'
FACES = {s: f"{_M / 'faces-v6.pt'},{_M / 'faces-v9-lean.pt'},{_M / 'faces-v9-full.pt'}" for s in H.WORK}


# obj-v11 (objects_rolls.py frames): the second opinion on a roll with one die (second_die.py); not a scan detector
SECOND = D / 'office-3-backgammon-20261121/objects/models/obj-v11.pt'


def key(r): return f'{max(r)}-{min(r)}'


def in_game(A, t):
    """Turns after the game's result (Nov 23: the position played out after the pass) are not published."""
    res = A.get('result') or {}
    return not (res.get('reason') == 'pass' and res.get('frame') is not None and t['resultFrame'] > res['frame'])


def read(net, patches, t, pool='first', nb=None):
    """A track's pooled face log-probs: 'first' its first 20 detections (as dice_evidence.py reads),
    'confident' the 10 of its detections (up to 200) the reader is surest of: a die lying still and
    seen from above reads sharply, a die under a hand or edge-on does not."""
    if nb is not None: patches = {i: df.mask_neighbours(patches[i], nb[i]) for i in t}
    if pool == 'first': return df.read_track(net, patches, t[:20])
    t = t[np.linspace(0, len(t) - 1, min(len(t), 200)).astype(int)]
    with torch.no_grad():
        lp = torch.log_softmax(net(torch.stack([df.prep(patches[i], False) for i in t]).to(df.dev)), 1).cpu().numpy()
    return lp[np.argsort(-lp.max(1))[:10]].mean(0)


def landing(meta, f0, f1, colour, score):
    """When a roll of this colour landed in the window: the first fresh die group's first detection."""
    fresh = [g for g in df.tracks(meta, f0, f1, colour, score) if meta[g, 0].min() > f0 + 25]
    return int(min(meta[g, 0].min() for g in fresh)) if fresh else None


def audit(sessions, scan, faces, min_score=.3, verbose=False, split=True, pool='first', mask=True, join=True, split_window=True, pale_partner=True, second=None):
    """second: {session: detector} for the second opinion (second_die.find) on a roll with one fresh die, or None."""
    rows = []; nets = {}; df.SPLIT_TOUCHING = split; df.JOIN_GROUPS = join
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
        nb = df.neighbour_offsets(meta, H.board_view(s)) if mask else None
        for page, g, p in games:
            A = json.loads(p.read_text())
            prev = start = A['startFrame']; carry = None
            for i, t in enumerate(A['turns']):
                if t.get('cubeOnly') or not t.get('roll') or not in_game(A, t):
                    if not t.get('cubeOnly'): prev = t['resultFrame']
                    continue
                red = 1 if t['player'] == red_side else 0
                start = df.window_start(prev, start, t['resultFrame'])
                if carry is not None and t['resultFrame'] - prev < 25: start = carry
                carry = None; end = t['resultFrame']
                nxt = next((u for u in A['turns'][i + 1:] if not u.get('cubeOnly')), None)
                if split_window and nxt is not None and nxt.get('roll') and nxt['player'] != t['player'] and abs(nxt['resultFrame'] - end) < 25:
                    # two turns decoded from one jump (a dance and the next roll) share a window: this turn's
                    # ends where the next roll's dice land, the next one's starts just before (Nov 21 G9 T46/T47;
                    # 30 frames, so its dice count as fresh)
                    L = landing(meta, start, end, 1 - red, score)
                    if L is not None and L - 5 > start + 25: end = L - 5; carry = max(start, L - 30)
                opening = i == 0 and not A['turns'][0].get('gapBefore') and A['turns'][0]['before']['points'] == OPENING
                if opening: tr = df.tracks(meta, start, end, 0, score)[:1] + df.tracks(meta, start, end, 1, score)[:1]
                else: tr = df.tracks(meta, start, end, red, score)
                pale = None
                if not opening and len(tr) == 1 and pale_partner and meta[tr[0], 0].min() > start + 25:
                    # The roller's only fresh die landed with one fresh die of the other colour: the other
                    # player's roll already lies on the board (it landed before this window), so that die is
                    # this roll's pale die read in the wrong colour (Nov 21 G9 T47: a pale yellow five at the rail).
                    s0 = meta[tr[0], 0].min()
                    other = [g for g in df.tracks(meta, start, end, 1 - red, score) if abs(meta[g, 0].min() - s0) <= 30]
                    if len(other) == 1 and len(other[0]) >= .5 * len(tr[0]): tr = tr + other; pale = 'YR'[1 - red]
                sec = None
                d_first = meta[tr[0], 0].min() if len(tr) == 1 else 0
                fresh1 = len(tr) == 1 and (d_first > start + 25 or not np.any(
                    (meta[:, 0] >= start - 100) & (meta[:, 0] < d_first) & (np.hypot(meta[:, 1] - np.median(meta[tr[0], 1]), meta[:, 2] - np.median(meta[tr[0], 2])) < 12)))
                if second and s in second and not opening and fresh1:
                    # Second opinion (obj-v11): the die that landed with the roller's only fresh die (a pale die at the bar
                    # edge or a rail that the scan never kept)
                    import second_die
                    d0 = [float(np.median(meta[tr[0], 1])), float(np.median(meta[tr[0], 2])), int(meta[tr[0], 0].min()), int(meta[tr[0], 0].max()), len(tr[0])]
                    sec = second_die.find(s, second[s], d0)
                pub = key(t['roll']); cands = t.get('rollCandidates') or [pub]
                row = {'page': page, 'game': g, 'turn': i + 1, 'session': s, 'player': t['player'], 'red': red, 'opening': opening,
                       'resultFrame': t['resultFrame'], 'windowStart': int(start), 'windowEnd': int(end), 'published': pub, 'source': t.get('rollSource'),
                       'candidates': cands, 'dance': bool(t.get('dance')), 'tracks': len(tr), '_tr': tr[:2], 'otherColour': pale}
                before = meta[(meta[:, 0] >= start - 100) & (meta[:, 0] < start - 50) & (meta[:, 4] == red) & (score > .3), 1:3]
                stale = not opening and len(tr) >= 2 and len(before) > 0 and all(
                    np.abs(before - np.median(meta[a, 1:3], 0)).max(1).min() <= 12 for a in tr[:2])
                if stale:  # both dice lay there before the window opened: an earlier roll's dice, this roll unseen
                    row.update(read=None, pick=None, status='stale', dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr[:2]])
                elif len(tr) >= 2:
                    pp = df.pair_prob(read(net, patches, tr[0], pool, nb), read(net, patches, tr[1], pool, nb))
                    best = max(pp, key=pp.get); pick = max(cands, key=lambda c: pp.get(c, -1e9))
                    row.update(read=best, margin=round(pp[best] - pp[pub], 2), pick=pick,
                               status='confirmed' if best == pub else 'disagrees',
                               dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr[:2]])
                elif sec is not None:
                    with torch.no_grad():
                        lp2 = torch.log_softmax(net(torch.stack([df.prep(q, False) for q in sec['patches']]).to(df.dev)), 1).mean(0).cpu().numpy()
                    pp = df.pair_prob(read(net, patches, tr[0], pool, nb), lp2)
                    best = max(pp, key=pp.get); pick = max(cands, key=lambda c: pp.get(c, -1e9))
                    a0 = tr[0]
                    row.update(read=best, margin=round(pp[best] - pp[pub], 2), pick=pick, status='confirmed' if best == pub else 'disagrees',
                               secondDie=[sec['x'], sec['y'], sec['first'], sec['last'], sec['n']],
                               dice=[[float(np.median(meta[a0, 1])), float(np.median(meta[a0, 2])), int(meta[a0, 0].min()), int(meta[a0, 0].max()), len(a0)],
                                     [sec['x'], sec['y'], sec['first'], sec['last'], sec['n']]])
                else:
                    row.update(read=None, pick=None, status='unseen', dice=[[float(np.median(meta[a, 1])), float(np.median(meta[a, 2])), int(meta[a, 0].min()), int(meta[a, 0].max()), len(a)] for a in tr])
                rows.append(row); prev = t['resultFrame']
                if verbose and (row['status'] != 'confirmed' or row.get('secondDie')):
                    print(f"  {page} G{g} T{i + 1} {t['player']} @{t['resultFrame']} pub {pub} ({row['source']}) {row['status']} read {row['read']} margin {row.get('margin')} pick {row['pick']} cands {cands}{' second ' + str(row['secondDie']) if row.get('secondDie') else ''}")
    return rows


OPENING = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2]


def public(rows):
    """Rows without the in-memory fields (the tracks' scan indices, '_tr')."""
    return [{k: v for k, v in r.items() if not k.startswith('_')} for r in rows]


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
    ap = argparse.ArgumentParser(); ap.add_argument('--scan', default='objects-scan-track3')
    ap.add_argument('--faces', nargs='*', default=[], help='SESSION=model')
    ap.add_argument('--sessions', nargs='*', default=list(H.WORK)); ap.add_argument('--min-score', type=float, default=.3)
    ap.add_argument('--json'); ap.add_argument('-v', action='store_true')
    ap.add_argument('--no-split', action='store_true', help='keep two touching dice in one group (dice_faces.split_touching)')
    ap.add_argument('--no-mask', action='store_true', help='read touching dice unmasked (dice_faces.mask_neighbours)')
    ap.add_argument('--no-join', action='store_true', help='keep one die in two groups apart (dice_faces._joined)')
    ap.add_argument('--no-split-window', action='store_true', help='two turns sharing a window read the same window')
    ap.add_argument('--no-pale-partner', action='store_true', help="never take a die of the other colour as the roll's second die")
    ap.add_argument('--pool', default='first', choices=('first', 'confident'), help='which detections of a track are read (read())')
    ap.add_argument('--second', default=str(SECOND), help='second-opinion detector for rolls with one die (second_die.py; obj-v11)')
    ap.add_argument('--no-second', action='store_true', help='no second opinion (the audit before Nov 25 PM)')
    ap.add_argument('--second-model', nargs='*', default=[], help='SESSION=detector: per-session second opinion (honest folds)')
    a = ap.parse_args()
    faces = dict(x.split('=', 1) for x in a.faces)
    second = None
    if a.no_second: a.second = None
    if a.second or a.second_model:
        second = {s: a.second for s in a.sessions if a.second}; second.update(dict(x.split('=', 1) for x in a.second_model))
    rows = audit(a.sessions, a.scan, faces, a.min_score, a.v, not a.no_split, a.pool, not a.no_mask, not a.no_join, not a.no_split_window, not a.no_pale_partner, second)
    summary(rows)
    if a.json: Path(a.json).write_text(json.dumps(public(rows), indent=0))


if __name__ == '__main__':
    main()
