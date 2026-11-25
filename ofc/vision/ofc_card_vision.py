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
        self.strip = None
        if p.get('stripReader'):  # optional: reads covered cards from crops with the cards on top greyed out
            sr = p['stripReader']
            if _sha256(base / sr['path']) != sr['sha256']: raise ValueError(f"model changed: {sr['path']}")
            self.strip = ort.InferenceSession(str(base / sr['path']), o, providers=['CPUExecutionProvider'])
        self.W, self.H = det['inputWidth'], det['inputHeight']
        self.crop = p['frameCrop']; self.accept = p['acceptance']

    def detect(self, frame, confidence=None):
        x0, y0, w, h = self.crop
        img = frame[y0:y0 + h, x0:x0 + w]
        s = min(self.W / w, self.H / h); sw, sh = round(w * s), round(h * s)
        canvas = np.full((self.H, self.W, 3), 114, np.uint8)
        ox, oy = (self.W - sw) // 2, (self.H - sh) // 2
        canvas[oy:oy + sh, ox:ox + sw] = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
        out = self.det.run(None, {self.det_in: canvas[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255})[0][0]
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
            if ask:
                xs = np.concatenate([x[ask], x[[n + i for i in ask]]])
                lf = self.fb.run(None, {self.fb.get_inputs()[0].name: np.ascontiguousarray(xs.transpose(0, 3, 1, 2))})[0]
                ef = np.exp(lf - lf.max(1, keepdims=True)); pf = ef / ef.sum(1, keepdims=True); k = len(ask)
                for j, i in enumerate(ask):
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

    def strip_probabilities(self, crops):
        """Strip reader on masked crops (cards on top greyed out): mean of both 180-degree turns, (n, 53)."""
        x = np.stack(crops).astype(np.float32) / 255; x = np.concatenate([x, x[:, ::-1, ::-1]]); n = len(crops)
        lg = self.strip.run(None, {self.strip.get_inputs()[0].name: np.ascontiguousarray(x.transpose(0, 3, 1, 2))})[0]
        e = np.exp(lg - lg.max(1, keepdims=True)); pr = e / e.sum(1, keepdims=True)
        return (pr[:n] + pr[n:]) / 2

    def read_hand(self, frame, t, state, cover_confidence=0.1):
        """Read a frame into an OfcHandState: b['handCard'] is the name to report (also for covered cards named
        earlier), b['card'] the single-view read; state.table(t) also lists covered cards no longer boxed."""
        boxes = self.detect(frame, cover_confidence)
        bodies = [b for b in boxes if b['detectorConfidence'] >= self.profile['detector']['confidence']]
        state.associate(t, bodies, boxes, small_frame(frame))
        self.identify(frame, bodies)
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
    - Strip reads (covered cards never seen whole) are off unless `stripProbability` <= 1; see README."""
    DEFAULTS = dict(dist=6, angle=8, gap=4.0, gapNamed=12.0, swapReads=2, minVotes=2, purity=0.8, medianProbability=0.8,
                    emptySeconds=3.0, contradiction=0.3, feltReads=2, glimpseSeconds=1.5, moveReads=2, stillKeep=0.0, coveredContradiction=True, singleVoteProbability=2.0, perClassMedian=None, stripProbability=2.0, stripMargin=0.3, stripAgree=0.7, stripMinViews=5)

    def __init__(self, **params):
        self.p = dict(self.DEFAULTS, **params); self.slots = []; self.n = 0
        self.hand = {}; self.hand_no = 0; self.empty_since = None

    def _new(self, t, b):
        sl = dict(id=self.n, xs=[], x=b['x'], y=b['y'], angle=b['angleDegrees'], width=b['width'], height=b['height'],
                  first=t, last=t, seen=t, votes={}, name=None, pend=None, npend=0, dead=False, views=[], stripViews=[], recent=None)
        self.n += 1; self.slots.append(sl); return sl

    def associate(self, t, bodies, cover, small=None):
        """Match bodies to slots by pose (b['slot']); cover = every detected box, also weak ones; small = the frame
        downscaled 4x (small_frame) for the bare-felt check, or None to skip it."""
        p = self.p
        if len(bodies) <= 1:
            self.empty_since = t if self.empty_since is None else self.empty_since
            if t - self.empty_since >= p['emptySeconds'] and self.hand: self.hand = {}; self.hand_no += 1
        else:
            self.empty_since = None
        for sl in self.slots:
            if any(_inside(sl['x'], sl['y'], c) for c in cover): sl['last'] = t
            # felt where a card lay: it was picked up or moved (fanned cards keep its centre covered)
            if small is not None and p['feltReads'] and sl['seen'] < t:
                sl['felt'] = sl.get('felt', 0) + 1 if bare_felt(small, sl['x'], sl['y']) else 0
                if sl['felt'] >= p['feltReads']: self._forget(sl); continue
            # a name seen only in a brief glimpse (a card in a hand) is carried only if a later card covers it
            glimpse = sl['seen'] - sl['first'] < p['glimpseSeconds'] and not self.covering(sl)
            # a named card still lying where it was, half covered by cards laid over it after the detector stopped
            # boxing it: >= stillKeep of its footprint is unchanged since its last box (a card taken away shows felt,
            # a hand, or whatever was put there instead)
            if p['stillKeep'] and small is not None and sl['name'] and not glimpse and sl['seen'] < t and sl.get('ref') is not None \
               and np.mean(np.abs(footprint(small, sl) - sl['ref']).max(2) <= 25) >= p['stillKeep']: sl['last'] = t
            keep = (sl['name'] and not glimpse) or sl['seen'] - sl['first'] >= 2.5
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

    def _strip(self, sl):
        p = self.p; ps = sl['stripViews']
        if p['stripProbability'] > 1 or len(ps) < p['stripMinViews']: return None
        m = np.mean(ps, 0); o = np.argsort(-m); top = int(o[0])
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
            sl = b['slot']; r = b.get('card')
            if r and sl['name'] and r != sl['name']:
                sl['npend'] = sl['npend'] + 1 if sl['pend'] == r else 1; sl['pend'] = r
                if sl['npend'] >= p['swapReads']:
                    sl['dead'] = True; sl = b['slot'] = self._new(t, b); sl['votes'][r] = p['swapReads']; r = None
            elif r:
                sl['pend'], sl['npend'] = None, 0
            if b.get('probabilities') is not None: sl['views'].append(b['probabilities']); sl['views'] = sl['views'][-200:]
            if b.get('stripProbabilities') is not None: sl['stripViews'].append(b['stripProbabilities']); sl['stripViews'] = sl['stripViews'][-60:]
            if r:
                sl['votes'][r] = sl['votes'].get(r, 0) + 1; sl['recent'] = sl['views'][-10:]
                sl['voteP'] = max(sl.get('voteP', 0), b['probability'])
            sl['xs'].append((b['x'], b['y'], b['angleDegrees'], b['width'], b['height'])); sl['xs'] = sl['xs'][-50:]
            m = np.median(np.array(sl['xs']), 0)
            sl.update(x=float(m[0]), y=float(m[1]), angle=float(m[2]), width=float(m[3]), height=float(m[4]), seen=t, last=t)
            if p['stillKeep'] and getattr(self, '_small', None) is not None: sl['ref'] = footprint(self._small, sl)
            if sl['votes']:
                top, n = max(sl['votes'].items(), key=lambda kv: kv[1])
                # one vote is enough for a card read whole at >= singleVoteProbability (seen once, then covered)
                ok = (n >= p['minVotes'] or (len(sl['votes']) == 1 and sl.get('voteP', 0) >= p['singleVoteProbability'])) \
                    and n >= p['purity'] * sum(sl['votes'].values())
                if ok and sl['recent']:
                    med = np.median(np.array(sl['recent']), 0)
                    mp = (p['perClassMedian'] or {}).get(top, p['medianProbability'])
                    ok = int(med.argmax()) == CODES.index(top) and med[CODES.index(top)] >= mp
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
        strips = {}
        for sl in self.slots:
            if not sl['name'] and sl['id'] not in dupe:
                v = self._strip(sl)
                if v and self.hand.get(v, sl['id']) == sl['id']: strips.setdefault(v, []).append(sl['id'])
        strip_of = {ids[0]: v for v, ids in strips.items() if len(ids) == 1}
        carried = {}
        for b in bodies:
            sl = b['slot']; c = sl['name'] if sl['id'] not in dupe and not sl['dead'] else None
            if b.get('card') and c and b['card'] != c: c = None  # pending swap: say nothing
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
            b['handCard'], b['source'] = (c, 'carried') if c else (v, 'view') if v else (s, 'strip') if s else (None, None)
        return bodies

    def table(self, t):
        """Every live slot, including covered cards the detector no longer boxes."""
        dupe = getattr(self, 'dupe', set())
        return [dict(slotId=sl['id'], x=sl['x'], y=sl['y'], width=sl['width'], height=sl['height'], angleDegrees=sl['angle'],
                     card=sl['name'] if sl['id'] not in dupe else None, placedSeconds=sl['first'], detected=sl['seen'] == t)
                for sl in self.slots]


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


def public(b):
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in b.items()
            if k not in ('quad', 'probabilities', 'stripProbabilities', 'slot')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source'); ap.add_argument('--overlay'); ap.add_argument('--jsonl')
    ap.add_argument('--start', type=float, default=0); ap.add_argument('--end', type=float, default=1e9)
    ap.add_argument('--no-hand-state', action='store_true', help='video: single views + StaticCardFuser only')
    a = ap.parse_args(); reader = OfcCardReader()
    if a.source.lower().endswith(('.jpg', '.jpeg', '.png')):
        frame = cv2.imread(a.source); bodies = reader.read(frame)
        print(json.dumps([public(b) for b in bodies]))
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
            bodies = fuser.update(t, reader.read(frame)); rec = dict(t=round(t, 3), cards=[public(b) for b in bodies])
        else:
            bodies = reader.read_hand(frame, t, state)
            rec = dict(t=round(t, 3), cards=[public(b) for b in bodies],
                       covered=[{k: (round(v, 2) if isinstance(v, float) else v) for k, v in sl.items()}
                                for sl in state.table(t) if not sl['detected'] and sl['card']])
        line = json.dumps(rec)
        print(line) if out is None else out.write(line + '\n')
    if a.overlay and frame is not None:  # the last frame read (use --end to choose it)
        cv2.imwrite(a.overlay, draw(frame, bodies, None if a.no_hand_state else state.table(last)))


if __name__ == '__main__':
    main()
