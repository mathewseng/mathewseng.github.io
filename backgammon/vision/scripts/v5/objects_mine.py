#!/usr/bin/env python3
"""Hard-example mining: frames from turns where fewer than two of the roller's dice were tracked.

Two frames per such turn (40% and 75% through the turn window) are added to
objects/frames.npz with their low-threshold detections (>= 0.15) listed in
objects/mine.json for review. Labels for the new frames start empty and
unreviewed (unlabelled colour blobs are ignored in training).

usage: objects_mine.py MODEL   (runs over every session in objects.SESSIONS)
"""
import json, sys
import av, cv2, numpy as np, torch
import objects as ob
import dice_faces as df


def main():
    net = ob.load(sys.argv[1])
    keys, jp = ob.load_frames(); have = set(keys)
    labels = json.loads((ob.OBJ_DIR / 'labels.json').read_text())
    decodes = {'s1': 'decode2-v4.json', 's2': 'decode2-v4.json', 's3': 'decode2-v3.json'}
    new_keys, new_jp, cands = [], [], []
    for name, work in ob.SESSIONS.items():
        meta, _ = df.load_scan(work)
        score = np.load(work / 'objects-scan/die-score.npy')
        offs = np.concatenate([[0], np.cumsum(json.loads((work / 'clip-frames.json').read_text()))]).astype(int)
        want = []
        for g in json.loads((work / decodes[name]).read_text())['games']:
            prev = g['startFrame']
            for t in g['turns']:
                red = 1 if t['player'] == 'dark' else 0
                if len(df.tracks(meta, prev, t['frame'], red, score)) < 2 and t['frame'] - prev > 50:
                    for q in (.4, .75):
                        n = int(prev + q * (t['frame'] - prev)); c = int(np.searchsorted(offs, n, side='right') - 1)
                        n = offs[c] + (n - offs[c]) // 5 * 5
                        if f'{name}:{n}' not in have: want.append((c, int(n - offs[c]), int(n)))
                prev = t['frame']
        for c in sorted({w[0] for w in want}):
            idx = {w[1]: w[2] for w in want if w[0] == c}
            with av.open(str(work / f'rect/clip-{c:03d}.mp4')) as box:
                for i, f in enumerate(box.decode(video=0)):
                    if i in idx:
                        img = f.to_ndarray(format='bgr24'); key = f'{name}:{idx[i]}'
                        with torch.no_grad(): rows = ob.peaks(net(ob.to_tensor(img)[None].to(ob.dev)), .15)[0]
                        new_keys.append(key); new_jp.append(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes())
                        labels[key] = {'dice': [], 'cube': None, 'reviewed': False, 'mined': True}
                        cands += [[key, round(x, 1), round(y, 1), f"{'YRC'[cl]}{s:.2f}"] for cl, x, y, s in rows if cl < 2]
                    if i >= max(idx): break
        print(name, len(want), flush=True)
    arr = np.empty(len(keys) + len(new_keys), object); arr[:] = list(jp) + new_jp
    np.savez(ob.OBJ_DIR / 'frames.npz', keys=np.array(keys + new_keys), jpegs=arr)
    (ob.OBJ_DIR / 'labels.json').write_text(json.dumps(labels))
    (ob.OBJ_DIR / 'mine.json').write_text(json.dumps(cands))
    print('frames', len(new_keys), 'candidates', len(cands))


if __name__ == '__main__':
    main()
