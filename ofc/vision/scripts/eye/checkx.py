"""checkx.py SIM SESS T X Y OUT: the slot at (X, Y) at keyframe T (hidden or boxed): its views over its life as 4x tiles
(last whole read, then every ~4 s until T) so a carried name can be checked by eye."""
import sys, json, math, cv2, numpy as np
from src import frame_at, REPO
sys.path.insert(0, REPO)
from ofc_card_vision import card_quad
sim = json.load(open(sys.argv[1])); s = sys.argv[2]; T, X, Y = map(float, sys.argv[3:6]); out = sys.argv[6]
fr = min(sim, key=lambda f: abs(f['t'] - T))
sl = min(fr['table'], key=lambda q: math.hypot(q['x'] - X, q['y'] - Y)); sid = sl['slotId']
reads = [(f['t'], b) for f in sim if f['t'] <= T for b in f['bodies'] if b['slot'] == sid]
print('slot', sid, sl['card'], 'placed', sl['placedSeconds'], 'views', len(reads), 'reads', sum(1 for _, b in reads if b['card']))
lastread = max((t for t, b in reads if b['card']), default=sl['placedSeconds'])
ts = [lastread]; t = lastread + 4
while t < T: ts.append(t); t += 4
ts.append(T); ts = ts[:1] + ts[1:-1][-10:] + [T]
def warp(img, x, y, w, h, deg, sc=4, m=1.6):
    q = card_quad(x, y, w * m, h * m, deg); W, H = int(w * m * sc), int(h * m * sc)
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)
tiles = []
for t in ts:
    im = warp(frame_at(s, t), sl['x'], sl['y'], sl['width'], sl['height'], sl['angleDegrees'])
    c = (im.shape[1] // 2, im.shape[0] // 2); cv2.circle(im, c, 3, (0, 0, 255), -1)
    cv2.putText(im, f'{t:.0f}', (3, 18), 0, 0.6, (0, 255, 255), 2); tiles.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % 6)
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + 6]) for i in range(0, len(tiles), 6)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
