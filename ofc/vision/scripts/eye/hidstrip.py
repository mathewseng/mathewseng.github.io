"""hidstrip.py DIFF.json SESS OUT [ids]: for every slot in a namediff output, the spot over the changed interval (5 frames
from t0 to t1, plus 1.3 s after) at 3x, 140x140 px around it with a dot, titled with the new name. Checks that a name
carried on a hidden or boxed slot is still the card lying there (a card picked up or moved shows here)."""
import sys, json, cv2, numpy as np
from src import frame_at
diff = json.load(open(sys.argv[1])); sess, out = sys.argv[2], sys.argv[3]
ids = set(int(i) for i in sys.argv[4].split(',')) if len(sys.argv) > 4 else None
rows = []
for d in diff:
    if ids and d['slot'] not in ids: continue
    new = ','.join(sorted({str(b) for a, b, n in d['pairs']}))
    ts = list(np.linspace(d['t0'], d['t1'], 5)) + [d['t1'] + 1.3]
    tl = []
    for t in ts:
        f = frame_at(sess, t); x, y = int(d['x']), int(d['y'])
        x0, y0 = max(x - 70, 0), max(y - 70, 0)
        im = cv2.resize(f[y0:y0 + 140, x0:x0 + 140], None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
        cv2.circle(im, ((x - x0) * 2, (y - y0) * 2), 4, (0, 0, 255), -1)
        cv2.putText(im, f"{t:.1f}", (3, 14), 0, 0.45, (0, 0, 255), 1); tl.append(np.pad(im, ((1, 1), (1, 1), (0, 0))))
    lab = np.zeros((20, sum(t.shape[1] for t in tl), 3), np.uint8)
    cv2.putText(lab, f"slot {d['slot']} {d['t0']:.1f}-{d['t1']:.1f} -> {new}", (4, 15), 0, 0.5, (0, 255, 255), 1)
    rows.append(np.vstack([lab, np.hstack(tl)]))
for k in range(0, len(rows), 4):
    cv2.imwrite(f'{out}-{k // 4}.jpg', np.vstack(rows[k:k + 4]), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(len(rows), 'rows')
