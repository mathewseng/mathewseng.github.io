"""Link keyframe detections into static-card tracks (a card lying still on the felt)."""
import json, sys, numpy as np
def angdiff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)
def build(session, min_conf=0.25, dist=12, gap=4.0, ang=12):
    rows = [json.loads(l) for l in open(f'../scan/{session}/dets.jsonl')]
    tracks, active = [], []
    for r in rows:
        t = r['t']
        active = [tr for tr in active if t - tr['last'] <= gap]
        dets = [d for d in r['dets'] if d['conf'] >= min_conf]
        cand = []
        for di, d in enumerate(dets):
            for ti, tr in enumerate(active):
                p = tr['pos']
                e = np.hypot(d['x'] - p[0], d['y'] - p[1])
                if e < dist and angdiff(d['deg'], p[2]) < ang:
                    cand.append((e, di, ti))
        used_d, used_t = set(), set()
        for e, di, ti in sorted(cand):
            if di in used_d or ti in used_t: continue
            used_d.add(di); used_t.add(ti)
            tr = active[ti]; d = dets[di]
            tr['obs'].append(dict(t=t, **d)); tr['last'] = t
            tr['pos'] = (d['x'], d['y'], d['deg'])
        for di, d in enumerate(dets):
            if di in used_d: continue
            tr = dict(id=f'{session}-{len(tracks):05d}', first=t, last=t, pos=(d['x'], d['y'], d['deg']), obs=[dict(t=t, **d)])
            tracks.append(tr); active.append(tr)
    out = []
    for tr in tracks:
        crops = [o['crop'] for o in tr['obs'] if 'crop' in o]
        if tr['last'] - tr['first'] < 2.5 or not crops: continue
        xs = np.array([[o['x'], o['y'], o['w'], o['h'], o['conf']] for o in tr['obs']])
        out.append(dict(id=tr['id'], session=session, first=tr['first'], last=tr['last'], n=len(tr['obs']),
                        x=float(np.median(xs[:, 0])), y=float(np.median(xs[:, 1])), conf=float(np.median(xs[:, 4])),
                        crops=crops, cropConf=[o['conf'] for o in tr['obs'] if 'crop' in o]))
    return out
if __name__ == '__main__':
    for s in sys.argv[1:]:
        tr = build(s)
        json.dump(tr, open(f'../scan/{s}/tracks.json', 'w'))
        print(s, len(tr), sum(len(t['crops']) for t in tr))
