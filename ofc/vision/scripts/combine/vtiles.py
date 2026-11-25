"""vtiles.py UNITS.json OUT [filter cls!=near]: tile per unit: frame zoom (80 px window x3.4, cross at x,y) at t0 + its crop x3. 12 per sheet."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-wt9/ofc/vision/scripts/eye')
from src import frame_at, est
U = json.load(open(sys.argv[1])); out = sys.argv[2]; allu = '--all' in sys.argv
CROPROOT = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else '/private/tmp/claude-501/ofc-vision2/scan'
items = [(i, u) for i, u in enumerate(U) if allu or u.get('cls') != 'near']
WIN, SC = 80, 3.4; T = int(WIN * SC); tiles = []
for i, u in items:
    im = frame_at(u['sess'], u['t0']); h = WIN // 2
    pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT); x0, y0 = int(round(u['x'])) - h, int(round(u['y'])) - h
    c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
    cv2.drawMarker(c, (T // 2, T // 2), (0, 255, 255), cv2.MARKER_CROSS, 10, 1)
    cr = u['crops'][0]; cp = f"{CROPROOT}/{u['sess']}/crops/{cr}"
    ci = cv2.imread(cp); ci = cv2.resize(ci, (int(64 * 2.83), T), interpolation=cv2.INTER_CUBIC) if ci is not None else np.zeros((T, 181, 3), np.uint8)
    t_ = np.hstack([c, ci]); hdr = np.zeros((22, t_.shape[1], 3), np.uint8)
    cv2.putText(hdr, f"#{i} {u['sess']} {u['name']} {u['t0']:.1f} n{u['n']} {u.get('cls','')}", (3, 16), 0, 0.5, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
for k in range(0, len(tiles), 12):
    ch = tiles[k:k + 12]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 4)
    cv2.imwrite(f'{out}-{k // 12:02d}.jpg', np.vstack([np.hstack(ch[j:j + 4]) for j in range(0, len(ch), 4)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
print(len(tiles), 'tiles')
