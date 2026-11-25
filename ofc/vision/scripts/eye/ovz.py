"""ovz.py PREFIX X0 Y0 X1 Y1 S [ids]: 2 s mean frame region at S with object centres + ids (no names)."""
import sys, json, cv2
from src import mean_frame
pre = sys.argv[1]; x0, y0, x1, y1 = map(int, sys.argv[2:6]); S = float(sys.argv[6]); d = json.load(open(pre + '-objects.json'))
ids = set(int(i) for i in sys.argv[7].split(',')) if len(sys.argv) > 7 else None
im = cv2.resize(mean_frame(d['session'], d['t'] - 1.8, d['t'] + 0.2)[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
for o in d['objects']:
    if ids and o['id'] not in ids: continue
    p = (int((o['x'] - x0) * S), int((o['y'] - y0) * S)); cv2.circle(im, p, 4, (0, 0, 255), -1)
    cv2.putText(im, str(o['id']), (p[0] + 5, p[1] - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
cv2.imwrite(pre + '-ovz.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 92])
