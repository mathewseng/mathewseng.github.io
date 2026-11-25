"""unitsheet.py UNITS.json SESS OUT [kind=added] [minN=1]: one tile per unit (first/mid/last keyframe side by side, 3x, 45 px radius):
the unit's name at its spot (yellow cross), with a header 'idx name t0-t1 n'. 9 units per sheet."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from sessions import frame_at
U = json.load(open(sys.argv[1])); sess, out = sys.argv[2], sys.argv[3]
kind = sys.argv[4] if len(sys.argv) > 4 else 'added'; minn = int(sys.argv[5]) if len(sys.argv) > 5 else 1
R, sc = 45, 3
cache = {}
def fr(t):
    t = round(t, 3)
    if t not in cache:
        if len(cache) > 40: cache.clear()
        cache[t] = frame_at(sess, t)
    return cache[t]
tiles = []
items = [(i, u) for i, u in enumerate(U) if u['kind'] == kind and u['n'] >= minn]
for i, u in items:
    ts = sorted({u['t0'], (u['t0'] + u['t1']) / 2, u['t1']}) if u['t1'] > u['t0'] else [u['t0']]
    row = []
    for t in ts:
        im = fr(t); x0, y0 = max(int(u['x'] - R), 0), max(int(u['y'] - R), 0)
        c = cv2.resize(im[y0:y0 + 2 * R, x0:x0 + 2 * R], (2 * R * sc, 2 * R * sc), interpolation=cv2.INTER_CUBIC)
        p = (int((u['x'] - x0) * sc), int((u['y'] - y0) * sc)); cv2.drawMarker(c, p, (0, 255, 255), cv2.MARKER_CROSS, 14, 1)
        cv2.putText(c, f'{t:.1f}', (3, 2 * R * sc - 6), 0, 0.45, (255, 255, 255), 1)
        row.append(c)
    while len(row) < 3: row.append(np.zeros_like(row[0]))
    t_ = np.hstack(row); hdr = np.zeros((20, t_.shape[1], 3), np.uint8)
    cv2.putText(hdr, f"#{i} {u['name']} {u['t0']:.1f}-{u['t1']:.1f} n{u['n']} {'/'.join(u['where'])} alt{u['alt']}", (4, 15), 0, 0.5, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
for k in range(0, len(tiles), 9):
    ch = tiles[k:k + 9]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 3)
    cv2.imwrite(f'{out}-{k // 9:02d}.jpg', np.vstack([np.hstack(ch[j:j + 3]) for j in range(0, len(ch), 3)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(tiles), 'tiles')
