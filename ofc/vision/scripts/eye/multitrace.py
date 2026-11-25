"""multitrace.py SESS T0 T1 '[[X,Y],...]' ['{params}'] [START]: slottrace.py for several spots in one pass (slots within 8 px of any
point): id, name, votes, view, corner evidence, held/dupe state and the report at every keyframe in T0..T1. START
(default T0 - 400) is where the sim begins; start before the hand began."""
import sys, os, json, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', '..')); sys.path.insert(0, os.path.join(HERE, '..'))
from sim import reader
from ofc_card_vision import OfcHandState, card_quad, CODES
from src import REPO
C = CODES + ['none']
s, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); PTS = json.loads(sys.argv[4]); X = Y = 0
params = json.loads(next((a for a in sys.argv[5:] if a.startswith('{')), '{}'))
start = float(next((a for a in sys.argv[5:] if not a.startswith('{')), t0 - 400))
r = reader(REPO + '/models/card-identity.onnx')
st = OfcHandState(**dict(r.profile.get('handState', {}), **params))
def top(v):
    v = np.asarray(v); k = int(v.argmax()); return f'{C[k]}:{v[k]:.2f}'
for line in open(f'../scan/{s}/state.jsonl'):
    row = json.loads(line); t = row['t']
    if t < start: continue
    if t > t1: break
    boxes = [dict(x=d['x'], y=d['y'], width=d['w'], height=d['h'], angleDegrees=d['deg'], detectorConfidence=d['conf'],
                  quad=card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']), crop=d.get('crop')) for d in row['dets']]
    bodies = [b for b in boxes if b['detectorConfidence'] >= 0.25]
    th = f"../scan/{s}/thumbs/{t:08.3f}.png"
    st.associate(t, bodies, boxes, cv2.imread(th) if os.path.exists(th) else None)
    crops = [cv2.imread(f"../scan/{s}/crops/{b['crop']}") for b in bodies]
    r.identify_crops(bodies, [c.copy() for c in crops])
    if getattr(r, 'corner', None) is not None: r.corner_reads(st, bodies, crops)
    st.update(t, bodies)
    if t < t0: continue
    near = [sl for sl in st.slots if any(abs(sl['x'] - X) < 8 and abs(sl['y'] - Y) < 8 for X, Y in PTS)]
    for sl in near:
        bs = [b for b in bodies if b['slot'] is sl]
        b = bs[0] if bs else None
        ps = sl['stripViews']; sm = top(np.mean(ps, 0)) if ps else '-'
        agree = f"{np.mean([int(np.argmax(q)) == int(np.argmax(np.mean(ps, 0))) for q in ps]):.2f}" if ps else '-'
        med = top(np.median(np.array(sl['views'][-20:]), 0)) if sl['views'] else '-'
        sr = st._strip_read(sl)
        print(f"{t:8.2f} slot {sl['id']} ({sl['x']:.0f},{sl['y']:.0f}) name={sl['name']} votes={sl['votes']} "
              f"box={'yes' if b else 'no'} view={top(b['probabilities']) if b else '-'} jumbo={b.get('deckJumbo', 0) if b else 0:.2f} "
              f"pair={b.get('cornerPair') if b else '-'} pairs={sl['pairs']} strip n={len(ps)} mean={sm} agree={agree} "
              f"stripRead={sr} med20={med} strip={st._strip(sl)} held={sr in st.held if sr else '-'} dupe={sl['id'] in st.dupe} "
              f"jumboHand={st.jumbo_hand()} report={b['handCard'] if b else st.strip_of.get(sl['id'])}", flush=True)
