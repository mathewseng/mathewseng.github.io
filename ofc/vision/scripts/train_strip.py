"""Identity classifier that also reads covered (fanned) cards. Same CardNetFast and recipe as train_cls.py, plus:
real covered views labelled by hand state (make_strip_index.py) and synthetic fans: a clean crop of card X with a
clean card Y pasted over it, shifted like a fanned row, labelled X."""
import argparse, json, math, random, time, cv2, numpy as np, torch, torch.nn.functional as F
from fast_card_model import CardNetFast
from train_cls import aug, CODES, NONE
CW, CH = 64, 96; CX0, CY0 = 3, 4; CX1, CY1 = 61, 92  # card area inside a 64x96 crop with 10 % margin
def fan(rng, x, y, z=None):
    """Paste card y over card x, shifted along the short (70 %) or long axis, small rotation; with z, a third card
    further along the same direction on top of y (a three-card fan: x's box shows y's strip and x's own strip)."""
    if rng.random() < 0.7: dx, dy = rng.choice([-1, 1]) * rng.uniform(9, 40), rng.normal(0, 3)
    else: dx, dy = rng.normal(0, 3), rng.choice([-1, 1]) * rng.uniform(12, 62)
    out = paste(rng, x, y, dx, dy)
    if z is not None:
        f = rng.uniform(1.6, 2.4); out = paste(rng, out, z, dx * f, dy * f)
    return out
def paste(rng, x, y, dx, dy):
    M = cv2.getRotationMatrix2D((CW / 2, CH / 2), rng.normal(0, 3), 1.0); M[:, 2] += (dx, dy)
    mask = np.zeros((CH, CW), np.float32); mask[CY0:CY1, CX0:CX1] = 1
    wy = cv2.warpAffine(y, M, (CW, CH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wm = cv2.warpAffine(mask, M, (CW, CH), flags=cv2.INTER_LINEAR)[..., None]
    shadow = np.clip(cv2.GaussianBlur(wm, (0, 0), 1.5)[..., None] - wm, 0, 1) * rng.uniform(0, 0.35)
    out = x.astype(np.float32) * (1 - shadow) * (1 - wm) + wy.astype(np.float32) * wm
    return np.clip(out, 0, 255).astype(np.uint8)
def maskfan(rng, x):
    """Grey out a card-shaped region shifted like a fanned card on top (sometimes two), as the hand-state masks do."""
    out = x.copy(); m = np.zeros((CH, CW), np.uint8)
    if rng.random() < 0.7: dx, dy = rng.choice([-1, 1]) * rng.uniform(9, 44), rng.normal(0, 3)
    else: dx, dy = rng.normal(0, 3), rng.choice([-1, 1]) * rng.uniform(12, 70)
    for k in range(1 if rng.random() < 0.7 else 2):
        f = 1 if k == 0 else rng.uniform(1.6, 2.4)
        M = cv2.getRotationMatrix2D((CW / 2, CH / 2), rng.normal(0, 3), 1.0); M[:, 2] += (dx * f + rng.normal(0, 1.5), dy * f + rng.normal(0, 1.5))
        card = np.zeros((CH, CW), np.uint8); card[CY0:CY1, CX0:CX1] = 1
        m |= cv2.warpAffine(card, M, (CW, CH), flags=cv2.INTER_NEAREST)
    out[m > 0] = 128
    return out
class DS(torch.utils.data.Dataset):
    def __init__(self, items, clean, n, synth, triple, mode): self.items, self.clean, self.n, self.synth, self.triple, self.mode = items, clean, n, synth, triple, mode
    def __len__(self): return self.n
    def __getitem__(self, i):
        rng = np.random.default_rng((i * 7919 + int(time.time() * 1e6)) % 2**32)
        if rng.random() < self.synth:
            (xi, y), (yi, y2) = self.clean[rng.integers(len(self.clean))], self.clean[rng.integers(len(self.clean))]
            while y2 == y: yi, y2 = self.clean[rng.integers(len(self.clean))]
            zi = None
            if rng.random() < self.triple:
                zi, y3 = self.clean[rng.integers(len(self.clean))]
                while y3 in (y, y2): zi, y3 = self.clean[rng.integers(len(self.clean))]
            im = maskfan(rng, xi) if self.mode == 'mask' else fan(rng, xi, yi, zi)
        else:
            im, y = self.items[rng.integers(len(self.items))]
        return torch.from_numpy(np.ascontiguousarray(aug(rng, im).transpose(2, 0, 1))), y
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', action='append', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=20); ap.add_argument('--steps', type=int, default=300)
    ap.add_argument('--batch', type=int, default=128); ap.add_argument('--lr', type=float, default=3e-3)
    ap.add_argument('--synth', type=float, default=0.3); ap.add_argument('--triple', type=float, default=0.4); ap.add_argument('--mode', default='fan'); ap.add_argument('--covered-weight', type=float, default=3.0)
    a = ap.parse_args()
    items, clean = [], []
    for idx in a.index:
        for it in json.load(open(idx)):
            if it['label'] == '?': continue
            y = NONE if it['label'] == 'none' else CODES.index(it['label'])
            im = cv2.imread(it['path']); items.append((im, y, it.get('kind', 'clean')))
            if it.get('kind') == 'clean': clean.append((im, y))
    counts = np.bincount([y for _, y, _ in items], minlength=53)
    print('items', len(items), 'none', counts[NONE], 'covered', sum(k == 'covered' for *_, k in items), 'clean', len(clean),
          'min class', counts[:52].min(), CODES[int(counts[:52].argmin())], flush=True)
    by = [[] for _ in range(53)]
    for im, y, k in items: by[y] += [(im, y)] * (int(a.covered_weight) if k == 'covered' else 1)
    w = np.sqrt(np.array([len(b) for b in by]).clip(1)); w = w / w.sum(); tot = sum(len(b) for b in by)
    flat = []
    for c in range(53):
        if by[c]: flat += [by[c][j % len(by[c])] for j in range(max(1, int(round(w[c] * tot))))]
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = CardNetFast().to(dev)
    dl = torch.utils.data.DataLoader(DS(flat, clean, a.steps * a.batch, a.synth, a.triple, a.mode), batch_size=a.batch, num_workers=3, persistent_workers=True)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * a.steps, pct_start=0.1)
    for ep in range(a.epochs):
        t0 = time.time(); tl = n = cor = 0
        for x, y in dl:
            x, y = x.to(dev), y.to(dev)
            out = model(x); loss = F.cross_entropy(out, y, label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tl += loss.item() * len(y); n += len(y); cor += (out.argmax(1) == y).sum().item()
        print(f'epoch {ep} loss {tl/n:.4f} train-acc {cor/n:.4f} {time.time()-t0:.0f}s', flush=True)
    model.eval().cpu(); torch.save(model.state_dict(), a.out + '.pt')
    torch.onnx.export(model, torch.zeros(1, 3, 96, 64), a.out + '.onnx', input_names=['images'], output_names=['logits'],
                      dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
    print('saved', a.out)
if __name__ == '__main__': main()
