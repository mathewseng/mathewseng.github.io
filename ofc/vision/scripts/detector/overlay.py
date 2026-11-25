"""overlay.py LABELS.jsonl SESS OUT T [T...]: frame region with labels at 2x (green trk boxed, yellow trk unboxed, magenta raw)."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
lab = {round(json.loads(l)['t'], 2): json.loads(l) for l in open(sys.argv[1])}
sess, out = sys.argv[2], sys.argv[3]
for T in map(float, sys.argv[4:]):
    k = min(lab, key=lambda t: abs(t - T)); L = lab[k]['labels']
    img = frame_at(sess, k)
    xs = [l['x'] for l in L] or [960]; ys = [l['y'] for l in L] or [540]
    x0, x1 = max(int(min(xs)) - 60, 0), min(int(max(xs)) + 60, 1920); y0, y1 = max(int(min(ys)) - 60, 0), min(int(max(ys)) + 60, 1080)
    Sc = float(os.environ.get('SC', 2)); ov = cv2.resize(img[y0:y1, x0:x1], None, fx=Sc, fy=Sc, interpolation=cv2.INTER_CUBIC)
    for l in L:
        c = (255, 0, 255) if l['src'] == 'raw' else ((60, 230, 60) if l['boxed'] else (0, 220, 255))
        q = ((quad(l['x'], l['y'], l['w'], l['h'], l['deg']) - [x0, y0]) * Sc).astype(np.int32)
        cv2.polylines(ov, [q], True, c, 1)
        if l['vis'] is not None:
            cv2.putText(ov, f"{l['vis']:.1f}", (int((l['x'] - x0) * Sc) - 12, int((l['y'] - y0) * Sc)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, c, 1)
    for g in lab[k].get('ignore', []):
        q = ((quad(*g) - [x0, y0]) * Sc).astype(np.int32)
        for i in range(4):
            a, b = q[i], q[(i + 1) % 4]
            for u in np.linspace(0, 1, 12)[::2]: cv2.line(ov, tuple((a + (b - a) * u).astype(int)), tuple((a + (b - a) * min(u + 0.08, 1)).astype(int)), (40, 40, 255), 1)
    cv2.putText(ov, f'{sess} {k:.1f}s n={len(L)}', (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.imwrite(f'{out}-{k:07.1f}.jpg', ov, [cv2.IMWRITE_JPEG_QUALITY, 88])
