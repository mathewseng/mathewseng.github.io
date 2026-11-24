"""'none' crops from saved full frames of TRAINING sessions: card-sized boxes on felt, backs, chips, hands, and
boxes straddling two cards or shifted half off a card. Boxes overlapping a detected card by > 25 % are skipped
(except the deliberate straddle/shift boxes)."""
import glob, json, math, os, sys, cv2, numpy as np
from det import Detector, card_quad, rectify, CROP
det = Detector(os.environ.get('OFC_DETECTOR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'card-body.onnx')), conf=0.15)
rng = np.random.default_rng(0)
out = '../data/none'; os.makedirs(out, exist_ok=True); index = []
def poly_overlap(q1, q2):
    k, inter = cv2.intersectConvexConvex(q1.astype(np.float32), q2.astype(np.float32))
    return k / (cv2.contourArea(q1.astype(np.float32)) + 1e-9)
for s in sys.argv[1:]:
    for p in sorted(glob.glob(f'../scan/{s}/frames/*.jpg')):
        img = cv2.imread(p); ds = det(img)
        quads = [card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']) for d in ds]
        x0, y0, w, h = CROP; made = 0
        for _ in range(400):
            if made >= 24: break
            cx, cy = rng.uniform(x0 + 300, x0 + w - 60), rng.uniform(y0 + 60, y0 + h - 60)
            cw = rng.uniform(44, 56); q = card_quad(cx, cy, cw, cw * rng.uniform(1.35, 1.6), rng.uniform(-90, 90))
            if any(poly_overlap(q, d) > 0.25 for d in quads): continue
            crop = rectify(img, q, 64, 96, 0.10)
            if crop.std() < 6 and rng.random() < 0.8: continue  # mostly plain felt; keep a few
            name = f'{out}/{s}-{os.path.basename(p)[:-4]}-r{made}.jpg'; cv2.imwrite(name, crop); index.append(dict(path=os.path.abspath(name), label='none')); made += 1
        for k, d in enumerate(ds[:12]):  # shifted half off a card along its long or short axis
            a = math.radians(d['deg']); f = rng.choice([-1, 1]) * rng.uniform(0.42, 0.6)
            if rng.random() < 0.5: dx, dy = f * d['w'] * math.cos(a), f * d['w'] * math.sin(a)
            else: dx, dy = -f * d['h'] * math.sin(a), f * d['h'] * math.cos(a)
            q = card_quad(d['x'] + dx, d['y'] + dy, d['w'], d['h'], d['deg'])
            name = f'{out}/{s}-{os.path.basename(p)[:-4]}-s{k}.jpg'; cv2.imwrite(name, rectify(img, q, 64, 96, 0.10)); index.append(dict(path=os.path.abspath(name), label='none'))
json.dump(index, open('../data/none.json', 'w')); print(len(index))
