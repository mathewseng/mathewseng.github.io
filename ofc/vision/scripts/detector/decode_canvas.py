"""decode_canvas.py SESS OUTDIR: every keyframe of SESS -> 1024x480 detector input canvas OUTDIR/SESS/{t:08.3f}.jpg"""
import sys, os, cv2, av
sys.path.insert(0, os.path.dirname(__file__)); from detin import canvas
W = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'eye')
sys.path.insert(0, W)
import src
OLD = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/ofc/')
src.SESS.update({'s1524': [(OLD + 'ofc-20261123-1524-starts-0800.mp4', 0, 1e9)], 's1931': [(OLD + 'ofc-20261123-1931-no-board-audio.mp4', 0, 1e9)],
                 's1953': [(OLD + 'ofc-20261123-1953.mp4', 0, 1e9)], 's2310': [(OLD + 'ofc-20261123-2310-three-players.mp4', 0, 1e9)],
                 'stud': [(OLD + 'ofc-20261124-0023.mp4', 0, 1e9)]})
sess, out = sys.argv[1], sys.argv[2]
t0 = {'s1524': 470, 'stud': 650}.get(sess, 0)
d = f'{out}/{sess}'; os.makedirs(d, exist_ok=True)
n = 0
for t, fr in src.frames(sess, t0, 1e9, keyonly=True):
    p = f'{d}/{t:08.3f}.jpg'
    if not os.path.exists(p): cv2.imwrite(p, canvas(fr.to_ndarray(format='bgr24')), [cv2.IMWRITE_JPEG_QUALITY, 92])
    n += 1
print('done', sess, n, flush=True)
