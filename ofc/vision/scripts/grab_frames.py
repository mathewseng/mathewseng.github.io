"""Save one keyframe per 60 s (training sessions) for gen_none.py."""
import os, sys, av, cv2
F = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/')
SESS = {  # same sessions as scan.py
    's1524': ('ofc/ofc-20261123-1524-starts-0800.mp4', 480, 4771),
    's1836': ('ofc/ofc-20261123-1836.mp4', 0, 2177),
    's1931': ('ofc/ofc-20261123-1931-no-board-audio.mp4', 0, 880),
    's1953': ('ofc/ofc-20261123-1953.mp4', 0, 345),
    's2310': ('ofc/ofc-20261123-2310-three-players.mp4', 0, 4202),
    's0023': ('ofc/ofc-20261124-0023.mp4', 0, 600),
}

if __name__ == '__main__':
    for name in sys.argv[1:]:
        path, t0, t1 = SESS[name]; out = f'../scan/{name}/frames'; os.makedirs(out, exist_ok=True)
        c = av.open(F + path); st = c.streams.video[0]; st.codec_context.skip_frame = 'NONKEY'; last = -1e9
        c.seek(int(max(t0 - 2, 0) / st.time_base), stream=st, backward=True)
        for fr in c.decode(st):
            t = float(fr.pts * st.time_base)
            if t < t0: continue
            if t > t1: break
            if t - last >= 60: cv2.imwrite(f'{out}/{t:08.2f}.jpg', fr.to_ndarray(format='bgr24'), [cv2.IMWRITE_JPEG_QUALITY, 90]); last = t
        print(name, len(os.listdir(out)))
