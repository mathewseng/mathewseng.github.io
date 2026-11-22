#!/usr/bin/env python3
"""Turn a decoded timeline into slot training labels, including hand occlusion.

Between a turn's confirmation and the last frame its position was still read,
the true position is known. Clean frames give ordinary labels. Frames with
motion are compared to a clean frame of the same position: slots mostly
covered by the difference mask are labelled occluded.

usage: build_labels.py decode.json obs-dir out.json [--per-interval N]
"""
import argparse, json, random
from pathlib import Path
import cv2, numpy as np
import frames, slots, geometry as g

random.seed(7)


def slot_mask_coverage(mask):
    """Fraction of each slot patch covered by mask -> [24, NSLOT]."""
    cov = np.zeros((24, slots.NSLOT))
    m = mask.astype(np.float32)
    for p in range(1, 25):
        x = g.point_x(p)
        for k in range(slots.NSLOT):
            off = slots.SLOT0 + slots.PITCH * k
            y = g.TOP[0] + off if g.is_top(p) else g.BOTTOM[1] - off
            x1, y1 = int(x - 18), int(y - 18)
            cov[p - 1, k] = m[max(0, y1):y1 + 36, max(0, x1):x1 + 36].mean()
    return cov


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('decode'); ap.add_argument('obs'); ap.add_argument('out')
    ap.add_argument('--per-interval', type=int, default=6)
    a = ap.parse_args()
    dec = json.loads(Path(a.decode).read_text())
    rows = []
    for p in sorted(Path(a.obs).glob('clip-*.json')): rows += json.loads(p.read_text())
    by_f = {r['f']: r for r in rows}
    fs = sorted(by_f)
    intervals = []
    for game in dec['games']:
        turns = game['turns']
        start_pts = [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2]
        seq = [(game['startFrame'], start_pts)] + [(t['frame'], t['after']['points']) for t in turns]
        ends = [t.get('lastBeforeFrame') for t in turns] + [None]
        for (f0, pts), end in zip(seq, ends):
            if end is None or end <= f0: continue
            intervals.append((f0, end, pts))
    entries = []
    for f0, f1, pts in intervals:
        inside = [f for f in fs if f0 <= f <= f1]
        clean = [f for f in inside if by_f[f]['m'] < 0.8 and by_f[f]['pos'] == pts and min(by_f[f]['conf']) > 0.9]
        if not clean: continue
        hands = [f for f in inside if by_f[f]['m'] > 3]
        pick_c = random.sample(clean, min(5, len(clean)))
        pick_h = random.sample(hands, min(a.per_interval, len(hands)))
        for f in pick_c: entries.append({'frame': f, 'points': {str(i + 1): v for i, v in enumerate(pts) if v}})
        refs = clean[::max(1, len(clean) // 7)][:7]
        for f in pick_h: entries.append({'frame': f, 'refs': refs, 'points': {str(i + 1): v for i, v in enumerate(pts) if v}})
    # occlusion masks
    need = sorted({e['frame'] for e in entries} | {r for e in entries for r in e.get('refs', [])})
    imgs = {}; frames_cache = {}
    for n, img in frames.read(need):
        frames_cache[n] = img
        imgs[n] = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2LAB), (7, 7), 0).astype(np.int16)
    out = []
    for e in entries:
        if 'refs' in e:
            ref = np.median(np.stack([imgs[r] for r in e['refs']]), 0).astype(np.int16)
            d = np.abs(imgs[e['frame']] - ref).max(-1)
            raw = cv2.morphologyEx((d > 28).astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
            n, lab, st, _ = cv2.connectedComponentsWithStats(raw)
            mask = np.zeros_like(raw)
            for c in range(1, n):
                x, y, w, h, area = st[c]
                touches = x <= 2 or y <= 2 or x + w >= raw.shape[1] - 2 or y + h >= raw.shape[0] - 2
                if area > 2500 and touches: mask[lab == c] = 1
            mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
            cov = slot_mask_coverage(mask)
            e['occluded'] = (cov > 0.30).astype(int).tolist()
            # Only trust the slots the hand clearly covers; everything else in a hand frame is ignored.
            e['ignore_slots'] = (cov <= 0.30).astype(int).tolist()
            ys, xs = np.nonzero(mask)
            if len(xs):
                cut_dir = Path(a.out).parent / 'hands'; cut_dir.mkdir(exist_ok=True)
                x1, x2, y1, y2 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                bgr = frames_cache[e['frame']][y1:y2, x1:x2]
                rgba = np.dstack([bgr, mask[y1:y2, x1:x2] * 255])
                cv2.imwrite(str(cut_dir / f"hand-{e['frame']}.png"), rgba)
            if not cov.max() > 0.3: e.pop('occluded'); e.pop('ignore_slots')
            e.pop('refs')
        out.append(e)
    Path(a.out).write_text(json.dumps(out))
    print('intervals', len(intervals), 'entries', len(out), 'with occlusion', sum('occluded' in e for e in out))


if __name__ == '__main__':
    main()
