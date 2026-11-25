"""vt.py UNITS.json OUT [--idx a,b,c] [--win 90] [--sc 3] [--dt 0]: tile per unit: full-res frame zoom around the box at t0+dt with the box drawn,
plus its crop. 8 per sheet (4x2). Header: #i sess name t est n cls."""
import sys, os, json, cv2, numpy as np, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'eye')); sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
from src import frame_at, est
from ofc_card_vision import card_quad
a = sys.argv; U = json.load(open(a[1])); out = a[2]
def opt(k, d): return type(d)(a[a.index(k) + 1]) if k in a else d
WIN, SC, DT = opt('--win', 90), opt('--sc', 2.5), opt('--dt', 0.0)
idx = [int(i) for i in opt('--idx', '').split(',')] if '--idx' in a else range(len(U))
dets = {}
def det(s, crop):
    if s not in dets:
        dets[s] = {d['crop']: d for line in open(f'scan/{s}/state.jsonl') for d in json.loads(line)['dets'] if d.get('crop')}
    return dets[s].get(crop)
T = int(WIN * SC); tiles = []
for i in idx:
    u = U[i]; t = u['t0'] + DT; im = frame_at(u['sess'], t); d = det(u['sess'], u['crops'][0]); h = WIN // 2
    im = im.copy()
    if d and DT == 0: cv2.polylines(im, [card_quad(d['x'], d['y'], d['w'], d['h'], d['deg']).astype(np.int32)], True, (0, 255, 255), 1)
    pad = cv2.copyMakeBorder(im, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT); x0, y0 = int(round(u['x'])) - h, int(round(u['y'])) - h
    c = cv2.resize(pad[y0 + WIN:y0 + 2 * WIN, x0 + WIN:x0 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
    ci = cv2.imread(f"scan/{u['sess']}/crops/{u['crops'][0]}")
    ci = cv2.resize(ci, (int(T * 64 / 96), T), interpolation=cv2.INTER_CUBIC) if ci is not None else np.zeros((T, int(T * 64 / 96), 3), np.uint8)
    hz = np.zeros((T, T, 3), np.uint8); ho = u.get('holder')
    if ho and '--noholder' not in a:
        im2 = frame_at(u['sess'], ho['t']); p2 = cv2.copyMakeBorder(im2, WIN, WIN, WIN, WIN, cv2.BORDER_CONSTANT); x2, y2 = int(round(ho['x'])) - h, int(round(ho['y'])) - h
        hz = cv2.resize(p2[y2 + WIN:y2 + 2 * WIN, x2 + WIN:x2 + 2 * WIN], (T, T), interpolation=cv2.INTER_CUBIC)
        cv2.putText(hz, f"held {ho['t']:.1f}", (3, T - 6), 0, 0.5, (0, 255, 255), 1)
    t_ = np.hstack([c, ci, hz]); hdr = np.zeros((22, t_.shape[1], 3), np.uint8)
    e = est(u['sess'], t) if u['sess'] in ('n1501', 'n1532') else ''
    cv2.putText(hdr, f"#{i} {u['sess']} {u['name']} {t:.1f} {e} n{u['n']} {u.get('cls','')[:4]}", (3, 16), 0, 0.5, (0, 255, 255), 1)
    tiles.append(cv2.copyMakeBorder(np.vstack([hdr, t_]), 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(255, 255, 255)))
PER, ROW = 6, 3
for k in range(0, len(tiles), PER):
    ch = tiles[k:k + PER]; ch += [np.zeros_like(tiles[0])] * ((-len(ch)) % ROW)
    cv2.imwrite(f'{out}-{k // PER:02d}.jpg', np.vstack([np.hstack(ch[j:j + ROW]) for j in range(0, len(ch), ROW)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(tiles), 'tiles')
