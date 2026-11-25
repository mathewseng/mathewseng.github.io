#!/usr/bin/env python3
"""Second look at every die peak: a crop classifier (not a die / yellow die / red die).

The detector (objects.py) sees the board at a quarter of its resolution. A pale die whose white
pip face shows splits its evidence between the colours and can score under the threshold in
both, while a dark checker's emblem or a red chip can give a peak as strong as a real die. Here
every peak of either colour from 0.15 up is cut out at full resolution (48x48 around the peak)
and read by a small network. refine() is conservative: a detector die (0.35 or more) is dropped
only when the crop is clearly not a die, and a weak peak (0.15-0.35) becomes a die only when the
crop is clearly one. Duplicate peaks on one die are then merged as before (objects.merge_dice).
Scored on both held-out sets it removed a false peak and rescued missed dice without adding errors
(see README); a looser rule (the crop's die probability as the score) found more dice but added
false ones on the Nov 24 15:31 view.

Training: peaks of the shipped detectors on the detector's training frames (objects.load_frames,
the held-out games left out with heldout.held), labelled from the reviewed object labels: a peak
within 9 px of a labelled die is that die, one 18 px or more from every die (and away from
"ignore" places) is not a die; peaks from 0.03 are taken so the weak ones are learned too. Labelled
dice are added as crops of their own; a few random places per frame and crops 12-18 px off a
labelled die (its pip face or side seen off centre, which gave a second peak) are not a die. Augmentation as
objects_train.photometric (another camera's softer, greyer view), plus rotations and flips.

usage: die_verify.py build OUT.npz [--models a.pt,b.pt ...]
       die_verify.py train DATA.npz OUT.pt [--steps 4000] [--neg-extra more.npz]
"""
import argparse, json, math, random
import cv2, numpy as np, torch, torch.nn as nn
import objects as ob

dev = ob.dev
CROP, IN = 64, 48  # stored crop, network input (jittered inside the stored crop)
LOW = .1  # candidate peaks from this score


class VerNet(nn.Module):
    def __init__(self):
        super().__init__()
        def block(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True),
                                              nn.Conv2d(o, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))
        self.f = nn.Sequential(block(3, 32), nn.MaxPool2d(2), block(32, 64), nn.MaxPool2d(2), block(64, 128), nn.MaxPool2d(2), block(128, 128))
        self.h = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(.2), nn.Linear(128, 3))

    def forward(self, x): return self.h(self.f(x))


def crop(img, x, y, size=CROP):
    return cv2.getRectSubPix(img, (size, size), (float(x), float(y)))


def prep(c):
    """BGR uint8 crop (IN x IN) -> normalised tensor."""
    t = torch.from_numpy(np.ascontiguousarray(c[..., ::-1])).permute(2, 0, 1).float()
    return (t / 255. - .5) / .25


def load(path):
    net = VerNet(); net.load_state_dict(torch.load(path, map_location='cpu')); return net.eval().to(dev)


@torch.no_grad()
def probs(net, img, rows):
    """(not die, yellow, red) per row (class, x, y, score) of one reader-view frame."""
    if not rows: return np.zeros((0, 3), np.float32)
    x = torch.stack([prep(crop(img, r[1], r[2], IN)) for r in rows]).to(dev)
    return torch.softmax(net(x), 1).cpu().numpy()


def candidates(logits):
    """Die peaks of either colour from LOW on the playing surface, one frame per row of logits."""
    return [[r for r in rows if r[0] < 2 and ob.on_board(r[1], r[2])] for rows in ob.peaks(logits, LOW)]


def refine(net, img, rows, thresh=.35, veto=.9, rescue=.9, low=.15):
    """Die rows (class, x, y, score) of one reader-view frame after a second look: a detector peak
    from thresh is dropped when its crop is not a die with veto or more; a weaker peak (low to
    thresh) is kept as a die when its crop is a die with rescue or more, in the crop's colour. The
    kept peaks are merged per die (objects.merge_dice). rows: every die peak from low up."""
    rows = [r for r in rows if r[0] < 2 and r[3] >= low]
    if not rows: return []
    out = []
    for r, p in zip(rows, probs(net, img, rows)):
        if r[3] >= thresh:
            if p[0] < veto: out.append(tuple(r[:4]))
        elif 1 - p[0] >= rescue: out.append((int(p[2] > p[1]), r[1], r[2], thresh))
    return ob.merge_dice(out, thresh)


def build(a):
    import heldout as H
    nets = [ob.load(m) for m in a.models]
    keys_all, jp = ob.load_frames(); labels = ob.load_labels()
    keys = [k for k in keys_all if k in labels and not H.held_key(k) and k.split(':')[0] in H.WORK]
    X, Y, K = [], [], []
    frames = dict(zip(keys_all, jp))
    for n, k in enumerate(keys):
        lab = labels[k]; img = ob.decode(frames[k]); dice = lab.get('dice', [])
        free = [p[:2] for p in lab.get('ignore', [])]; rng = random.Random(k)
        t = ob.to_tensor(img)[None].to(dev); cand = []
        with torch.no_grad():
            for net in nets:
                for r in [r for r in ob.peaks(net(t), .03)[0] if r[0] < 2 and ob.on_board(r[1], r[2])]:
                    if not any(math.hypot(r[1] - c[1], r[2] - c[2]) < 4 for c in cand): cand.append(r)
        for r in cand:
            d = min(((math.hypot(r[1] - x, r[2] - y), c) for x, y, c in dice), default=(99, None))
            if d[0] <= 9: y = 1 + int(d[1])
            elif d[0] >= 18 and not any(math.hypot(r[1] - p[0], r[2] - p[1]) < 16 for p in free): y = 0
            else: continue
            X.append(crop(img, r[1], r[2])); Y.append(y); K.append(k)
        for x, y, c in dice:
            X.append(crop(img, x, y)); Y.append(1 + int(c)); K.append(k)
            for _ in range(a.offcentre):  # a die seen off its centre is not a die peak (one peak per die)
                t = rng.uniform(0, 2 * math.pi); r = rng.uniform(12, 18); ox, oy = x + r * math.cos(t), y + r * math.sin(t)
                if all(math.hypot(ox - dx, oy - dy) >= 12 for dx, dy, _ in dice):
                    X.append(crop(img, ox, oy)); Y.append(0); K.append(k)
        for _ in range(a.random):  # random places on the board (checkers, emblems, points, rails)
            x, y = rng.uniform(16, 784), rng.uniform(10, 574)
            if all(math.hypot(x - dx, y - dy) >= 24 for dx, dy, _ in dice) and not any(math.hypot(x - p[0], y - p[1]) < 16 for p in free):
                X.append(crop(img, x, y)); Y.append(0); K.append(k)
        for x, y in lab.get('negatives', []):
            if ob.on_board(x, y): X.append(crop(img, x, y)); Y.append(0); K.append(k)
        if n % 200 == 0: print(n, len(keys), len(X), flush=True)
    Y = np.array(Y); print('not die', (Y == 0).sum(), 'yellow', (Y == 1).sum(), 'red', (Y == 2).sum())
    np.savez_compressed(a.out, x=np.array(X, np.uint8), y=Y, keys=np.array(K))


def photometric(p):
    """objects_train.photometric on a crop, plus an occasional grey cast."""
    import objects_train as ot
    p = ot.photometric(p)
    if random.random() < .3:
        g = cv2.cvtColor(p, cv2.COLOR_BGR2GRAY)[..., None].astype(np.float32)
        w = random.uniform(.1, .4); p = np.clip(p * (1 - w) + g * w, 0, 255).astype(np.uint8)
    return p


def augment(c):
    k = random.randint(0, 3); c = np.rot90(c, k)
    if random.random() < .5: c = c[:, ::-1]
    o = (CROP - IN) // 2; dx, dy = random.randint(-3, 3), random.randint(-3, 3)
    c = np.ascontiguousarray(c[o + dy:o + dy + IN, o + dx:o + dx + IN])
    c = np.clip(c.astype(np.float32) * random.uniform(.8, 1.2) + random.uniform(-18, 18), 0, 255).astype(np.uint8)
    if random.random() < .7: c = photometric(c)
    return c


def train(a):
    import heldout as H
    z = np.load(a.data); X, Y, K = z['x'], z['y'], list(z['keys'])
    if a.neg_extra:
        for p in a.neg_extra:
            e = np.load(p); X = np.concatenate([X, e['x']]); Y = np.concatenate([Y, e['y']]); K += list(e['keys'])
    val = np.array([(int(k.split(':')[1]) // 125) % 10 == 0 for k in K])  # one sampled frame in ten
    tr = np.nonzero(~val)[0]; va = np.nonzero(val)[0]
    print('train', len(tr), 'val', len(va), 'classes', np.bincount(Y[tr], minlength=3), flush=True)
    random.seed(1); torch.manual_seed(1)
    net = VerNet().to(dev); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=a.steps, pct_start=.1)
    # balance: half the batch dice, half not
    pos = tr[Y[tr] > 0]; neg = tr[Y[tr] == 0]
    for step in range(a.steps):
        idx = np.concatenate([np.random.choice(pos, a.batch // 2), np.random.choice(neg, a.batch // 2)])
        x = torch.stack([prep(augment(X[i])) for i in idx]).to(dev); y = torch.from_numpy(Y[idx]).long().to(dev)
        net.train(); loss = nn.functional.cross_entropy(net(x), y, label_smoothing=.05)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 500 == 0: print(step, round(loss.item(), 4), flush=True)
    net.eval(); o = (CROP - IN) // 2
    with torch.no_grad():
        P = np.concatenate([torch.softmax(net(torch.stack([prep(np.ascontiguousarray(X[i][o:o + IN, o:o + IN])) for i in va[s:s + 512]]).to(dev)), 1).cpu().numpy()
                            for s in range(0, len(va), 512)])
    pr = P.argmax(1); print('val acc', (pr == Y[va]).mean(), 'confusion', [[int(((Y[va] == i) & (pr == j)).sum()) for j in range(3)] for i in range(3)])
    torch.save(net.cpu().state_dict(), a.out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd')
    b = sub.add_parser('build'); b.add_argument('out'); b.add_argument('--models', nargs='+', default=[
        str(ob.OBJ_DIR / 'models/obj-v8.pt'), str(ob.OBJ_DIR / 'models/obj-v8.pt') + ',' + str(ob.OBJ_DIR / 'models/obj-v10.pt')])
    b.add_argument('--random', type=int, default=6, help='random not-die crops per frame')
    b.add_argument('--offcentre', type=int, default=2, help='not-die crops 12-18 px off each labelled die')
    t = sub.add_parser('train'); t.add_argument('data'); t.add_argument('out'); t.add_argument('--steps', type=int, default=4000)
    t.add_argument('--batch', type=int, default=128); t.add_argument('--neg-extra', nargs='*')
    a = ap.parse_args()
    build(a) if a.cmd == 'build' else train(a)
