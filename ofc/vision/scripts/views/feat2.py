"""feat2.py: features of every single-view unit (vo-base.json, verd.txt) and every needed view report (needed-base.json):
hc (hand cover on the crop), sh (sharpness), ov (largest share of the box covered by one other body conf>=0.25), ov1 (any det >= 0.1),
p (gate probability, both turns mean), dc (det conf), rw/rh (box side / expected whole card)."""
import sys, os, json, re, math, cv2, numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ofc_card_vision import OfcCardReader, card_quad, expected_card
from cf import hand_cover, sharp
r = OfcCardReader(); G = r.profile['partialGuard']
U = json.load(open('vo-base.json')); N = json.load(open('needed-base.json')); V = {}
for l in open('verd.txt'):
    m = re.match(r'(\d+) ([RWUZ]) (.*)', l.strip())
    if m: V[int(m[1])] = m[2]
rows = {}
def load(s):
    if s not in rows:
        rows[s] = {}
        for line in open(f'scan/{s}/state.jsonl'):
            row = json.loads(line)
            for d in row['dets']:
                if d.get('crop'): rows[s][d['crop']] = (d, row['dets'])
    return rows[s]
def feats(s, crop):
    d, dets = load(s)[crop]; q = card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']); a = d['w'] * d['h']
    ov = ov1 = 0
    for o in dets:
        if o is d: continue
        got, _ = cv2.intersectConvexConvex(q, card_quad(o['x'], o['y'], o['w'], o['h'], o['deg']))
        ov1 = max(ov1, got / a)
        if o['conf'] >= 0.25: ov = max(ov, got / a)
    c = cv2.imread(f'scan/{s}/crops/{crop}'); b = dict(x=d['x'], y=d['y'], width=d['w'], height=d['h'], angleDegrees=d['deg'])
    r.identify_crops([b], [c.copy()]); ew, eh = expected_card(G, d['x'], d['y'], d['deg'])
    return dict(hc=round(hand_cover(c), 3), sh=round(sharp(c)), ov=round(ov, 2), ov1=round(ov1, 2), p=round(b['probability'], 3), dc=round(d['conf'], 2),
                rw=round(d['w'] / ew, 2), rh=round(d['h'] / eh, 2), src=d.get('src'))
out = []
for i, u in enumerate(U): out.append(dict(kind='unit', i=i, v=V[i], sess=u['sess'], name=u['name'], t=u['t0'], **feats(u['sess'], u['crops'][0])))
for n in N: out.append(dict(kind='need', i=-1, v='N', sess=n['frame'][:5], name=n['name'], t=n['t'], **feats(n['frame'][:5], n['crop'])))
json.dump(out, open('feat2.json', 'w'))
for o in out:
    if o['v'] in 'WUN': print(o)
