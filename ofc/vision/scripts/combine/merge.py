"""merge.py RULE ROOT SESS...: merged scans of the shipped detector (A, ofc-vision2/scan) and d1 (B, ofc-vision8/r-d1e3/scan) into
ROOT/scan/SESS (crops/a, crops/b symlinked; crop names prefixed). RULE: add<IOU> (A + B bodies whose rotated IoU with every A box
of conf>=0.25 is < IOU), or span<IOU> (add rule + an A body clearly larger than a card holding >= 2 B bodies is replaced by them)."""
import sys, os, json, math, cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cs import expected
sys.path.insert(0, '/private/tmp/claude-501/ofc-wt9/ofc/vision')
from ofc_card_vision import card_quad
A, B = '/private/tmp/claude-501/ofc-vision2/scan', '/private/tmp/claude-501/ofc-vision8/r-d1e3/scan'
rule, root = sys.argv[1], sys.argv[2]
th = float(rule[3:] if rule.startswith('add') else rule[4:])
def poly(d): return card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']).astype(np.float32)
def iou(p, q):
    a, _ = cv2.intersectConvexConvex(p, q)
    return a / (cv2.contourArea(p) + cv2.contourArea(q) - a + 1e-9)
def inside(p, big):  # fraction of p's area inside big
    a, _ = cv2.intersectConvexConvex(p, big); return a / (cv2.contourArea(p) + 1e-9)
stats = {}
for s in sys.argv[3:]:
    out = f'{root}/scan/{s}'; os.makedirs(out + '/crops', exist_ok=True)
    for k, src in (('a', A), ('b', B)):
        if not os.path.exists(f'{out}/crops/{k}'): os.symlink(os.path.realpath(f'{src}/{s}/crops'), f'{out}/crops/{k}')
    if not os.path.exists(out + '/thumbs'): os.symlink(os.path.realpath(f'{A}/{s}/thumbs'), out + '/thumbs')
    st = stats.setdefault(s, dict(frames=0, added=0, replaced=0))
    with open(f'{out}/state.jsonl', 'w') as fo:
        for la, lb in zip(open(f'{A}/{s}/state.jsonl'), open(f'{B}/{s}/state.jsonl')):
            ra, rb = json.loads(la), json.loads(lb); assert abs(ra['t'] - rb['t']) < 0.01
            da = [dict(d, src='a', crop='a/' + d['crop']) if d.get('crop') else dict(d, src='a') for d in ra['dets']]
            db = [dict(d, src='b', crop='b/' + d['crop']) if d.get('crop') else dict(d, src='b') for d in rb['dets']]
            pa = [poly(d) for d in da]; pb = [poly(d) for d in db]
            drop = set()
            if rule.startswith('span'):
                for i, d in enumerate(da):
                    if d['conf'] < 0.25: continue
                    ew, eh = expected(d['x'], d['y'], d['deg'])
                    if d['w'] < 1.2 * ew and d['h'] < 1.2 * eh: continue
                    inn = [j for j, e in enumerate(db) if e['conf'] >= 0.25 and inside(pb[j], pa[i]) >= 0.7]
                    if len(inn) >= 2: drop.add(i)
            keep_a = [i for i in range(len(da)) if i not in drop]
            add = []
            for j, e in enumerate(db):
                if e['conf'] < 0.25: continue
                if all(iou(pb[j], pa[i]) < th for i in keep_a if da[i]['conf'] >= 0.25): add.append(j)
            st['frames'] += 1; st['added'] += len(add); st['replaced'] += len(drop)
            dets = [da[i] for i in keep_a] + [db[j] for j in add]
            fo.write(json.dumps(dict(t=ra['t'], dets=dets)) + '\n')
    print(s, st, flush=True)
