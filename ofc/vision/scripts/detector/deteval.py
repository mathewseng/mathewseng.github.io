"""deteval.py MODEL.onnx TAG [nms]: detector recall/precision at the 30 eye-truth frames (25 eye + 5 fresh).
GT = truth objects: legible cards (dup objects folded), '?' objects (old spanning/boundary boxes), X; plus 'missed' cards
(no geometry). Card geometry: the amodal tracker label overlapping the object (whole-view box) or else the object box.
A box is GOOD for a card if its centre is within 5 px across / 7 px along the card, size within 25 %, angle within 15 deg
(90 for near-square). Writes det/eval-TAG.json (per frame: cards with matched box, unmatched boxes)."""
import sys, os, json, glob, math, bisect, cv2, numpy as np, onnxruntime as ort
sys.path.insert(0, os.path.dirname(__file__))
from detin import S, OX, OY, CROP
from amodal import quad, poly_iou
from gtsheet import truth
ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())  # scratch: canvas/, labels/, det/, scan/
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))
from ofc_card_vision import rotated_nms
EV = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eval')
FRAMES = sorted(os.path.basename(p)[:-5] for p in glob.glob(EV + '/*/objects/*.json'))
FRESH = {os.path.basename(p)[:-5] for p in glob.glob(EV + '/fresh-truth/objects/*.json')}

def detect(sess, img, conf=0.25, nms=0.5):
    out = sess.run(None, {sess.get_inputs()[0].name: img[:, :, ::-1].transpose(2, 0, 1)[None].astype(np.float32) / 255})[0][0]
    sel = out[4] >= conf
    if not sel.any(): return []
    boxes, scores = out[[0, 1, 2, 3, 5]][:, sel].T.copy(), out[4][sel]
    res = []
    for i in rotated_nms(boxes, scores, nms):
        cx, cy, bw, bh, ang = boxes[i]
        cx, cy, bw, bh, deg = (cx - OX) / S + CROP[0], (cy - OY) / S + CROP[1], bw / S, bh / S, math.degrees(ang)
        if bw > bh: bw, bh, deg = bh, bw, deg + 90
        deg = (deg + 90) % 180 - 90
        res.append(dict(x=float(cx), y=float(cy), w=float(bw), h=float(bh), deg=float(deg), conf=float(scores[i])))
    return res

def canvas_at(sess, t):
    files = sorted(glob.glob(f'{ROOT}/canvas/{sess}/*.jpg')); ft = [float(os.path.basename(p)[:-4]) for p in files]
    i = min(range(len(ft)), key=lambda i: abs(ft[i] - t)); return cv2.imread(files[i])

def labels_at(sess, t):
    best = None
    for l in open(f'{ROOT}/labels/{sess}.jsonl'):
        f = json.loads(l)
        if best is None or abs(f['t'] - t) < abs(best['t'] - t): best = f
    return best['labels']

def angd(a, b):
    d = abs(a - b) % 180; return min(d, 180 - d)

def good(b, c):
    a = math.radians(c['deg']); dx, dy = b['x'] - c['x'], b['y'] - c['y']
    du, dv = abs(dx * math.cos(a) + dy * math.sin(a)), abs(-dx * math.sin(a) + dy * math.cos(a))
    sq = c['w'] >= 0.8 * c['h']
    # near-square boxes: orientation ambiguous, compare max/min sides
    if sq: du, dv = max(du, dv), min(du, dv); tol_u, tol_v = 6, 6
    else: tol_u, tol_v = 5, 7
    size = abs(b['w'] / c['w'] - 1) <= 0.25 and abs(b['h'] / c['h'] - 1) <= 0.25
    ang = angd(b['deg'], c['deg']) <= 15 or (sq and angd(b['deg'], c['deg'] + 90) <= 15)
    return du <= tol_u and dv <= tol_v and size and ang, math.hypot(du, dv)

GEO = json.load(open(ROOT + '/det/gt-overrides.json')) if os.path.exists(ROOT + '/det/gt-overrides.json') else {}

def gt(name):
    obj, lab = truth(name); sess, t = obj['session'], obj['t']
    L = labels_at(sess, t)
    cards = {}
    for o in obj['objects']:
        l = lab.get(o['id'], '-')
        if l.startswith('dup:'): continue
        geo = dict(x=o['x'], y=o['y'], w=o['w'], h=o['h'], deg=o['deg'])
        qo = quad(**geo)
        best = max(L, key=lambda x: poly_iou(qo, quad(x['x'], x['y'], x['w'], x['h'], x['deg'])), default=None)
        if best is not None and poly_iou(qo, quad(best['x'], best['y'], best['w'], best['h'], best['deg'])) >= 0.6 and best['src'] == 'trk':
            geo = dict(x=best['x'], y=best['y'], w=best['w'], h=best['h'], deg=best['deg'])
        geo.update(GEO.get(f"{name}:{o['id']}", {}))
        kind = 'card' if (len(l) == 2 and l[0] in 'SHDC') else ('cq' if l == 'C?' else ('x' if l == 'X' else 'amb'))
        cards[o['id']] = dict(id=o['id'], code=l, kind=kind, first=o.get('first') or 0, hidden=o['kind'] != 'box', **geo)
    # dup objects: extra geometry for the same card
    for o in obj['objects']:
        l = lab.get(o['id'], '-')
        if l.startswith('dup:') and int(l[4:]) in cards: cards[int(l[4:])].setdefault('alts', []).append(dict(x=o['x'], y=o['y'], w=o['w'], h=o['h'], deg=o['deg']))
    return obj, list(cards.values())

def categorize(cards):
    """vis = share of the card under no later-placed card (by slot placement time); sideways from the geometry."""
    real = [c for c in cards if c['kind'] in ('card', 'cq', 'amb')]
    for c in cards:
        q = quad(c['x'], c['y'], c['w'], c['h'], c['deg']); A = cv2.contourArea(q)
        from amodal import grid_pts, inside
        pts = grid_pts(q); cov = np.zeros(pts.shape[:2], bool)
        for o in real:
            if o is c or o['kind'] == 'amb' or o['first'] <= c['first']: continue
            cov |= inside(pts, quad(o['x'], o['y'], o['w'], o['h'], o['deg']))
        c['vis'] = float(1 - cov.mean())
        c['side'] = bool(abs(c['deg']) > 45 or (c['x'] >= 1680 and c['w'] >= 0.8 * c['h']))
        c['cat'] = 'whole' if c['vis'] >= 0.9 and not c['hidden'] else ('partial' if c['vis'] >= 0.4 else 'strip')

def main():
    model, tag = sys.argv[1], sys.argv[2]; nms = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    res = {}
    for name in FRAMES:
        obj, cards = gt(name); categorize(cards)
        boxes = detect(sess, canvas_at(obj['session'], obj['t']), nms=nms)
        # assign each box to its best good card (unique), then classify leftovers
        pairs = []
        for bi, b in enumerate(boxes):
            for c in cards:
                for g in [c] + c.get('alts', []):
                    ok, d = good(b, g)
                    if ok: pairs.append((d, bi, c['id']))
        pairs.sort(); used_b, used_c, match = set(), set(), {}
        for d, bi, ci in pairs:
            if bi in used_b or ci in used_c: continue
            used_b.add(bi); used_c.add(ci); match[ci] = bi
        out_boxes = []
        for bi, b in enumerate(boxes):
            qb = quad(b['x'], b['y'], b['w'], b['h'], b['deg'])
            if bi in used_b:
                ci = next(c for c, x in match.items() if x == bi); k = next(c for c in cards if c['id'] == ci)['kind']
                cls = {'card': 'tp', 'cq': 'tp', 'amb': 'amb', 'x': 'x'}[k]
            else:
                ious = [poly_iou(qb, quad(c['x'], c['y'], c['w'], c['h'], c['deg'])) for c in cards if c['kind'] != 'x']
                n = sum(i >= 0.15 for i in ious)
                gdup = any(good(b, c)[0] for c in cards)
                cls = 'dup' if gdup else ('merge' if n >= 2 else ('partial' if n == 1 else 'stray'))
            out_boxes.append(dict(b, cls=cls, bi=bi))
        res[name] = dict(session=obj['session'], t=obj['t'], cards=[dict(c, box=match.get(c['id'])) for c in cards], boxes=out_boxes,
                         fresh=name in FRESH)
    json.dump(res, open(f'{ROOT}/det/eval-{tag}.json', 'w'), indent=0)
    summarize(res)

def summarize(res):
    import collections
    for grp, names in (('fresh', [n for n in res if res[n]['fresh']]), ('eye', [n for n in res if not res[n]['fresh']])):
        R = collections.Counter(); N = collections.Counter(); P = collections.Counter()
        for n in names:
            for c in res[n]['cards']:
                if c['kind'] not in ('card', 'cq'): continue
                for k in [c['cat']] + (['sideways'] if c['side'] else []) + ['all']:
                    N[k] += 1; R[k] += c['box'] is not None
            for b in res[n]['boxes']: P[b['cls']] += 1
        print(grp, ' '.join(f"{k} {R[k]}/{N[k]}" for k in ('all', 'whole', 'partial', 'strip', 'sideways')), '| boxes', dict(P))

if __name__ == '__main__':
    main()
