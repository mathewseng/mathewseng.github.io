"""simtile.py ROOT SESS T X Y OUT [R]: region at T with the scan's boxes (conf>=.25 red, weak grey) and sim names (hand name yellow)."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
root, sess, T, X, Y, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
R = int(sys.argv[7]) if len(sys.argv) > 7 else 90; sc = 4
st = min((json.loads(l) for l in open(f'{root}/scan/{sess}/state.jsonl')), key=lambda f: abs(f['t'] - T))
sim = json.load(open(f'{root}/sim-fin-{sess}.json')); fr = min(sim, key=lambda f: abs(f['t'] - T))
img = frame_at(sess, st['t']); x0, y0 = int(X - R), int(Y - R)
ov = cv2.resize(img[y0:y0 + 2 * R, x0:x0 + 2 * R], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
for d in st['dets']:
    q = ((quad(d['x'], d['y'], d['w'], d['h'], d['deg']) - [x0, y0]) * sc).astype(np.int32)
    cv2.polylines(ov, [q], True, (60, 60, 255) if d['conf'] >= 0.25 else (150, 150, 150), 1)
for b in fr['bodies']:
    p = (int((b['x'] - x0) * sc) - 20, int((b['y'] - y0) * sc))
    t = f"{b['hand'] or '-'}/{b['card'] or '-'} s{b['slot']}"
    cv2.putText(ov, t, p, 0, 0.45, (0, 0, 0), 3); cv2.putText(ov, t, p, 0, 0.45, (0, 255, 255), 1)
for s in fr['table']:
    if s['detected']: continue
    p = (int((s['x'] - x0) * sc) - 20, int((s['y'] - y0) * sc) + 14); t = f"h:{s['card'] or '-'} s{s['slotId']}"
    cv2.putText(ov, t, p, 0, 0.45, (0, 0, 0), 3); cv2.putText(ov, t, p, 0, 0.45, (255, 200, 0), 1)
cv2.putText(ov, f'{sess} {st["t"]:.2f}', (5, 18), 0, 0.6, (255, 255, 255), 2)
cv2.imwrite(out, ov)
