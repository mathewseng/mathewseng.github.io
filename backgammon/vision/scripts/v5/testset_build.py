#!/usr/bin/env python3
"""Pick and store the held-out test frames (heldout.BLOCKS) for the object accuracy test.

Two kinds of frame per block:
  uniform  every STEP frames (any state: hands, rolling, quiet), and
  turn     each turn's dice about 1.6 s after they first show (settled dice, mostly before the move).
Frames within 25 of a detector training frame are moved by 30 frames. Frames are stored losslessly
(PNG) in the readers' view (heldout.board_view turned back), as the scans read them.

Writes TEST_DIR/frames.npz (keys, png) and TEST_DIR/items.json. usage: [BG_TEST_SET=new] testset_build.py
"""
import json
import av, cv2, numpy as np
import heldout as H
import objects as ob
from session import reader_view

STEP = {'s1': 500, 's3': 375, 's4': 125, 's5': 375}


def offsets(s):
    counts = json.loads((H.WORK[s] / 'clip-frames.json').read_text())
    return np.concatenate([[0], np.cumsum(counts)]).astype(int)


def read(s, numbers):
    o = offsets(s); by = {}
    for n in sorted(numbers):
        c = int(np.searchsorted(o, n, side='right') - 1); by.setdefault(c, {})[n - o[c]] = n
    for c, want in sorted(by.items()):
        last = max(want)
        with av.open(str(H.WORK[s] / 'rect' / f'clip-{c:03d}.mp4')) as box:
            for i, f in enumerate(box.decode(video=0)):
                if i in want: yield want[i], f.to_ndarray(format='bgr24')
                if i >= last: break


def main_new():
    """BG_TEST_SET=new: the Nov 24 15:31 recording (s6), which no model was trained on. Frames every
    15 s from the first orange-board reading to the end of play (session.json "testFrames": [a, b])."""
    s = 's6'; a, b = H.settings(s)['testFrames']
    items = [{'key': f'{s}:{n}', 'session': s, 'kind': 'uniform', 'block': 'Nov 24 15:31'} for n in range(a, b, 375)]
    view = H.board_view(s); pngs = {}
    for n, im in read(s, [int(it['key'].split(':')[1]) for it in items]):
        pngs[f'{s}:{n}'] = cv2.imencode('.png', reader_view(im, view))[1].tobytes()
    items = [it for it in items if it['key'] in pngs]
    H.TEST_DIR.mkdir(parents=True, exist_ok=True)
    arr = np.empty(len(items), object); arr[:] = [pngs[it['key']] for it in items]
    np.savez(H.TEST_DIR / 'frames.npz', keys=np.array([it['key'] for it in items]), png=arr)
    (H.TEST_DIR / 'items.json').write_text(json.dumps(items, indent=1))
    print(len(items), 'frames')


def main():
    if H.TEST_SET == 'new': return main_new()
    train = {}
    for k in ob.load_frames()[0]:
        s, f = k.split(':'); train.setdefault(s, []).append(int(f))
    items = []
    for s, a, b, an, label in H.BLOCKS:
        tr = np.array(sorted(train.get(s, [])))
        def free(n):
            for _ in range(4):
                if not len(tr) or np.abs(tr - n).min() > 25: return n
                n += 30
            return n
        A = json.loads(an.read_text()); end = min(b, A['endFrame'])
        for n in range(a + 62, end, STEP[s]):
            items.append({'key': f'{s}:{free(n)}', 'session': s, 'kind': 'uniform', 'block': label})
        for i, t in enumerate(A['turns']):
            if t.get('cubeOnly') or not t.get('rollFrame') or not (a <= t['resultFrame'] <= b): continue
            n = min(t['rollFrame'] + 40, t['resultFrame'] - 10)
            items.append({'key': f'{s}:{free(n)}', 'session': s, 'kind': 'turn', 'block': label, 'turn': i,
                          'player': t['player'], 'roll': t['roll'], 'rollSource': t['rollSource']})
    seen = set(); items = [it for it in items if not (it['key'] in seen or seen.add(it['key']))]
    pngs = {}
    for s in sorted({it['session'] for it in items}):
        view = H.board_view(s)
        want = [int(it['key'].split(':')[1]) for it in items if it['session'] == s]
        for n, im in read(s, want):
            pngs[f'{s}:{n}'] = cv2.imencode('.png', reader_view(im, view))[1].tobytes()
    items = [it for it in items if it['key'] in pngs]
    H.TEST_DIR.mkdir(parents=True, exist_ok=True)
    arr = np.empty(len(items), object); arr[:] = [pngs[it['key']] for it in items]
    np.savez(H.TEST_DIR / 'frames.npz', keys=np.array([it['key'] for it in items]), png=arr)
    (H.TEST_DIR / 'items.json').write_text(json.dumps(items, indent=1))
    import collections
    print(collections.Counter((it['block'], it['kind']) for it in items))


if __name__ == '__main__':
    main()
