"""amodal.py SESS [T0 T1]: amodal card labels for every keyframe of a session from the old detector's boxes (scan state.jsonl)
and the decoded canvases (canvas/SESS). A still card first seen whole keeps that whole-view box while later cards or hands
cover part of it; a card is labelled while >= 45 % of it (or >= 12 % with an index corner) still shows its own pixels and
lies under no later card. Writes labels/SESS.jsonl: {t, labels:[{x,y,w,h,deg,vis,src,trk}], merges:[...]} in frame px."""
import sys, os, json, math, glob, bisect
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from detin import S, OX, OY, CROP
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())
SCANS = os.environ.get('OFC_SCANS', ROOT + '/scan').split(':')  # old-detector scans (state.jsonl)
GW, GH = 16, 24  # card grid (cells) for pixel tests

def quad(x, y, w, h, deg):
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    pts = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    return np.array([(x + px * c - py * s, y + px * s + py * c) for px, py in pts], np.float32)

def to_canvas(q): return np.stack([(q[:, 0] - CROP[0]) * S + OX, (q[:, 1] - CROP[1]) * S + OY], 1).astype(np.float32)

_dst = np.array([[0, 0], [GW, 0], [GW, GH], [0, GH]], np.float32)
def patch(img, q):
    M = cv2.getPerspectiveTransform(to_canvas(q), _dst)
    return cv2.warpPerspective(img, M, (GW, GH), flags=cv2.INTER_AREA).astype(np.int16)

def grid_pts(q):  # frame coords of grid cell centres (GH, GW, 2)
    M = cv2.getPerspectiveTransform(_dst, q)
    u, v = np.meshgrid(np.arange(GW) + 0.5, np.arange(GH) + 0.5)
    p = np.stack([u, v, np.ones_like(u)], -1) @ M.T
    return p[..., :2] / p[..., 2:]

def inside(pts, q):  # points (...,2) inside convex quad q
    res = np.ones(pts.shape[:-1], bool)
    for i in range(4):
        a, b = q[i], q[(i + 1) % 4]
        res &= ((b[0] - a[0]) * (pts[..., 1] - a[1]) - (b[1] - a[1]) * (pts[..., 0] - a[0])) >= 0
    return res

def poly_iou(a, b):
    ia, _ = cv2.intersectConvexConvex(a, b)
    return ia / (cv2.contourArea(a) + cv2.contourArea(b) - ia + 1e-6)

def angd(a, b):
    d = abs(a - b) % 180; return min(d, 180 - d)

def load(sess):
    for sc in SCANS:
        p = f'{sc}/{sess}/state.jsonl'
        if os.path.exists(p): return [json.loads(l) for l in open(p)]
    raise SystemExit('no scan ' + sess)

def size_model(frames):
    """median (short, long) side of confident boxes per 60x60 px cell, smoothed by neighbours."""
    acc = {}
    for f in frames:
        for d in f['dets']:
            if d['conf'] >= 0.8: acc.setdefault((int(d['x'] // 60), int(d['y'] // 60)), []).append((d['w'], d['h']))
    med = {k: np.median(v, 0) for k, v in acc.items() if len(v) >= 20}
    def exp(x, y):
        cx, cy = int(x // 60), int(y // 60)
        for r in (0, 1, 2, 3):
            vs = [med[(cx + i, cy + j)] for i in range(-r, r + 1) for j in range(-r, r + 1) if (cx + i, cy + j) in med]
            if vs: return np.median(vs, 0)
        return np.array([38.0, 60.0])
    return exp

class Track:
    __slots__ = ('id', 'x', 'y', 'deg', 'views', 'born', 'last', 'geo', 'ref', 'refconf', 'merge', 'dead', 'miss', 'whole')
    def __init__(s, i, t, d):
        s.id = i; s.x, s.y, s.deg = d['x'], d['y'], d['deg']; s.views = [d]; s.born = t; s.last = t
        s.geo = None; s.ref = None; s.refconf = 0; s.merge = 0; s.dead = False; s.miss = 0; s.whole = []

def run(sess, t0=0, t1=1e9, canvas_dir=ROOT + '/canvas'):
    frames = [f for f in load(sess) if t0 <= f['t'] <= t1]
    exp = size_model(frames)
    files = sorted(glob.glob(f'{canvas_dir}/{sess}/*.jpg')); ft = [float(os.path.basename(p)[:-4]) for p in files]
    tracks, nid, out = [], 0, []
    for f in frames:
        t = f['t']; i = bisect.bisect_left(ft, t - 0.01)
        if i >= len(ft) or abs(ft[i] - t) > 0.01: continue
        img = cv2.GaussianBlur(cv2.imread(files[i]), (3, 3), 0)
        dets = [d for d in f['dets'] if d['conf'] >= 0.25]
        live = [k for k in tracks if not k.dead]
        # associate (6 px, 8 deg to the anchor), best conf first
        used = set()
        for d in sorted(dets, key=lambda d: -d['conf']):
            best, bd = None, 6.0
            for k in live:
                if k.id in used: continue
                dd = math.hypot(d['x'] - k.x, d['y'] - k.y)
                if dd < bd and angd(d['deg'], k.deg) < 8: best, bd = k, dd
            if best is None:
                best = Track(nid, t, d); nid += 1; tracks.append(best); live.append(best)
            else:
                best.views.append(d); best.last = t
                if len(best.views) <= 10:
                    best.x = float(np.median([v['x'] for v in best.views])); best.y = float(np.median([v['y'] for v in best.views]))
            used.add(best.id); d['_trk'] = best
            ew, eh = exp(d['x'], d['y'])
            sq = d['x'] >= 1680 and d['w'] >= 0.8 * d['h'] and 40 <= d['h'] <= 54  # right-edge sideways card (lens-squeezed)
            if d['conf'] >= 0.6 and (sq or (abs(d['w'] / ew - 1) < 0.12 and abs(d['h'] / eh - 1) < 0.12)):
                best.whole.append(d)
                if best.geo is None and len(best.whole) >= 3:
                    w = best.whole
                    best.geo = (float(np.median([v['x'] for v in w])), float(np.median([v['y'] for v in w])), float(np.median([v['w'] for v in w])),
                                float(np.median([v['h'] for v in w])), float(np.median([v['deg'] for v in w])))
                if best.geo is not None and d['conf'] > best.refconf and math.hypot(d['x'] - best.geo[0], d['y'] - best.geo[1]) < 3:
                    best.ref = patch(img, quad(*best.geo)); best.refconf = d['conf']
        # geometry tracks present now, in birth order
        present = [k for k in tracks if not k.dead and k.geo is not None and k.ref is not None]
        quads = {k.id: quad(*k.geo) for k in present}
        labels, merges = [], []
        for k in present:
            q = quads[k.id]
            # merge test: overlaps two earlier-born present cards each by >= 30 % of its area
            ov = [kk for kk in present if kk.born < k.born and cv2.intersectConvexConvex(q, quads[kk.id])[0] >= 0.3 * cv2.contourArea(q)]
            if len(ov) >= 2: k.merge += 1
            pts = grid_pts(q)
            cov = np.zeros((GH, GW), bool)
            for kk in present:
                if kk.born > k.born and poly_iou(q, quads[kk.id]) > 0.02: cov |= inside(pts, quads[kk.id])
            same = np.abs(patch(img, q) - k.ref).max(-1) <= 30
            vis_cells = same & ~cov
            vis = float(vis_cells.mean())
            idx = max(vis_cells[:GH // 4, :GW // 3].mean(), vis_cells[-GH // 4:, -GW // 3:].mean())
            boxed = k.last == t
            if not boxed:
                k.miss = k.miss + 1 if same.mean() < 0.3 else 0
                if k.miss >= 3: k.dead = True; continue
            if k.merge >= 3 and k.merge >= 0.5 * len(k.views): merges.append(k.id); continue
            if vis >= 0.45 or (vis >= 0.12 and idx >= 0.9):
                labels.append(dict(x=round(k.geo[0], 1), y=round(k.geo[1], 1), w=round(k.geo[2], 1), h=round(k.geo[3], 1), deg=round(k.geo[4], 1),
                                   vis=round(vis, 2), src='trk', trk=k.id, boxed=boxed))
        # tracks without geometry die after 6 s unseen; geometry tracks die by the pixel test above
        for k in tracks:
            if not k.dead and k.geo is None and t - k.last > 6: k.dead = True
        # confident raw boxes that no label explains: kept only when isolated (moving cards, cards in hand); any other box
        # no label explains (strips, merge boxes, weak boxes) becomes an ignore region (painted grey in training images)
        lq = [quad(l['x'], l['y'], l['w'], l['h'], l['deg']) for l in labels]
        allq = [(d, quad(d['x'], d['y'], d['w'], d['h'], d['deg'])) for d in f['dets']]
        ignore = []
        for d, q in allq:
            if any(poly_iou(q, x) > 0.3 for x in lq): continue
            iso = all(dd is d or poly_iou(q, qq) < 0.05 for dd, qq in allq)
            if d['conf'] >= 0.5 and iso and '_trk' in d and d['_trk'].id not in merges:
                ew, eh = exp(d['x'], d['y'])
                if (d['x'] >= 1680 and d['w'] >= 0.8 * d['h'] and 40 <= d['h'] <= 54) or (abs(d['w'] / ew - 1) < 0.15 and abs(d['h'] / eh - 1) < 0.15):
                    labels.append(dict(x=d['x'], y=d['y'], w=d['w'], h=d['h'], deg=d['deg'], vis=None, src='raw', trk=d['_trk'].id, boxed=True)); continue
            ignore.append([d['x'], d['y'], d['w'], d['h'], d['deg']])
        out.append(dict(t=t, labels=labels, merges=merges, ignore=ignore))
    return out

if __name__ == '__main__':
    sess = sys.argv[1]; t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0; t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
    out = run(sess, t0, t1)
    os.makedirs(ROOT + '/labels', exist_ok=True)
    with open(f'{ROOT}/labels/{sess}.jsonl', 'w') as fo:
        for o in out: fo.write(json.dumps(o) + '\n')
    print('done', sess, len(out), sum(len(o['labels']) for o in out))
