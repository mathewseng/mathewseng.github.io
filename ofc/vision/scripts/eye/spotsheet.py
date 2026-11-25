"""spotsheet.py OUT JSONLIST: [[sess,t,x,y,label],...] -> tiles 150x150 px around (x,y) at 2.5x from the keyframe at t (dot at x,y)."""
import sys, json, cv2, numpy as np
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from src import frame_at
out = sys.argv[1]; items = json.loads(open(sys.argv[2]).read())
tiles = []
for sess, t, x, y, lab in items:
    im = frame_at(sess, t); H = 70
    x0, y0 = int(max(x - H, 0)), int(max(y - H, 0)); c = im[y0:y0 + 2 * H, x0:x0 + 2 * H].copy()
    c = cv2.resize(c, (2 * H * 5 // 2, 2 * H * 5 // 2), interpolation=cv2.INTER_CUBIC)
    cv2.circle(c, (int((x - x0) * 2.5), int((y - y0) * 2.5)), 4, (0, 0, 255), -1)
    cv2.putText(c, f'{lab} {t:.1f}', (3, 18), 0, 0.55, (0, 255, 255), 2); tiles.append(np.pad(c, ((2, 2), (2, 2), (0, 0))))
cols = 6; tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % cols)
rows = [np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]
for k in range(0, len(rows), 3): cv2.imwrite(out.replace('.jpg', f'-{k // 3}.jpg'), np.vstack(rows[k:k + 3]), [cv2.IMWRITE_JPEG_QUALITY, 88])
