#!/usr/bin/env python3
"""Train the dice and cube detector (objects.ObjNet) on sampled board frames.

Labels: objects/labels.json (dice, reviewed corrections) plus cube positions
from objects/cube-labels.json. Frames whose cube is unknown do not train the
cube channel. Dice are also pasted at random places on the board (cut out
with a colour hull) so the detector sees them on every kind of point and
next to checkers. Pixels of unlabelled die-sized colour blobs are ignored,
so a missed die in an unreviewed frame does not count as background.

usage: objects_train.py out.pt [--steps N] [--init model.pt]
"""
import argparse, json, os, random
import cv2, numpy as np, torch
import objects as ob

CROP = 320


def colour_masks(img, relaxed=False):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    if relaxed:
        red = ((h <= 12) | (h >= 160)) & (s >= 35) & (v >= 60)
        yellow = (h >= 16) & (h <= 40) & (s >= 45) & (v >= 60)
    else:
        red = ((h <= 9) | (h >= 168)) & (s >= 70) & (v >= 60)
        yellow = (h >= 21) & (h <= 34) & (s >= 65) & (v >= 70)
    return red, yellow


def ignore_mask(img, labels):
    """Die-sized relaxed colour blobs that no label explains."""
    out = np.zeros(img.shape[:2], bool)
    for m in colour_masks(img, True):
        n, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8))
        for i in range(1, n):
            x, y, w, hh, area = st[i]
            if 6 <= area <= 450 and max(w, hh) <= 30:
                out[y:y + hh, x:x + w] = True
    for x, y, _ in labels.get('dice', []) + [p + [0] for p in labels.get('negatives', [])]:
        out[max(0, int(y) - 14):int(y) + 14, max(0, int(x) - 14):int(x) + 14] = False
    for x, y in labels.get('ignore', []):
        out[max(0, int(y) - 14):int(y) + 14, max(0, int(x) - 14):int(x) + 14] = True
    return cv2.dilate(out.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)


def cutouts(frames, labels, keys, limit=600):
    """Die patches (28x28) with soft alpha from the colour hull."""
    bank = []
    random.seed(3)
    for k in random.sample(keys, len(keys)):
        lab = labels[k]
        if not lab.get('reviewed') and not lab.get('dice'): continue
        img = None
        for x, y, red in lab['dice']:
            if img is None: img = ob.decode(frames[k])
            xi, yi = int(round(x)), int(round(y))
            if not (16 <= xi < ob.W - 16 and 16 <= yi < ob.H - 16): continue
            p = img[yi - 14:yi + 14, xi - 14:xi + 14]
            r, yl = colour_masks(p, True)
            m = (r if red else yl).astype(np.uint8)
            if m.sum() < 25: continue
            pts = cv2.findNonZero(m)
            hull = cv2.convexHull(pts)
            a = np.zeros((28, 28), np.uint8); cv2.fillConvexPoly(a, hull, 255)
            a = cv2.dilate(a, np.ones((3, 3), np.uint8))
            a = cv2.GaussianBlur(a, (3, 3), 0).astype(np.float32) / 255
            if a.sum() < 80 or a.sum() > 420: continue
            bank.append((p.copy(), a, int(red)))
        if len(bank) >= limit: break
    return bank


def paste(img, labels, bank, n):
    img = img.copy(); dice = list(labels.get('dice', []))
    for _ in range(n):
        p, a, red = random.choice(bank)
        k = random.randint(0, 3); p = np.rot90(p, k); a = np.rot90(a, k)
        s = random.uniform(.85, 1.15)
        p = cv2.resize(np.ascontiguousarray(p), None, fx=s, fy=s); a = cv2.resize(np.ascontiguousarray(a), None, fx=s, fy=s)
        h, w = a.shape
        x = random.randint(105, 690 - w); y = random.randint(8, 582 - h)
        roi = img[y:y + h, x:x + w].astype(np.float32)
        img[y:y + h, x:x + w] = (roi * (1 - a[..., None]) + p.astype(np.float32) * a[..., None]).astype(np.uint8)
        dice.append([x + w / 2, y + h / 2, red])
    return img, {**labels, 'dice': dice}


def sample(frames, labels, keys, bank, train=True):
    k = random.choice(keys); lab = labels[k]
    img = ob.decode(frames[k])
    if train and bank and random.random() < .7: img, lab = paste(img, lab, bank, random.randint(1, 3))
    ign = ignore_mask(img, lab)
    img = cv2.copyMakeBorder(img, 0, ob.PH - ob.H, 0, 0, cv2.BORDER_REPLICATE)
    ign = np.pad(ign, ((0, ob.PH - ob.H), (0, 0)))
    tgt = ob.target(lab)
    cube_known = lab.get('cube') is not None or lab.get('reviewed') or lab.get('cubeAbsent')
    if train:
        x0 = random.randrange(0, ob.W - CROP + 1, ob.STRIDE); y0 = random.randrange(0, ob.PH - CROP + 1, ob.STRIDE)
        if lab.get('cube') and random.random() < .4:  # keep the cube in view more often (it is one object per frame)
            cx, cy = lab['cube']
            x0 = int(np.clip(cx - random.uniform(40, CROP - 40), 0, ob.W - CROP)) // 4 * 4
            y0 = int(np.clip(cy - random.uniform(40, CROP - 40), 0, ob.PH - CROP)) // 4 * 4
        img = img[y0:y0 + CROP, x0:x0 + CROP]; ign = ign[y0:y0 + CROP, x0:x0 + CROP]
        tgt = tgt[:, y0 // 4:(y0 + CROP) // 4, x0 // 4:(x0 + CROP) // 4]
        if random.random() < .5: img, ign, tgt = img[:, ::-1], ign[:, ::-1], tgt[:, :, ::-1]
        if random.random() < .5: img, ign, tgt = img[::-1], ign[::-1], tgt[:, ::-1]
        img = np.clip(img.astype(np.float32) * random.uniform(.8, 1.2) + random.uniform(-18, 18), 0, 255).astype(np.uint8)
    weight = np.ones_like(tgt)
    small = np.ascontiguousarray(ign).reshape(tgt.shape[1], 4, tgt.shape[2], 4).any(axis=(1, 3))
    weight[0][small] = 0; weight[1][small] = 0
    if not cube_known: weight[2] = 0
    return ob.to_tensor(np.ascontiguousarray(img)), torch.from_numpy(np.ascontiguousarray(tgt)), torch.from_numpy(weight)


class Batches(torch.utils.data.IterableDataset):
    """Endless training samples; each worker loads the frame JPEGs itself."""
    def __init__(self, labels, keys, bank): self.labels, self.keys, self.bank = labels, keys, bank
    def __iter__(self):
        info = torch.utils.data.get_worker_info()
        random.seed((info.id if info else 0) * 7919 + int.from_bytes(os.urandom(2), 'little'))
        k, jp = ob.load_frames(); frames = dict(zip(k, jp))
        while True: yield sample(frames, self.labels, self.keys, self.bank)


def focal_w(logits, gt, w, alpha=2, beta=4):
    p = torch.sigmoid(logits).clamp(1e-4, 1 - 1e-4)
    pos = gt.ge(.99).float()
    pl = -torch.log(p) * (1 - p) ** alpha * pos
    nl = -torch.log(1 - p) * p ** alpha * (1 - gt) ** beta * (1 - pos) * w
    return (pl.sum() + nl.sum()) / pos.sum().clamp(min=1)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('--steps', type=int, default=3000)
    ap.add_argument('--init'); ap.add_argument('--batch', type=int, default=12)
    a = ap.parse_args()
    keys, jp = ob.load_frames(); frames = dict(zip(keys, jp))
    labels = json.loads((ob.OBJ_DIR / 'labels.json').read_text())
    cubes = json.loads((ob.OBJ_DIR / 'cube-labels.json').read_text())
    for k, c in cubes.items():
        if k in labels and not labels[k].get('reviewed'):
            if c == 'absent': labels[k]['cubeAbsent'] = True
            elif c: labels[k]['cube'] = c
    held = [k for i, k in enumerate(keys) if i % 10 == 0]
    train = [k for i, k in enumerate(keys) if i % 10]
    bank = cutouts(frames, labels, train)
    print('train', len(train), 'held', len(held), 'cutouts', len(bank), flush=True)
    net = ob.ObjNet()
    if a.init: net.load_state_dict(torch.load(a.init, map_location='cpu'))
    net.to(ob.dev)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=a.steps, pct_start=.15)
    loader = iter(torch.utils.data.DataLoader(Batches(labels, train, bank), batch_size=a.batch, num_workers=6,
                                              multiprocessing_context='spawn', persistent_workers=True))
    for step in range(a.steps):
        x, t, w = (v.to(ob.dev) for v in next(loader))
        net.train(); loss = focal_w(net(x), t, w)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 250 == 0: print(step, round(loss.item(), 3), flush=True)
    torch.save(net.cpu().state_dict(), a.out)
    net.to(ob.dev).eval()
    # held-out recall/precision against existing labels (dice from the old detector are incomplete)
    hit = tot = extra = 0
    for k in held:
        lab = labels[k]
        x = ob.to_tensor(ob.decode(frames[k]))[None].to(ob.dev)
        det = ob.peaks(net(x), .4)[0]
        for c, px, py, s in det:
            near = [d for d in lab.get('dice', []) if c == d[2] and abs(d[0] - px) < 8 and abs(d[1] - py) < 8]
            if c < 2 and not near: extra += 1
        for d in lab.get('dice', []):
            tot += 1; hit += any(c == d[2] and abs(d[0] - px) < 8 and abs(d[1] - py) < 8 for c, px, py, s in det)
    print('held-out dice recall', hit, '/', tot, 'unlabelled detections', extra)


if __name__ == '__main__':
    main()
