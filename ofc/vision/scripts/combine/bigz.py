"""bigz.py SESS OUT SPEC... : SPEC = label@t@x@y[@t2...] ; 70 px window x5 per time, one row per spec."""
import sys, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-wt9/ofc/vision/scripts/eye')
from src import frame_at
sess, out = sys.argv[1], sys.argv[2]; W, S = 70, 5; rows = []
for spec in sys.argv[3:]:
    p = spec.split('@'); lab, x, y = p[0], float(p[2]), float(p[3]); ts = [float(p[1])] + [float(v) for v in p[4:]]
    tl = []
    for t in ts:
        im = frame_at(sess, t); pad = cv2.copyMakeBorder(im, W, W, W, W, cv2.BORDER_CONSTANT)
        x0, y0 = int(x) - W // 2 + W, int(y) - W // 2 + W
        c = cv2.resize(pad[y0:y0 + W, x0:x0 + W], (W * S, W * S), interpolation=cv2.INTER_CUBIC)
        cv2.drawMarker(c, (W * S // 2, W * S // 2), (0, 255, 255), cv2.MARKER_CROSS, 12, 1)
        cv2.putText(c, f'{lab} {t:.1f}', (3, 16), 0, 0.5, (0, 255, 255), 1); tl.append(c)
    rows.append(np.hstack(tl + [np.zeros_like(tl[0])] * (3 - len(tl))))
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 90])
