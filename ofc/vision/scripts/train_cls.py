"""Train the OFC deck identity classifier (52 suit-first codes + none) on real 64x96 crops.
index.json: [{path, label}] with label a code, 'none', or '?' (skipped)."""
import argparse, json, math, random, time, cv2, numpy as np, torch, torch.nn.functional as F
from fast_card_model import CardNetFast
CODES = [s + r for s in 'SHCD' for r in 'A23456789TJQK']
NONE = 52
def aug(rng, im):
    h, w = im.shape[:2]
    a = rng.normal(0, 3.0); s = rng.uniform(0.94, 1.07)
    M = cv2.getRotationMatrix2D((w / 2 + rng.normal(0, 1.5), h / 2 + rng.normal(0, 2)), a, s)
    M[:, 2] += rng.normal(0, [2.0, 2.5])
    im = cv2.warpAffine(im, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    if rng.random() < 0.5: im = im[::-1, ::-1]
    x = im.astype(np.float32) / 255
    x = x * rng.uniform(0.8, 1.15) + rng.uniform(-0.07, 0.07) + rng.normal(0, 0.02, 3).astype(np.float32)
    if rng.random() < 0.3: x = cv2.GaussianBlur(x, (3, 3), rng.uniform(0.3, 1.0))
    if rng.random() < 0.3: x = x + rng.normal(0, 0.02, x.shape).astype(np.float32)
    return np.clip(x, 0, 1)
class DS(torch.utils.data.Dataset):
    def __init__(self, items, n): self.items, self.n = items, n
    def __len__(self): return self.n
    def __getitem__(self, i):
        rng = np.random.default_rng((i * 7919 + int(time.time() * 1e6)) % 2**32)
        im, y = self.items[rng.integers(len(self.items))]
        return torch.from_numpy(np.ascontiguousarray(aug(rng, im).transpose(2, 0, 1))), y
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--index', action='append', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=24); ap.add_argument('--steps', type=int, default=300)
    ap.add_argument('--batch', type=int, default=128); ap.add_argument('--lr', type=float, default=3e-3)
    ap.add_argument('--none-weight', type=float, default=1.0)
    a = ap.parse_args()
    items = []
    for idx in a.index:
        for it in json.load(open(idx)):
            if it['label'] == '?': continue
            y = NONE if it['label'] == 'none' else CODES.index(it['label'])
            items.append((cv2.imread(it['path']), y))
    counts = np.bincount([y for _, y in items], minlength=53)
    print('items', len(items), 'none', counts[NONE], 'min class', counts[:52].min(), CODES[int(counts[:52].argmin())], flush=True)
    # class-balanced: sample classes uniformly-ish (sqrt balancing)
    by = [[] for _ in range(53)]
    for it in items: by[it[1]].append(it)
    w = np.sqrt(counts.clip(1)); w = w / w.sum()
    flat = []
    for c in range(53):
        if not by[c]: continue
        k = max(1, int(round(w[c] * len(items) * (a.none_weight if c == NONE else 1))))
        flat += [by[c][j % len(by[c])] for j in range(k)]
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = CardNetFast().to(dev)
    dl = torch.utils.data.DataLoader(DS(flat, a.steps * a.batch), batch_size=a.batch, num_workers=2, persistent_workers=True)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * a.steps, pct_start=0.1)
    for ep in range(a.epochs):
        t0 = time.time(); tot = n = cor = 0
        for x, y in dl:
            x, y = x.to(dev), y.to(dev)
            out = model(x); loss = F.cross_entropy(out, y, label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tot += loss.item() * len(y); n += len(y); cor += (out.argmax(1) == y).sum().item()
        print(f'epoch {ep} loss {tot/n:.4f} train-acc {cor/n:.4f} {time.time()-t0:.0f}s', flush=True)
    model.eval().cpu()
    torch.save(model.state_dict(), a.out + '.pt')
    torch.onnx.export(model, torch.zeros(1, 3, 96, 64), a.out + '.onnx', input_names=['images'], output_names=['logits'],
                      dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
    print('saved', a.out)
if __name__ == '__main__': main()
