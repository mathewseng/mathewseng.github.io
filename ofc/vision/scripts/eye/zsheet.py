"""zsheet.py PREFIX [ids] : 5x upright tiles (frame | best view) per object, 4 objects per row, no model names."""
import sys, json, cv2, numpy as np
from src import frame_at, warp
pre = sys.argv[1]; d = json.load(open(pre + '-objects.json'))
ids = [int(i) for i in sys.argv[2].split(',')] if len(sys.argv) > 2 else [o['id'] for o in d['objects']]
F = frame_at(d['session'], d['t']); cache = {}
tiles = []
for o in d['objects']:
    if o['id'] not in ids: continue
    a = warp(F, o['x'], o['y'], o['w'], o['h'], o['deg'], 5, 1.25)
    bt = o.get('best')
    if bt and abs(bt - d['t']) > 0.3:
        if bt not in cache: cache[bt] = frame_at(d['session'], bt)
        b = warp(cache[bt], o['x'], o['y'], o['w'], o['h'], o['deg'], 5, 1.25)
    else: b = np.zeros_like(a)
    b = cv2.resize(b, (a.shape[1], a.shape[0]))
    t = np.hstack([a, np.full((a.shape[0], 4, 3), 255, np.uint8), b])
    lab = np.zeros((28, t.shape[1], 3), np.uint8)
    cv2.putText(lab, f"#{o['id']} {o['kind']} {bt or 0:.0f}s", (4, 21), 0, 0.7, (0, 255, 255), 2)
    tiles.append(np.pad(np.vstack([lab, t]), ((3, 3), (3, 3), (0, 0))))
H = max(t.shape[0] for t in tiles); W = max(t.shape[1] for t in tiles)
tiles = [np.pad(t, ((0, H - t.shape[0]), (0, W - t.shape[1]), (0, 0))) for t in tiles]
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % 4)
rows = [np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]
for k in range(0, len(rows), 2):
    cv2.imwrite(f'{pre}-z{k // 2}.jpg', np.vstack(rows[k:k + 2]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(tiles), 'tiles', (len(rows) + 1) // 2, 'sheets')
