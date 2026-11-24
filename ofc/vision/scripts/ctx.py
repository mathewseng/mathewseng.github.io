"""Context zooms: python3 ctx.py SESSION X Y OUT T1 T2 ... (full keyframes, 5x around x, y, slot names drawn)"""
import os, sys, av, cv2, numpy as np
from hand_state import run
from grab_frames import SESS
s, X, Y, outp = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]; want = [float(a) for a in sys.argv[5:]]
tag = 'v3'
out = run(s, tag)
c = av.open(os.path.expanduser('~/Downloads/')+'office-3-labelled-footage-20261123/' + SESS[s][0]); st = c.streams.video[0]; st.codec_context.skip_frame = 'NONKEY'
c.seek(int(max(min(want) - 3, 0) / st.time_base), stream=st, backward=True)
got = {}
for fr in c.decode(st):
    t = float(fr.pts * st.time_base)
    for w in want:
        if w not in got and t >= w: got[w] = (t, fr.to_ndarray(format='bgr24'))
    if len(got) == len(want): break
rows = []
for w, (t, img) in sorted(got.items()):
    fb = min(out, key=lambda f: abs(f['t'] - t)); x0, y0 = int(X) - 70, int(Y) - 55
    z = cv2.resize(img[y0:y0 + 110, x0:x0 + 140], None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
    for b in fb['bodies']:
        if x0 < b['x'] < x0 + 140 and y0 < b['y'] < y0 + 110:
            p = (int((b['x'] - x0) * 5), int((b['y'] - y0) * 5)); cv2.circle(z, p, 5, (0, 0, 255), -1)
            cv2.putText(z, f"{b['track']} {b['name'] or ''}", (p[0] - 30, p[1] - 8), 0, 0.7, (0, 0, 255), 2)
    cv2.putText(z, f't={t:.0f}', (5, 25), 0, 0.8, (0, 0, 0), 2); rows.append(z)
while len(rows) % 2: rows.append(np.zeros_like(rows[0]))
cv2.imwrite(outp, np.vstack([np.hstack(rows[i:i + 2]) for i in range(0, len(rows), 2)]))
