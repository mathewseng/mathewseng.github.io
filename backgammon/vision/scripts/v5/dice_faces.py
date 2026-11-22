#!/usr/bin/env python3
"""Train a die-face reader from rolls that a legal move determines uniquely.

White rolls the yellow pair and Black the red pair. For each decoded turn with
a single possible roll, the two most persistent dice of the roller's colour in
the roll window are paired with that roll. Non-doubles use an order-free pair
loss. usage: dice_faces.py decode.json out.pt [--holdout-games 3 4]
"""
import argparse, collections, glob, json, random
from pathlib import Path
import numpy as np, torch, torch.nn as nn, cv2
from session import WORK

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
COLOUR = {'white': 0, 'dark': 1}  # meta[:,4]: 1 = red (dark)


def load_scan(work=None):
    work = Path(work) if work else WORK
    metas, patches = [], []
    for p in sorted(glob.glob(str(work / 'dice-scan/clip-*.npz'))):
        z = np.load(p); metas.append(z['meta']); patches.append(z['patches'])
    return np.concatenate(metas), np.concatenate(patches)


DIE_SCORE = None
def tracks(meta, f0, f1, red, score=None):
    """Persistent dice in a frame window: list of index arrays, most persistent first."""
    global DIE_SCORE
    if score is None:
        if DIE_SCORE is None: DIE_SCORE = np.load(WORK / 'dice-scan/die-score.npy')
        score = DIE_SCORE
    sel = np.nonzero((meta[:, 0] > f0) & (meta[:, 0] <= f1) & (meta[:, 4] == red) & (score > .5))[0]
    cells = collections.defaultdict(list)
    for i in sel: cells[(int(meta[i, 1] // 10), int(meta[i, 2] // 10))].append(i)
    # merge neighbouring cells
    groups = []
    for key, idx in sorted(cells.items(), key=lambda kv: -len(kv[1])):
        for g in groups:
            if abs(g['key'][0] - key[0]) <= 1 and abs(g['key'][1] - key[1]) <= 1: g['idx'] += idx; break
        else: groups.append({'key': key, 'idx': list(idx)})
    groups = [np.array(g['idx']) for g in groups if len(g['idx']) >= 5]
    return sorted(groups, key=len, reverse=True)


def examples(decode, meta, score=None, source=0):
    out = []
    for gi, g in enumerate(decode['games'], 1):
        prev = g['startFrame']
        for t in g['turns']:
            red = 1 if t['player'] == 'dark' else 0
            start = t.get('fromFrame', prev)
            tr = tracks(meta, start, t['frame'], red, score)
            if t['rolls'] and len(tr) >= 2 and not t.get('inferred'):
                sets = [tuple(map(int, r.split('-'))) for r in t['rolls']]
                out.append({'game': gi, 'source': source, 'frame': t['frame'], 'faces': sets[0], 'sets': sets, 'tracks': tr[:2]})
            prev = t['frame']
    return out


class FaceNet(nn.Module):
    def __init__(self):
        super().__init__()
        def block(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        self.f = nn.Sequential(block(3, 32), block(32, 64), block(64, 128))
        self.h = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(.3), nn.Linear(128, 6))
    def forward(self, x): return self.h(self.f(x))


def prep(p, train):
    p = p.astype(np.float32)
    if train:
        k = random.randint(0, 3); p = np.rot90(p, k)
        if random.random() < .5: p = p[:, ::-1]
        M = cv2.getRotationMatrix2D((20, 20), random.uniform(-45, 45), random.uniform(.9, 1.1))
        M[:, 2] += np.random.uniform(-3, 3, 2)
        p = cv2.warpAffine(np.ascontiguousarray(p), M, (40, 40), borderMode=cv2.BORDER_REFLECT)
        p = p * random.uniform(.8, 1.2) + random.uniform(-20, 20)
    p = np.ascontiguousarray(p[4:36, 4:36, ::-1])
    return (torch.from_numpy(p).permute(2, 0, 1).contiguous() / 255. - .5) / .25


def pair_loss(l1, l2, a, b):
    ce = nn.functional.cross_entropy
    x = ce(l1, a, reduction='none') + ce(l2, b, reduction='none')
    y = ce(l1, b, reduction='none') + ce(l2, a, reduction='none')
    return torch.minimum(x, y).mean()


@torch.no_grad()
def read_track(net, patches, idx):
    x = torch.stack([prep(patches[i], False) for i in idx]).to(dev)
    return torch.log_softmax(net(x), 1).mean(0).cpu().numpy()  # pooled log-probs


def pair_prob(lp1, lp2):
    """log P(unordered roll) for all 21 rolls from two pooled die log-probs."""
    out = {}
    for a in range(1, 7):
        for b in range(a, 7):
            s = np.logaddexp(lp1[a - 1] + lp2[b - 1], lp1[b - 1] + lp2[a - 1]) if a != b else lp1[a - 1] + lp2[a - 1]
            out[f'{b}-{a}'] = float(s)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('decode'); ap.add_argument('out')
    ap.add_argument('--holdout-games', type=int, nargs='*', default=[]); ap.add_argument('--steps', type=int, default=2500)
    ap.add_argument('--extra', nargs='*', default=[], help='more sessions as decode.json@work-dir (training only)')
    a = ap.parse_args()
    meta, patches = load_scan()
    ex = examples(json.loads(Path(a.decode).read_text()), meta)
    for k, pair in enumerate(a.extra, 1):
        dec, work = pair.split('@')
        m2, p2 = load_scan(work); sc2 = np.load(Path(work) / 'dice-scan/die-score.npy')
        offset = len(patches)
        more = examples(json.loads(Path(dec).read_text()), m2, sc2, k)
        for e in more: e['tracks'] = [t + offset for t in e['tracks']]; e['game'] = 1000 * k + e['game']
        patches = np.concatenate([patches, p2]); ex += more
    train = [e for e in ex if e['game'] not in a.holdout_games]; test = [e for e in ex if e['game'] in a.holdout_games]
    print('examples', len(ex), 'train', len(train), 'test', len(test))
    net = FaceNet().to(dev); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=a.steps)
    for step in range(a.steps):
        batch = random.choices(train, k=48)
        x1 = torch.stack([prep(patches[random.choice(e['tracks'][0])], True) for e in batch]).to(dev)
        x2 = torch.stack([prep(patches[random.choice(e['tracks'][1])], True) for e in batch]).to(dev)
        net.train(); l1 = torch.log_softmax(net(x1), 1); l2 = torch.log_softmax(net(x2), 1)
        losses = []
        for j, e in enumerate(batch):
            terms = []
            for a_, b_ in e['sets']:
                x = l1[j, a_ - 1] + l2[j, b_ - 1]
                terms.append(x if a_ == b_ else torch.logaddexp(x, l1[j, b_ - 1] + l2[j, a_ - 1]))
            losses.append(-torch.logsumexp(torch.stack(terms), 0))
        loss = torch.stack(losses).mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 500 == 0: print(step, round(loss.item(), 3), flush=True)
    net.eval()
    for name, part in (('train', train), ('test', test)):
        ok = 0; tot = 0
        for e in part:
            pp = pair_prob(read_track(net, patches, e['tracks'][0][:15]), read_track(net, patches, e['tracks'][1][:15]))
            if len(e['sets']) > 1: continue
            best = max(pp, key=pp.get); truth = f"{max(e['faces'])}-{min(e['faces'])}"
            ok += best == truth; tot += 1
            if name == 'test' and best != truth: print('  miss', e['frame'], truth, 'read', best)
        print(name, 'unique-roll turns', ok, '/', tot)
    torch.save(net.cpu().state_dict(), a.out)
