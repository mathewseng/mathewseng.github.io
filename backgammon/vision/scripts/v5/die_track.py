#!/usr/bin/env python3
"""Die identity tracking: each physical die (and the cube) followed through time.

A single frame often cannot tell a pale yellow die from a red one: the yellow dice are translucent,
and a yellow die lying pip face up over the dark felt shows a grey face that the detector and the
crop verifier read as red, while its yellow side, when it shows at all, gives a second, weaker
peak 12-20 px away. The die's colour is plain when it is rolled. Colour from the player on roll
does not work (the previous roller's dice usually lie on the board until that player rolls again),
so each die is followed instead, from the roll until it is picked up.

Every 5th frame the detector's die peaks from 0.1 (both colours, with the detector's yellow and red
scores at the peak and the crop verifier's not-die / yellow / red) and the three best cube peaks are
kept. Peaks within 17 px are one blob (a die's side and pip face); blobs are linked frame to frame
(16 px a step, or 10 px across up to 10 steps when a hand hides the die). A track's colour is the mean
over its frames of the detector's and the verifier's yellow/red log-odds; a track that starts where
another ended (12 px, 6 s) continues it. A track's "roll partners" are the other strong tracks
(peak 0.5+, 5+ steps) that started within 30 frames of it: the other die of the same roll.

Per frame the dice are those of die_verify.refine (the single-frame result), then:
  1. Pair colour: a die whose peak is weak (< 0.5) and whose track colour is unsure (|log-odds| < 4)
     takes the colour of its roll partner when it has exactly one and that one is sure (>= 3). The
     15:57 die at the rail (Nov 24 15:31) landed with a clear yellow die and showed only its face.
     A sure track keeps its colour, so an opening roll (one die of each colour) is left alone.
  2. Track rescue: a peak from 0.15 that no die covers is a die when its track peaked at 0.45 or
     more, its median is 0.2 or more, it lasted 10 steps and the verifier called it a die (not-die
     under 0.2) at least once: a die seen clearly at times stays a die while its peak fades.
  3. Roll-partner rescue: a peak from 0.1 on a still track (20+ steps, peak 0.25+, verifier not-die
     under 0.3 at least once) that started within 25 frames of exactly one strong die track (0.9+) is
     that roll's other die (a pale die on a cream point, a die at the rail).
  3b. Opening-roll partner: the same for a still track the verifier never called a die (not-die under 0.5
     once) when its one strong partner is of the other colour and 30+ px away: the opening roll, one die of
     each colour (Nov 24 game 3's pale red die at the rail; a red peak landing with one yellow die mid-game
     is that die's own side, within 30 px).
  4. Pale face: a red die with a yellow peak of 0.35 or more, or a yellow die kept above, within 22 px
     is the pip face of a pale yellow die (red dice show no yellow side: no red die in either test set
     has a yellow peak of 0.35 within 20 px, while yellow dice often have a red one).
  5. The dice are merged again (objects.merge_dice: a die's two peaks now share a colour), except two
     same-colour peaks 13+ px apart that both scored 0.75+ in half the frames within 10 steps: two
     touching dice.
  6. At most two dice of each colour (there are two): a third is dropped, the weakest track first (a
     fingertip, a dark checker's emblem next to a fresh roll).
The cube: a peak of 0.5 or more stands; otherwise the cube peaks from 0.08 within 10 s either side
are summed per place (20 px) and the strongest place is taken (the current peak if it holds half as
much): the cube in the holder of the 15:31 view peaks at 0.12-0.18 and sometimes not at all.

usage: die_track.py testcache OBJ VER OUT.pkl [--back 3000] [--fwd 750]   ([BG_TEST_SET=new]: test windows)
       die_track.py scan OBJ VER [--out objects-scan-track] [--cube-out cube-scan-track.json] [--frames A B] [--raw R.pkl]
  testcache keeps the raw peaks every 5th frame from 120 s before to 30 s after each held-out test frame
  (testset_eval.py --track reads it). scan does the same for a recording (BG_WORK_DIR) and writes the
  tracked dice in objects_scan.py's format (meta, 40x40 patches, die-score.npy) and the cube per frame.
"""
import argparse, collections, math, pickle, time
import numpy as np, torch
import objects as ob, die_verify as dv

STEP = 5         # frames between samples
LOW = .1         # die peaks kept from this score
BLOB = 17        # px: peaks of one die
LINK, STILL, GAP = 16, 10, 10  # px per step, px across a gap, steps of gap
PRED_GAP, PRED_PX = 150, 12    # a track continuing one that ended here this many frames before
PARTNER_WIN = 30
OPEN_VN, OPEN_FAR = .5, 30   # rule 3b: verifier not-die below this once; px from its partner


# ---------------------------------------------------------------- raw peaks per frame
@torch.no_grad()
def frame_rows(net, ver, ims):
    """Reader-view images -> per image {'dice': [(class, x, y, score, pY, pR, vN, vY, vR)], 'cube': [(x, y, score)] x3}."""
    x = torch.stack([ob.to_tensor(im) for im in ims]).to(ob.dev)
    logits = net(x); p = torch.sigmoid(logits).cpu().numpy(); det = ob.peaks(logits, LOW)
    out = []
    for im, rows, pp in zip(ims, det, p):
        dice = [r for r in rows if r[0] < 2 and ob.on_board(r[1], r[2])]
        vp = dv.probs(ver, im, dice); drows = []
        for r, v in zip(dice, vp):
            cy, cx = int((r[2] - 2) / 4 + .5), int((r[1] - 2) / 4 + .5)
            win = pp[:2, max(0, cy - 1):cy + 2, max(0, cx - 1):cx + 2].reshape(2, -1).max(1)
            drows.append((r[0], round(r[1], 1), round(r[2], 1), round(r[3], 3), round(float(win[0]), 3), round(float(win[1]), 3),
                          round(float(v[0]), 3), round(float(v[1]), 3), round(float(v[2]), 3)))
        cubes = sorted([r for r in rows if r[0] == 2], key=lambda r: -r[3])[:3]
        out.append({'dice': drows, 'cube': [(round(r[1], 1), round(r[2], 1), round(r[3], 3)) for r in cubes]})
    return out


def raw_frames(net, ver, images, batch=16):
    """images: iterable of (frame, reader-view image) -> {frame: rows}."""
    res = {}; buf = []
    def flush():
        for (n, _), r in zip(buf, frame_rows(net, ver, [im for _, im in buf])): res[n] = r
        buf.clear()
    for n, im in images:
        buf.append((n, im))
        if len(buf) == batch: flush()
    if buf: flush()
    return res


# ---------------------------------------------------------------- tracking
def refine_rows(rows, thresh=.35, veto=.9, rescue=.9, low=.15):
    """die_verify.refine on raw rows (the single-frame dice)."""
    out = []
    for r in rows:
        if r[0] >= 2 or r[3] < low: continue
        if r[3] >= thresh:
            if r[6] < veto: out.append((r[0], r[1], r[2], r[3]))
        elif 1 - r[6] >= rescue: out.append((int(r[8] > r[7]), r[1], r[2], thresh))
    return ob.merge_dice(out, thresh)


def blobs(rows):
    rows = sorted([q for q in rows if q[0] < 2 and q[3] >= LOW], key=lambda q: -q[3]); out = []
    for q in rows:
        b = next((b for b in out if math.hypot(b['x'] - q[1], b['y'] - q[2]) < BLOB), None)
        if b is None:
            out.append({'x': q[1], 'y': q[2], 's': q[3], 'dy': q[4], 'dr': q[5], 'vy': q[7], 'vr': q[8], 'vn': q[6], 'rows': [q]})
        else:
            b['dy'] = max(b['dy'], q[4]); b['dr'] = max(b['dr'], q[5]); b['vy'] = max(b['vy'], q[7]); b['vr'] = max(b['vr'], q[8])
            b['vn'] = min(b['vn'], q[6]); b['rows'].append(q)
    for b in out:
        w = sum(q[3] for q in b['rows']); b['x'] = sum(q[1] * q[3] for q in b['rows']) / w; b['y'] = sum(q[2] * q[3] for q in b['rows']) / w
    return out


def colour_lo(b):
    """Yellow-against-red log-odds of one blob in one frame (detector plus verifier, each capped at 4)."""
    e = 1e-3
    return max(-4, min(4, math.log((b['dy'] + e) / (b['dr'] + e)))) + max(-4, min(4, math.log((b['vy'] + e) / (b['vr'] + e))))


class Tracker:
    """Tracks over one recording's raw frames {frame: {'dice': rows, 'cube': peaks}} (every STEP frames)."""

    def __init__(self, frames):
        self.F = frames; self.T = []; self.blobs = {}
        live = []; prev = None
        for f in sorted(frames):
            if prev is not None and f - prev > 10 * STEP: live = []
            bl = blobs(frames[f]['dice']); self.blobs[f] = bl; cand = []
            for bi, b in enumerate(bl):
                for t in live:
                    lf, lb = self.T[t][-1]; steps = (f - lf) / STEP; d = math.hypot(lb['x'] - b['x'], lb['y'] - b['y'])
                    if (steps <= 1.01 and d <= LINK) or (steps <= GAP and d <= STILL): cand.append((d, bi, t))
            ub, ut = set(), set()
            for d, bi, t in sorted(cand):
                if bi in ub or t in ut: continue
                ub.add(bi); ut.add(t); self.T[t].append((f, bl[bi])); bl[bi]['t'] = t
            for bi, b in enumerate(bl):
                if bi not in ub: self.T.append([(f, b)]); b['t'] = len(self.T) - 1; live.append(b['t'])
            live = [t for t in live if (f - self.T[t][-1][0]) / STEP <= GAP]; prev = f
        self.info = []
        for t in self.T:
            lo = [colour_lo(b) for _, b in t]; ss = sorted(b['s'] for _, b in t)
            self.info.append({'start': t[0][0], 'end': t[-1][0], 'n': len(t), 'smax': ss[-1], 'smed': ss[len(ss) // 2],
                              'vnmin': min(b['vn'] for _, b in t), 'O': sum(lo) / len(lo), 'Osum': sum(lo),
                              'x': t[0][1]['x'], 'y': t[0][1]['y'], 'xe': t[-1][1]['x'], 'ye': t[-1][1]['y'], 'pred': None})
        order = sorted(range(len(self.T)), key=lambda i: self.info[i]['end'])
        for t in self.info:
            for j in order:
                u = self.info[j]
                if u['end'] >= t['start']: break
                if t['start'] - u['end'] <= PRED_GAP and math.hypot(u['xe'] - t['x'], u['ye'] - t['y']) <= PRED_PX and u['smax'] >= .35: t['pred'] = j

    def chain_O(self, i, depth=10):
        tot = n = 0
        while i is not None and depth: tot += self.info[i]['Osum']; n += self.info[i]['n']; i = self.info[i]['pred']; depth -= 1
        return tot / max(n, 1)

    def chain_start(self, i, depth=10):
        while self.info[i]['pred'] is not None and depth: i = self.info[i]['pred']; depth -= 1
        return i

    def partners(self, i, win=PARTNER_WIN, smin=.5, nmin=5):
        r = self.chain_start(i); st = self.info[r]['start']
        return [j for j, u in enumerate(self.info) if j != r and u['smax'] >= smin and u['n'] >= nmin and abs(u['start'] - st) <= win and u['pred'] is None]

    def _blob(self, f, x, y):
        bl = [b for b in self.blobs[f] if math.hypot(b['x'] - x, b['y'] - y) < BLOB]
        return min(bl, key=lambda b: math.hypot(b['x'] - x, b['y'] - y)) if bl else None

    def dice(self, f):
        """Tracked dice at a sampled frame: [(class, x, y, score)] in the readers' view."""
        rows = self.F[f]['dice']; out = []
        for d in refine_rows(rows):  # 1. pair colour
            b = self._blob(f, d[1], d[2])
            out.append(self._pair(d, b) if b is not None else d)
        for b in self.blobs[f]:  # 2. track rescue
            if any(math.hypot(b['x'] - d[1], b['y'] - d[2]) < BLOB for d in out): continue
            t = self.info[b['t']]
            if b['s'] >= .15 and t['smax'] >= .45 and t['smed'] >= .2 and t['n'] >= 10 and t['vnmin'] < .2:
                q = max(b['rows'], key=lambda q: q[3]); out.append(self._pair((int(self.chain_O(b['t']) < 0), q[1], q[2], b['s']), b))
        for b in self.blobs[f]:  # 3. roll-partner rescue
            if any(math.hypot(b['x'] - d[1], b['y'] - d[2]) < BLOB for d in out): continue
            i = b['t']; t = self.info[i]
            if b['s'] < LOW or t['n'] < 20 or t['smax'] < .25 or t['vnmin'] >= .3: continue
            st = self.info[self.chain_start(i)]['start']
            P = [j for j, u in enumerate(self.info) if j != i and abs(u['start'] - st) <= 25 and u['smax'] >= .9 and u['n'] >= 20]
            if len(P) == 1:
                q = max(b['rows'], key=lambda q: q[3]); out.append((int(self.chain_O(i) < 0), q[1], q[2], b['s']))
        for b in self.blobs[f]:  # 3b. opening-roll partner
            if any(math.hypot(b['x'] - d[1], b['y'] - d[2]) < BLOB for d in out): continue
            i = b['t']; t = self.info[i]
            if b['s'] < LOW or t['n'] < 20 or t['smax'] < .25 or t['vnmin'] >= OPEN_VN: continue
            st = self.info[self.chain_start(i)]['start']
            P = [j for j, u in enumerate(self.info) if j != i and abs(u['start'] - st) <= 25 and u['smax'] >= .9 and u['n'] >= 20]
            c = int(self.chain_O(i) < 0)
            if len(P) == 1 and int(self.info[P[0]]['O'] < 0) != c and math.hypot(self.info[P[0]]['x'] - t['x'], self.info[P[0]]['y'] - t['y']) >= OPEN_FAR:
                q = max(b['rows'], key=lambda q: q[3]); out.append((c, q[1], q[2], b['s']))
        ys = [r for r in rows if r[0] == 0 and r[3] >= .35] + [d for d in out if d[0] == 0]  # 4. pale face
        out = [((0,) + tuple(d[1:])) if d[0] == 1 and any(3 < math.hypot(r[1] - d[1], r[2] - d[2]) <= 22 for r in ys) else d for d in out]
        return self._cap(self._merge(out, f), f)  # 5., 6.

    def _cap(self, out, f):
        """Rule 6: there are two dice of each colour; a third is the weakest track's (a fingertip, an emblem)."""
        keep = []
        for c in (0, 1):
            mine = [d for d in out if d[0] == c]
            if len(mine) > 2:
                def strength(d):
                    b = self._blob(f, d[1], d[2]); return self.info[b['t']]['smax'] if b is not None else d[3]
                mine = sorted(mine, key=strength, reverse=True)[:2]
            keep += mine
        return keep

    def _pair(self, d, b):
        """Rule 1: a weak die with an unsure track takes the colour of its one sure roll partner."""
        if d[3] >= .5: return d
        O = self.chain_O(b['t']); P = self.partners(b['t'])
        if abs(O) < 4 and len(P) == 1 and abs(self.info[P[0]]['O']) >= 3: return (int(self.info[P[0]]['O'] < 0),) + tuple(d[1:])
        return d

    def _merge(self, out, f, W=10, smin=.75, frac=.5, dmin=13, near=5):
        kept = ob.merge_dice(out, 0)
        for d in out:
            if d in kept: continue
            nb = [k for k in kept if k[0] == d[0] and math.hypot(k[1] - d[1], k[2] - d[2]) < 24]
            if len(nb) != 1 or math.hypot(nb[0][1] - d[1], nb[0][2] - d[2]) < dmin: continue
            k = nb[0]; hit = tot = 0
            for g in range(f - STEP * W, f + STEP * W + 1, STEP):
                if g not in self.F: continue
                tot += 1; rr = [r for r in self.F[g]['dice'] if r[0] == d[0] and r[3] >= smin]
                if any(math.hypot(r[1] - d[1], r[2] - d[2]) < near for r in rr) and any(math.hypot(r[1] - k[1], r[2] - k[2]) < near for r in rr): hit += 1
            if tot and hit >= frac * tot: kept.append(d)
        return kept

    def cube(self, f, thresh, W=250, low=.08, keep=.5, px=20):
        """(x, y, score) of the cube at frame f in the readers' view, or None."""
        c = self.F[f]['cube']
        if c and c[0][2] >= keep: return c[0]
        places = []  # [x, y, total, n]
        for g in range(f - W, f + W + 1, STEP):
            for x, y, s in self.F.get(g, {'cube': []})['cube']:
                if s < low: continue
                p = next((p for p in places if math.hypot(p[0] - x, p[1] - y) < px), None)
                if p is None: places.append([x, y, s, 1])
                else: p[2] += s; p[3] += 1
        if not places: return c[0] if c and c[0][2] >= thresh else None
        best = max(places, key=lambda p: p[2])
        if c and c[0][2] >= thresh:
            mine = next((p for p in places if math.hypot(p[0] - c[0][0], p[1] - c[0][1]) < px), None)
            if mine is not None and mine[2] >= .5 * best[2]: return c[0]
        return (best[0], best[1], max(thresh, best[2] / max(best[3], 1)))


# ---------------------------------------------------------------- CLI
def testcache(a):
    import heldout as H
    from testset_build import read, offsets
    from testset_sheet import load_test
    from session import reader_view
    net = ob.load(a.obj); ver = dv.load(a.ver); items, _ = load_test(); want = {}
    for it in items:
        s, f = it['key'].split(':'); f = int(f)
        want.setdefault(s, set()).update(range(max(0, f - a.back), f + a.fwd + 1, STEP))
    out = {}; t0 = time.time()
    for s, nums in sorted(want.items()):
        view = H.board_view(s); last = int(offsets(s)[-1])
        out[s] = raw_frames(net, ver, ((n, reader_view(im, view)) for n, im in read(s, sorted(n for n in nums if n < last))))
        print(s, len(out[s]), f'{time.time() - t0:.0f}s', flush=True)
    pickle.dump(out, open(a.out, 'wb'))


def scan(a):
    import dice, frames as fr
    from session import WORK, board_view, reader_view, reader_xy
    net = ob.load(a.obj); ver = dv.load(a.ver); view = board_view(); total = fr.total()
    f0, f1 = (a.frames if a.frames else (0, total))
    nums = list(range(f0 - f0 % STEP, min(f1, total), STEP)); t0 = time.time()
    if a.raw:  # the raw peaks of an earlier scan with the same models
        raw = pickle.load(open(a.raw, 'rb')); nums = [n for n in nums if n in raw]
    else:
        raw = raw_frames(net, ver, ((n, reader_view(im, view)) for n, im in fr.read(nums)))
        print('raw', len(raw), f'{time.time() - t0:.0f}s', flush=True)
        pickle.dump(raw, open(WORK / (a.out + '.raw.pkl'), 'wb'))
    tr = Tracker(raw); out = WORK / a.out; out.mkdir(exist_ok=True)
    dice_at = {n: tr.dice(n) for n in nums}; cube_rows = []
    offs = fr.offsets(); scores = []
    for clip in range(len(offs) - 1):
        want = [n for n in nums if offs[clip] <= n < offs[clip + 1]]
        meta, patches = [], []
        if want:
            for n, im in fr.read(want):
                im = reader_view(im, view); h, w = im.shape[:2]
                for c, x, y, s in dice_at[n]:
                    px, py = reader_xy(x, y, w, h, view); meta.append([n, px, py, s, c]); patches.append(dice.patch(im, x, y, 40))
                cb = tr.cube(n, .15)
                if cb: cx, cy = reader_xy(cb[0], cb[1], w, h, view); cube_rows.append([n, round(cb[2], 3), round(cx, 1), round(cy, 1)])
                else: cube_rows.append([n, 0.0, 0, 0])
        m = np.array(meta, np.float32).reshape(-1, 5)
        np.savez_compressed(out / f'clip-{clip:03d}.npz', meta=m, patches=np.array(patches, np.uint8).reshape(-1, 40, 40, 3))
        scores.append(m[:, 3]); print(clip, len(m), flush=True)
    np.save(out / 'die-score.npy', np.concatenate(scores))
    import json
    (WORK / a.cube_out).write_text(json.dumps(cube_rows))


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('testcache'); p.add_argument('obj'); p.add_argument('ver'); p.add_argument('out')
    p.add_argument('--back', type=int, default=3000); p.add_argument('--fwd', type=int, default=750)
    p = sub.add_parser('scan'); p.add_argument('obj'); p.add_argument('ver'); p.add_argument('--out', default='objects-scan-track')
    p.add_argument('--cube-out', default='cube-scan-track.json'); p.add_argument('--frames', type=int, nargs=2)
    p.add_argument('--raw', help='reuse the raw peaks (OUT.raw.pkl) of an earlier scan')
    a = ap.parse_args()
    {'testcache': testcache, 'scan': scan}[a.cmd](a)


if __name__ == '__main__':
    main()
