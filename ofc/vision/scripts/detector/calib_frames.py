import sys, av, os, cv2
sys.path.insert(0, os.path.dirname(__file__)); from detin import canvas
OLD = os.path.expanduser('~/Downloads/office-3-labelled-footage-20261123/ofc/')
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
for f, ts in [('ofc-20261123-1524-starts-0800.mp4', range(900, 4000, 200)), ('ofc-20261123-2310-three-players.mp4', range(100, 3000, 200)),
              ('ofc-20261123-1931-no-board-audio.mp4', range(60, 900, 70))]:
    c = av.open(OLD + f); s = c.streams.video[0]
    for t in ts:
        c.seek(int(t / s.time_base), stream=s)
        fr = next(c.decode(s)).to_ndarray(format='bgr24')
        cv2.imwrite(f'{out}/{f[4:17]}_{t:05d}.jpg', canvas(fr), [cv2.IMWRITE_JPEG_QUALITY, 95])
    c.close()
