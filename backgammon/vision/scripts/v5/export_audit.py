#!/usr/bin/env python3
"""Frame-level detections for the page's Vision overlay (board-only, gzip JSON).

The overlay draws in a 560x420 board space placed over the video's board at
928x696, so canonical 800x590 coordinates are scaled to that space.
Each frame: [checkers [[x, y, side, 0, 0]], dice [[x, y, face, '', score, size]],
cube [x, y, face, score, size] | null, hands [], stacks [[point, side, count]]]

Dice and cube come from the detector scan (objects_scan.py). A die's face is the
game's roll for that turn, assigned to the two dice by the face reader; a die
outside a known roll shows the reader's own answer when it is confident. The
cube shows the face the game state implies (64 in the middle, the offered or
owned value otherwise).

usage: export_audit.py <obs-dir> <analysis-dir> <render-dir> <page-dir> <faces.pt> <game...>
"""
import collections, gzip, json, sys
from pathlib import Path
import numpy as np, torch
import geometry as g, slots
import dice_faces as df, frames
from session import WORK, red_player, board_view, display_x

SX, SY = 560 / 800, 420 / 590
DIE_BOX, CUBE_BOX = round(26 * SX, 1), round(48 * SX, 1)
# The detector centres on a die's coloured side face; the whole die (pip face
# included, about 10 px to the left from this camera) is centred 5 px left of it.
DIE_DX = -5
SIDE = {'white': 0, 'dark': 1}


def load_scan(first, last):
    """Detector rows and patches for the clips overlapping [first, last]."""
    offs = frames.offsets(); metas, patches = [], []
    for c in range(len(offs) - 1):
        if offs[c + 1] <= first or offs[c] > last: continue
        z = np.load(WORK / 'objects-scan' / f'clip-{c:03d}.npz'); metas.append(z['meta']); patches.append(z['patches'])
    return np.concatenate(metas), np.concatenate(patches)


@torch.no_grad()
def face_logprobs(net, patches):
    out = []
    for s in range(0, len(patches), 512):
        x = torch.stack([df.prep(p, False) for p in patches[s:s + 512]]).to(df.dev)
        out.append(torch.log_softmax(net(x), 1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 6))


def roll_windows(A):
    """Per colour: [(start, roll or None)] sorted; a colour's dice belong to its latest roll."""
    win = {0: [], 1: []}
    for t in A['turns']:
        if t.get('cubeOnly'): continue
        start = t.get('rollFrame') or (t.get('fromFrame') or t['resultFrame']) - 50
        known = t.get('roll') if t.get('rollSource') in ('move', 'dice', 'reviewed') or t.get('dance') and t.get('roll') else None
        win[1 if t['player'] == red_player() else 0].append((start, known))
    for c in win: win[c].sort(key=lambda w: w[0])
    return win


def assign_faces(meta, lp, win, first, last):
    """Face value and confidence for every detector row in the game."""
    face = np.zeros(len(meta), int); conf = np.zeros(len(meta))
    for c in (0, 1):
        starts = [w[0] for w in win[c]]
        rows = np.nonzero((meta[:, 4] == c) & (meta[:, 0] >= first) & (meta[:, 0] <= last))[0]
        which = np.searchsorted(starts, meta[rows, 0], side='right') - 1
        for wi in np.unique(which):
            idx = rows[which == wi]
            roll = win[c][wi][1] if wi >= 0 else None
            # tracks: detections that stay within a 10 px cell neighbourhood
            cells = collections.defaultdict(list)
            for i in idx: cells[(int(meta[i, 1] // 10), int(meta[i, 2] // 10))].append(i)
            groups = []
            for key, ix in sorted(cells.items(), key=lambda kv: -len(kv[1])):
                for gr in groups:
                    if abs(gr['key'][0] - key[0]) <= 1 and abs(gr['key'][1] - key[1]) <= 1: gr['idx'] += ix; break
                else: groups.append({'key': key, 'idx': list(ix)})
            groups.sort(key=lambda gr: -len(gr['idx']))
            pooled = [lp[gr['idx']].mean(0) for gr in groups]
            if roll:
                a, b = roll
                if len(groups) >= 2 and a != b:
                    p0, p1 = pooled[0], pooled[1]
                    first_a = p0[a - 1] + p1[b - 1] >= p0[b - 1] + p1[a - 1]
                    vals = [a, b] if first_a else [b, a]
                else: vals = []
                for k, gr in enumerate(groups):
                    v = vals[k] if k < len(vals) else (a if a == b or pooled[k][a - 1] >= pooled[k][b - 1] else b)
                    face[gr['idx']] = v; conf[gr['idx']] = 1.0
            else:
                for k, gr in enumerate(groups):
                    p = np.exp(pooled[k]); v = int(p.argmax()) + 1
                    if p.max() >= .8: face[gr['idx']] = v; conf[gr['idx']] = p.max()
    return face, conf


def cube_timeline(A):
    """[(frame, face)] changes: 64 in the middle, the offered value during an offer, the value once owned."""
    out = [(A['startFrame'], 64)]; value = 1
    for t in A['turns']:
        ca = t.get('cubeAction')
        if not ca: continue
        out.append((ca['offerFrame'], value * 2))
        if ca.get('reply') == 'take' and ca.get('replyFrame'): value *= 2; out.append((ca['replyFrame'], value))
        elif ca.get('reply') == 'pass' and ca.get('replyFrame'): out.append((ca['replyFrame'], value if value > 1 else 64))
    return out


def main():
    obs_dir, an_dir, render_dir, page = map(Path, sys.argv[1:5])
    view = board_view(); X = lambda x: display_x(x, view)
    # the camera puts a die's pip face on its left: right on the canonical board when it is turned
    die_dx = -DIE_DX if view == 'turned' else DIE_DX
    net = df.FaceNet(); net.load_state_dict(torch.load(sys.argv[5], map_location='cpu')); net.eval().to(df.dev)
    rows = {}
    for p in sorted(obs_dir.glob('clip-*.json')):
        for r in json.loads(p.read_text()): rows[r['f']] = r
    keys = np.array(sorted(rows))
    cube = json.loads((WORK / 'cube-scan.json').read_text()); cube_f = np.array([c[0] for c in cube])
    (page / 'audit').mkdir(parents=True, exist_ok=True)
    for gnum in map(int, sys.argv[6:]):
        A = json.loads((an_dir / f'game-{gnum:02d}.json').read_text())
        rng = json.loads((render_dir / f'game-{gnum:02d}.range.json').read_text())
        first, last = rng['first'], rng['first'] + rng['frames']
        meta, patches = load_scan(first, last)
        lp = face_logprobs(net, patches)
        face, conf = assign_faces(meta, lp, roll_windows(A), first, last)
        by_frame = collections.defaultdict(list)
        for i in np.nonzero((meta[:, 3] >= .4) & (meta[:, 0] >= first) & (meta[:, 0] <= last))[0]: by_frame[int(meta[i, 0])].append(i)
        dkeys = np.array(sorted(by_frame)) if by_frame else np.zeros(0, int)
        ctl = cube_timeline(A); cstarts = [c[0] for c in ctl]
        out = []
        for vf in range(rng['frames']):
            f = first + vf
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
                    checkers.append([round(X(g.point_x(p)) * SX, 1), round(y * SY, 1), side, 0, 0])
                if abs(v) >= 5: stacks.append([p, side, abs(v)])
            dice = []
            j = np.searchsorted(dkeys, f, side='right') - 1
            if j >= 0 and f - dkeys[j] < 5:
                kept = []  # one box per die: a die can give two peaks a few pixels apart
                for i in sorted(by_frame[int(dkeys[j])], key=lambda i: -meta[i, 3]):
                    if not any(meta[k, 4] == meta[i, 4] and np.hypot(*(meta[k, 1:3] - meta[i, 1:3])) < 14 for k in kept): kept.append(i)
                for i in kept:
                    dice.append([round((X(float(meta[i, 1])) + die_dx) * SX, 1), round(float(meta[i, 2]) * SY, 1), int(face[i]),
                                 'yellow die' if meta[i, 4] == 0 else 'red die', int(round(float(meta[i, 3]) * 100)), DIE_BOX])
            cb = None
            ci = np.searchsorted(cube_f, f, side='right') - 1
            if ci >= 0 and f - cube_f[ci] < 5 and cube[ci][1] >= .5:
                c = cube[ci]; fc = ctl[max(0, np.searchsorted(cstarts, f, side='right') - 1)][1]
                cb = [round(X(c[2]) * SX, 1), round(c[3] * SY, 1), fc, int(round(c[1] * 100)), CUBE_BOX]
            out.append([checkers, dice, cb, [], stacks])
        with gzip.open(page / 'audit' / f'game-{gnum:02d}.json.gz', 'wt', compresslevel=9) as fh:
            json.dump({'fps': 25, 'frames': out}, fh, separators=(',', ':'))
        print(gnum, len(out), (page / 'audit' / f'game-{gnum:02d}.json.gz').stat().st_size, 'dice rows', len(by_frame))


if __name__ == '__main__':
    main()
