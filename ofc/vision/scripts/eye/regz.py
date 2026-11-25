"""regz.py PREFIX X0 Y0 X1 Y1 S [cw|ccw] [T0 T1]: 2 s mean (or T0..T1) of a frame region at S x with every object's id
(no names), optionally turned 90 degrees so a player's sideways cards read upright. Writes PREFIX-reg-X0-Y0.jpg."""
import sys, json, cv2
from src import mean_frame
pre = sys.argv[1]; x0, y0, x1, y1 = map(int, sys.argv[2:6]); S = float(sys.argv[6])
rot = sys.argv[7] if len(sys.argv) > 7 and sys.argv[7] in ('cw', 'ccw') else None
d = json.load(open(pre + '-objects.json'))
tt = [float(a) for a in sys.argv[7:] if a not in ('cw', 'ccw')]
t0, t1 = (tt[0], tt[1]) if len(tt) >= 2 else (d['t'] - 1.8, d['t'] + 0.2)
im = cv2.resize(mean_frame(d['session'], t0, t1)[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
for o in d['objects']:
    x, y = (o['x'] - x0) * S, (o['y'] - y0) * S
    if 0 < x < im.shape[1] and 0 < y < im.shape[0]:
        cv2.circle(im, (int(x), int(y)), 4, (0, 0, 255), -1); cv2.putText(im, str(o['id']), (int(x) + 5, int(y) - 4), 0, 0.7, (0, 0, 255), 2)
if rot: im = cv2.rotate(im, cv2.ROTATE_90_CLOCKWISE if rot == 'cw' else cv2.ROTATE_90_COUNTERCLOCKWISE)
cv2.imwrite(f'{pre}-reg-{x0}-{y0}.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 92])
