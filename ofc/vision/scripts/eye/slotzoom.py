"""slotzoom.py SIM SESS OUT slot[@t] ...: full-resolution 5x upright view of each named box (slot id at time t, or every
named view of the slot, max 4), plus the 2 s mean around it, labelled with the reported name."""
import sys, json, cv2, numpy as np

from src import frame_at, mean_frame, warp
sim = json.load(open(sys.argv[1])); sess, out = sys.argv[2], sys.argv[3]
st = {round(json.loads(l)['t'], 2): json.loads(l) for l in open(f'../scan/{sess}/state.jsonl')}
tiles = []
for a in sys.argv[4:]:
    slot, t = (int(a.split('@')[0]), float(a.split('@')[1])) if '@' in a else (int(a), None)
    vs = [(f['t'], b) for f in sim for b in f['bodies'] if b['slot'] == slot and b['hand'] and (t is None or abs(f['t'] - t) < 0.4)]
    for tt, b in vs[:: max(1, len(vs) // 4)][:4]:
        d = next(d for d in st[round(tt, 2)]['dets'] if d.get('crop') == b['crop'])
        im = frame_at(sess, tt); mf = mean_frame(sess, tt - 0.6, tt + 0.6)
        A = [cv2.resize(warp(x, d['x'], d['y'], d['w'], d['h'], d['deg'], 5, 1.3), (250, 375), interpolation=cv2.INTER_CUBIC) for x in (im, mf)]
        t_ = np.hstack([A[0], np.full((375, 3, 3), 255, np.uint8), A[1]]); lab = np.zeros((26, t_.shape[1], 3), np.uint8)
        cv2.putText(lab, f'{slot} {b["hand"]} {tt:.1f}', (3, 19), 0, 0.65, (0, 255, 255), 2); tiles.append(np.pad(np.vstack([lab, t_]), ((2, 2), (2, 2), (0, 0))))
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % 3)
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)]), [cv2.IMWRITE_JPEG_QUALITY, 92])
