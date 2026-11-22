#!/usr/bin/env python3
"""Die / not-die patch classifier trained on the hand-labelled candidate grid."""
import json, random, sys
import numpy as np, torch, torch.nn as nn
import dice_faces as df
from session import WORK

dev = df.dev


class DieNet(nn.Module):
    def __init__(self):
        super().__init__()
        def block(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        self.f = nn.Sequential(block(3, 24), block(24, 48), block(48, 96))
        self.h = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(96, 2))
    def forward(self, x): return self.h(self.f(x))


@torch.no_grad()
def score(net, patches, idx, batch=512):
    out = []
    for s in range(0, len(idx), batch):
        x = torch.stack([df.prep(patches[i], False) for i in idx[s:s + batch]]).to(dev)
        out.append(torch.softmax(net(x), 1)[:, 1].cpu().numpy())
    return np.concatenate(out) if out else np.zeros(0)


if __name__ == '__main__':
    meta, patches = df.load_scan()
    pick = np.load(WORK / 'labels/die-grid-idx.npy')
    pos = set(json.loads((WORK / 'labels/die-grid.json').read_text())['positive'])
    data = [(int(i), int(j in pos)) for j, i in enumerate(pick)]
    random.seed(1); random.shuffle(data); test, train = data[:40], data[40:]
    net = DieNet().to(dev); opt = torch.optim.AdamW(net.parameters(), 2e-3)
    for step in range(800):
        b = random.choices(train, k=64)
        x = torch.stack([df.prep(patches[i], True) for i, _ in b]).to(dev); y = torch.tensor([l for _, l in b]).to(dev)
        net.train(); loss = nn.functional.cross_entropy(net(x), y); opt.zero_grad(); loss.backward(); opt.step()
    net.eval()
    s = score(net, patches, [i for i, _ in test])
    print('held-out acc', np.mean((s > .5) == np.array([l for _, l in test])), 'n', len(test))
    torch.save(net.cpu().state_dict(), sys.argv[1]); net.to(dev)
    allidx = np.arange(len(meta)); sc = score(net, patches, allidx)
    np.save(WORK / 'dice-scan/die-score.npy', sc); print('dice-like', int((sc > .5).sum()), 'of', len(sc))
