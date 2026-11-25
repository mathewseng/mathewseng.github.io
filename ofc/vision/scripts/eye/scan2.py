"""scan2.py SESS T0 T1 OUTNAME: scan_state.py + thumbs.py in one decode, on src.py sessions.
Writes ../scan/OUTNAME/state.jsonl, probs-v3.npz, crops/, thumbs/."""
import json, os, sys, time, cv2, numpy as np
from src import frames, REPO
sys.path.insert(0, REPO)
from ofc_card_vision import OfcCardReader, rectify
sess, t0, t1, name = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
r = OfcCardReader(REPO + '/profile.json', threads=2); r.profile['detector']['confidence'] = 0.1
c = r.profile['classifier']
out = f'../scan/{name}'; os.makedirs(out + '/crops', exist_ok=True); os.makedirs(out + '/thumbs', exist_ok=True)
k = 0; started = time.time(); names, P1, P2 = [], [], []
with open(out + '/state.jsonl', 'w') as fo:
    for t, fr in frames(sess, t0, t1, keyonly=True):
        img = fr.to_ndarray(format='bgr24')
        cv2.imwrite(f'{out}/thumbs/{t:08.3f}.png', cv2.resize(img, (480, 270), interpolation=cv2.INTER_AREA))
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
