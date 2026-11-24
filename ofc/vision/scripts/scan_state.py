"""Full-state keyframe scan for hand-state reading: every body (detector conf >= 0.1) on every keyframe, its
classifier probabilities (both 180-degree turns) and a 64x96 crop of every body with conf >= 0.2.
Writes ../scan/SESSION/state.jsonl, probs.npz (crop name -> mean probs, p1, p2) and crops/."""
import json, os, sys, time, av, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from ofc_card_vision import OfcCardReader, rectify
F = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/')
SESS = {  # same sessions as scan.py
    's1524': ('ofc/ofc-20261123-1524-starts-0800.mp4', 480, 4771),
    's1836': ('ofc/ofc-20261123-1836.mp4', 0, 2177),
    's1931': ('ofc/ofc-20261123-1931-no-board-audio.mp4', 0, 880),
    's1953': ('ofc/ofc-20261123-1953.mp4', 0, 345),
    's2310': ('ofc/ofc-20261123-2310-three-players.mp4', 0, 4202),
    's0023': ('ofc/ofc-20261124-0023.mp4', 0, 600),
    'stud': ('other/stud-poker-20261124-0023-starts-1000.mp4', 660, 3150),
}
r = OfcCardReader(threads=2); r.profile['detector']['confidence'] = 0.1
c = r.profile['classifier']
for name in sys.argv[1:]:
    path, t0, t1 = SESS[name]
    out = f'../scan/{name}'; os.makedirs(out + '/crops', exist_ok=True)
    cont = av.open(F + path); s = cont.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
    cont.seek(int(max(t0 - 2, 0) / s.time_base), stream=s, backward=True)
    k = 0; started = time.time(); names, P1, P2 = [], [], []
    with open(out + '/state.jsonl', 'w') as fo:
        for fr in cont.decode(s):
            t = float(fr.pts * s.time_base)
            if t < t0: continue
            if t > t1: break
            img = fr.to_ndarray(format='bgr24')
            bodies = r.detect(img); rows = []
            if bodies:
                crops = [rectify(img, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']) for b in bodies]
                x = np.stack(crops).astype(np.float32) / 255; x = np.concatenate([x, x[:, ::-1, ::-1]])
                lg = r.cls.run(None, {r.cls_in: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
                e = np.exp(lg - lg.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True); n = len(bodies)
                for i, b in enumerate(bodies):
                    row = dict(x=round(b['x'], 1), y=round(b['y'], 1), w=round(b['width'], 1), h=round(b['height'], 1),
                               deg=round(b['angleDegrees'], 1), conf=round(b['detectorConfidence'], 3))
                    if b['detectorConfidence'] >= 0.2:
                        row['crop'] = f'{t:08.2f}_{i:02d}.jpg'
                        cv2.imwrite(f"{out}/crops/{row['crop']}", crops[i], [cv2.IMWRITE_JPEG_QUALITY, 92])
                        names.append(row['crop']); P1.append(pr[i].astype(np.float16)); P2.append(pr[n + i].astype(np.float16))
                    rows.append(row)
            fo.write(json.dumps(dict(t=round(t, 3), dets=rows)) + '\n'); k += 1
            if k % 500 == 0: print(name, round(t), k, round(time.time() - started), flush=True)
    np.savez_compressed(f'{out}/probs-v3.npz', names=np.array(names), p1=np.array(P1), p2=np.array(P2))
    print('done', name, k, round(time.time() - started), flush=True)
