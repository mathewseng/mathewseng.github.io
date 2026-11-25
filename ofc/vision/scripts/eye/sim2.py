"""sim2.py TAG SESS[,SESS] ['{params}'] [MODEL.onnx] [fb=FALLBACK.onnx:below] [deck=GATE.onnx:jumbo[:JUMBO.onnx]] [corner=CORNER.onnx]: sim.py's simulate() only (no v3 reference), writes ../sim-TAG-SESS.json."""
import sys, json, os
from src import REPO
R = REPO
sys.path.insert(0, R); sys.path.insert(0, R + '/scripts')
from sim import reader, simulate
tag, sessions = sys.argv[1], sys.argv[2].split(',')
params = json.loads(next((a for a in sys.argv[3:] if a.startswith('{')), '{}'))
model = next((a for a in sys.argv[3:] if a.endswith('.onnx') and '=' not in a), R + '/models/card-identity.onnx')
r = reader(model)
fb = next((a for a in sys.argv[3:] if a.startswith('fb=')), None)  # fb=FALLBACK.onnx:below (fallbackClassifier)
if fb:
    import onnxruntime as ort
    path, below = fb[3:].split(':'); r.fb = ort.InferenceSession(path, providers=['CPUExecutionProvider']); r.fb_below = float(below)
dk = next((a for a in sys.argv[3:] if a.startswith('deck=')), None)  # deck=GATE.onnx:jumbo (deckGate)
if dk:
    import onnxruntime as ort
    path, th = dk[5:].split(':')[:2]; r.deck = ort.InferenceSession(path, providers=['CPUExecutionProvider']); r.deck_jumbo = float(th)
    jc = dk[5:].split(':')[2:]  # deck=GATE.onnx:jumbo:JUMBO_CLASSIFIER.onnx reads jumbo crops with their own classifier
    r.jumbo = ort.InferenceSession(jc[0], providers=['CPUExecutionProvider']) if jc else None
cr = next((a for a in sys.argv[3:] if a.startswith('corner=')), None)  # corner=CORNER.onnx (cornerReader)
if cr:
    import onnxruntime as ort
    r.corner = ort.InferenceSession(cr[7:], providers=['CPUExecutionProvider'])
pg = next((a for a in sys.argv[3:] if a.startswith('pg=')), None)  # pg=GUARD.json (partialGuard: q, short, cover)
if pg: r.profile['partialGuard'] = json.load(open(pg[3:]))
for s in sessions:
    out = simulate(r, s, False, params)
    json.dump(out, open(f'../sim-{tag}-{s}.json', 'w'), default=float); print('done', s, flush=True)
