#!/usr/bin/env python3
"""Hard dice for the detector: weak peaks that stay put (a die lies still for seconds).

Every STEP-th rectified frame of every session outside the held-out blocks (heldout.py) is read
in the readers' view. Die peaks scoring LOW..0.5 with no strong peak within 12 px, and places where
a yellow and a red peak meet, are grouped by place over time; a place seen in at least three frames
within 10 s becomes one review item (its middle frame). Writes OUT/frames.npz (keys, jpegs: the
items' frames) and OUT/items.json ([key, x, y, caption]) for objects_grid.py-style review.

usage: objects_hard.py MODEL OUT_DIR [--step 25] [--low 0.15]
"""
import argparse, collections, json
from pathlib import Path
import av, cv2, numpy as np, torch
import heldout as H, objects as ob
from session import reader_view


def offsets(work):
    return np.concatenate([[0], np.cumsum(json.loads((work / 'clip-frames.json').read_text()))]).astype(int)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('model'); ap.add_argument('out')
    ap.add_argument('--step', type=int, default=25); ap.add_argument('--low', type=float, default=.15)
    a = ap.parse_args()
    net = ob.load(a.model); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    items, jpegs, keys = [], [], []
    for s, work in H.WORK.items():
        view = H.board_view(s); off = offsets(work); st = H.settings(s)
        weak = []  # (frame, x, y, class, score)
        frames_seen = {}
        batch, nums = [], []

        def flush():
            with torch.no_grad():
                det = ob.peaks(net(torch.stack([ob.to_tensor(im) for im in batch]).to(ob.dev)), a.low)
            for n, rows in zip(nums, det):
                dice = [r for r in rows if r[0] < 2]
                strong = [r for r in dice if r[3] >= .5]
                for c, x, y, sc in dice:
                    if sc >= .5: continue
                    if any(abs(x - r[1]) < 12 and abs(y - r[2]) < 12 for r in strong): continue
                    weak.append((n, x, y, c, sc))
                for c, x, y, sc in strong:  # a strong peak with a rival colour peak on the same die
                    if any(r[0] != c and r[3] >= .2 and abs(x - r[1]) < 9 and abs(y - r[2]) < 9 for r in dice):
                        weak.append((n, x, y, c, -sc))
            batch.clear(); nums.clear()

        for clip in range(len(off) - 1):
            base = int(off[clip])
            with av.open(str(work / 'rect' / f'clip-{clip:03d}.mp4')) as box:
                for i, f in enumerate(box.decode(video=0)):
                    n = base + i
                    if i % a.step or H.held(s, n) or n < st.get('startFrame', 0) or n > st.get('endFrame', 1e9): continue
                    batch.append(reader_view(f.to_ndarray(format='bgr24'), view)); nums.append(n)
                    if len(batch) == 16: flush()
            if batch: flush()
        # group by place and time: one item when a place has its third weak peak within 10 s
        weak.sort(); active = []
        for w in weak:
            active = [g for g in active if w[0] - g[-1][0] <= 250]
            for g in active:
                if abs(w[1] - g[-1][1]) < 10 and abs(w[2] - g[-1][2]) < 10:
                    g.append(w)
                    if len(g) == 3:
                        m = g[1]
                        items.append([f'{s}:{m[0]}', round(m[1], 1), round(m[2], 1), f"{'R' if m[3] else 'Y'}{abs(m[4]):.2f}{'x' if m[4] < 0 else ''}"])
                    break
            else: active.append([w])
        print(s, 'weak peaks', len(weak), 'items', sum(1 for it in items if it[0].startswith(s + ':')), flush=True)
    want = collections.defaultdict(set)
    for it in items: want[it[0].split(':')[0]].add(int(it[0].split(':')[1]))
    for s, nums in want.items():
        work = H.WORK[s]; view = H.board_view(s); off = offsets(work)
        by = collections.defaultdict(dict)
        for n in nums:
            c = int(np.searchsorted(off, n, side='right') - 1); by[c][n - off[c]] = n
        for c, w in sorted(by.items()):
            last = max(w)
            with av.open(str(work / 'rect' / f'clip-{c:03d}.mp4')) as box:
                for i, f in enumerate(box.decode(video=0)):
                    if i in w:
                        keys.append(f'{s}:{w[i]}')
                        jpegs.append(cv2.imencode('.jpg', reader_view(f.to_ndarray(format='bgr24'), view), [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes())
                    if i >= last: break
    arr = np.empty(len(jpegs), object); arr[:] = jpegs
    np.savez(out / 'frames.npz', keys=np.array(keys), jpegs=arr)
    (out / 'items.json').write_text(json.dumps([it[:4] for it in items]))
    print('items', len(items), 'frames', len(keys))


if __name__ == '__main__':
    main()
