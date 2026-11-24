"""full.py PREFIX: the whole table crop at this truth frame with all truth objects outlined (miss check)."""
import sys, json, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-vision/work')
from render_truth import frame_at
sys.path.insert(0, '/Users/mathewseng/Documents/GitHub/claude-worktrees/mathewseng.github.io/orange-board/ofc/vision')
from ofc_card_vision import card_quad
pre = sys.argv[1]; d = json.load(open(pre + '-objects.json'))
img = frame_at(d['session'], d['t'])
for o in d['objects']:
    cv2.polylines(img, [card_quad(o['x'], o['y'], o['w'], o['h'], o['deg']).astype(np.int32)], True, (0, 255, 0), 1)
x0, y0, w, h = 130, 190, 1781, 835
cv2.imwrite(pre + '-full.jpg', img[y0:y0 + h, x0:x0 + w], [cv2.IMWRITE_JPEG_QUALITY, 88])
