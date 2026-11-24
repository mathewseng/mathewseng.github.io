"""Eye-truth sheets for one keyframe of a scanned session: an overview with every detector box (conf>=0.1, thin) and
every live hand-state slot (numbered), and a tile sheet per object: the object at this frame and at its earliest
settled view, both rectified from the full-resolution frame at 4x. No model names are drawn."""
import sys, json, math, av, cv2, numpy as np
sys.path.insert(0, '/Users/mathewseng/Documents/GitHub/claude-worktrees/mathewseng.github.io/orange-board/ofc/vision')
from ofc_card_vision import card_quad, rectify
F = '/Users/mathewseng/Downloads/office-3-labelled-footage-20261123/ofc/'
FILES = {'s1836': 'ofc-20261123-1836.mp4', 's0023': 'ofc-20261124-0023.mp4'}
_cont = {}
def frame_at(sess, t):
    if sess not in _cont: _cont[sess] = av.open(F + FILES[sess])
    c = _cont[sess]; s = c.streams.video[0]
    c.seek(int((t - 0.05) / s.time_base), stream=s, backward=True)
    for fr in c.decode(s):
        if float(fr.pts * s.time_base) >= t - 0.02: return fr.to_ndarray(format='bgr24')
def objects(sim, t):
    fr = next(f for f in sim if abs(f['t'] - t) < 1e-3)
    return fr
def main(sess, simf, t, out):
    sim = json.load(open(simf)); fr = objects(sim, t)
    scan = {round(json.loads(l)['t'], 3): json.loads(l) for l in open(f'../scan/{sess}/state.jsonl')}
    dets = scan[round(t, 3)]['dets']
    img = frame_at(sess, t)
    objs = []  # every live slot (boxed or hidden) + boxes with no slot (conf 0.1-0.25)
    boxed = {b['slot'] for b in fr['bodies']}
    for s in fr['table']:
        objs.append(dict(kind='box' if s['detected'] else 'hidden', x=s['x'], y=s['y'], w=s['width'], h=s['height'], deg=s['angleDegrees'], slot=s['slotId'], first=s['placedSeconds']))
    weak = [d for d in dets if d['conf'] < 0.25]
    for d in weak: objs.append(dict(kind='weak', x=d['x'], y=d['y'], w=d['w'], h=d['h'], deg=d['deg'], slot=None, first=None))
    # for boxed slots use the box pose at this frame
    for b in fr['bodies']:
        for o in objs:
            if o['slot'] == b['slot']: o['bx'], o['by'] = b['x'], b['y']
    objs.sort(key=lambda o: (round(o['y'] / 60), o['x']))
    for i, o in enumerate(objs): o['id'] = i + 1
    xs = [o['x'] for o in objs]; ys = [o['y'] for o in objs]
    x0, x1 = max(int(min(xs)) - 90, 0), min(int(max(xs)) + 90, 1920); y0, y1 = max(int(min(ys)) - 90, 0), min(int(max(ys)) + 90, 1080)
    S = 3; ov = cv2.resize(img[y0:y1, x0:x1], None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    col = {'box': (60, 220, 60), 'hidden': (0, 220, 255), 'weak': (255, 80, 255)}
    for o in objs:
        q = ((card_quad(o['x'], o['y'], o['w'], o['h'], o['deg']) - [x0, y0]) * S).astype(np.int32)
        cv2.polylines(ov, [q], True, col[o['kind']], 1)
    for o in objs:
        p = (int((o['x'] - x0) * S) - 12, int((o['y'] - y0) * S) + 8); txt = str(o['id'])
        cv2.putText(ov, txt, p, cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 5); cv2.putText(ov, txt, p, cv2.FONT_HERSHEY_SIMPLEX, 0.8, col[o['kind']], 2)
    # grid ticks every 50 source px
    for gx in range((x0 // 50 + 1) * 50, x1, 50): cv2.putText(ov, str(gx), ((gx - x0) * S, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    for gy in range((y0 // 50 + 1) * 50, y1, 50): cv2.putText(ov, str(gy), (2, (gy - y0) * S), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    cv2.imwrite(f'{out}-overview.jpg', ov, [cv2.IMWRITE_JPEG_QUALITY, 90])
    # tiles
    def tile(im, o, w=None):
        q = card_quad(o['x'], o['y'], o['w'], o['h'], o['deg'])
        return rectify(im, q, 160, 240, 0.25)
    early = {}
    conf = {}
    for f in sim:
        if not (t - 400 <= f['t'] <= t): continue
        ds = [d for d in scan[round(f['t'], 3)]['dets'] if d['conf'] >= 0.25]
        for b, d in zip(f['bodies'], ds):
            if b['slot'] not in conf or d['conf'] > conf[b['slot']][0] + 0.01: conf[b['slot']] = (d['conf'], f['t'])
    for o in objs:
        if o['slot'] is not None and o['slot'] in conf: early[o['id']] = conf[o['slot']][1]; o['best'] = conf[o['slot']][1]
    json.dump(dict(session=sess, t=t, crop=[x0, y0, x1, y1], objects=objs), open(f'{out}-objects.json', 'w'), indent=0)
    if '--no-tiles' in sys.argv: return
    tiles = []
    for o in objs:
        a = tile(img, o)
        b = tile(frame_at(sess, early[o['id']]), o) if o['id'] in early else np.zeros_like(a)
        t_ = np.hstack([a, np.full((240, 4, 3), 255, np.uint8), b])
        lab = np.zeros((26, t_.shape[1], 3), np.uint8)
        cv2.putText(lab, f"#{o['id']} {o['kind']} {early.get(o['id'], 0):.0f}s", (4, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.6, col[o['kind']], 2)
        tiles.append(np.vstack([lab, t_]))
    cols = 5; rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
    blank = np.zeros_like(tiles[0])
    sheet = np.vstack([np.hstack([np.pad(x, ((4, 4), (4, 4), (0, 0))) for x in r + [blank] * (cols - len(r))]) for r in rows])
    for k in range(0, sheet.shape[0], 1100):
        cv2.imwrite(f'{out}-tiles{k // 1100}.jpg', sheet[k:k + 1100], [cv2.IMWRITE_JPEG_QUALITY, 90])
    json.dump(dict(session=sess, t=t, crop=[x0, y0, x1, y1], objects=objs), open(f'{out}-objects.json', 'w'), indent=0)
if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4])
