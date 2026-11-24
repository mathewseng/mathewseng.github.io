"""avgzoom.py SESS T0 T1 X Y W H DEG SCALE OUT: mean of every frame in [T0,T1] (a still table), region rotated upright."""
import sys, av, cv2, numpy as np
sys.path.insert(0, '/Users/mathewseng/Documents/GitHub/claude-worktrees/mathewseng.github.io/orange-board/ofc/vision')
from ofc_card_vision import card_quad
F = '/Users/mathewseng/Downloads/office-3-labelled-footage-20261123/ofc/'
FILES = {'s1836': 'ofc-20261123-1836.mp4', 's0023': 'ofc-20261124-0023.mp4'}
def mean_frame(s, t0, t1):
    c = av.open(F + FILES[s]); st = c.streams.video[0]; c.seek(int(max(t0 - 1, 0) / st.time_base), stream=st, backward=True)
    acc = None; n = 0
    for fr in c.decode(st):
        t = float(fr.pts * st.time_base)
        if t < t0: continue
        if t > t1: break
        im = fr.to_ndarray(format='bgr24').astype(np.float32); acc = im if acc is None else acc + im; n += 1
    return (acc / n).clip(0, 255).astype(np.uint8)
if __name__ == '__main__':
    s, t0, t1, x, y, w, h, deg, sc, out = sys.argv[1:11]
    img = mean_frame(s, float(t0), float(t1)); x, y, w, h, deg, sc = map(float, (x, y, w, h, deg, sc))
    q = card_quad(x, y, w, h, deg); W, H = int(w * sc), int(h * sc)
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    cv2.imwrite(out, cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_LANCZOS4))
