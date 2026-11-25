"""region.py SESS T X0 Y0 X1 Y1 SC OUT [labels.jsonl]: zoomed full-res region with a 10 px tick grid (labels drawn if given)."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
sess, T = sys.argv[1], float(sys.argv[2]); x0, y0, x1, y1 = map(int, sys.argv[3:7]); sc = float(sys.argv[7]); out = sys.argv[8]
img = frame_at(sess, T)
ov = cv2.resize(img[y0:y1, x0:x1], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
for gx in range((x0 // 10 + 1) * 10, x1, 10):
    X = int((gx - x0) * sc); cv2.line(ov, (X, 0), (X, 6 if gx % 50 else 14), (255, 255, 255), 1)
    if gx % 50 == 0: cv2.putText(ov, str(gx), (X + 2, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
for gy in range((y0 // 10 + 1) * 10, y1, 10):
    Y = int((gy - y0) * sc); cv2.line(ov, (0, Y), (6 if gy % 50 else 14, Y), (255, 255, 255), 1)
    if gy % 50 == 0: cv2.putText(ov, str(gy), (16, Y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
if len(sys.argv) > 9:
    lab = [json.loads(l) for l in open(sys.argv[9])]
    f = min(lab, key=lambda f: abs(f['t'] - T))
    for l in f['labels']:
        q = ((quad(l['x'], l['y'], l['w'], l['h'], l['deg']) - [x0, y0]) * sc).astype(np.int32); cv2.polylines(ov, [q], True, (60, 230, 60), 1)
cv2.imwrite(out, ov, [cv2.IMWRITE_JPEG_QUALITY, 90])
