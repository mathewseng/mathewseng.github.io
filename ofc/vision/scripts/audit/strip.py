"""strip.py UNITS.json IDS OUT: per unit a row of 5 keyframes over its reported life (4x, 90 px window)."""
import os as _os, sys as _sys
RT = _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '..', '..'))
_sys.path.insert(0, RT); _sys.path.insert(0, RT + '/scripts/eye')
import sys, json, cv2, numpy as np
from src import frame_at
U = {u['id']: u for u in json.load(open(sys.argv[1]))}; ids = [int(x) for x in sys.argv[2].split(',')]
WIN, SC = 90, 3.2; T = int(WIN * SC); rows = []
sims = {}
for i in ids:
    u = U[i]; s = u['sess']
    if s not in sims: sims[s] = json.load(open(f'../sim-base-{s}.json'))
    ts = [fr['t'] for fr in sims[s] if any(e['slotId'] == u['slot'] and e['card'] == u['name'] for e in fr['table'])]
    pick = [ts[int(k * (len(ts) - 1) / 4)] for k in range(5)]
    tl = []
    for t in pick:
        im = frame_at(s, t); h = WIN // 2; x0, y0 = int(u['x']) - h, int(u['y']) - h
        pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT)
        c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
        cv2.drawMarker(c, (T // 2, T // 2), (0, 255, 255), cv2.MARKER_CROSS, 10, 1)
        o = np.zeros((T + 20, T + 4, 3), np.uint8); o[20:, :T] = c
        cv2.putText(o, f"#{i} {u['name']} {t:.1f}", (3, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1); tl.append(o)
    rows.append(np.hstack(tl))
cv2.imwrite(sys.argv[3], np.vstack(rows))
