"""sim2.py TAG SESS[,SESS] ['{params}'] [MODEL.onnx]: sim.py's simulate() only (no v3 reference), writes ../sim-TAG-SESS.json."""
import sys, json, os
from src import REPO
sys.path.insert(0, R); sys.path.insert(0, R + '/scripts')
from sim import reader, simulate
tag, sessions = sys.argv[1], sys.argv[2].split(',')
params = json.loads(next((a for a in sys.argv[3:] if a.startswith('{')), '{}'))
model = next((a for a in sys.argv[3:] if a.endswith('.onnx')), R + '/models/card-identity.onnx')
r = reader(model)
for s in sessions:
    out = simulate(r, s, False, params)
    json.dump(out, open(f'../sim-{tag}-{s}.json', 'w'), default=float); print('done', s, flush=True)
