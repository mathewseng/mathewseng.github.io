"""avgovz.py PREFIX X0 Y0 X1 Y1 S [T0 T1]: mean of the frames in [t-1.5, t+0.3] (or T0..T1), region at S with object ids."""
import sys, json, cv2
sys.path.insert(0, '/private/tmp/claude-501/ofc-vision/work')
from avgzoom import mean_frame
pre = sys.argv[1]; x0, y0, x1, y1 = map(int, sys.argv[2:6]); S = float(sys.argv[6]); d = json.load(open(pre + '-objects.json')); t = d['t']
t0, t1 = (float(sys.argv[7]), float(sys.argv[8])) if len(sys.argv) > 8 else (t - 1.5, t + 0.3)
im = cv2.resize(mean_frame(d['session'], t0, t1)[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
for o in d['objects']:
    p = (int((o['x'] - x0) * S), int((o['y'] - y0) * S)); cv2.circle(im, p, 4, (0, 0, 255), -1)
    cv2.putText(im, str(o['id']), (p[0] + 5, p[1] - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
cv2.imwrite(pre + '-avg.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 92])
