"""tiles.py UNITS.json OUTPREFIX [per_sheet=12]: full-resolution zoom sheets, 2 tiles per unit (first gate pass / last report).
UNITS: list of dict(id, sess, slot, name, x, y, tA, tB)."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import sys, json, cv2, numpy as np
from src import frame_at, est
units = json.load(open(sys.argv[1])); pre = sys.argv[2]; per = int(sys.argv[3]) if len(sys.argv) > 3 else 12
WIN, SC = 80, 3.4; T = int(WIN * SC)
cache = {}
def frame(s, t):
    k = (s, round(t, 2))
    if k not in cache:
        if len(cache) > 40: cache.clear()
        cache[k] = frame_at(s, t)
    return cache[k]
def tile(s, t, x, y, lab):
    im = frame(s, t); h = WIN // 2
    x0, y0 = int(round(x)) - h, int(round(y)) - h
    pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT)
    c = pad[y0 + WIN:y0 + WIN + WIN, x0 + WIN:x0 + WIN + WIN]
    c = cv2.resize(c, (T, T), interpolation=cv2.INTER_CUBIC)
    cv2.drawMarker(c, (T // 2, T // 2), (0, 255, 255), cv2.MARKER_CROSS, 10, 1)
    out = np.zeros((T + 22, T, 3), np.uint8); out[22:] = c
    cv2.putText(out, lab, (3, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return out
units.sort(key=lambda u: (u['sess'], u['tA']))
for si in range(0, len(units), per):
    rows = []; row = []
    for u in units[si:si + per]:
        a = tile(u['sess'], u['tA'], u['x'], u['y'], f"#{u['id']} {u['name']} {u['tA']:.0f}")
        b = tile(u['sess'], u['tB'], u['x'], u['y'], f"   end {u['tB']:.0f}")
        row.append(np.hstack([a, b, np.full((T + 22, 6, 3), 255, np.uint8)]))
        if len(row) == 3: rows.append(np.hstack(row)); row = []
    if row:
        while len(row) < 3: row.append(np.zeros_like(row[0]))
        rows.append(np.hstack(row))
    cv2.imwrite(f'{pre}-{si // per:02d}.jpg', np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 90]); print('sheet', si // per, flush=True)
