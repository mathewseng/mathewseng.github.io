"""ft_fact.py --init ONNX --index I --weight W ... --out OUT: CardNetFast (v3 weights, frozen BN) with a factorized head:
rank (13 + none) x suit (4). p(card) = p(rank) * p(suit), p(none) = p(rank = none). Unseen rank-suit pairs of a deck are
named from ranks and suits seen elsewhere. Exports log p(53) as 'logits' (softmax gives p back), a drop-in classifier."""
import sys, argparse, json, time, cv2, numpy as np, torch, torch.nn as nn, torch.nn.functional as F

from fast_card_model import CardNetFast
from train_cls import aug, CODES, NONE
from ft_cls import load_onnx
class Fact(nn.Module):
    def __init__(self, base):
        super().__init__(); self.f = base.f
        self.head = nn.Sequential(nn.Flatten(), nn.Dropout(0.2), nn.Linear(128 * 6, 128), nn.ReLU(inplace=True), nn.Linear(128, 18))
        self.head[2].load_state_dict(base.head[2].state_dict())
    def parts(self, x):
        o = self.head(self.f(x - 0.5)); return o[:, :14], o[:, 14:]
    def forward(self, x):
        r, s = self.parts(x); lr, ls = F.log_softmax(r, 1), F.log_softmax(s, 1)
        card = (ls[:, :, None] + lr[:, None, :13]).reshape(-1, 52)  # suit-first codes: S A..K, H.., C.., D..
        return torch.cat([card, lr[:, 13:14]], 1)
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--init', required=True); ap.add_argument('--index', action='append', required=True)
    ap.add_argument('--weight', action='append', type=float); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=6); ap.add_argument('--steps', type=int, default=300)
    ap.add_argument('--batch', type=int, default=128); ap.add_argument('--lr', type=float, default=1e-3)
    a = ap.parse_args(); ws = a.weight or [1.0] * len(a.index)
    groups = []
    for idx in a.index:
        items = [(cv2.imread(it['path']), NONE if it['label'] == 'none' else CODES.index(it['label'])) for it in json.load(open(idx)) if it['label'] != '?']
        groups.append(items); print(idx, len(items), flush=True)
    base = CardNetFast(); load_onnx(base, a.init); model = Fact(base)
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'; model.to(dev)
    p = np.array(ws) / sum(ws); rng = np.random.default_rng(0)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * a.steps, pct_start=0.15)
    for ep in range(a.epochs):
        model.train()
        for m in model.f:
            if isinstance(m, nn.BatchNorm2d): m.eval()
        t0 = time.time(); tot = n = cor = 0
        for _ in range(a.steps):
            xs, ys = [], []
            for g in rng.choice(len(groups), a.batch, p=p):
                im, y = groups[g][rng.integers(len(groups[g]))]; xs.append(aug(rng, im).transpose(2, 0, 1)); ys.append(y)
            x = torch.from_numpy(np.ascontiguousarray(np.stack(xs))).to(dev); y = torch.tensor(ys).to(dev)
            r, s = model.parts(x)
            yr = torch.where(y == NONE, torch.full_like(y, 13), y % 13); ys_ = y // 13; card = y != NONE
            loss = F.cross_entropy(r, yr, label_smoothing=0.05) + (F.cross_entropy(s[card], ys_[card], label_smoothing=0.05) if card.any() else 0)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            with torch.no_grad(): pred = model(x).argmax(1)
            tot += loss.item() * len(y); n += len(y); cor += (pred == y).sum().item()
        print(f'epoch {ep} loss {tot / n:.4f} train-acc {cor / n:.4f} {time.time() - t0:.0f}s', flush=True)
    model.eval().cpu(); torch.save(model.state_dict(), a.out + '.pt')
    torch.onnx.export(model, torch.zeros(1, 3, 96, 64), a.out + '.onnx', input_names=['images'], output_names=['logits'],
                      dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
    print('saved', a.out, flush=True)
if __name__ == '__main__': main()
