#!/usr/bin/env python3
"""Review sheets for labelling the held-out test frames by eye.

Each frame (readers' view) shows the detector's peaks above 0.15 (numbered; yellow-die peaks in
cyan, red-die peaks in magenta, the best cube peak boxed), the published decode's checker counts at that frame in
bands above and below the board (decoded/reader when the slot reader disagrees, '?' unknown),
and below the board each peak's crop at 4x. Also writes TEST_DIR/proposals.json, the starting
point for labels.json.

usage: testset_sheet.py OBJ_MODEL SLOT_MODEL OUT_DIR [--keys k1 k2 ...] [--per 2]
"""
import argparse, json
import cv2, numpy as np, torch
import heldout as H
import objects as ob, read_slots as rs, geometry as g
from session import reader_points


def load_test():
    z = np.load(H.TEST_DIR / 'frames.npz', allow_pickle=True)
    items = json.loads((H.TEST_DIR / 'items.json').read_text())
    imgs = {k: p for k, p in zip(z['keys'], z['png'])}
    return items, imgs


def img_of(png):
    return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)


def analysis(block):
    for s, a, b, an, label in H.BLOCKS:
        if label == block: return json.loads(an.read_text())


def state_at(A, f, session=None):
    """Decoded position and cube at frame f: after the last turn finished by f (positions from
    heldout.CHECKER_REF when the session has one)."""
    pos = A['turns'][0]['before']; idx = -1
    for i, t in enumerate(A['turns']):
        if t.get('cubeOnly'): continue
        if t['resultFrame'] <= f: pos = t['after']; idx = i
    if session in H.CHECKER_REF:
        for t in json.loads(H.CHECKER_REF[session].read_text())['games'][0]['turns']:
            if t['frame'] <= f: pos = t['after']
    cube = None
    for t in A['turns']:
        if (t.get('rollFrame') or t['resultFrame']) <= f: cube = t.get('cube')
    ev = [e for e in A['cubeEvents'] if e['frame'] <= f]
    return pos, idx, cube, ev[-1] if ev else None


def canon_points_xy(view):
    """Reader-view x of each canonical point (index 0-23) and whether it is drawn in the top band."""
    order = reader_points(view); out = []
    for i in range(24):
        q = int(order[i]) + 1
        out.append((g.point_x(q), g.is_top(q)))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('obj'); ap.add_argument('slots'); ap.add_argument('out')
    ap.add_argument('--keys', nargs='*'); ap.add_argument('--per', type=int, default=2); ap.add_argument('--thresh', type=float, default=.15)
    a = ap.parse_args()
    items, imgs = load_test()
    if a.keys: items = [it for it in items if it['key'] in a.keys]
    net = ob.load(a.obj); reader = rs.Reader(a.slots, ob.dev)
    from pathlib import Path
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    props = {}; tiles = []; names = []
    for it in items:
        k = it['key']; s, f = k.split(':'); f = int(f); view = H.board_view(s)
        im = img_of(imgs[k]); A = analysis(it['block'])
        with torch.no_grad(): det = ob.peaks(net(ob.to_tensor(im)[None].to(ob.dev)), a.thresh)[0]
        pr = reader.probs_batch([im])[0]
        cls = pr.argmax(-1); conf = np.where((cls == 3).any(-1), 0., pr.max(-1).min(-1)) if pr.shape[-1] > 3 else pr.max(-1).min(-1)
        order = reader_points(view)
        rd = []
        for i in range(24):
            q = order[i]; w, d = int((cls[q] == 1).sum()), int((cls[q] == 2).sum())
            rd.append(None if conf[q] < .5 else (w if w >= d else -d))
        pos, tidx, cube, ev = state_at(A, f, s)
        dice = [d for d in det if d[0] < 2]; cubes = sorted([d for d in det if d[0] == 2], key=lambda d: -d[3])
        props[k] = {'dice': [[round(x, 1), round(y, 1), int(c), round(sc, 3)] for c, x, y, sc in dice],
                    'cube': [round(cubes[0][1], 1), round(cubes[0][2], 1), round(cubes[0][3], 3)] if cubes else None,
                    'reader': rd, 'decoded': pos, 'decodedTurn': tidx, 'cubeState': cube, 'cubeEvent': ev}
        vis = im.copy()
        for x in range(0, 800, 50):
            cv2.line(vis, (x, 0), (x, 6), (255, 255, 255), 1); cv2.line(vis, (x, 583), (x, 589), (255, 255, 255), 1)
        for y in range(0, 590, 50):
            cv2.line(vis, (0, y), (6, y), (255, 255, 255), 1); cv2.line(vis, (793, y), (799, y), (255, 255, 255), 1)
        crops = []
        for j, (c, x, y, sc) in enumerate(dice):
            col = (255, 255, 0) if c == 0 else (255, 0, 255)
            cv2.circle(vis, (int(x), int(y)), 13, col, 1)
            cv2.putText(vis, str(j), (int(x) + 12, int(y) - 10), 0, .45, col, 1)
            p = cv2.getRectSubPix(im, (40, 40), (x, y))
            p = cv2.resize(p, (160, 160), interpolation=cv2.INTER_CUBIC)
            cv2.putText(p, f'{j} {"YR"[c]} {sc:.2f}', (3, 14), 0, .45, col, 1)
            crops.append(p)
        if cubes:
            c, x, y, sc = cubes[0]
            cv2.rectangle(vis, (int(x) - 25, int(y) - 25), (int(x) + 25, int(y) + 25), (0, 255, 0) if sc >= .5 else (0, 128, 0), 1)
            p = cv2.getRectSubPix(im, (56, 56), (x, y)); p = cv2.resize(p, (160, 160), interpolation=cv2.INTER_CUBIC)
            cv2.putText(p, f'cube {sc:.2f}', (3, 14), 0, .45, (0, 255, 0), 1); crops.append(p)
        top = np.zeros((26, 800, 3), np.uint8); bot = np.zeros((26, 800, 3), np.uint8)
        for i, (x, is_top) in enumerate(canon_points_xy(view)):
            v, r = pos['points'][i], rd[i]
            txt = str(abs(v)) if r == v else f'{abs(v)}/{"?" if r is None else abs(r)}'
            if v == 0 and r == 0: continue
            colr = (255, 255, 255) if v > 0 else (150, 150, 150) if v < 0 else (0, 200, 255)
            if r != v: colr = (0, 0, 255) if r is not None else (0, 200, 255)
            band = top if is_top else bot
            cv2.putText(band, txt, (int(x) - 12, 19), 0, .55, colr, 1 + (r != v))
        head = np.zeros((24, 800, 3), np.uint8)
        cs = f"cube {cube['value']}{(' ' + cube['owner'][0]) if cube and cube.get('owner') else ''}" if cube else 'cube ?'
        if ev: cs += f" last {ev['type']}@{ev['frame']}"
        lab = f"{k} {it['kind']} T{tidx + 2}"
        if it['kind'] == 'turn': lab += f" {it['player'][0]} roll {'-'.join(map(str, it['roll'] or []))} ({it['rollSource']})"
        lab += f"  bar{pos['bar']} off{pos['off']}  {cs}"
        cv2.putText(head, lab, (4, 17), 0, .5, (0, 255, 255), 1)
        strip = np.zeros((160, 800, 3), np.uint8)
        for j, p in enumerate(crops[:5]): strip[:, j * 160:(j + 1) * 160] = p
        tiles.append(np.vstack([head, top, vis, bot, strip])); names.append(k)
    for i in range(0, len(tiles), a.per):
        chunk = tiles[i:i + a.per]
        if len(chunk) < a.per: chunk += [np.zeros_like(tiles[0])] * (a.per - len(chunk))
        cv2.imwrite(str(out / f'sheet-{i // a.per:03d}.jpg'), np.hstack(chunk), [cv2.IMWRITE_JPEG_QUALITY, 88])
    (H.TEST_DIR / 'proposals.json').write_text(json.dumps(props))
    print(len(tiles), 'frames')


if __name__ == '__main__':
    main()
