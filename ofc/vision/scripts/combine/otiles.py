"""otiles.py UNITS.json SIM.json SESS OUT SCANROOT [ids]: per added unit: ORIGIN = zoom at the slot's first gate pass of that name + its crop
| zoom at the unit's first report | zoom at its last report. 9 per sheet. OUT-index.json."""
import sys, os, json, math, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-wt9/ofc/vision/scripts/eye')
from src import frame_at
U = json.load(open(sys.argv[1])); sim = json.load(open(sys.argv[2])); sess, out, scan = sys.argv[3], sys.argv[4], sys.argv[5]
ids = set(int(x) for x in sys.argv[6].split(',')) if len(sys.argv) > 6 else None
WIN, SC = 80, 3.0; T = int(WIN * SC)
bt = {round(f['t'], 2): f for f in sim}
def zoom(t, x, y, col=(0, 255, 255)):
    im = frame_at(sess, t); h = WIN // 2; pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT)
    x0, y0 = int(round(x)) - h, int(round(y)) - h
    c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
    cv2.drawMarker(c, (T // 2, T // 2), col, cv2.MARKER_CROSS, 10, 1); cv2.putText(c, f'{t:.1f}', (3, T - 5), 0, 0.45, (255, 255, 255), 1); return c
tiles, index = [], []
for i, u in enumerate(U):
    if u['kind'] != 'added' or (ids is not None and i not in ids): continue
    f = bt.get(round(u['t0'], 2)); slot = None
    if f:
        c = [(math.hypot(b['x'] - u['x0'], b['y'] - u['y0']), b['slot']) for b in f['bodies'] if b['hand'] == u['name']] + \
            [(math.hypot(e['x'] - u['x0'], e['y'] - u['y0']), e['slotId']) for e in f['table'] if e['card'] == u['name']]
        if c: slot = min(c)[1]
    org = None
    for g in sim:
        for b in g['bodies']:
            if b['slot'] == slot and b['card'] == u['name']: org = (g['t'], b); break
        if org: break
    if org:
        oz = zoom(org[0], org[1]['x'], org[1]['y'], (0, 255, 0)); ci = cv2.imread(f"{scan}/{sess}/crops/{org[1]['crop']}")
        ci = cv2.resize(ci, (int(T * 64 / 96), T), interpolation=cv2.INTER_CUBIC)
    else:
        oz = np.zeros((T, T, 3), np.uint8); ci = np.zeros((T, int(T * 64 / 96), 3), np.uint8)
    row = [oz, ci, zoom(u['t0'], u['x0'], u['y0']), zoom(u['t1'], u['x'], u['y'])]
    t_ = np.hstack(row); hdr = np.zeros((20, t_.shape[1], 3), np.uint8)
    cv2.putText(hdr, f"{len(tiles)}: u{i} {u['name']} {u['t0']:.1f}-{u['t1']:.1f} n{u['n']} {'/'.join(u['where'])} {u.get('cls','')} slot{slot} org{org[0] if org else '-'}", (3, 15), 0, 0.45, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
    index.append(dict(tile=len(tiles) - 1, unit=i, slot=slot, origin=org[0] if org else None, **{k: u[k] for k in ('name', 't0', 't1', 'x', 'y', 'n')}))
for k in range(0, len(tiles), 8):
    ch = tiles[k:k + 8]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 2)
    cv2.imwrite(f'{out}-{k // 8:02d}.jpg', np.vstack([np.hstack(ch[j:j + 2]) for j in range(0, len(ch), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
json.dump(index, open(f'{out}-index.json', 'w')); print(len(tiles), 'tiles')
