"""Run the shipped runtime (OfcCardReader gate + OfcHandState) over a scanned session's detections and saved crops,
with a candidate classifier, and score it against the v3 hand-state reference (names carried from v3 clean reads,
checked by eye on filmstrips). python3 sim.py MODEL.onnx SESSION[,SESSION] [masked] ['{state params}']"""
import sys, os, json, cv2, numpy as np, onnxruntime as ort
from collections import Counter, defaultdict
RT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sys.path.insert(0, RT)
from ofc_card_vision import OfcCardReader, OfcHandState, cover_mask, card_quad
def reader(model, strip=None):
    r = OfcCardReader(RT + '/profile.json')
    o = ort.SessionOptions(); o.intra_op_num_threads = 4
    r.cls = ort.InferenceSession(model, o, providers=['CPUExecutionProvider']); r.cls_in = r.cls.get_inputs()[0].name
    r.strip = ort.InferenceSession(strip, o, providers=['CPUExecutionProvider']) if strip else None
    return r
def simulate(r, s, masked, params):  # masked: a strip reader is attached
    st = OfcHandState(**params); out = []
    for line in open(f'../scan/{s}/state.jsonl'):
        row = json.loads(line); t = row['t']
        boxes = [dict(x=d['x'], y=d['y'], width=d['w'], height=d['h'], angleDegrees=d['deg'], detectorConfidence=d['conf'],
                      quad=card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']), crop=d.get('crop')) for d in row['dets']]
        bodies = [b for b in boxes if b['detectorConfidence'] >= 0.25]
        st.associate(t, bodies, boxes)
        crops = [cv2.imread(f"../scan/{s}/crops/{b['crop']}") for b in bodies]
        r.identify_crops(bodies, [c.copy() for c in crops])
        if r.strip is not None:
            todo, mc = [], []
            for b, im in zip(bodies, crops):
                if b['slot']['name']: continue
                m = cover_mask(b, st.covering(b['slot']), 64, 96, 0.10)
                if m is None: continue
                im = im.copy(); im[m > 0] = 128; todo.append(b); mc.append(im)
            if todo:
                for b, pr in zip(todo, r.strip_probabilities(mc)): b['stripProbabilities'] = pr
        st.update(t, bodies)
        out.append(dict(t=t, bodies=[dict(x=b['x'], y=b['y'], crop=b['crop'], card=b['card'], hand=b['handCard'], src=b['source'], slot=b['slotId'])
                                     for b in bodies], table=st.table(t)))
    return out
if __name__ == '__main__':
    model, sessions = sys.argv[1], sys.argv[2].split(',')
    strip = next((a for a in sys.argv[3:] if a.endswith('.onnx')), None); masked = bool(strip); params = json.loads(next((a for a in sys.argv[3:] if a.startswith('{')), '{}'))
    from hand_state import run
    r = reader(model, strip)
    for s in sessions:
        ref = run(s, 'v3'); out = simulate(r, s, masked, params)
        json.dump(out, open(f'../sim-{os.path.basename(model)[:-5]}-{s}{"-m" if masked else ""}.json', 'w'), default=float)
        c = Counter(); w = Counter(); novel = defaultdict(Counter)
        for fr, fo in zip(ref, out):
            assert len(fr['bodies']) == len(fo['bodies'])
            for br, bo in zip(fr['bodies'], fo['bodies']):
                if br['carried']:
                    c['ref'] += 1; c['ref_' + str(bo['src'])] += 1
                    if bo['hand'] and bo['hand'] != br['carried']: w[(bo['src'], br['carried'], bo['hand'])] += 1
                else:
                    c['unref'] += 1
                    if bo['hand']: c['new_' + bo['src']] += 1; novel[bo['slot']][(bo['src'], bo['hand'])] += 1
        print(f"{s} {os.path.basename(model)}{' masked' if masked else ''}: reference-named views {c['ref']}: named {c['ref']-c['ref_None']} "
              f"(carried {c['ref_carried']}, view {c['ref_view']}, strip {c['ref_strip']}) wrong {sum(w.values())} {w.most_common(6)}")
        print(f"   other views {c['unref']}: named carried {c['new_carried']} view {c['new_view']} strip {c['new_strip']} on {len(novel)} slots")
