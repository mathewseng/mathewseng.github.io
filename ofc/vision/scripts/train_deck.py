"""train_deck.py IDX OUT: deck gate = CardNetFast (v3 conv weights, frozen BN) with a 3-way head: classic, jumbo, none."""
import os, sys, json, time, cv2, numpy as np, torch, torch.nn.functional as F

from fast_card_model import CardNetFast
from train_cls import aug
from ft_cls import load_onnx
LAB = {'classic': 0, 'jumbo': 1, 'none': 2}
items = json.load(open(sys.argv[1])); out = sys.argv[2]
groups = {}
for it in items:
    g = (it['src'], it['label']) if it['label'] != 'none' else ('any', 'none')
    groups.setdefault(g, []).append((cv2.imread(it['path']), LAB[it['label']]))
W = {('n1532', 'jumbo'): 2.0, ('n1532', 'classic'): 1.0, ('old', 'classic'): 1.0, ('any', 'none'): 0.6}
keys = list(groups); p = np.array([W[k] for k in keys]); p /= p.sum(); print({k: len(v) for k, v in groups.items()}, flush=True)
m = CardNetFast(); load_onnx(m, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models', 'card-identity.onnx')); m.head[4] = torch.nn.Linear(128, 3)
dev = 'mps' if torch.backends.mps.is_available() else 'cpu'; m.to(dev); rng = np.random.default_rng(1)
E, STEPS, B = 6, 300, 128
opt = torch.optim.AdamW(m.parameters(), lr=1e-3, weight_decay=1e-4)
sch = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=1e-3, total_steps=E * STEPS, pct_start=0.15)
for ep in range(E):
    m.train()
    for mm in m.f:
        if isinstance(mm, torch.nn.BatchNorm2d): mm.eval()
    t0 = time.time(); tot = n = cor = 0
    for _ in range(STEPS):
        xs, ys = [], []
        for g in rng.choice(len(keys), B, p=p):
            im, y = groups[keys[g]][rng.integers(len(groups[keys[g]]))]; xs.append(aug(rng, im).transpose(2, 0, 1)); ys.append(y)
        x = torch.from_numpy(np.ascontiguousarray(np.stack(xs))).to(dev); y = torch.tensor(ys).to(dev)
        o = m(x); loss = F.cross_entropy(o, y, label_smoothing=0.02); opt.zero_grad(); loss.backward(); opt.step(); sch.step()
        tot += loss.item() * B; n += B; cor += (o.argmax(1) == y).sum().item()
    print(f'epoch {ep} loss {tot / n:.4f} acc {cor / n:.4f} {time.time() - t0:.0f}s', flush=True)
m.eval().cpu(); torch.save(m.state_dict(), out + '.pt')
torch.onnx.export(m, torch.zeros(1, 3, 96, 64), out + '.onnx', input_names=['images'], output_names=['logits'],
                  dynamic_axes={'images': {0: 'n'}, 'logits': {0: 'n'}}, opset_version=17)
print('saved', out, flush=True)
