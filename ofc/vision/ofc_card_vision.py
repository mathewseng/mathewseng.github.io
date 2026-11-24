"""OFC card vision: find face-up cards on office-3's overhead camera and name them, or say unknown.

Adapted from gigarepo servers/poker-os/scripts/learned_card_vision.py (LearnedCardReader): same two stages,
same oriented-box geometry, rectification and rotated NMS. Changes: reads raw 1920x1080 camera frames through a
fixed table crop (no normalized felt / homography), a classifier trained for this deck, a stricter gate (both
180-degree orientations must name the same card and each clear the probability), and a StaticCardFuser that
averages a card's reads while it lies still (OFC rows do not move until the hand is cleared).

    python3 ofc_card_vision.py frame.jpg --overlay out.jpg
    python3 ofc_card_vision.py video.mp4 --start 60 --end 120 --jsonl reads.jsonl   # keyframes only
"""
import argparse, hashlib, json, math
from pathlib import Path
import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']


def card_quad(cx, cy, w, h, deg):
    a = math.radians(deg); ca, sa = math.cos(a), math.sin(a)
    return np.array([(cx + dx * ca - dy * sa, cy + dx * sa + dy * ca)
                     for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))], np.float32)


def rectify(img, quad, out_w, out_h, margin):
    q = np.asarray(quad, np.float32); c = q.mean(0); q = c + (q - c) * (1 + margin)
    dst = np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], np.float32)
    return cv2.warpPerspective(img, cv2.getPerspectiveTransform(q, dst), (out_w, out_h),
                               flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def rotated_nms(boxes, scores, iou):
    order = np.argsort(-scores); keep = []; gone = np.zeros(len(boxes), bool)
    rects = [((float(b[0]), float(b[1])), (float(b[2]), float(b[3])), math.degrees(float(b[4]))) for b in boxes]
    areas = boxes[:, 2] * boxes[:, 3]
    for i in order:
        if gone[i]: continue
        keep.append(i)
        for j in order:
            if j == i or gone[j]: continue
            kind, inter = cv2.rotatedRectangleIntersection(rects[i], rects[j])
            if kind == cv2.INTERSECT_NONE or inter is None: continue
            a = cv2.contourArea(inter)
            if a / (areas[i] + areas[j] - a + 1e-9) > iou: gone[j] = True
    return keep


def _sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class OfcCardReader:
    def __init__(self, profile_path=HERE / 'profile.json', threads=2):
        import onnxruntime as ort
        self.profile = p = json.loads(Path(profile_path).read_text())
        base = Path(profile_path).resolve().parent
        det, cls = p['detector'], p['classifier']
        for spec in (det, cls):
            if _sha256(base / spec['path']) != spec['sha256']:
                raise ValueError(f"model changed: {spec['path']}")
        if cls['classes'] != CODES + ['none']:
            raise ValueError('classifier classes must be the 52 suit-first codes then none')
        o = ort.SessionOptions(); o.intra_op_num_threads = threads
        self.det = ort.InferenceSession(str(base / det['path']), o, providers=['CPUExecutionProvider'])
        self.cls = ort.InferenceSession(str(base / cls['path']), o, providers=['CPUExecutionProvider'])
        self.det_in, self.cls_in = self.det.get_inputs()[0].name, self.cls.get_inputs()[0].name
        self.W, self.H = det['inputWidth'], det['inputHeight']
        self.crop = p['frameCrop']; self.accept = p['acceptance']

    def detect(self, frame):
        x0, y0, w, h = self.crop
        img = frame[y0:y0 + h, x0:x0 + w]
        s = min(self.W / w, self.H / h); sw, sh = round(w * s), round(h * s)
        canvas = np.full((self.H, self.W, 3), 114, np.uint8)
        ox, oy = (self.W - sw) // 2, (self.H - sh) // 2
        canvas[oy:oy + sh, ox:ox + sw] = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
        out = self.det.run(None, {self.det_in: canvas[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255})[0][0]
        sel = out[4] >= self.profile['detector']['confidence']
        if not sel.any(): return []
        boxes, scores = out[[0, 1, 2, 3, 5]][:, sel].T.copy(), out[4][sel]
        bodies = []
        for i in rotated_nms(boxes, scores, self.profile['detector']['nmsIou']):
            cx, cy, bw, bh, ang = boxes[i]
            cx, cy, bw, bh, deg = (cx - ox) / s + x0, (cy - oy) / s + y0, bw / s, bh / s, math.degrees(ang)
            if bw > bh: bw, bh, deg = bh, bw, deg + 90
            deg = (deg + 90) % 180 - 90
            bodies.append(dict(x=float(cx), y=float(cy), width=float(bw), height=float(bh), angleDegrees=float(deg),
                               detectorConfidence=float(scores[i]), quad=card_quad(cx, cy, bw, bh, deg)))
        return bodies

    def identify(self, frame, bodies):
        if not bodies: return bodies
        c = self.profile['classifier']
        crops = [rectify(frame, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']) for b in bodies]
        x = np.stack(crops).astype(np.float32) / 255
        x = np.concatenate([x, x[:, ::-1, ::-1]])
        logits = self.cls.run(None, {self.cls_in: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(logits - logits.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
        n = len(bodies); a = self.accept
        for b, p1, p2 in zip(bodies, pr[:n], pr[n:]):
            p = (p1 + p2) / 2; o = np.argsort(-p); top = int(o[0])
            b['probabilities'] = p
            b['label'] = 'none' if top == 52 else CODES[top]
            b['probability'], b['margin'] = float(p[top]), float(p[top] - p[o[1]])
            ok = top != 52 and b['probability'] >= a['probability'] and b['margin'] >= a['margin']
            if a.get('orientationsAgree'):
                ok = ok and int(p1.argmax()) == top == int(p2.argmax()) and min(p1[top], p2[top]) >= a['probability']
            b['card'] = b['label'] if ok else None
        if a.get('oneCopyPerIdentity'):
            best = {}
            for b in bodies:
                if b['card'] and (b['card'] not in best or b['probability'] > best[b['card']]['probability']): best[b['card']] = b
            for b in bodies:
                if b['card'] and best[b['card']] is not b: b['card'] = None; b['duplicateIdentity'] = True
        return bodies

    def read(self, frame):
        """Every card body in the frame; b['card'] is a code like 'HQ' when accepted, else None (unknown)."""
        return self.identify(frame, self.detect(frame))


class StaticCardFuser:
    """Average identity probabilities of a card while it lies still (same spot and angle); a fused read is
    accepted on the same gate as a single read. A confident different identity on the spot starts a new card."""
    def __init__(self, accept, dist=12, angle=12, gap=2.5):
        self.accept, self.dist, self.angle, self.gap, self.cards, self.next_id = accept, dist, angle, gap, [], 0

    def update(self, t, bodies):
        self.cards = [c for c in self.cards if t - c['last'] <= self.gap]
        used = set()
        for b in sorted(bodies, key=lambda b: -b['detectorConfidence']):
            best = None
            for i, c in enumerate(self.cards):
                if i in used: continue
                d = math.hypot(b['x'] - c['x'], b['y'] - c['y']); da = abs(b['angleDegrees'] - c['angle']) % 180
                if d < self.dist and min(da, 180 - da) < self.angle and (best is None or d < best[0]): best = (d, i)
            if best is not None:
                c = self.cards[best[1]]
                if b['card'] and c['fused'] and b['card'] != c['fused']: best = None  # swapped card
            if best is None:
                c = dict(id=self.next_id, sum=np.zeros(53), n=0, fused=None); self.next_id += 1; self.cards.append(c)
                used.add(len(self.cards) - 1)
            else:
                used.add(best[1])
            c.update(x=b['x'], y=b['y'], angle=b['angleDegrees'], last=t)
            c['sum'] += b['probabilities']; c['n'] += 1
            m = c['sum'] / c['n']; o = np.argsort(-m); top = int(o[0])
            c['fused'] = CODES[top] if top != 52 and m[top] >= self.accept['probability'] and m[top] - m[o[1]] >= self.accept['margin'] else None
            b['trackId'], b['fusedCard'], b['fusedReads'] = c['id'], c['fused'], c['n']
        return bodies


SUIT = {'S': '♠', 'H': '♥', 'C': '♣', 'D': '♦'}


def draw(frame, bodies):
    out = frame.copy()
    for b in bodies:
        q = b['quad'].astype(np.int32); card = b.get('fusedCard') or b.get('card')
        cv2.polylines(out, [q], True, (60, 220, 60) if card else (0, 165, 255), 2)
        if card:
            t = card[1].replace('T', '10') + card[0].lower()
            org = (int(b['x']) - 16, int(b['y']) + 6)
            cv2.putText(out, t, org, cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 4)
            cv2.putText(out, t, org, cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 0, 200) if card[0] in 'HD' else (0, 0, 0), 2)
    return out


def public(b):
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in b.items() if k not in ('quad', 'probabilities')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source'); ap.add_argument('--overlay'); ap.add_argument('--jsonl')
    ap.add_argument('--start', type=float, default=0); ap.add_argument('--end', type=float, default=1e9)
    a = ap.parse_args(); reader = OfcCardReader()
    if a.source.lower().endswith(('.jpg', '.jpeg', '.png')):
        frame = cv2.imread(a.source); bodies = reader.read(frame)
        print(json.dumps([public(b) for b in bodies]))
        if a.overlay: cv2.imwrite(a.overlay, draw(frame, bodies))
        return
    import av
    c = av.open(a.source); s = c.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
    c.seek(int(max(a.start - 2, 0) / s.time_base), stream=s, backward=True)
    fuser = StaticCardFuser(reader.accept); out = open(a.jsonl, 'w') if a.jsonl else None
    for fr in c.decode(s):
        t = float(fr.pts * s.time_base)
        if t < a.start: continue
        if t > a.end: break
        bodies = fuser.update(t, reader.read(fr.to_ndarray(format='bgr24')))
        line = json.dumps(dict(t=round(t, 3), cards=[public(b) for b in bodies]))
        print(line) if out is None else out.write(line + '\n')


if __name__ == '__main__':
    main()
