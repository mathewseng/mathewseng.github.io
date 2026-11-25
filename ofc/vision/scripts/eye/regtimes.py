"""regtimes.py SESS X0 Y0 X1 Y1 S OUT T...: a frame region at S x, 0.6 s mean around each time T, one tile per time (no names)."""
import sys, cv2, numpy as np
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from src import mean_frame
sess, x0, y0, x1, y1, S, out = sys.argv[1], *map(int, sys.argv[2:6]), float(sys.argv[6]), sys.argv[7]
ts = [float(a) for a in sys.argv[8:]]
tiles = []
for t in ts:
    im = cv2.resize(mean_frame(sess, t - 0.3, t + 0.3)[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_LANCZOS4)
    cv2.putText(im, f'{t:.1f}', (4, 22), 0, 0.8, (0, 255, 255), 2); tiles.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
cols = 3
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % cols)
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 92])
