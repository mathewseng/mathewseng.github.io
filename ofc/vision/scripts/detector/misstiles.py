"""misstiles.py EVAL.json OUT [fresh|eye|all] [cards|boxes]: tiles (3x, 70 px radius) of each unmatched legible card (GT quad green,
detector boxes red with conf) or each non-tp box (yellow) with nearby GT."""
import sys, os, json, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
r = json.load(open(sys.argv[1])); out = sys.argv[2]; grp = sys.argv[3] if len(sys.argv) > 3 else 'fresh'; mode = sys.argv[4] if len(sys.argv) > 4 else 'cards'
tiles = []; R = 70; sc = 3
for n, v in r.items():
    if grp == 'fresh' and not v['fresh'] or grp == 'eye' and v['fresh']: continue
    items = [c for c in v['cards'] if c['kind'] in ('card', 'cq') and c['box'] is None] if mode == 'cards' else [b for b in v['boxes'] if b['cls'] not in ('tp',) and (not os.environ.get('CLS') or b['cls'] == os.environ['CLS'])]
    if not items: continue
    img = frame_at(v['session'], v['t'])
    for it in items:
        cx, cy = int(it['x']), int(it['y']); x0, y0 = max(cx - R, 0), max(cy - R, 0)
        t = cv2.resize(img[y0:y0 + 2 * R, x0:x0 + 2 * R], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
        for b in v['boxes']:
            q = ((quad(b['x'], b['y'], b['w'], b['h'], b['deg']) - [x0, y0]) * sc).astype(np.int32)
            cv2.polylines(t, [q], True, (0, 255, 255) if mode == 'boxes' and b is it else (60, 60, 255), 1)
        for c in v['cards']:
            if mode == 'cards' and c is not it: continue
            q = ((quad(c['x'], c['y'], c['w'], c['h'], c['deg']) - [x0, y0]) * sc).astype(np.int32)
            cv2.polylines(t, [q], True, (60, 230, 60), 1)
            if mode == 'boxes': cv2.putText(t, c['code'], (int((c['x'] - x0) * sc) - 8, int((c['y'] - y0) * sc)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (60, 230, 60), 1)
        lab = f"{n} {it['id']}:{it['code']} {it['cat']}" if mode == 'cards' else f"{n} b{it['bi']} {it['cls']} {it['conf']:.2f}"
        cv2.rectangle(t, (0, 0), (t.shape[1], 18), (0, 0, 0), -1); cv2.putText(t, lab, (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
        t = cv2.copyMakeBorder(t, 0, 2 * R * sc - t.shape[0], 0, 2 * R * sc - t.shape[1], cv2.BORDER_CONSTANT)
        tiles.append(cv2.copyMakeBorder(t, 3, 3, 3, 3, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
cols = 4
for k in range(0, len(tiles), 12):
    ch = tiles[k:k + 12]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % cols)
    cv2.imwrite(f'{out}-{k // 12}.jpg', np.vstack([np.hstack(ch[i:i + cols]) for i in range(0, len(ch), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(len(tiles), 'tiles')
