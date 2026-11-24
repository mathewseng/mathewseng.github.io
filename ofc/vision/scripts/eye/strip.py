"""strip.py SESS T0 T1 STEP X Y W H SCALE OUT: filmstrip of a table region (all frames, not only keyframes)."""
import sys, av, cv2, numpy as np
F = '/Users/mathewseng/Downloads/office-3-labelled-footage-20261123/ofc/'
FILES = {'s1836': 'ofc-20261123-1836.mp4', 's0023': 'ofc-20261124-0023.mp4'}
s, t0, t1, step, x, y, w, h, sc, out = sys.argv[1:11]
t0, t1, step, x, y, w, h, sc = map(float, (t0, t1, step, x, y, w, h, sc))
c = av.open(F + FILES[s]); st = c.streams.video[0]; c.seek(int(max(t0 - 1, 0) / st.time_base), stream=st, backward=True)
tiles = []; nxt = t0
for fr in c.decode(st):
    t = float(fr.pts * st.time_base)
    if t < nxt: continue
    if t > t1: break
    im = fr.to_ndarray(format='bgr24')[int(y - h / 2):int(y + h / 2), int(x - w / 2):int(x + w / 2)]
    im = cv2.resize(im, None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
    cv2.putText(im, f'{t:.1f}', (3, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2); tiles.append(np.pad(im, ((2, 2), (2, 2), (0, 0))))
    nxt = t + step
cols = int(sys.argv[11]) if len(sys.argv) > 11 else 6
tiles += [np.zeros_like(tiles[0])] * ((-len(tiles)) % cols)
cv2.imwrite(out, np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 88])
