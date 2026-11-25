"""Fine-tune the shipped classifier (ONNX, BatchNorm folded into the convs) on extra labelled crops, replaying the old
training crops so other decks are not forgotten. BN layers carry the folded bias and stay frozen (eval mode).
python3 ft_cls.py --init models/card-identity.onnx --index old.json --index new.json --weight 1 --weight 3 --out cls-v5"""
import argparse, json, time, cv2, numpy as np, onnx, torch, torch.nn.functional as F
from onnx import numpy_helper
from fast_card_model import CardNetFast
from train_cls import aug, CODES, NONE

def load_onnx(model, path):
    init = {i.name: numpy_helper.to_array(i) for i in onnx.load(path).graph.initializer}
    convs = [m for m in model.f if isinstance(m, torch.nn.Conv2d)]; bns = [m for m in model.f if isinstance(m, torch.nn.BatchNorm2d)]
    folded = [v for k, v in init.items() if k.startswith('onnx::Conv')]  # weight, bias pairs in graph order
    for c, b, (w, bias) in zip(convs, bns, zip(folded[::2], folded[1::2])):
        c.weight.data = torch.from_numpy(w.copy()); b.weight.data.fill_(1); b.bias.data = torch.from_numpy(bias.copy())
        b.running_mean.zero_(); b.running_var.fill_(1 - b.eps)
    for k in ('head.2.weight', 'head.2.bias', 'head.4.weight', 'head.4.bias'):
        dict(model.named_parameters())[k].data = torch.from_numpy(init[k].copy())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--init', required=True); ap.add_argument('--index', action='append', required=True)
    ap.add_argument('--weight', action='append', type=float); ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=int, default=6); ap.add_argument('--steps', type=int, default=300)
    ap.add_argument('--batch', type=int, default=128); ap.add_argument('--lr', type=float, default=1e-3)
    a = ap.parse_args(); ws = a.weight or [1.0] * len(a.index)
    groups = []
    for idx in a.index:
        items = [(cv2.imread(it['path']), NONE if it['label'] == 'none' else CODES.index(it['label']))
                 for it in json.load(open(idx)) if it['label'] != '?']
        groups.append(items); print(idx, len(items), flush=True)
    model = CardNetFast(); load_onnx(model, a.init)
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'; model.to(dev)
    p = np.array(ws) / sum(ws); rng = np.random.default_rng(0)
    def batch():
        xs, ys = [], []
        for g in rng.choice(len(groups), a.batch, p=p):
            im, y = groups[g][rng.integers(len(groups[g]))]; xs.append(aug(rng, im).transpose(2, 0, 1)); ys.append(y)
        return torch.from_numpy(np.ascontiguousarray(np.stack(xs))).to(dev), torch.tensor(ys).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a.lr, total_steps=a.epochs * a.steps, pct_start=0.15)
    for ep in range(a.epochs):
        model.train()
        for m in model.f:
            if isinstance(m, torch.nn.BatchNorm2d): m.eval()
        t0 = time.time(); tot = n = cor = 0
        for _ in range(a.steps):
            x, y = batch(); out = model(x); loss = F.cross_entropy(out, y, label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tot += loss.item() * len(y); n += len(y); cor += (out.argmax(1) == y).sum().item()
        print(f'epoch {ep} loss {tot / n:.4f} train-acc {cor / n:.4f} {time.time() - t0:.0f}s', flush=True)
    model.eval().cpu(); torch.save(model.state_dict(), a.out + '.pt')
    torch.onnx.export(model, torch.zeros(1, 3, 96, 64), a.out + '.onnx', input_names=['images'], output_names=['logits'],
                      dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
    print('saved', a.out)

if __name__ == '__main__': main()
