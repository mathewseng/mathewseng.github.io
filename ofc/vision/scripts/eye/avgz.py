"""avgz.py PREFIX ids [T0 T1]: 8x upright crops of objects from the mean of frames in [t-1.8, t+0.2] (or T0..T1)."""
import sys, json, cv2, numpy as np
from src import mean_frame, warp
pre = sys.argv[1]; d = json.load(open(pre + '-objects.json')); ids = [int(i) for i in sys.argv[2].split(',')]
t0, t1 = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (d['t'] - 1.8, d['t'] + 0.2)
img = mean_frame(d['session'], t0, t1); tiles = []
for o in d['objects']:
    if o['id'] not in ids: continue
    a = cv2.resize(warp(img, o['x'], o['y'], o['w'], o['h'], o['deg'], 8, 1.15), (340, 520), interpolation=cv2.INTER_CUBIC)
    cv2.putText(a, f"#{o['id']}", (4, 24), 0, 0.8, (0, 0, 255), 2); tiles.append(np.pad(a, ((3, 3), (3, 3), (0, 0))))
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % 5)
cv2.imwrite(pre + '-avg8.jpg', np.vstack([np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)]), [cv2.IMWRITE_JPEG_QUALITY, 92])
