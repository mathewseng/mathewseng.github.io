"""train_corner.py --hands A[,B] --out OUT [--epochs N]: corner-index reader (36x36 corner patch -> rank 13+none x suit 4).
Positives: corners of the index pair of whole jumbo training crops (strict ink rule); negatives: the other pair + none crops.
Augment: shift/scale/rotate, photometric, and a pasted neighbour card (fan / column) over the patch's far side."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import sys, json, argparse, time, cv2, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from corner import corners, S
import synth as SY
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']; NONE = 52
class CornerNet(nn.Module):
    """Two branches: rank from contrast-normalized luma (red and black ink look alike, so a rank seen in one colour
    reads in the other), suit from colour. p(card) = p(rank) * p(suit); none = rank none."""
    def __init__(self):
        super().__init__()
        def cbr(i, o, k=3, s=1): return [nn.Conv2d(i, o, k, s, k // 2, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]
        def trunk(c): return nn.Sequential(*cbr(c, 32), *cbr(32, 32), nn.MaxPool2d(2), *cbr(32, 64), *cbr(64, 64), nn.MaxPool2d(2),
                                         *cbr(64, 96), *cbr(96, 96), nn.AdaptiveAvgPool2d((3, 3)))
        self.fr, self.fs = trunk(1), trunk(3)
        self.hr = nn.Sequential(nn.Flatten(), nn.Dropout(0.25), nn.Linear(96 * 9, 128), nn.ReLU(inplace=True), nn.Linear(128, 14))
        self.hs = nn.Sequential(nn.Flatten(), nn.Dropout(0.25), nn.Linear(96 * 9, 64), nn.ReLU(inplace=True), nn.Linear(64, 4))
    def parts(self, x):
        g = 0.114 * x[:, 0:1] + 0.587 * x[:, 1:2] + 0.299 * x[:, 2:3]  # BGR luma: full resolution in H.264 (chroma is halved)
        lo = g.amin((2, 3), keepdim=True); hi = g.amax((2, 3), keepdim=True); g = (g - lo) / (hi - lo + 0.05)
        return self.hr(self.fr(g - 0.5)), self.hs(self.fs(x - 0.5))
    def forward(self, x):
        r, s = self.parts(x); lr, ls = F.log_softmax(r, 1), F.log_softmax(s, 1)
        return torch.cat([(ls[:, :, None] + lr[:, None, :13]).reshape(-1, 52), lr[:, 13:14]], 1)
def strict(r):
    k = r['ink']
    if r['label'] == 'none': return None
    for pr, ot in (((0, 2), (1, 3)), ((1, 3), (0, 2))):
        if min(k[pr[0]], k[pr[1]]) >= 0.1 and max(k[ot[0]], k[ot[1]]) <= 0.08: return pr, ot
    return 'skip'
def load(hands, extra=None, keep=None, keys=None):
    """keep: set of (crop, corner) positives that survived cross-validated cleaning (None = all); keys: list to fill
    with (crop, corner, slot k) per positive."""
    recs = [r for r in json.load(open('../corner-whole.json')) if r['hand'] in hands]
    pos, neg = [], []
    for r in recs:
        c = cv2.imread('../scan/n1532/crops/' + r['crop']); ps = corners(c); st = strict(r)
        if st is None: neg += ps
        elif st != 'skip':
            for i in st[0]:
                if keep is not None and (r['crop'], i) not in keep: continue
                pos.append((ps[i], CODES.index(r['label'])))
                if keys is not None: keys.append((r['crop'], i, r['k']))
            for i in st[1]: neg.append(ps[i])
    for e in extra or []:
        for it in json.load(open(e)):
            if it['hand'] in hands: pos.append((cv2.imread(it['path']), CODES.index(it['label'])))
    return pos, neg
def seam(p):
    """row between the rank glyph and the suit pip: least ink in rows 12-22 of the index column"""
    g = p[:, 1:18].astype(np.float32).mean(2); white = np.percentile(g, 90)
    return 12 + int(np.argmin((g[12:23] < white - 40).sum(1)))
def recombine(rng, pos, i, j):
    """rank glyph of positive i over the suit pip of positive j: label (rank i, suit j). Breaks rank-suit shortcuts."""
    (a, ya), (b, yb) = pos[i], pos[j]; sa, sb = seam(a), seam(b)
    lo = b[sb:]; need = a.shape[0] - sa
    if len(lo) < need: lo = np.concatenate([lo, np.repeat(lo[-1:], need - len(lo), 0)])
    return np.concatenate([a[:sa], lo[:need]]), (yb // 13) * 13 + ya % 13
def aug(rng, im, pool):
    h, w = im.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), rng.normal(0, 3), rng.uniform(0.9, 1.12)); M[:, 2] += rng.normal(0, 1.5, 2)
    im = cv2.warpAffine(im, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
    if rng.random() < 0.45:  # neighbour card over the far side (fan to the right, or a column below), with its own index
        o = pool[rng.integers(len(pool))][0]; im = im.copy()
        if rng.random() < 0.6: dx = rng.integers(15, 33); im[:, dx:] = o[:, :w - dx]; im[:, dx - 1:dx] = (im[:, dx - 1:dx] * 0.6).astype(np.uint8)
        else: dy = rng.integers(26, 34); im[dy:] = o[:h - dy]; im[dy - 1:dy] = (im[dy - 1:dy] * 0.6).astype(np.uint8)
    x = im.astype(np.float32) / 255
    x = x * rng.uniform(0.8, 1.15) + rng.uniform(-0.07, 0.07) + rng.normal(0, 0.02, 3).astype(np.float32)
    if rng.random() < 0.3: x = cv2.GaussianBlur(x, (3, 3), rng.uniform(0.3, 1.0))
    if rng.random() < 0.3: x = x + rng.normal(0, 0.02, x.shape).astype(np.float32)
    return np.clip(x, 0, 1)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--hands', default='A,B'); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=12); ap.add_argument('--steps', type=int, default=250); ap.add_argument('--extra', action='append'); ap.add_argument('--keep'); ap.add_argument('--synth', type=float, default=0.0)
    ap.add_argument('--rankw', default='', help='synthetic rank weights, e.g. 3:3,4:3 (corner6)'); ap.add_argument('--posw', default='', help='real positive weight by rank, e.g. 3:4,4:4'); ap.add_argument('--morefonts', action='store_true')
    a = ap.parse_args(); global SYN, RW, PW; SYN = a.synth; RW = {k: float(v) for k, v in (x.split(':') for x in a.rankw.split(',') if x)}; PW = {k: float(v) for k, v in (x.split(':') for x in a.posw.split(',') if x)}
    if a.morefonts: SY.use_more_fonts()
    kj = json.load(open(a.keep)) if a.keep else None; keep = {tuple(x) for x in (kj['keep'] if isinstance(kj, dict) else kj)} if kj else None
    pos, neg = load(a.hands.split(','), a.extra, keep); print('pos', len(pos), 'neg', len(neg), flush=True)
    model = fit(pos, neg, a.epochs, a.steps)
    model.eval().cpu(); torch.save(model.state_dict(), a.out + '.pt')
    torch.onnx.export(model, torch.zeros(1, 3, S, S), a.out + '.onnx', input_names=['images'], output_names=['logits'],
                      dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
    print('saved', a.out, flush=True)
SYN = 0.0; RW = {}; PW = {}
def fit(pos, neg, epochs, steps):
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'; model = CornerNet().to(dev); rng = np.random.default_rng(0)
    # sqrt class balance over positives
    from collections import Counter
    cnt = Counter(y for _, y in pos); wp = np.array([PW.get(SY.RANKS[y % 13], 1.0) / np.sqrt(cnt[y]) for _, y in pos]); wp /= wp.sum()
    rw = np.array([RW.get(r, 1.0) for r in SY.RANKS]); rw /= rw.sum()
    opt = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=epochs * steps, pct_start=0.15)
    for ep in range(epochs):
        model.train(); t0 = time.time(); tl = n = cor = 0
        for _ in range(steps):
            xs, ys = [], []
            for _ in range(128):
                if rng.random() < 0.3: im, y = neg[rng.integers(len(neg))], NONE
                elif SYN and rng.random() < SYN:
                    im = None
                    while im is None:
                        p0, y0 = pos[rng.integers(len(pos))]; rk = int(rng.choice(13, p=rw)); im = SY.synth(rng, p0, seam(p0), SY.RANKS[rk])
                    y = (y0 // 13) * 13 + rk
                elif rng.random() < 0.5: im, y = recombine(rng, pos, rng.choice(len(pos), p=wp), rng.choice(len(pos), p=wp))
                else: im, y = pos[rng.choice(len(pos), p=wp)]
                xs.append(aug(rng, im, pos).transpose(2, 0, 1)); ys.append(y)
            x = torch.from_numpy(np.ascontiguousarray(np.stack(xs))).float().to(dev); y = torch.tensor(ys).to(dev)
            r, s = model.parts(x); yr = torch.where(y == NONE, torch.full_like(y, 13), y % 13); card = y != NONE
            loss = F.cross_entropy(r, yr, label_smoothing=0.05) + (F.cross_entropy(s[card], (y // 13)[card], label_smoothing=0.05) if card.any() else 0)
            opt.zero_grad(); loss.backward(); opt.step(); sch.step()
            with torch.no_grad(): cor += (model(x).argmax(1) == y).sum().item()
            tl += loss.item() * len(y); n += len(y)
        print(f'epoch {ep} loss {tl / n:.4f} acc {cor / n:.4f} {time.time() - t0:.0f}s', flush=True)
    return model.eval()
if __name__ == '__main__': main()
