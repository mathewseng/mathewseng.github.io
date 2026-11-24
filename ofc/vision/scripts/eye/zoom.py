"""zoom.py PREFIX id[,id...] [t1,t2,...]: 6x upright views of truth objects (from PREFIX-objects.json) at the hand-end
frame, at their best view, and at extra times. Or region mode: zoom.py region SESS T X Y DEG W H SCALE OUT."""
import sys, json, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-vision/work')
from render_truth import frame_at
sys.path.insert(0, '/Users/mathewseng/Documents/GitHub/claude-worktrees/mathewseng.github.io/orange-board/ofc/vision')
from ofc_card_vision import card_quad
def warp(img, x, y, w, h, deg, sc, m=1.3):
    q = card_quad(x, y, w * m, h * m, deg); W, H = int(w * m * sc), int(h * m * sc)
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)
if __name__ != '__main__': pass
elif sys.argv[1] == 'region':
    s, t, x, y, deg, w, h, sc, out = sys.argv[2:11]
    img = frame_at(s, float(t)); cv2.imwrite(out, warp(img, float(x), float(y), float(w), float(h), float(deg), float(sc), 1.0)); sys.exit()
def main():
  pre = sys.argv[1]; d = json.load(open(pre + '-objects.json')); ids = [int(i) for i in sys.argv[2].split(',')]
  extra = [float(v) for v in sys.argv[3].split(',')] if len(sys.argv) > 3 else []
  sim = None
  rows = []
  for i in ids:
      o = next(o for o in d['objects'] if o['id'] == i)
      ts = [d['t']] + extra
      tiles = []
      for t in ts:
          im = warp(frame_at(d['session'], t), o['x'], o['y'], o['w'], o['h'], o['deg'], 5)
          cv2.putText(im, f'#{i} {t:.0f}', (3, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2); tiles.append(im)
      rows.append(np.hstack([np.pad(t, ((3, 3), (3, 3), (0, 0))) for t in tiles]))
  w = max(r.shape[1] for r in rows)
  cv2.imwrite(pre + '-zoom.jpg', np.vstack([np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0))) for r in rows]), [cv2.IMWRITE_JPEG_QUALITY, 92])

if __name__ == '__main__' and sys.argv[1] != 'region': main()
