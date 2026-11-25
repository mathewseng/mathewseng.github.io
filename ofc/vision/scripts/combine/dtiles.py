"""dtiles.py UNITS.json SIM.json SESS OUT [SCANROOT]: one tile per added unit of a namediff2 output: frame zoom at the first report
(80 px window x3.4, cross) | the crop read there (or blank if hidden) | frame zoom at the unit's last report. 12 per sheet.
Writes OUT-index.json (tile number -> unit)."""
import sys, os, json, math, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-wt9/ofc/vision/scripts/eye')
from src import frame_at, est
U = json.load(open(sys.argv[1])); sim = json.load(open(sys.argv[2])); sess, out = sys.argv[3], sys.argv[4]
scan = sys.argv[5] if len(sys.argv) > 5 else None
WIN, SC = 80, 3.4; T = int(WIN * SC)
bt = {round(f['t'], 2): f for f in sim}
cache = {}
def frame(t):
    k = round(t, 2)
    if k not in cache:
        if len(cache) > 30: cache.clear()
        cache[k] = frame_at(sess, t)
    return cache[k]
def zoom(t, x, y):
    im = frame(t); h = WIN // 2; pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT)
    x0, y0 = int(round(x)) - h, int(round(y)) - h
    c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
    cv2.drawMarker(c, (T // 2, T // 2), (0, 255, 255), cv2.MARKER_CROSS, 10, 1); return c
tiles, index = [], []
for i, u in enumerate(U):
    if u['kind'] != 'added': continue
    f = bt.get(round(u['t0'], 2)); crop = None; src = 'hid'
    if f:
        bs = [b for b in f['bodies'] if b['hand'] == u['name'] and math.hypot(b['x'] - u['x0'], b['y'] - u['y0']) < 20] if 'x0' in u else []
        if not bs: bs = [b for b in f['bodies'] if b['hand'] == u['name']]
        if bs: crop = bs[0]['crop']; src = bs[0]['src']
    ci = None
    if crop and scan: ci = cv2.imread(f'{scan}/{sess}/crops/{crop}')
    ci = cv2.resize(ci, (int(T * 64 / 96), T), interpolation=cv2.INTER_CUBIC) if ci is not None else np.zeros((T, int(T * 64 / 96), 3), np.uint8)
    x0, y0 = u.get('x0', u['x']), u.get('y0', u['y'])
    row = [zoom(u['t0'], x0, y0), ci, zoom(u['t1'], u['x'], u['y'])]
    t_ = np.hstack(row); hdr = np.zeros((22, t_.shape[1], 3), np.uint8)
    cv2.putText(hdr, f"{len(tiles)}: u{i} {u['name']} {u['t0']:.1f}-{u['t1']:.1f} n{u['n']} {src} alt{u['alt']}", (3, 16), 0, 0.5, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255))); index.append(dict(tile=len(tiles) - 1, unit=i, **{k: u[k] for k in ('name', 't0', 't1', 'x', 'y', 'n', 'alt')}))
for k in range(0, len(tiles), 9):
    ch = tiles[k:k + 9]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 3)
    cv2.imwrite(f'{out}-{k // 9:02d}.jpg', np.vstack([np.hstack(ch[j:j + 3]) for j in range(0, len(ch), 3)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
json.dump(index, open(f'{out}-index.json', 'w'))
print(len(tiles), 'tiles')
