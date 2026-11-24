"""Page overlays for hand-state reading: run OfcHandState from the start of a hand to a moment, then save a 2x zoom of
one player's rows. Labels of covered cards sit on their visible strip (pushed away from the cards lying on them).
python3 render_hand_samples.py VIDEO HAND_START T X0 Y0 X1 Y1 OUT.jpg"""
import sys, math, av, cv2, numpy as np
sys.path.insert(0, __file__.rsplit('/scripts/', 1)[0])
from ofc_card_vision import OfcCardReader, OfcHandState, draw
video, t0, t1 = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); x0, y0, x1, y1 = map(int, sys.argv[4:8]); outp = sys.argv[8]
r = OfcCardReader(); st = OfcHandState(**r.profile.get('handState', {}))
c = av.open(video); s = c.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
c.seek(int(max(t0 - 2, 0) / s.time_base), stream=s, backward=True)
for fr in c.decode(s):
    t = float(fr.pts * s.time_base)
    if t < t0: continue
    if t > t1: break
    frame = fr.to_ndarray(format='bgr24'); bodies = r.read_hand(frame, t, st); last = t
t = last
def label_at(sl, cx, cy):
    cov = st.covering(sl)
    if not cov: return cx, cy
    mx, my = np.mean([o['x'] for o in cov]), np.mean([o['y'] for o in cov]); dx, dy = cx - mx, cy - my; n = math.hypot(dx, dy) or 1
    return cx + dx / n * 0.3 * sl['height'], cy + dy / n * 0.3 * sl['height']
for b in bodies: b['labelAt'] = label_at(b['slot'], b['x'], b['y'])
table = st.table(t); live = {sl['id']: sl for sl in st.slots}
for e in table: e['labelAt'] = label_at(live[e['slotId']], e['x'], e['y'])
f = 2
big = cv2.resize(frame, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
def scale(d):
    d = dict(d); d['x'], d['y'] = d['x'] * f, d['y'] * f; d['labelAt'] = (d['labelAt'][0] * f, d['labelAt'][1] * f)
    for k in ('width', 'height'):
        if k in d: d[k] *= f
    if 'quad' in d: d['quad'] = d['quad'] * f
    return d
img = draw(big, [scale(b) for b in bodies], [scale(e) for e in table])[y0 * f:y1 * f, x0 * f:x1 * f]
cv2.imwrite(outp, img, [cv2.IMWRITE_JPEG_QUALITY, 85])
named = sum(1 for b in bodies if x0 < b['x'] < x1 and y0 < b['y'] < y1 and b['handCard'])
boxed = sum(1 for b in bodies if x0 < b['x'] < x1 and y0 < b['y'] < y1)
hidden = sum(1 for e in table if x0 < e['x'] < x1 and y0 < e['y'] < y1 and not e['detected'] and e['card'])
single = sum(1 for b in bodies if x0 < b['x'] < x1 and y0 < b['y'] < y1 and b['card'])
print(f'{outp}: t={t:.2f} boxed {boxed} single-view named {single} hand-state named {named} + covered unboxed named {hidden}')
