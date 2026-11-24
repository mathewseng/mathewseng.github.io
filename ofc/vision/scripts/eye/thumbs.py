"""thumbs.py SESS...: every keyframe of a scanned session, area-downscaled 4x (480x270), as ../scan/SESS/thumbs/T.png
(the runtime's bare-felt check works on this scale)."""
import sys, os, json, av, cv2
F = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/')
SESS = {'s1524': ('ofc/ofc-20261123-1524-starts-0800.mp4', 480, 4771), 's1836': ('ofc/ofc-20261123-1836.mp4', 0, 2177),
        's1931': ('ofc/ofc-20261123-1931-no-board-audio.mp4', 0, 880), 's1953': ('ofc/ofc-20261123-1953.mp4', 0, 345),
        's2310': ('ofc/ofc-20261123-2310-three-players.mp4', 0, 4202), 's0023': ('ofc/ofc-20261124-0023.mp4', 0, 600),
        'stud': ('other/stud-poker-20261124-0023-starts-1000.mp4', 660, 3150)}
for name in sys.argv[1:]:
    path, t0, t1 = SESS[name]; out = f'../scan/{name}/thumbs'; os.makedirs(out, exist_ok=True)
    c = av.open(F + path); s = c.streams.video[0]; s.codec_context.skip_frame = 'NONKEY'
    c.seek(int(max(t0 - 2, 0) / s.time_base), stream=s, backward=True)
    for fr in c.decode(s):
        t = float(fr.pts * s.time_base)
        if t < t0: continue
        if t > t1: break
        cv2.imwrite(f'{out}/{t:08.3f}.png', cv2.resize(fr.to_ndarray(format='bgr24'), (480, 270), interpolation=cv2.INTER_AREA))
    print('done', name, len(os.listdir(out)), flush=True)
