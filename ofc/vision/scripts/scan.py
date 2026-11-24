"""Keyframe scan: detect card bodies on every keyframe, save rectified crops every Nth keyframe."""
import json, os, sys, time, av, cv2, numpy as np
from det import Detector, card_quad, rectify
F = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/')
SESS = {
    's1524': ('ofc/ofc-20261123-1524-starts-0800.mp4', 480, 4771),
    's1836': ('ofc/ofc-20261123-1836.mp4', 0, 2177),
    's1931': ('ofc/ofc-20261123-1931-no-board-audio.mp4', 0, 880),
    's1953': ('ofc/ofc-20261123-1953.mp4', 0, 345),
    's2310': ('ofc/ofc-20261123-2310-three-players.mp4', 0, 4202),
    's0023': ('ofc/ofc-20261124-0023.mp4', 0, 600),
    'stud':  ('other/stud-poker-20261124-0023-starts-1000.mp4', 660, 3150),
}
HELDOUT = {'s1836', 's0023'}
det = Detector(os.environ.get('OFC_DETECTOR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'card-body.onnx')), conf=0.1, threads=2)
for name in sys.argv[1:]:
    path, t0, t1 = SESS[name]
    out = f'../scan/{name}'; os.makedirs(out + '/crops', exist_ok=True); os.makedirs(out + '/frames', exist_ok=True)
    c = av.open(F + path); s = c.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
    c.seek(int(max(t0 - 2, 0) / s.time_base), stream=s, backward=True)
    k = 0; last_full = -1e9; started = time.time()
    with open(out + '/dets.jsonl', 'w') as fo:
        for fr in c.decode(s):
            t = float(fr.pts * s.time_base)
            if t < t0: continue
            if t > t1: break
            img = fr.to_ndarray(format='bgr24')
            ds = det(img)
            save = k % 3 == 0
            for i, d in enumerate(ds):
                if save and d['conf'] >= 0.25:
                    crop = rectify(img, card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']), 64, 96, 0.10)
                    d['crop'] = f'{t:08.2f}_{i:02d}.jpg'
                    cv2.imwrite(f"{out}/crops/{d['crop']}", crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
            every = 60 if name in HELDOUT else 120
            if t - last_full >= every:
                cv2.imwrite(f'{out}/frames/{t:08.2f}.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90]); last_full = t
            fo.write(json.dumps(dict(t=round(t, 3), dets=[{kk: (round(v, 2) if isinstance(v, float) else v) for kk, v in d.items()} for d in ds])) + '\n')
            k += 1
            if k % 500 == 0: print(name, round(t), k, round(time.time() - started), flush=True)
    print('done', name, k, round(time.time() - started), flush=True)
