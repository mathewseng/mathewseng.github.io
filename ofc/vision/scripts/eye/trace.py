"""trace.py SESS T0 T1 X Y [params]: run the shipped hand state from T0 to T1 on a scan; print each keyframe's slot
nearest (X, Y) (within 10 px): id, name, detected, felt, votes, and box at that spot."""
import sys, json, math, os, cv2, numpy as np
from src import REPO
sys.path.insert(0, REPO)
sys.path.insert(0, os.path.join(REPO, 'scripts'))
import ofc_card_vision as V
from sim import reader
s, t0, t1, X, Y = sys.argv[1], *map(float, sys.argv[2:6])
params = json.loads(sys.argv[6]) if len(sys.argv) > 6 else {}
r = reader(os.path.join(REPO, 'models', 'card-identity.onnx'))
st = V.OfcHandState(**dict(r.profile.get('handState', {}), **params))
orig_forget = st._forget
def fg(sl):
    if math.hypot(sl['x'] - X, sl['y'] - Y) < 10: print('   forget', sl['id'], sl['name'], 'felt', sl.get('felt'), 'moved', sl.get('moved'))
    orig_forget(sl)
st._forget = fg
for line in open(f'../scan/{s}/state.jsonl'):
    row = json.loads(line); t = row['t']
    if t < t0: continue
    if t > t1: break
    boxes = [dict(x=d['x'], y=d['y'], width=d['w'], height=d['h'], angleDegrees=d['deg'], detectorConfidence=d['conf'],
                  quad=V.card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']), crop=d.get('crop')) for d in row['dets']]
    bodies = [b for b in boxes if b['detectorConfidence'] >= 0.25]
    th = f"../scan/{s}/thumbs/{t:08.3f}.png"
    st.associate(t, bodies, boxes, cv2.imread(th) if os.path.exists(th) else None)
    r.identify_crops(bodies, [cv2.imread(f"../scan/{s}/crops/{b['crop']}") for b in bodies])
    st.update(t, bodies)
    near = [sl for sl in st.slots if math.hypot(sl['x'] - X, sl['y'] - Y) < 10]
    bx = [b for b in bodies if math.hypot(b['x'] - X, b['y'] - Y) < 10]
    cov = [round(c['detectorConfidence'], 2) for c in boxes if V._inside(X, Y, c)]
    sm = cv2.imread(th) if os.path.exists(th) else None
    fr_ = lambda sl: round(float(np.mean(np.abs(V.footprint(sm, sl) - sl['ref']).max(2) <= 25)), 2) if sl.get('ref') is not None and sm is not None else None
    print(round(t, 2), [(sl['id'], sl['name'], sl['seen'] == t, fr_(sl), sum(sl['votes'].values())) for sl in near],
          [(b['card'], b['handCard'], b.get('label'), round(b.get('probability', 0), 2)) for b in bx], 'cover', cov)
