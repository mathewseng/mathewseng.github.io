"""src.py: session sources for the eye tools. Sessions: old held-out files plus the 2026-11-24 office-3 footage (n1501 = 15:01 combined file,
n1532 = 1-minute clips 0-77 from 15:31:55 EST, stitched on a global clock = cumulative clip durations).
frames(sess, t0, t1, keyonly) yields (t, frame); frame_at(sess, t)."""
import os, json, av
HERE = os.path.dirname(os.path.abspath(__file__))
OLD = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/ofc/')
D1 = os.path.expanduser('~/Downloads/office-3-wide-20261124-150116-l61q7w03/')
D2 = os.path.expanduser('~/Downloads/office-3-wide-20261124-153155-0tvbinup/')
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
def _clip_durations(n=78):
    # video stream duration of each 1-minute clip (cached beside the clips' scan)
    cache = os.path.expanduser('~/.cache/ofc-vision-n1532-clips.json')
    if os.path.exists(cache): return json.load(open(cache))
    out = []
    for i in range(n):
        c = av.open(D2 + f'office-3-wide_01_{i:06d}.mp4'); s = c.streams.video[0]; out.append(float(s.duration * s.time_base)); c.close()
    os.makedirs(os.path.dirname(cache), exist_ok=True); json.dump(out, open(cache, 'w')); return out
_durs = _clip_durations() if os.path.isdir(D2) else [60.16] * 78
_off = [sum(_durs[:i]) for i in range(len(_durs))]
CLIPS = [(D2 + f'office-3-wide_01_{i:06d}.mp4', _off[i], _durs[i]) for i in range(len(_durs))]
SESS = {'s1836': [(OLD + 'ofc-20261123-1836.mp4', 0, 1e9)], 's0023': [(OLD + 'ofc-20261124-0023.mp4', 0, 1e9)],
        'n1501': [(D1 + 'wide-with-board-audio.mp4', 0, 1e9)], 'n1532': CLIPS}
RANGE = {'s1836': (0, 2177), 's0023': (0, 600), 'n1501': (0, 1791), 'n1532': (0, _off[-1] + _durs[-1])}
EST0 = {'n1501': (15, 1, 16), 'n1532': (15, 31, 55)}  # wall clock at t = 0 (EST)

def est(sess, t):
    h, m, s = EST0[sess]; x = h * 3600 + m * 60 + s + t
    return f'{int(x // 3600)}:{int(x % 3600 // 60):02d}:{int(x % 60):02d}'

def frames(sess, t0, t1, keyonly=False):
    for path, off, dur in SESS[sess]:
        if off + dur < t0 - 1 or off > t1: continue
        c = av.open(path); s = c.streams.video[0]
        if keyonly: s.codec_context.skip_frame = 'NONKEY'
        lt = max(t0 - off - 2, 0)
        if lt > 0: c.seek(int(lt / s.time_base), stream=s, backward=True)
        for fr in c.decode(s):
            t = off + float(fr.pts * s.time_base)
            if t < t0: continue
            if t > t1: c.close(); return
            yield t, fr
        c.close()

def frame_at(sess, t):
    for tt, fr in frames(sess, t - 0.02, t + 5):
        return fr.to_ndarray(format='bgr24')

def mean_frame(sess, t0, t1):
    import numpy as np
    acc = None; n = 0
    for t, fr in frames(sess, t0, t1):
        im = fr.to_ndarray(format='bgr24').astype(np.float32); acc = im if acc is None else acc + im; n += 1
    return (acc / n).clip(0, 255).astype('uint8')

def warp(img, x, y, w, h, deg, sc, m=1.3):
    """Upright view of a card box scaled by sc, with margin m (as zoom.py)."""
    import sys, cv2, numpy as np
    sys.path.insert(0, REPO)
    from ofc_card_vision import card_quad
    q = card_quad(x, y, w * m, h * m, deg); W, H = int(w * m * sc), int(h * m * sc)
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(img, M, (W, H), flags=cv2.INTER_CUBIC)
