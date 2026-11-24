#!/usr/bin/env python3
"""Add a later recording's frames to the dice and cube training set.

Every 125th rectified frame (5 s) of the session in BG_WORK_DIR is stored in the
Nov 21 view (turned or mirrored boards are turned back, as the scan reads them)
in OBJ_DIR/extra/frames-NAME.npz. Labels start from the detector (dice >= 0.5,
the cube >= 0.5) and are corrected by review with objects_grid.py; the cube
label is null when the detector does not see it and unknown cubes do not train
the cube channel. usage: objects_add.py NAME MODEL [step]
"""
import json, sys
import av, cv2, numpy as np, torch
import frames, objects as ob
from session import RECT, board_view, reader_view


def main():
    name, model = sys.argv[1], sys.argv[2]
    step = int(sys.argv[3]) if len(sys.argv) > 3 else 125
    net = ob.load(model); view = board_view(); off = frames.offsets()
    keys, jpegs, labels = [], [], {}
    for clip in range(len(off) - 1):
        with av.open(str(RECT / f'clip-{clip:03d}.mp4')) as box:
            for i, f in enumerate(box.decode(video=0)):
                if i % step: continue
                n = int(off[clip] + i); key = f'{name}:{n}'
                img = reader_view(f.to_ndarray(format='bgr24'), view)
                with torch.no_grad(): det = ob.peaks(net(ob.to_tensor(img)[None].to(ob.dev)), .5)[0]
                dice = [[round(x, 1), round(y, 1), int(c)] for c, x, y, s in det if c < 2]
                cubes = sorted([d for d in det if d[0] == 2], key=lambda d: -d[3])
                keys.append(key); jpegs.append(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 93])[1].tobytes())
                labels[key] = {'dice': dice, 'cube': [round(cubes[0][1], 1), round(cubes[0][2], 1)] if cubes else None,
                               'reviewed': False, 'view': view}
    out = ob.OBJ_DIR / 'extra'; out.mkdir(exist_ok=True)
    arr = np.empty(len(jpegs), object); arr[:] = jpegs
    np.savez(out / f'frames-{name}.npz', keys=np.array(keys), jpegs=arr)
    (out / f'labels-{name}.json').write_text(json.dumps(labels))
    print(name, 'frames', len(keys), 'dice', sum(len(v['dice']) for v in labels.values()),
          'cubes', sum(v['cube'] is not None for v in labels.values()))


if __name__ == '__main__':
    main()
