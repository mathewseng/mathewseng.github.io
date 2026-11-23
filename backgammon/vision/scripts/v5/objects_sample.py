#!/usr/bin/env python3
"""Sample rectified frames from every recording for the dice and cube detector.

Every 125th frame (5 s) is kept as a JPEG. Initial dice labels are the
colour-blob candidates the old die classifier scored above 0.9; the cube
starts unlabelled. usage: objects_sample.py [step]
"""
import json, sys
import av, cv2, numpy as np
import objects as ob


def clip_offsets(work):
    counts = json.loads((work / 'clip-frames.json').read_text())
    return np.concatenate([[0], np.cumsum(counts)]).astype(int)


def main():
    step = int(sys.argv[1]) if len(sys.argv) > 1 else 125
    ob.OBJ_DIR.mkdir(parents=True, exist_ok=True)
    keys, jpegs, labels = [], [], {}
    for name, work in ob.SESSIONS.items():
        off = clip_offsets(work)
        meta = np.concatenate([np.load(p)['meta'] for p in sorted((work / 'dice-scan').glob('clip-*.npz'))])
        score = np.load(work / 'dice-scan/die-score.npy')
        for clip in range(len(off) - 1):
            path = work / f'rect/clip-{clip:03d}.mp4'
            if not path.exists(): continue
            with av.open(str(path)) as box:
                for i, f in enumerate(box.decode(video=0)):
                    if i % step: continue
                    n = int(off[clip] + i); key = f'{name}:{n}'
                    img = f.to_ndarray(format='bgr24')
                    keys.append(key); jpegs.append(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes())
                    sel = np.nonzero((meta[:, 0] == n) & (score > .9))[0]
                    labels[key] = {'dice': [[round(float(meta[j, 1]), 1), round(float(meta[j, 2]), 1), int(meta[j, 4])] for j in sel], 'cube': None, 'reviewed': False}
        print(name, len(keys), flush=True)
    arr = np.empty(len(jpegs), object); arr[:] = jpegs
    np.savez(ob.OBJ_DIR / 'frames.npz', keys=np.array(keys), jpegs=arr)
    (ob.OBJ_DIR / 'labels.json').write_text(json.dumps(labels))
    print('frames', len(keys), 'dice labels', sum(len(v['dice']) for v in labels.values()))


if __name__ == '__main__':
    main()
