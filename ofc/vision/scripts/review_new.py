"""Rows for every slot the runtime names (by SOURCE) on views the v3 reference left unnamed: 4 crops + a 5x zoom.
python3 review_new.py SIMJSON SESSION SOURCE OUTPREFIX"""
import os, sys, json, av, cv2, numpy as np
from collections import defaultdict, Counter
from hand_state import run
from grab_frames import SESS
simf, s, src, pre = sys.argv[1:5]
sim = json.load(open(simf)); ref = run(s, 'v3'); N = defaultdict(list)
for fr, fo in zip(ref, sim):
    for br, bo in zip(fr['bodies'], fo['bodies']):
        if not br['carried'] and bo['hand'] and bo['src'] == src: N[bo['slot']].append((fo['t'], bo))
slots = sorted(N, key=lambda k: N[k][0][0]); mid = {k: N[k][len(N[k]) // 2] for k in slots}
c = av.open(os.path.expanduser('~/Downloads/')+'office-3-labelled-footage-20261123/' + SESS[s][0]); st = c.streams.video[0]; st.codec_context.skip_frame = 'NONKEY'
times = sorted({round(v[0], 2) for v in mid.values()}); frames = {}; i = 0
for fr in c.decode(st):
    t = float(fr.pts * st.time_base)
    while i < len(times) and t >= times[i] - 0.05: frames[times[i]] = fr.to_ndarray(format='bgr24'); i += 1
    if i >= len(times): break
rows = []
for k in slots:
    v = N[k]; row = np.full((240, 1240, 3), 30, np.uint8); names = Counter(b['hand'] for _, b in v)
    for j, txt in enumerate([f'#{k} {src}', f'{v[0][0]:.0f}-{v[-1][0]:.0f}s n{len(v)}'] + [f'{a}:{n}' for a, n in names.most_common(2)]):
        cv2.putText(row, txt, (6, 30 + 32 * j), 0, 0.7, (255, 255, 255), 2)
    for j, (t, b) in enumerate([v[round(q * (len(v) - 1) / 3)] for q in range(min(4, len(v)))]):
        row[8:200, 200 + 136 * j:328 + 136 * j] = cv2.resize(cv2.imread(f"../scan/{s}/crops/{b['crop']}"), (128, 192), interpolation=cv2.INTER_CUBIC)
    t, b = mid[k]; img = frames.get(round(t, 2))
    if img is not None:
        x0, y0 = int(b['x']) - 48, int(b['y']) - 48; z = img[max(y0, 0):y0 + 96, max(x0, 0):x0 + 96].copy()
        z = cv2.resize(z, (236, 236), interpolation=cv2.INTER_CUBIC); cc = (int((b['x'] - max(x0, 0)) * 236 / 96), int((b['y'] - max(y0, 0)) * 236 / 96))
        cv2.circle(z, cc, 4, (0, 0, 255), -1); row[2:238, 1000:1236] = z
    rows.append(row)
for j in range(0, len(rows), 6): cv2.imwrite(f'{pre}-{j // 6:02d}.jpg', np.vstack(rows[j:j + 6]))
print(s, src, len(rows), 'slots')
