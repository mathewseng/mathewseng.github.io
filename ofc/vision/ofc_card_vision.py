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


def cover_mask(body, covering, out_w, out_h, margin):
    """Crop-space mask of the cards lying on top of `body` (slots placed after it), or None."""
    if not covering: return None
    q = np.asarray(body['quad'], np.float32); c = q.mean(0); q = c + (q - c) * (1 + margin)
    H = cv2.getPerspectiveTransform(q, np.array([[0, 0], [out_w, 0], [out_w, out_h], [0, out_h]], np.float32))
    m = np.zeros((out_h, out_w), np.uint8)
    for o in covering:
        oq = card_quad(o['x'], o['y'], o['width'], o['height'], o['angle']).reshape(-1, 1, 2)
        cv2.fillConvexPoly(m, np.round(cv2.perspectiveTransform(oq, H).reshape(-1, 2)).astype(np.int32), 1)
    return m


CORNER = 36


def corner_patches(crop):
    """The 4 corners of a 64x96 card crop, each turned so that corner sits top-left, 36x36: index glyphs of an upright
    card (top-left, bottom-right) and of a card lying sideways in a near-square box (top-right, bottom-left)."""
    S, (h, w) = CORNER, crop.shape[:2]
    return [crop[1:1 + S, 1:1 + S],
            cv2.rotate(crop[1:1 + S, w - 1 - S:w - 1], cv2.ROTATE_90_COUNTERCLOCKWISE),
            cv2.rotate(crop[h - 1 - S:h - 1, w - 1 - S:w - 1], cv2.ROTATE_180),
            cv2.rotate(crop[h - 1 - S:h - 1, 1:1 + S], cv2.ROTATE_90_CLOCKWISE)]


def pip_count(crop, ink=24, white=150):
    """Suit pips in a classic card crop (64x96): ink holes enclosed by the white card component at the crop centre,
    away from the index corners, compact (fill >= 0.4, aspect <= 2.3) and sized like the largest ones. Noisy on its
    own (a neighbour's pips in a fan count too); used only together with the turned read (turnVeto, README)."""
    im = crop.astype(np.int16); mn = im.min(2); mx = im.max(2); g = im[..., 1].astype(np.float32)
    dark = ((cv2.dilate(g, np.ones((11, 11), np.uint8)) - g) > ink) | (mn < white) | (mx - mn >= 70)
    n, lab, st, _ = cv2.connectedComponentsWithStats((~dark).astype(np.uint8), connectivity=4)
    H, W = dark.shape; win = lab[H // 2 - 12:H // 2 + 12, W // 2 - 8:W // 2 + 8].ravel(); win = win[win > 0]
    if n < 2 or not len(win): return -1
    comp = (lab == np.bincount(win).argmax()).astype(np.uint8)
    ys, xs = np.nonzero(comp); x0, y0 = xs.min(), ys.min(); cw, ch = xs.max() - x0 + 1, ys.max() - y0 + 1
    n2, _, st2, cen = cv2.connectedComponentsWithStats(1 - comp, connectivity=8)
    areas = []
    for i in range(1, n2):
        x, y, w, h, a = st2[i]
        if x == 0 or y == 0 or x + w >= W or y + h >= H or a < 6: continue
        fx, fy = (cen[i][0] - x0) / cw, (cen[i][1] - y0) / ch
        if min(fx, 1 - fx) < 0.2 and min(fy, 1 - fy) < 0.2: continue  # index corner
        if a / float(w * h) >= 0.4 and max(w, h) / max(1, min(w, h)) <= 2.3: areas.append(a)
    if not areas: return 0
    a = np.array(areas); ref = float(np.median(a[a >= 0.5 * a.max()]))
    return int(((a >= 0.55 * ref) & (a <= 1.8 * ref)).sum())


RANKS = {r: i + 2 for i, r in enumerate('23456789T')}


def hand_cover(crop, margin=0.1):
    """Share of the card in a rectified crop (made with `margin`) covered by a hand: skin-coloured regions that reach the
    crop border (a hand comes from outside the card; red pips and court art never touch it). gigarepo learned_card_vision
    hand_cover, read on the classifier crop instead of a 30 % ring (README round 10)."""
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    skin = (cv2.inRange(hsv, (0, 40, 70), (25, 200, 255)) | cv2.inRange(hsv, (165, 40, 70), (180, 200, 255))) > 0
    n, lab = cv2.connectedComponents(skin.astype(np.uint8))
    if n <= 1: return 0.0
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    hand = np.isin(lab, edge[edge > 0]); H, W = hand.shape
    y, x = round(H * margin / (1 + margin) / 2), round(W * margin / (1 + margin) / 2)
    return float(hand[y:H - y, x:W - x].mean())


def sharpness(crop):
    """Variance of the Laplacian of a crop: a card moving through the frame is a blur (< 100; still cards, aces too, >= 112)."""
    return float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def single_view_ok(b, params):
    """May this body's gate pass be reported as a name by itself (one view, no hand state behind it)? Not when the box is
    sandwiched in a fan (partialGuard noView), a hand reaches over >= viewHand of the card, or the crop is a blur
    (sharpness < viewSharp). One view of a 7 of spades with a finger over its centre pip read 6 of spades (s1836 1837 s)."""
    if b.get('noView'): return False
    if params.get('viewHand') is not None and b.get('handCover', 0) >= params['viewHand']: return False
    if params.get('viewSharp') is not None and b.get('sharpness', 1e9) < params['viewSharp']: return False
    return True


def footprint_white(fp):
    """Share of a slot footprint (footprint(), 4x-downscaled BGR) that looks like a card face: bright and grey."""
    mx, mn = fp.max(2), fp.min(2)
    return float(np.mean((mn >= 140) & (mx - mn <= 45)))


def expected_card(cardsize, x, y, deg):
    """Box size (short, long side) of a whole card lying at (x, y) with its long axis `deg` from vertical (profile cardSize:
    card W0 x H0 under a log-quadratic lens scale sx, sy fitted on confident whole views; README round 9)."""
    q = cardsize['q']; u, v = (x - 1000) / 1000, (y - 600) / 1000; f = (u, v, u * u, u * v, v * v)
    sx = math.exp(sum(a * b for a, b in zip(q[2:7], f))); sy = math.exp(sum(a * b for a, b in zip(q[7:12], f)))
    th = math.radians(deg)
    return math.exp(q[0]) * math.hypot(sx * math.cos(th), sy * math.sin(th)), math.exp(q[1]) * math.hypot(sx * math.sin(th), sy * math.cos(th))


def partial_boxes(bodies, cover, guard):
    """Mark b['partial'] on a box that may show only part of a card, so its view is not read as a whole card (README round 9):
    - size: a side clearly shorter than a whole card at its spot (< guard['short'] x expected) whose missing part, on either
      end, is >= guard['cover'] under another box (boxes of the detectors listed in guard['sizeSources'], default all);
    - sandwich (guard['sandwich'] = [lo, hi]): other bodies overlap it from BOTH ends of one axis, each centred lo..hi of a card
      along that axis and within half a card across it. One of them lies on top of it: a box over the 4 of hearts' left
      pip column, the 3 of diamonds' strip and the 8 of clubs' edge read 2 of hearts (n1501 1445 s)."""
    sw = guard.get('sandwich')
    for b in bodies:
        # a box of a detector listed in noViewSources never names a card by one view (only through the hand state's votes)
        if b.get('detector', 0) in guard.get('noViewSources', ()): b['noView'] = True
        if sw:
            ew, eh = expected_card(guard, b['x'], b['y'], b['angleDegrees'])
            a = math.radians(b['angleDegrees']); u, v = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
            ends = set()
            for o in bodies:
                if o is b: continue
                dx, dy = o['x'] - b['x'], o['y'] - b['y']; du, dv = dx * u[0] + dy * u[1], dx * v[0] + dy * v[1]
                if sw[0] * ew <= abs(du) <= sw[1] * ew and abs(dv) < 0.5 * eh: ends.add(('u', du > 0))
                if sw[0] * eh <= abs(dv) <= sw[1] * eh and abs(du) < 0.5 * ew: ends.add(('v', dv > 0))
            for ax in 'uv':
                if (ax, True) in ends and (ax, False) in ends:
                    # every detector: a single gate pass on such a box is not reported by itself (hand state, noView)
                    if guard.get('sandwichNoView'): b['noView'] = True
                    if guard.get('sandwichSources') is None or b.get('detector', 0) in guard['sandwichSources']:
                        b['partial'] = dict(side='sandwich-' + ax, courts=bool(guard.get('sandwichCourts')))
                    break
            if b.get('partial'): continue
        if guard.get('sizeSources') is not None and b.get('detector', 0) not in guard['sizeSources']: continue
        ew, eh = expected_card(guard, b['x'], b['y'], b['angleDegrees'])
        a = math.radians(b['angleDegrees']); u, v = np.array([math.cos(a), math.sin(a)]), np.array([-math.sin(a), math.cos(a)])
        for side, exp_, axis, other in (('width', ew, u, 'height'), ('height', eh, v, 'width')):
            if guard.get('long') and b[side] > guard['long'] * exp_:
                # clearly longer than a card: the box spans cards (a d1 box over a fanned 8, 6 of hearts and 3 of spades read 6S)
                b['partial'] = dict(side=side + '-over', ratio=round(b[side] / exp_, 3)); break
            if b[side] >= guard['short'] * exp_: continue
            miss = exp_ - b[side]
            for sgn in (-1, 1):
                c = np.array([b['x'], b['y']]) + sgn * axis * (b[side] + miss) / 2
                w_, h_ = (miss, b['height']) if side == 'width' else (b['width'], miss)
                strip = card_quad(c[0], c[1], w_, h_, b['angleDegrees']); area = w_ * h_
                for o in cover:
                    if o is b or (abs(o['x'] - b['x']) < 1e-6 and abs(o['y'] - b['y']) < 1e-6): continue
                    got, _ = cv2.intersectConvexConvex(strip, np.asarray(o['quad'], np.float32))
                    if got >= guard['cover'] * area:
                        b['partial'] = dict(side=side, ratio=round(b[side] / exp_, 3)); break
                if b.get('partial'): break
            if b.get('partial'): break
    return bodies


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


def gate_for(accept, code):
    """Acceptance probability and margin for one card: acceptance.perClass overrides the global gate (the ornate
    deck-A ace of spades, which the model tops at 0.55-0.75, see README)."""
    pc = accept.get('perClass', {}).get(code, {})
    return dict(probability=pc.get('probability', accept['probability']), margin=pc.get('margin', accept['margin']))


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
        self.fb = None
        if p.get('fallbackClassifier'):  # second classifier, consulted only where the main one has no opinion
            fb = p['fallbackClassifier']
            if _sha256(base / fb['path']) != fb['sha256']: raise ValueError(f"model changed: {fb['path']}")
            self.fb = ort.InferenceSession(str(base / fb['path']), o, providers=['CPUExecutionProvider'])
            self.fb_below = fb['below']
        self.deck = None
        if p.get('deckGate'):  # classic vs jumbo-index deck per crop: jumbo crops are read by the fallback classifier
            dg = p['deckGate']
            if _sha256(base / dg['path']) != dg['sha256']: raise ValueError(f"model changed: {dg['path']}")
            self.deck = ort.InferenceSession(str(base / dg['path']), o, providers=['CPUExecutionProvider'])
            self.deck_jumbo = dg['jumbo']
            self.jumbo = None  # classifier for jumbo crops (default: the fallback classifier)
            if dg.get('classifier'):
                jc = dg['classifier']
                if _sha256(base / jc['path']) != jc['sha256']: raise ValueError(f"model changed: {jc['path']}")
                self.jumbo = ort.InferenceSession(str(base / jc['path']), o, providers=['CPUExecutionProvider'])
        self.strip = None
        if p.get('stripReader'):  # optional: reads covered cards from crops with the cards on top greyed out
            sr = p['stripReader']
            if _sha256(base / sr['path']) != sr['sha256']: raise ValueError(f"model changed: {sr['path']}")
            self.strip = ort.InferenceSession(str(base / sr['path']), o, providers=['CPUExecutionProvider'])
        self.corner = None
        if p.get('cornerReader'):  # jumbo-index deck: reads the index glyphs in the box corners (fan strips, columns)
            cr = p['cornerReader']
            if _sha256(base / cr['path']) != cr['sha256']: raise ValueError(f"model changed: {cr['path']}")
            self.corner = ort.InferenceSession(str(base / cr['path']), o, providers=['CPUExecutionProvider'])
        self.det2 = None
        if p.get('secondDetector'):  # d1 (README round 9): its bodies join only where the first detector has none
            sd = p['secondDetector']
            if _sha256(base / sd['path']) != sd['sha256']: raise ValueError(f"model changed: {sd['path']}")
            self.det2 = ort.InferenceSession(str(base / sd['path']), o, providers=['CPUExecutionProvider'])
        self.W, self.H = det['inputWidth'], det['inputHeight']
        self.crop = p['frameCrop']; self.accept = p['acceptance']

    def detect(self, frame, confidence=None, net=None):
        x0, y0, w, h = self.crop
        img = frame[y0:y0 + h, x0:x0 + w]
        s = min(self.W / w, self.H / h); sw, sh = round(w * s), round(h * s)
        canvas = np.full((self.H, self.W, 3), 114, np.uint8)
        ox, oy = (self.W - sw) // 2, (self.H - sh) // 2
        canvas[oy:oy + sh, ox:ox + sw] = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
        net = net or self.det
        out = net.run(None, {net.get_inputs()[0].name: canvas[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255})[0][0]
        sel = out[4] >= (self.profile['detector']['confidence'] if confidence is None else confidence)
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

    def identify(self, frame, bodies, masks=None):
        """Name each body or leave it None. masks: per body, a crop-sized array; nonzero pixels are greyed out."""
        if not bodies: return bodies
        c = self.profile['classifier']
        crops = [rectify(frame, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']) for b in bodies]
        for crop, m in zip(crops, masks or []):
            if m is not None: crop[m > 0] = 128
        return self.identify_crops(bodies, crops)

    def identify_crops(self, bodies, crops):
        if not bodies: return bodies
        x = np.stack(crops).astype(np.float32) / 255
        x = np.concatenate([x, x[:, ::-1, ::-1]])
        logits = self.cls.run(None, {self.cls_in: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(logits - logits.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
        n = len(bodies); a = self.accept
        if self.fb is not None:
            # the main classifier has no opinion (best card < fallbackClassifier.below, or none on top): a deck it
            # was not trained on. Read those crops with the fallback classifier instead (see README)
            m = (pr[:n] + pr[n:]) / 2
            ask = [i for i in range(n) if m[i, :52].max() < self.fb_below or m[i].argmax() == 52]
            jumbo_ask = []
            if self.deck is not None:
                # the deck gate says this crop is the jumbo-index deck (both turns): it is read by the deck gate's
                # classifier (or the fallback) even where the main classifier holds an opinion (see README)
                ld = self.deck.run(None, {self.deck.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
                ed = np.exp(ld - ld.max(1, keepdims=True)); pd = ed / ed.sum(1, keepdims=True)
                jumbo = np.minimum(pd[:n, 1], pd[n:, 1])
                for i in range(n): bodies[i]['deckJumbo'] = float(jumbo[i])
                jumbo_ask = [i for i in range(n) if jumbo[i] >= self.deck_jumbo]
                if self.jumbo is None: ask, jumbo_ask = sorted(set(ask) | set(jumbo_ask)), []
                else: ask = [i for i in ask if i not in set(jumbo_ask)]
            for sess, idx in ((self.fb, ask), (getattr(self, 'jumbo', None), jumbo_ask)):
                if not idx: continue
                xs = np.concatenate([x[idx], x[[n + i for i in idx]]])
                lf = sess.run(None, {sess.get_inputs()[0].name: np.ascontiguousarray(xs.transpose(0, 3, 1, 2))})[0]
                ef = np.exp(lf - lf.max(1, keepdims=True)); pf = ef / ef.sum(1, keepdims=True); k = len(idx)
                for j, i in enumerate(idx):
                    pr[i], pr[n + i] = pf[j], pf[k + j]; bodies[i]['fallback'] = True
        for b, p1, p2 in zip(bodies, pr[:n], pr[n:]):
            p = (p1 + p2) / 2; o = np.argsort(-p); top = int(o[0])
            b['probabilities'] = p
            b['label'] = 'none' if top == 52 else CODES[top]
            b['probability'], b['margin'] = float(p[top]), float(p[top] - p[o[1]])
            g = gate_for(a, b['label'])
            ok = top != 52 and b['probability'] >= g['probability'] and b['margin'] >= g['margin']
            if a.get('orientationsAgree'):
                ok = ok and int(p1.argmax()) == top == int(p2.argmax()) and min(p1[top], p2[top]) >= g['probability']
            b['card'] = b['label'] if ok else None
            # (partialGuard) part of a card: never read as a whole card. Overlapped from both ends ('sandwich'): a court card
            # still reads by its art (a half-covered Q of spades), a number card or ace does not (its pips are cut: 4 of hearts -> 2)
            pg = b.get('partial')
            if pg and not (pg.get('courts') and b['label'][1:] in ('J', 'Q', 'K')): b['card'] = None
        tv = self.profile.get('turnVeto')
        if tv:
            # a sideways card in a near-square box is squashed into the upright crop: a sideways 8 of diamonds (pips in rows
            # of 3, 2, 3) passed the gate as a 7 of diamonds 21 times (README, round 7). Turned a quarter, its crop reads
            # 8 of diamonds; with the pip count also 8, the view is not a vote for the 7 (hand state: turnBan)
            idx = [i for i, b in enumerate(bodies) if b['card'] and not b.get('fallback') and b['width'] >= tv['aspect'] * b['height']]
            if idx:
                xt = np.stack([cv2.resize(cv2.rotate(crops[i], cv2.ROTATE_90_CLOCKWISE), (crops[i].shape[1], crops[i].shape[0]))
                               for i in idx]).astype(np.float32) / 255
                xt = np.concatenate([xt, xt[:, ::-1, ::-1]])
                lt = self.cls.run(None, {self.cls_in: np.ascontiguousarray(xt.transpose(0, 3, 1, 2))})[0]
                et = np.exp(lt - lt.max(1, keepdims=True)); pt = et / et.sum(1, keepdims=True); k = len(idx)
                for j, i in enumerate(idx):
                    b = bodies[i]; q = (pt[j] + pt[k + j]) / 2; top = int(q.argmax())
                    if top < 52 and CODES[top] != b['card'] and q[top] >= tv['probability'] and CODES[top][1] in RANKS:
                        pc = pip_count(crops[i])
                        if pc == RANKS[CODES[top][1]] and pc != RANKS.get(b['card'][1]):
                            b['turnVeto'] = CODES[top]; b['vetoedCard'] = b['card']; b['card'] = None
        for i, b in enumerate(bodies):
            # hand over the card and blur, for the single-view checks (single_view_ok)
            if b['card']: b['handCover'], b['sharpness'] = round(hand_cover(crops[i], self.profile['classifier']['cropMargin']), 3), round(sharpness(crops[i]), 1)
        if tv:
            # pip count of each classic number card read whole (hand state: pipMedian)
            for i, b in enumerate(bodies):
                if b['card'] and not b.get('fallback') and b['card'][1] in RANKS: b['pips'] = pip_count(crops[i])
        if a.get('oneCopyPerIdentity'):
            best = {}
            for b in bodies:
                if b['card'] and (b['card'] not in best or b['probability'] > best[b['card']]['probability']): best[b['card']] = b
            for b in bodies:
                if b['card'] and best[b['card']] is not b: b['card'] = None; b['duplicateIdentity'] = True
        return bodies

    def second_bodies(self, frame, boxes):
        """The second detector's bodies (conf >= secondDetector.confidence) whose rotated IoU with every first-detector body is
        below secondDetector.mergeIou, marked detector 1: the second detector adds boxes only where the first has none, and
        the first detector's boxes stay as they are (README round 9)."""
        sd = self.profile['secondDetector']; c = self.profile['detector']['confidence']
        first = [np.asarray(b['quad'], np.float32) for b in boxes if b['detectorConfidence'] >= c]
        out = []
        for b in self.detect(frame, sd['confidence'], self.det2):
            q = np.asarray(b['quad'], np.float32); a = cv2.contourArea(q)
            if all(cv2.intersectConvexConvex(q, f)[0] / (a + cv2.contourArea(f) - cv2.intersectConvexConvex(q, f)[0] + 1e-9) < sd['mergeIou']
                   for f in first):
                b['detector'] = 1; out.append(b)
        return out

    def read(self, frame):
        """Every card body in the frame; b['card'] is a code like 'HQ' when accepted, else None (unknown). One frame is one view:
        a gate pass on a box sandwiched in a fan, under a hand or blurred is not a name here (single_view_ok, README round 10)."""
        bodies = self.detect(frame)
        if self.profile.get('partialGuard'): partial_boxes(bodies, bodies, self.profile['partialGuard'])
        self.identify(frame, bodies)
        for b in bodies:
            if b['card'] and not single_view_ok(b, self.profile.get('handState', {})): b['viewRead'], b['card'] = b['card'], None
        return bodies

    def strip_probabilities(self, crops):
        """Strip reader on masked crops (cards on top greyed out): mean of both 180-degree turns, (n, 53)."""
        x = np.stack(crops).astype(np.float32) / 255; x = np.concatenate([x, x[:, ::-1, ::-1]]); n = len(crops)
        lg = self.strip.run(None, {self.strip.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(lg - lg.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
        return (pr[:n] + pr[n:]) / 2

    def corner_probabilities(self, crops):
        """Corner reader on the 4 corners of each crop: (n, 53), per card the best corner's p; none = the least
        none-like corner's p(none). Two different indices in two corners leave no margin (see README)."""
        x = np.stack([q for c in crops for q in corner_patches(c)]).astype(np.float32) / 255
        lp = self.corner.run(None, {self.corner.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        pc = np.exp(lp).reshape(len(crops), 4, 53)
        return np.concatenate([pc[:, :, :52].max(1), pc[:, :, 52:].min(1)], 1), pc

    @staticmethod
    def corner_pair(pc, p=0.5):
        """The card two corners of one view both put on top at >= p (the two index corners of a whole card), else None."""
        tops = [int(q.argmax()) for q in pc if q.argmax() < 52 and q.max() >= p]
        best = max(set(tops), key=tops.count) if tops else None
        return CODES[best] if best is not None and tops.count(best) >= 2 and len(set(tops)) == 1 else None

    def corner_reads(self, state, bodies, crops):
        """In a hand the deck gate calls jumbo, read unnamed slots' boxes by their corner indices (b['stripProbabilities'])."""
        if self.corner is None or not state.jumbo_hand(): return
        idx = [i for i, b in enumerate(bodies) if not b['slot']['name'] and not b.get('partial')]
        if idx:
            v, pc = self.corner_probabilities([crops[i] for i in idx])
            for i, pr, q in zip(idx, v, pc): bodies[i]['stripProbabilities'] = pr; bodies[i]['cornerPair'] = self.corner_pair(q)

    def read_hand(self, frame, t, state, cover_confidence=0.1):
        """Read a frame into an OfcHandState: b['handCard'] is the name to report (also for covered cards named
        earlier), b['card'] the single-view read; state.table(t) also lists covered cards no longer boxed."""
        boxes = self.detect(frame, cover_confidence)
        if self.det2 is not None: boxes = boxes + self.second_bodies(frame, boxes)
        bodies = [b for b in boxes if b['detectorConfidence'] >= self.profile['detector']['confidence']]
        state.associate(t, bodies, boxes, small_frame(frame))
        if self.profile.get('partialGuard'): partial_boxes(bodies, boxes, self.profile['partialGuard'])
        self.identify(frame, bodies)
        if self.corner is not None:
            c = self.profile['classifier']
            self.corner_reads(state, bodies, [rectify(frame, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']) for b in bodies])
        if self.strip is not None:
            c = self.profile['classifier']; todo, crops = [], []
            for b in bodies:
                if b['slot']['name']: continue
                m = cover_mask(b, state.covering(b['slot']), c['cropWidth'], c['cropHeight'], c['cropMargin'])
                if m is None: continue
                crop = rectify(frame, b['quad'], c['cropWidth'], c['cropHeight'], c['cropMargin']); crop[m > 0] = 128
                todo.append(b); crops.append(crop)
            if todo:
                for b, pr in zip(todo, self.strip_probabilities(crops)): b['stripProbabilities'] = pr
        return state.update(t, bodies)


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


def small_frame(frame):
    """The frame area-downscaled 4x (480x270): what the bare-felt check reads."""
    return cv2.resize(frame, (frame.shape[1] // 4, frame.shape[0] // 4), interpolation=cv2.INTER_AREA)


def bare_felt(small, x, y, frac=0.8):
    """True when the felt shows at full-frame point (x, y): >= frac of a 5x7 patch (20x28 px full size) is felt blue
    (B > 120, B - R > 60, B - G > 40). Card faces are white, skin and sleeves are not blue."""
    cx, cy = int(round(x / 4)), int(round(y / 4))
    p = small[max(cy - 3, 0):cy + 4, max(cx - 2, 0):cx + 3].reshape(-1, 3).astype(np.int16)
    if not len(p): return False
    b, g, r = p[:, 0], p[:, 1], p[:, 2]
    return float(np.mean((b > 120) & (b - r > 60) & (b - g > 40))) >= frac


def footprint(small, sl):
    """The slot's card footprint on the 4x-downscaled frame, rectified to 12x18 px."""
    q = card_quad(sl['x'] / 4, sl['y'] / 4, sl['width'] / 4, sl['height'] / 4, sl['angle'])
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [12, 0], [12, 18], [0, 18]]))
    return cv2.warpPerspective(small, M, (12, 18), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE).astype(np.int16)


def _angdiff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def _inside(px, py, b, shrink=0.8):
    a = math.radians(b['angleDegrees']); dx, dy = px - b['x'], py - b['y']
    u = dx * math.cos(a) + dy * math.sin(a); v = -dx * math.sin(a) + dy * math.cos(a)
    return abs(u) <= b['width'] / 2 * shrink and abs(v) <= b['height'] / 2 * shrink


class OfcHandState:
    """What is on the table this hand. An OFC card never moves once placed, so each placed card is a slot anchored
    where it lies; a card named while fully visible keeps its name after later cards are fanned over it.

    - A body joins a slot only within `dist` px / `angle` deg of the anchor (median of its views), so a card fanned
      10+ px over another starts its own slot (still cards jitter < 4 px).
    - A placed slot lives while any detected box covers its anchor (or `gapNamed` s without cover); others `gap` s.
    - Naming: >= `minVotes` single views accepted on the reader gate, `purity` of votes, and the median of the last 10
      views up to the latest vote must put the name on top at >= `medianProbability`.
    - A view whose own accepted read contradicts its slot's name says nothing; `swapReads` such reads in a row start
      a new slot (a card replaced on the same spot). A view whose probabilities put another card at >= `contradiction`
      also says nothing, unless that card is one known to lie on top of this one.
    - One card, one place: the same name on an overlapping slot (nudged) or on a slot not boxed now while another
      slot boxed now holds it (moved while its old spot stays covered) folds into the current slot. Any other clash:
      only the best-supported slot keeps the name.
    - Hand memory: every name seen since the table was last empty (<= 1 card for `emptySeconds`) belongs to one slot;
      a single-view or strip read of a name held by another slot is dropped.
    - Strip reads (covered cards never seen whole) are off unless `stripProbability` <= 1; see README.
    - (2026-11-25, README) `oneVoteViews`: one gate pass names a slot when the median of its last oneVoteViews views also
      tops the card at >= the median gate. Corner names: `cornerHeldMargin` (an index of a card another slot holds this
      hand does not compete), `stripOwnHeld` (a slot may take back a name it held itself), `stripHiddenStill` (a corner
      name on a hidden slot only while its footprint is unchanged). `noneHide`: a hidden slot never read as a card whose
      views say `none` is not reported. `ghostGrace`: an unnamed slot reading weakly as a card an overlapping named slot
      holds gets no long grace once nothing covers it.
    - (2026-11-25 round 6, README) `feltHide` 'sticky': a slot whose centre showed bare felt reports nothing until its own
      name is read whole again."""
    DEFAULTS = dict(dist=6, angle=8, gap=4.0, gapNamed=12.0, swapReads=2, minVotes=2, purity=0.8, medianProbability=0.8,
                    emptySeconds=3.0, contradiction=0.3, feltReads=2, glimpseSeconds=1.5, moveReads=2, stillKeep=0.0, coveredContradiction=True, singleVoteProbability=2.0, perClassMedian=None, stripProbability=2.0, stripMargin=0.3, stripAgree=0.7, stripMinViews=5,
                    jumboShare=0.5, jumboMinBodies=10, deckJumbo=0.5, cornerPairVotes=0, cornerAgree=True, cornerMedian=0.5,
                    cornerHeldMargin=False, stripOwnHeld=False, stripHiddenStill=False, oneVoteViews=0, ghostGrace=False, noneHide=None,
                    feltHide=False, turnBan=0, turnShare=0.25, pipMedian=None, pipVotes=5, pipAgree=0.9, viewReport=True, secondKeepsRecent=False, secondViewsOwn=False, viewMedian=None,
                    viewHand=None, viewSharp=None, hiddenEvidence=None)

    def __init__(self, **params):
        self.p = dict(self.DEFAULTS, **params); self.slots = []; self.n = 0
        self.hand = {}; self.hand_no = 0; self.empty_since = None; self.deck_n = self.deck_j = 0; self.strip_of = {}; self.held = set()

    def _new(self, t, b):
        sl = dict(id=self.n, xs=[], x=b['x'], y=b['y'], angle=b['angleDegrees'], width=b['width'], height=b['height'],
                  first=t, last=t, seen=t, votes={}, name=None, pend=None, npend=0, dead=False, views=[], stripViews=[], recent=None,
                  pairs={})
        self.n += 1; self.slots.append(sl); return sl

    def associate(self, t, bodies, cover, small=None):
        """Match bodies to slots by pose (b['slot']); cover = every detected box, also weak ones; small = the frame
        downscaled 4x (small_frame) for the bare-felt check, or None to skip it."""
        p = self.p
        if len(bodies) <= 1:
            self.empty_since = t if self.empty_since is None else self.empty_since
            if t - self.empty_since >= p['emptySeconds'] and (self.hand or self.deck_n):
                self.hand = {}; self.hand_no += 1; self.deck_n = self.deck_j = 0; self.held = set()
                # corner evidence belongs to the hand it was seen in: a duplicate slot of a collected card must not
                # become the only holder of its name once the hand's names are forgotten
                for sl in self.slots: sl['stripViews'], sl['pairs'] = [], {}
        else:
            self.empty_since = None
        he = p['hiddenEvidence']
        for sl in self.slots:
            sl['covNow'] = any(_inside(sl['x'], sl['y'], c) for c in cover)
            if sl['covNow']: sl['last'] = t
            if he and sl['name'] and small is not None:
                # (hiddenEvidence) what the named card's spot shows now, for its report while no box reads it (table)
                fp = footprint(small, sl); sl['white'] = footprint_white(fp)
                sl['stillShare'] = float(np.mean(np.abs(fp - sl['ref']).max(2) <= 25)) if sl.get('ref') is not None else 0.0
            # felt where a card lay: it was picked up or moved (fanned cards keep its centre covered)
            if small is not None and p['feltReads'] and sl['seen'] < t:
                sl['felt'] = sl.get('felt', 0) + 1 if bare_felt(small, sl['x'], sl['y']) else 0
                if sl['felt']: sl['feltSeen'] = True
                if sl['felt'] >= p['feltReads']: self._forget(sl); continue
            # a name seen only in a brief glimpse (a card in a hand) is carried only if a later card covers it
            glimpse = sl['seen'] - sl['first'] < p['glimpseSeconds'] and not self.covering(sl)
            # a named card still lying where it was, half covered by cards laid over it after the detector stopped
            # boxing it: >= stillKeep of its footprint is unchanged since its last box (a card taken away shows felt,
            # a hand, or whatever was put there instead)
            still = small is not None and sl['seen'] < t and sl.get('ref') is not None \
                and np.mean(np.abs(footprint(small, sl) - sl['ref']).max(2) <= 25) >= (p['stillKeep'] or 0.6)
            sl['still'] = still or sl['seen'] == t
            if p['stillKeep'] and sl['name'] and not glimpse and still: sl['last'] = t
            keep = (sl['name'] and not glimpse) or sl['seen'] - sl['first'] >= 2.5
            if keep and not sl['name'] and p['ghostGrace'] and sl['views'] and t - sl['last'] > p['gap']:
                # an unnamed slot whose weak median read is the card an overlapping named slot holds is a ghost of that
                # card (the deck put where a 10 of diamonds was taken from): no long grace once nothing covers it
                med = np.median(np.array(sl['views'][-20:]), 0); k = int(med[:52].argmax())
                if med[k] < 0.5 and any(o['name'] == CODES[k] and math.hypot(o['x'] - sl['x'], o['y'] - sl['y']) < 12
                                        for o in self.slots if o is not sl): keep = False
            if (t - sl['seen'] > (p['gapNamed'] if keep else p['gap']) and t - sl['last'] > p['gap']) or \
               (not keep and t - sl['seen'] > p['gap']): sl['dead'] = True
        self.slots = [sl for sl in self.slots if not sl['dead']]
        self._small = small
        cand = sorted((math.hypot(b['x'] - sl['x'], b['y'] - sl['y']), bi, si)
                      for bi, b in enumerate(bodies) for si, sl in enumerate(self.slots)
                      if math.hypot(b['x'] - sl['x'], b['y'] - sl['y']) < p['dist'] and _angdiff(b['angleDegrees'], sl['angle']) < p['angle'])
        ub, us = {}, set()
        for _, bi, si in cand:
            if bi not in ub and si not in us: ub[bi] = si; us.add(si)
        live = list(self.slots)
        for bi, b in enumerate(bodies):
            b['slot'] = live[ub[bi]] if bi in ub else self._new(t, b)
        return bodies

    def _forget(self, sl):
        """The card left this spot: drop the slot and free its name for the hand."""
        sl['dead'] = True
        for k, v in list(self.hand.items()):
            if v == sl['id']: del self.hand[k]

    def covering(self, sl):
        """Live slots placed after `sl` that overlap it: the cards lying on top of it."""
        return [o for o in self.slots if o is not sl and o['first'] > sl['first'] + 0.3
                and math.hypot(o['x'] - sl['x'], o['y'] - sl['y']) < 0.9 * (sl['height'] + o['height']) / 2]

    def jumbo_hand(self):
        """This hand is dealt from the jumbo-index deck: >= jumboShare of its card crops so far passed the deck gate."""
        p = self.p
        return self.deck_n >= p['jumboMinBodies'] and self.deck_j >= p['jumboShare'] * self.deck_n

    def _strip(self, sl):
        p = self.p; c = self._strip_read(sl)
        if c is None or not p['cornerAgree']: return c
        # the card reader's median over the slot's last views must put the same card on top (the corner reader alone,
        # trained on 1-4 physical cards per rank, read a whole jumbo 4 as an ace and a 10 as a queen; see README)
        vs = sl['views'][-20:]
        if not vs: return None
        med = np.median(np.array(vs), 0); k = CODES.index(c)
        # ... at >= cornerMedian: a sideways 2 of diamonds that both readers leant to call a spade (reader median 0.31)
        # was named 2 of spades for 6 s before this check
        return c if int(med[:52].argmax()) == k and med[k] >= p['cornerMedian'] else None

    def _strip_read(self, sl):
        p = self.p; ps = sl['stripViews']
        # two index corners of one view agree (a whole card the reader left under its gate): cornerPairVotes such views,
        # and no view whose two corners agree on another card
        if p['cornerPairVotes'] and len(sl['pairs']) == 1:
            (c, n), = sl['pairs'].items()
            if n >= p['cornerPairVotes']: return c
        if p['stripProbability'] > 1 or len(ps) < p['stripMinViews']: return None
        ps = np.array(ps)
        if p['cornerHeldMargin']:
            # an index of a card another slot holds this hand is a neighbour's corner showing in this box (one card,
            # one place): it is not this card and does not compete with it
            other = [CODES.index(k) for k in self.held if self.hand.get(k) != sl['id']]
            if other: ps = ps.copy(); ps[:, other] = 0
        m = ps.mean(0); o = np.argsort(-m); top = int(o[0])
        if top == 52 or m[top] < p['stripProbability'] or m[top] - m[o[1]] < p['stripMargin']: return None
        if np.mean([int(q.argmax()) == top for q in ps]) < p['stripAgree']: return None
        return CODES[top]

    def update(self, t, bodies):
        """After identify(): bodies carry 'slot', 'card' (single-view accepted read or None) and 'probabilities'.
        Sets b['handCard'] (the name to report or None), b['source'] ('carried' | 'view' | 'strip') and b['slotId']."""
        p = self.p
        boxed = {id(b['slot']) for b in bodies}
        if p['moveReads']:
            # a card named on a slot that is hidden now, read whole somewhere else: it was moved, not buried
            for sl in self.slots:
                if not sl['name'] or id(sl) in boxed: continue
                if any(b.get('card') == sl['name'] and b['slot'] is not sl and math.hypot(b['x'] - sl['x'], b['y'] - sl['y']) >= 30
                       for b in bodies):  # (a read within 30 px is the same card nudged: it keeps its slot)
                    sl['moved'] = sl.get('moved', 0) + 1
                    if sl['moved'] >= p['moveReads']: self._forget(sl)
            for sl in self.slots:
                if id(sl) in boxed: sl['moved'] = 0
        for b in bodies:
            if b.get('deckJumbo') is not None and b.get('label') != 'none':
                self.deck_n += 1; self.deck_j += b['deckJumbo'] >= p['deckJumbo']
        for b in bodies:
            sl = b['slot']; r = b.get('card')
            if r and sl['name'] and r != sl['name']:
                sl['npend'] = sl['npend'] + 1 if sl['pend'] == r else 1; sl['pend'] = r
                if sl['npend'] >= p['swapReads']:
                    sl['dead'] = True; sl = b['slot'] = self._new(t, b); sl['votes'][r] = p['swapReads']; r = None
            elif r:
                sl['pend'], sl['npend'] = None, 0
            if b.get('vetoedCard'): sl.setdefault('vetoes', {})[b['vetoedCard']] = sl.get('vetoes', {}).get(b['vetoedCard'], 0) + 1
            if not b.get('detector'): sl['firstDetector'] = True
            # (secondViewsOwn) a second-detector view joins a slot's median views only on a slot the first detector never boxed:
            # its amodal box over a covered 6 of hearts dropped the median a first-detector vote then took (README round 9)
            own = not (p['secondViewsOwn'] and b.get('detector') and sl.get('firstDetector'))
            if own and b.get('probabilities') is not None and not (b.get('partial') and not b['partial'].get('courts')): sl['views'].append(b['probabilities']); sl['views'] = sl['views'][-200:]
            if b.get('cornerPair'): sl['pairs'][b['cornerPair']] = sl['pairs'].get(b['cornerPair'], 0) + 1
            if b.get('stripProbabilities') is not None: sl['stripViews'].append(b['stripProbabilities']); sl['stripViews'] = sl['stripViews'][-60:]
            if r:
                sl['votes'][r] = sl['votes'].get(r, 0) + 1
                # (secondKeepsRecent) a second-detector gate pass agreeing with the slot's name keeps the median snapshot that
                # named it: its refresh with half-covered views dropped a 4 of hearts' median under the gate (README round 9)
                if not (p['secondKeepsRecent'] and b.get('detector') and r == sl['name'] and sl['recent']): sl['recent'] = sl['views'][-10:]
                sl['voteP'] = max(sl.get('voteP', 0), b['probability'])
                if b.get('pips') is not None:
                    pc = sl.setdefault('pipVotes', {}).setdefault(r, [0, 0]); pc[0] += 1; pc[1] += b['pips'] == RANKS[r[1]]
            sl['xs'].append((b['x'], b['y'], b['angleDegrees'], b['width'], b['height'])); sl['xs'] = sl['xs'][-50:]
            m = np.median(np.array(sl['xs']), 0)
            sl.update(x=float(m[0]), y=float(m[1]), angle=float(m[2]), width=float(m[3]), height=float(m[4]), seen=t, last=t)
            # (feltHide 'sticky') a slot whose spot showed bare felt stays silent until its own name is read again whole
            if not sl['name'] or r == sl['name']: sl['feltSeen'] = False
            if p['stillKeep'] and getattr(self, '_small', None) is not None: sl['ref'] = footprint(self._small, sl)
            if sl['votes']:
                top, n = max(sl['votes'].items(), key=lambda kv: kv[1])
                # one vote is enough for a card read whole at >= singleVoteProbability (seen once, then covered)
                ok = (n >= p['minVotes'] or (len(sl['votes']) == 1 and sl.get('voteP', 0) >= p['singleVoteProbability'])) \
                    and n >= p['purity'] * sum(sl['votes'].values())
                mp = (p['perClassMedian'] or {}).get(top, p['medianProbability'])
                pv = sl.get('pipVotes', {}).get(top)
                if p['pipMedian'] and pv and pv[0] >= p['pipVotes'] and pv[1] >= p['pipAgree'] * pv[0] and not sl.get('vetoes', {}).get(top):
                    # (pipMedian) a number card whose gate passes nearly all count its own rank of pips keeps its name at a
                    # lower median: the 3 of diamonds at n1501 1470 s (44 gate passes) sat at 0.77-0.79 once a 4 of hearts
                    # covered half of it. The wrong 7 of diamonds that sank holdAgree counted 8 pips (README, round 7)
                    mp = min(mp, p['pipMedian'])
                k = CODES.index(top)
                if not ok and p['oneVoteViews'] and n == 1 and len(sl['votes']) == 1 and len(sl['views']) >= p['oneVoteViews']:
                    # one gate pass, and the median of the slot's last oneVoteViews views also tops it at >= the median gate
                    med = np.median(np.array(sl['views'][-p['oneVoteViews']:]), 0)
                    ok = int(med.argmax()) == k and med[k] >= mp
                elif ok and sl['recent']:
                    med = np.median(np.array(sl['recent']), 0)
                    ok = int(med.argmax()) == k and med[k] >= mp
                # (turnBan) the turned-crop + pip-count check said another card on >= turnBan of this name's gate passes
                # and >= turnShare of them: never this name on this slot
                nv = sl.get('vetoes', {}).get(top, 0)
                if p['turnBan'] and nv >= p['turnBan'] and nv >= p['turnShare'] * (n + nv): ok = False
                sl['name'] = top if ok else None
        self.slots = [sl for sl in self.slots if not sl['dead']]
        byname = {}
        for sl in sorted(self.slots, key=lambda sl: -sl['seen']):
            if not sl['name']: continue
            keep = byname.get(sl['name'])
            if keep is None: byname[sl['name']] = sl
            elif math.hypot(keep['x'] - sl['x'], keep['y'] - sl['y']) < 30 or (keep['seen'] == t and sl['seen'] < t):
                # one card in one place: nudged (fold the old slot in) or moved while its old spot stays covered
                for k, v in sl['votes'].items(): keep['votes'][k] = keep['votes'].get(k, 0) + v
                sl['dead'] = True
                for k, v in list(self.hand.items()):
                    if v == sl['id']: self.hand[k] = keep['id']
        self.slots = [sl for sl in self.slots if not sl['dead']]
        best = {}
        for sl in self.slots:
            if sl['name'] and (sl['name'] not in best or sl['votes'][sl['name']] > best[sl['name']]['votes'][sl['name']]): best[sl['name']] = sl
        dupe = self.dupe = {sl['id'] for sl in self.slots if sl['name'] and best[sl['name']] is not sl}
        for sl in self.slots:
            if sl['name'] and sl['id'] not in dupe: self.hand.setdefault(sl['name'], sl['id'])
        self.held |= set(self.hand)  # every name a slot has held this hand (a picked-up card's name is freed, not forgotten)
        strips = {}
        for sl in self.slots:
            if not sl['name'] and sl['id'] not in dupe:
                v = self._strip(sl)
                # (a name this same slot held earlier is its own, not another slot's)
                if v and (v not in self.held or (p['stripOwnHeld'] and self.hand.get(v) == sl['id'])): strips.setdefault(v, []).append(sl['id'])
        strip_of = self.strip_of = {ids[0]: v for v, ids in strips.items() if len(ids) == 1}
        carried = {}
        for b in bodies:
            sl = b['slot']; c = sl['name'] if sl['id'] not in dupe and not sl['dead'] else None
            if b.get('card') and c and b['card'] != c: c = None  # pending swap: say nothing
            if c and p['feltHide'] == 'sticky' and sl.get('feltSeen'): c = None  # the card was taken from here
            pr = b.get('probabilities')
            if c and pr is not None:
                q = int(np.argmax(pr[:52]))
                # the view looks like another card that is not one of the cards known to lie on top of this one:
                # something new is on the spot (a card slid over it, a replacement not yet read), say nothing
                over = self.covering(sl)
                # a card on top that has no name yet may be what the view shows: no contradiction
                if p['coveredContradiction'] and any(not o['name'] for o in over): over = None
                if over is not None and CODES[q] != c and pr[q] >= p['contradiction'] and CODES[q] not in {o['name'] for o in over}:
                    c = None; b['contradicted'] = True
            carried[id(b)] = c
        held = set(v for v in carried.values() if v)
        for b in bodies:
            sl = b['slot']; c = carried[id(b)]; b['slotId'] = sl['id']
            v = b.get('card')
            v = v if v and sl['id'] not in dupe and self.hand.get(v, sl['id']) == sl['id'] and v not in held else None
            s = strip_of.get(sl['id'])
            # (viewReport False) a single gate pass on a slot that holds no name is not reported: one view of a box over
            # parts of three cards read 2 of hearts at n1501 1445 s (README round 9). Nor one sandwiched in a fan, under a hand
            # (viewHand) or blurred (viewSharp): a finger over a 7 of spades' centre pip read 6 of spades (README round 10)
            if not p['viewReport'] or not single_view_ok(b, p): v = None
            if v and p['viewMedian'] is not None:
                # (viewMedian) a single gate pass is reported by itself only when the median of the slot's last 6 views tops
                # the same card at >= viewMedian (README round 9)
                med = np.median(np.array(sl['views'][-6:]), 0) if sl['views'] else None
                if med is None or CODES[int(med[:52].argmax())] != v or med[CODES.index(v)] < p['viewMedian']: v = None
            b['handCard'], b['source'] = (c, 'carried') if c else (v, 'view') if v else (s, 'strip') if s else (None, None)
        return bodies

    def _hidden_strip(self, sl, t):
        # a corner name on a slot not boxed now is reported only while its footprint is unchanged since its last box
        # (a 10 of spades named from corners was reported hidden for 4 s after it was picked up; see README)
        if self.p['stripHiddenStill'] and sl['seen'] < t and not sl.get('still', True): return None
        return self.strip_of.get(sl['id'])

    def _nonecard(self, sl):
        # a slot whose own views say "not a card" (a lap, a sleeve), never read as a card: not reported as an object
        p = self.p
        return p['noneHide'] is not None and not sl['name'] and not sl['votes'] and not sl['pairs'] and len(sl['views']) >= 3 \
            and float(np.median(np.array(sl['views'][-20:]), 0)[52]) >= p['noneHide']

    def _hidden_evidence(self, sl, t):
        """(hiddenEvidence) A named card no box reads now is reported only while something says it still lies there: a box
        still covers its spot, its footprint is >= `still` unchanged since its last box, it was boxed <= `age` s ago, or >= `white`
        of its footprint is card face (cards laid over it). A card swept up at collection or picked up kept its name on its old
        spot for up to 12 s before this (README round 10)."""
        he = self.p['hiddenEvidence']
        if not he or sl['seen'] == t or not sl['name']: return True
        return bool((he.get('cover') and sl.get('covNow')) or sl.get('stillShare', 0) >= he['still'] or t - sl['seen'] <= he['age']
                    or sl.get('white', 0) >= he['white'])

    def table(self, t):
        """Every live slot, including covered cards the detector no longer boxes."""
        dupe = getattr(self, 'dupe', set())
        return [dict(slotId=sl['id'], x=sl['x'], y=sl['y'], width=sl['width'], height=sl['height'], angleDegrees=sl['angle'],
                     card=(sl['name'] or self._hidden_strip(sl, t)) if sl['id'] not in dupe and not (self._felt_now(sl) and self.p['feltHide'] == 'sticky')
                     and self._hidden_evidence(sl, t) else None, placedSeconds=sl['first'], detected=sl['seen'] == t)
                for sl in self.slots if sl['seen'] == t or not (self._nonecard(sl) or self._felt_now(sl))]

    def _felt_now(self, sl):
        # bare felt at a hidden slot's centre on this keyframe: the card was taken (feltReads such keyframes in a row drop
        # the slot; the first one only stops the report). A K of hearts was reported one keyframe after it was picked up.
        # 'sticky': once its centre showed felt, the slot reports no name until its own name is read whole again (a hand
        # passing over the spot breaks the run of felt reads that drops the slot, and the taken card's name came back; a
        # spread deck's box joined a taken Q of spades' slot and showed its name for 12 s)
        if self.p['feltHide'] == 'sticky': return sl.get('feltSeen', False)
        return self.p['feltHide'] and sl.get('felt', 0) >= 1


SUIT = {'S': '♠', 'H': '♥', 'C': '♣', 'D': '♦'}


def _label(out, card, x, y, scale=0.62):
    t = card[1].replace('T', '10') + card[0].lower(); (tw, th), _ = cv2.getTextSize(t, cv2.FONT_HERSHEY_SIMPLEX, scale, 2)
    org = (int(x - tw / 2), int(y + th / 2))
    cv2.putText(out, t, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), max(3, int(6 * scale)))
    cv2.putText(out, t, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 200) if card[0] in 'HD' else (0, 0, 0), max(1, int(3 * scale)))


def draw(frame, bodies, table=None):
    """Green: named from this view. Teal: name carried from earlier views (the card is covered now).
    Orange: card found, not named. Thin teal: covered card no longer boxed, named earlier (from table)."""
    out = frame.copy()
    for s in table or []:
        if s['detected'] or not s['card']: continue
        q = card_quad(s['x'], s['y'], s['width'], s['height'], s['angleDegrees']).astype(np.int32)
        cv2.polylines(out, [q], True, (200, 200, 0), 1); _label(out, s['card'], *s.get('labelAt', (s['x'], s['y'])))
    for b in bodies:
        q = b['quad'].astype(np.int32)
        card = b.get('handCard') if 'handCard' in b else (b.get('fusedCard') or b.get('card'))
        col = (60, 220, 60) if card and b.get('source') in (None, 'view') or (card and b.get('card') == card) else (200, 200, 0) if card else (0, 165, 255)
        cv2.polylines(out, [q], True, col, 2)
        if card: _label(out, card, *b.get('labelAt', (b['x'], b['y'])))
    return out


# card codes the reader computes on the way that are not reports: the gate's read of one view before the hand state and the
# single-view checks, the classifier's top class, vetoed and turned reads, corner reads (README round 10, what is reported)
DIAGNOSTIC = ('card', 'label', 'turnVeto', 'vetoedCard', 'cornerPair', 'viewRead')


def public(b, debug=False, report=()):
    """A body as JSON. Card codes in DIAGNOSTIC are written only with debug, except the mode's own report fields (`report`)."""
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in b.items()
            if k not in ('quad', 'probabilities', 'stripProbabilities', 'slot') and (debug or k not in DIAGNOSTIC or k in report)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source'); ap.add_argument('--overlay'); ap.add_argument('--jsonl')
    ap.add_argument('--start', type=float, default=0); ap.add_argument('--end', type=float, default=1e9)
    ap.add_argument('--no-hand-state', action='store_true', help='video: single views + StaticCardFuser only')
    ap.add_argument('--debug', action='store_true', help='also write diagnostic card codes (raw gate read of each view, top class, vetoed and corner reads): not reports')
    a = ap.parse_args(); reader = OfcCardReader()
    if a.source.lower().endswith(('.jpg', '.jpeg', '.png')):
        frame = cv2.imread(a.source); bodies = reader.read(frame)
        print(json.dumps([public(b, a.debug, ('card',)) for b in bodies]))
        if a.overlay: cv2.imwrite(a.overlay, draw(frame, bodies))
        return
    import av
    c = av.open(a.source); s = c.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
    c.seek(int(max(a.start - 2, 0) / s.time_base), stream=s, backward=True)
    out = open(a.jsonl, 'w') if a.jsonl else None
    fuser = StaticCardFuser(reader.accept); state = OfcHandState(**reader.profile.get('handState', {}))
    frame = bodies = None
    for fr in c.decode(s):
        t = float(fr.pts * s.time_base)
        if t < a.start: continue
        if t > a.end: break
        frame = fr.to_ndarray(format='bgr24'); last = t
        if a.no_hand_state:
            bodies = fuser.update(t, reader.read(frame)); rec = dict(t=round(t, 3), cards=[public(b, a.debug, ('card',)) for b in bodies])
        else:
            bodies = reader.read_hand(frame, t, state)
            rec = dict(t=round(t, 3), cards=[public(b, a.debug) for b in bodies],
                       covered=[{k: (round(v, 2) if isinstance(v, float) else v) for k, v in sl.items()}
                                for sl in state.table(t) if not sl['detected'] and sl['card']])
        line = json.dumps(rec)
        print(line) if out is None else out.write(line + '\n')
    if a.overlay and frame is not None:  # the last frame read (use --end to choose it)
        cv2.imwrite(a.overlay, draw(frame, bodies, None if a.no_hand_state else state.table(last)))


if __name__ == '__main__':
    main()
