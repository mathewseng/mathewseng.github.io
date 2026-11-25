"""strip.py UNITS.json OUT idx,idx [--dts -1.2,-0.6,-0.3,0,0.3,0.6,1.2,2.4] [--win 110] [--sc 3]: per unit one row of full-rate frames around t0 (zoom at the unit spot)."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'eye'))
from src import frames
a = sys.argv; U = json.load(open(a[1])); out = a[2]; idx = [int(i) for i in a[3].split(',')]
def opt(k, d): return type(d)(a[a.index(k) + 1]) if k in a else d
dts = [float(x) for x in opt('--dts', '-1.2,-0.6,-0.3,0,0.3,0.6,1.2,2.4').split(',')]; WIN, SC = opt('--win', 110), opt('--sc', 3.0)
T = int(WIN * SC); rows = []
for i in idx:
    u = U[i]; want = sorted(u['t0'] + d for d in dts); got = {}
    for t, fr in frames(u['sess'], want[0] - 0.05, want[-1] + 0.1):
        for w in want:
            if w not in got and t >= w - 0.02: got[w] = (t, fr.to_ndarray(format='bgr24'))
        if len(got) == len(want): break
    tiles = []
    for w in want:
        t, im = got.get(w, (w, np.zeros((1080, 1920, 3), np.uint8))); h = WIN // 2
        pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT); x0, y0 = int(round(u['x'])) - h, int(round(u['y'])) - h
        c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
        cv2.putText(c, f"{t - u['t0']:+.2f}", (3, T - 6), 0, 0.5, (0, 255, 255), 1)
        if abs(w - u['t0']) < 1e-6: cv2.drawMarker(c, (T // 2, T // 2), (0, 255, 255), cv2.MARKER_CROSS, 8, 1)
        tiles.append(c)
    row = np.hstack(tiles); hdr = np.zeros((22, row.shape[1], 3), np.uint8)
    cv2.putText(hdr, f"#{i} {u['sess']} {u['name']} {u['t0']:.2f}", (3, 16), 0, 0.55, (0, 255, 255), 1)
    rows.append(np.vstack([hdr, row]))
cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 92]); print('ok')
