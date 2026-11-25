"""gtobj.py FRAME X0 Y0 X1 Y1 SC OUT [gt.json]: truth objects (or a geometry-truth file's cards) drawn with ids/labels on a zoom grid."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
from gtsheet import truth
name = sys.argv[1]; x0, y0, x1, y1 = map(int, sys.argv[2:6]); sc = float(sys.argv[6]); out = sys.argv[7]
obj, lab = truth(name); sess, t = obj['session'], obj['t']
img = frame_at(sess, t)
ov = cv2.resize(img[y0:y1, x0:x1], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
if len(sys.argv) > 8:
    items = [(c['id'], c['code'], c) for c in json.load(open(sys.argv[8]))['cards']]
else:
    items = [(o['id'], lab.get(o['id'], '-'), dict(x=o['x'], y=o['y'], w=o['w'], h=o['h'], deg=o['deg'])) for o in obj['objects']]
cols = [(60, 230, 60), (0, 200, 255), (255, 120, 60), (255, 0, 255), (0, 255, 255), (80, 80, 255)]
for k, (i, code, g) in enumerate(items):
    c = cols[k % len(cols)]
    q = ((quad(g['x'], g['y'], g['w'], g['h'], g['deg']) - [x0, y0]) * sc).astype(np.int32); cv2.polylines(ov, [q], True, c, 1)
    p = (int((g['x'] - x0) * sc) - 14, int((g['y'] - y0) * sc) + 4)
    cv2.putText(ov, f'{i}:{code}', p, cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 0), 3); cv2.putText(ov, f'{i}:{code}', p, cv2.FONT_HERSHEY_SIMPLEX, 0.42, c, 1)
for gx in range((x0 // 10 + 1) * 10, x1, 10):
    X = int((gx - x0) * sc); cv2.line(ov, (X, 0), (X, 5 if gx % 50 else 12), (255, 255, 255), 1)
    if gx % 50 == 0: cv2.putText(ov, str(gx), (X + 2, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
for gy in range((y0 // 10 + 1) * 10, y1, 10):
    Y = int((gy - y0) * sc); cv2.line(ov, (0, Y), (5 if gy % 50 else 12, Y), (255, 255, 255), 1)
    if gy % 50 == 0: cv2.putText(ov, str(gy), (14, Y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
cv2.imwrite(out, ov, [cv2.IMWRITE_JPEG_QUALITY, 90])
