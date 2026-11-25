"""adjud.py ROOT OUT [--fresh]: for every score.py discrepancy of ROOT's sims (WRONG, named-illegible, FALSE-NAMED, DUP-NAMED-OTHER,
EXTRA) render a tile: truth frame zoom (yellow cross at the report) | the slot's first keyframe reporting that name | a keyframe 5 s later."""
import sys, os, re, json, subprocess, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from sessions import frame_at
W = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
root, out = sys.argv[1], sys.argv[2]; fresh = '--fresh' in sys.argv
T = W + ('/eval/fresh-truth' if fresh else '/eval/eye-truth')
sess = ['n1501', 'n1532'] if fresh else ['s1836', 's0023', 'n1501', 'n1532']
args = ['python3', W + '/scripts/eye/score.py'] + [f'{root}/sim-fin-{s}.json' for s in sess] + (['--truth', T] if fresh else [])
lines = subprocess.run(args, capture_output=True, text=True).stdout.splitlines()
sims = {s: json.load(open(f'{root}/sim-fin-{s}.json')) for s in sess}
items = []
for l in lines:
    m = re.match(r'(WRONG|named-illegible|FALSE-NAMED|DUP-NAMED-OTHER|EXTRA) (\S+) (.*)', l)
    if not m: continue
    kind, frame, rest = m.groups(); s = frame[:5]
    obj = json.load(open(f'{T}/objects/{frame}.json')); t = obj['t']
    if kind == 'EXTRA':
        nm, x, y = rest.split()[:3]; x, y = float(x), float(y)
    else:
        oid = int(rest.split()[0]); o = next(o for o in obj['objects'] if o['id'] == oid)
        nm = rest.split('->')[-1].strip() if '->' in rest else rest.split()[-1]
        x, y = o.get('bx') or o['x'], o.get('by') or o['y']
    items.append((kind, frame, s, t, nm, x, y, rest))
def find_slot(sim, t, nm, x, y):
    fr = min(sim, key=lambda f: abs(f['t'] - t)); best = None
    for b in fr['bodies']:
        if b['hand'] == nm:
            d = ((b['x'] - x) ** 2 + (b['y'] - y) ** 2) ** .5
            if best is None or d < best[0]: best = (d, b['slot'])
    for sl in fr['table']:
        if sl['card'] == nm:
            d = ((sl['x'] - x) ** 2 + (sl['y'] - y) ** 2) ** .5
            if best is None or d < best[0]: best = (d, sl['slotId'])
    return best[1] if best else None
def zoom(s, t, x, y, R=50, sc=3, label=''):
    im = frame_at(s, t); x0, y0 = max(int(x - R), 0), max(int(y - R), 0)
    c = cv2.resize(im[y0:y0 + 2 * R, x0:x0 + 2 * R], (2 * R * sc, 2 * R * sc), interpolation=cv2.INTER_CUBIC)
    cv2.drawMarker(c, (int((x - x0) * sc), int((y - y0) * sc)), (0, 255, 255), cv2.MARKER_CROSS, 16, 1)
    cv2.putText(c, label, (3, 2 * R * sc - 6), 0, 0.45, (255, 255, 255), 1); return c
tiles = []
for kind, frame, s, t, nm, x, y, rest in items:
    sim = sims[s]; sid = find_slot(sim, t, nm, x, y)
    first = None
    if sid is not None:
        for f in sim:
            if f['t'] > t: break
            for b in f['bodies']:
                if b['slot'] == sid and b['hand'] == nm and b['src'] == 'view': first = (f['t'], b['x'], b['y']); break
            if first: break
    row = [zoom(s, t, x, y, label=f'{t:.1f}')]
    if first:
        row.append(zoom(s, first[0], first[1], first[2], label=f'first view {first[0]:.1f}'))
        row.append(zoom(s, min(first[0] + 5, t), first[1], first[2], label=f'{min(first[0] + 5, t):.1f}'))
    while len(row) < 3: row.append(np.zeros_like(row[0]))
    t_ = np.hstack(row); hdr = np.zeros((20, t_.shape[1], 3), np.uint8)
    cv2.putText(hdr, f'{len(tiles)} {kind} {frame} {nm} | {rest[:60]}', (4, 15), 0, 0.45, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
    print(len(tiles) - 1, kind, frame, nm, round(x), round(y), rest[:80])
for k in range(0, len(tiles), 6):
    ch = tiles[k:k + 6]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % 2)
    cv2.imwrite(f'{out}-{k // 6:02d}.jpg', np.vstack([np.hstack(ch[j:j + 2]) for j in range(0, len(ch), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
