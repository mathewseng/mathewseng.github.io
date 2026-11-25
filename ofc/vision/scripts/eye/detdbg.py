"""detdbg.py SESS T X0 Y0 X1 Y1 OUT [conf]: raw detector candidates (pre-NMS, conf >= c) over a region at 3x;
thick = kept by rotated NMS at 0.5 (conf >= 0.1), thin = suppressed or weak. Prints the kept list."""
import sys, math, cv2, numpy as np
from src import frame_at, REPO
sys.path.insert(0, REPO)
from ofc_card_vision import OfcCardReader, card_quad, rotated_nms
s, t, x0, y0, x1, y1, out = sys.argv[1], float(sys.argv[2]), *map(int, sys.argv[3:7]), sys.argv[7]
cmin = float(sys.argv[8]) if len(sys.argv) > 8 else 0.03
r = OfcCardReader(REPO + '/profile.json'); img = frame_at(s, t)

def raw(r, frame):
    X0, Y0, w, h = r.crop
    im = frame[Y0:Y0 + h, X0:X0 + w]; sc = min(r.W / w, r.H / h); sw, sh = round(w * sc), round(h * sc)
    canvas = np.full((r.H, r.W, 3), 114, np.uint8); ox, oy = (r.W - sw) // 2, (r.H - sh) // 2
    canvas[oy:oy + sh, ox:ox + sw] = cv2.resize(im, (sw, sh), interpolation=cv2.INTER_AREA)
    o = r.det.run(None, {r.det_in: canvas[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255})[0][0]
    res = []
    for k in range(o.shape[1]):
        cx, cy, bw, bh, cf, ang = o[:, k]
        cx, cy, bw, bh, deg = (cx - ox) / sc + X0, (cy - oy) / sc + Y0, bw / sc, bh / sc, math.degrees(ang)
        if bw > bh: bw, bh, deg = bh, bw, deg + 90
        res.append((float(cf), float(cx), float(cy), float(bw), float(bh), (deg + 90) % 180 - 90, o[[0, 1, 2, 3, 5], k]))
    return res
if __name__ == '__main__':
    cand = [c for c in raw(r, img) if c[0] >= cmin and x0 <= c[1] <= x1 and y0 <= c[2] <= y1]
    S = 3; ov = cv2.resize(img[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    kept = r.detect(img, 0.1)
    for c in sorted(cand):
        q = ((card_quad(*c[1:6]) - [x0, y0]) * S).astype(np.int32)
        cv2.polylines(ov, [q], True, (0, int(255 * min(1, c[0] * 2)), 255), 1)
    for b in kept:
        if not (x0 <= b['x'] <= x1 and y0 <= b['y'] <= y1): continue
        q = ((b['quad'] - [x0, y0]) * S).astype(np.int32); cv2.polylines(ov, [q], True, (60, 220, 60), 2)
        cv2.putText(ov, f"{b['detectorConfidence']:.2f}", (int((b['x'] - x0) * S) - 15, int((b['y'] - y0) * S)), 0, 0.5, (255, 255, 255), 2)
        print('kept', round(b['x']), round(b['y']), round(b['angleDegrees']), round(b['width']), round(b['height']), round(b['detectorConfidence'], 3))
    cv2.imwrite(out, ov)
    # local maxima of raw candidates not near a kept box
    for c in sorted(cand, reverse=True)[:400]:
        if all(math.hypot(c[1] - b['x'], c[2] - b['y']) > 8 for b in kept):
            print('cand', round(c[0], 3), round(c[1]), round(c[2]), round(c[5]), round(c[3]), round(c[4]))
