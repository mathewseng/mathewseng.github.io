"""strip2.py SESS T0 T1 STEP X Y W H SCALE OUT [COLS]: filmstrip of a region (all frames) on src.py sessions."""
import sys, cv2, numpy as np
from src import frames
s, t0, t1, step, x, y, w, h, sc, out = sys.argv[1:11]
t0, t1, step, x, y, w, h, sc = map(float, (t0, t1, step, x, y, w, h, sc))
tiles = []; nxt = t0
for t, fr in frames(s, t0, t1):
    if t < nxt: continue
    im = fr.to_ndarray(format='bgr24')[int(y - h / 2):int(y + h / 2), int(x - w / 2):int(x + w / 2)]
    im = cv2.resize(im, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
    cv2.putText(im, f'{t:.1f}', (3, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2); tiles.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
    nxt = t + step
cols = int(sys.argv[11]) if len(sys.argv) > 11 else 6
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % cols)
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
