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
from session import WORK, red_player
import os
SCAN = os.environ.get('BG_DICE_SCAN', 'objects-scan')  # 'dice-scan' for the colour-blob candidates

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
COLOUR = {'white': 0, 'dark': 1}  # meta[:,4]: 1 = red (dark)


def load_scan(work=None):
    work = Path(work) if work else WORK
    metas, patches = [], []
    for p in sorted(glob.glob(str(work / SCAN / 'clip-*.npz'))):
        z = np.load(p); metas.append(z['meta']); patches.append(z['patches'])
    return np.concatenate(metas), np.concatenate(patches)


DIE_SCORE = None
def tracks(meta, f0, f1, red, score=None):
    """Persistent dice in a frame window: list of index arrays, most persistent first."""
    global DIE_SCORE
    if score is None:
        if DIE_SCORE is None: DIE_SCORE = np.load(WORK / SCAN / 'die-score.npy')
        score = DIE_SCORE
    sel = np.nonzero((meta[:, 0] > f0) & (meta[:, 0] <= f1) & (meta[:, 4] == red) & (score > .3))[0]
    cells = collections.defaultdict(list)
    for i in sel: cells[(int(meta[i, 1] // 10), int(meta[i, 2] // 10))].append(i)
    # merge neighbouring cells
    groups = []
    for key, idx in sorted(cells.items(), key=lambda kv: -len(kv[1])):
        for g in groups:
            if abs(g['key'][0] - key[0]) <= 1 and abs(g['key'][1] - key[1]) <= 1: g['idx'] += idx; break
        else: groups.append({'key': key, 'idx': list(idx)})
    groups = [np.array(g['idx']) for g in groups if len(g['idx']) >= 5]
    if SPLIT_TOUCHING: groups = [h for g in groups for h in split_touching(meta, g)]
    # The window starts at the previous turn's end, so the roller's dice from two
    # turns ago are usually still there until they are picked up to roll. Leave
    # out dice already present when the window opens, then prefer dice still
    # seen in the last 10 s before the move.
    fresh = [g for g in groups if meta[g, 0].min() > f0 + 25]
    if len(fresh) >= 2: groups = fresh
    recent = [g for g in groups if meta[g, 0].max() >= f1 - 250]
    if len(recent) >= 2: groups = recent
    return sorted(groups, key=len, reverse=True)


def mask_neighbours(p, offsets):
    """A 40x40 patch with every pixel nearer to a neighbouring die than to the patch's own die
    painted the felt colour (the median of the pixels far from both), so a touching die's pips are
    not read. offsets: neighbours' centres relative to the patch centre, in patch pixels."""
    if not len(offsets): return p
    yy, xx = np.mgrid[0:40, 0:40] - 19.5
    own = np.hypot(xx, yy); near = np.zeros((40, 40), bool); far = own > 13
    for dx, dy in offsets:
        dn = np.hypot(xx - dx, yy - dy); near |= dn < own; far &= dn > 13
    p = p.copy(); fill = np.median(p[far], 0) if far.sum() > 20 else np.median(p.reshape(-1, 3), 0)
    p[near] = fill; return p


def neighbour_offsets(meta, view=None, near=26, same=6):
    """For every detection in a scan, the other detections of its frame within `near` px (any colour;
    closer than `same` px is the same die), as offsets in its patch's pixels (patches are cut from the
    rectified frame, meta is in the reader's view: session.reader_xy)."""
    sx, sy = (-1, -1) if view == 'turned' else (-1, 1) if view == 'mirrored' else (1, 1)
    out = [[] for _ in range(len(meta))]
    order = np.argsort(meta[:, 0], kind='stable'); fr = meta[order, 0]
    cuts = np.nonzero(np.diff(fr))[0] + 1
    for grp in np.split(order, cuts):
        if len(grp) < 2: continue
        for i in grp:
            for j in grp:
                if i == j: continue
                dx, dy = meta[j, 1] - meta[i, 1], meta[j, 2] - meta[i, 2]
                if same <= np.hypot(dx, dy) <= near: out[i].append((sx * dx, sy * dy))
    return out


SPLIT_TOUCHING = False  # roll_audit.py: a group seen twice in one frame is two touching dice (split_touching)


def split_touching(meta, g):
    """Two dice of one colour lying within a cell of each other fall into one group (Nov 21 G6 T19:
    a three 16 px from a four). When a quarter or more of the group's frames hold two of its
    detections, split it in two around the two farthest-apart detections (2-means); each part must
    keep 5 detections and the parts' centres must be 10 px apart."""
    _, c = np.unique(meta[g, 0], return_counts=True)
    if (c > 1).sum() < .25 * len(c): return [g]
    xy = meta[g, 1:3].astype(float)
    d = np.linalg.norm(xy[:, None] - xy[None], axis=2); i, j = np.unravel_index(d.argmax(), d.shape)
    cen = xy[[i, j]]
    for _ in range(10):
        lab = np.linalg.norm(xy[:, None] - cen[None], axis=2).argmin(1)
        if lab.min() == lab.max(): return [g]
        cen = np.array([xy[lab == k].mean(0) for k in (0, 1)])
    parts = [g[lab == 0], g[lab == 1]]
    if min(map(len, parts)) < 5 or np.linalg.norm(cen[0] - cen[1]) < 10: return [g]
    return parts


def stale_positions(meta, f0, red, score):
    """Where the roller's previous dice lie when the window opens (frames f0-25..f0+25)."""
    sel = np.nonzero((np.abs(meta[:, 0] - f0) <= 25) & (meta[:, 4] == red) & (score > .3))[0]
    return meta[sel, 1:3]


def window_start(prev, last_start, frame):
    """A turn's dice window starts where the previous turn ended; two turns decoded from one
    jump share an end frame, so the second shares the first one's window (other colour)."""
    return last_start if frame - prev < 25 else prev


OPENINGS = False         # --openings: also learn from opening rolls (one die of each colour)
EXCLUDE_HELDOUT = False  # --exclude-heldout: leave out the object test's held-out games (heldout.py)


def examples(decode, meta, score=None, source=0, work=None):
    import heldout
    out = []; red_side = red_player(work); session = heldout.session_of_work(work or WORK)
    for gi, g in enumerate(decode['games'], 1):
        prev = start = g['startFrame']
        for ti, t in enumerate(g['turns']):
            red = 1 if t['player'] == red_side else 0
            start = window_start(prev, start, t['frame'])
            if EXCLUDE_HELDOUT and session and heldout.held(session, t['frame']): prev = t['frame']; continue
            tr = tracks(meta, start, t['frame'], red, score)
            if ti == 0 and OPENINGS and not g.get('fragment'):
                tr = tracks(meta, start, t['frame'], 0, score)[:1] + tracks(meta, start, t['frame'], 1, score)[:1]
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


# The detector centres on a die's coloured side face; its pip face is about 10 px
# to the left (the camera sees the dice from one side), so the crop leans left ('lean': 32x32).
# 'full' reads the whole 40x40 patch, so a turned die's pip face stays in view. A model saved
# as {'state_dict', 'crop'} carries its crop (load_net).
CROP_X = int(os.environ.get('BG_FACE_CROP_X', '4'))
CROP = 'lean'


class Ensemble(nn.Module):
    """Several face readers, each on its own crop, averaged in log-probability. Inputs are 'full'
    40x40 patches; a 'lean' member reads its 32x32 crop out of them."""
    def __init__(self, members):
        super().__init__(); self.nets = nn.ModuleList(n for n, _ in members); self.crops = [c for _, c in members]
    def forward(self, x):
        outs = [torch.log_softmax(n(x if c == 'full' else x[:, :, 4:36, CROP_X:CROP_X + 32]), 1) for n, c in zip(self.nets, self.crops)]
        return torch.stack(outs).mean(0)


def load_net(path):
    """A face reader and its crop ('lean' for models saved as a bare state dict). 'a.pt,b.pt' is an
    Ensemble of the models (read on full patches)."""
    global CROP
    path = str(path)
    if ',' in path:
        members = []
        for p in path.split(','):
            n = load_net(p); members.append((n, CROP))
        CROP = 'full'; return Ensemble(members).eval().to(dev)
    obj = torch.load(path, map_location='cpu')
    sd = obj['state_dict'] if 'state_dict' in obj else obj
    CROP = obj.get('crop', 'lean') if 'state_dict' in obj else 'lean'
    net = FaceNet(); net.load_state_dict(sd); return net.eval().to(dev)


def prep(p, train):
    p = p.astype(np.float32)
    if train:
        k = random.randint(0, 3); p = np.rot90(p, k)
        if random.random() < .5: p = p[:, ::-1]
        M = cv2.getRotationMatrix2D((20, 20), random.uniform(-45, 45), random.uniform(.9, 1.1))
        M[:, 2] += np.random.uniform(-3, 3, 2)
        p = cv2.warpAffine(np.ascontiguousarray(p), M, (40, 40), borderMode=cv2.BORDER_REFLECT)
        p = p * random.uniform(.8, 1.2) + random.uniform(-20, 20)
    p = np.ascontiguousarray(p[:, :, ::-1] if CROP == 'full' else p[4:36, CROP_X:CROP_X + 32, ::-1])
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
    ap.add_argument('--eval-only', action='store_true', help='score the existing model at out on the held-out games')
    ap.add_argument('--crop', default='lean', choices=('lean', 'full')); ap.add_argument('--openings', action='store_true')
    ap.add_argument('--exclude-heldout', action='store_true', help="leave out the object test's held-out games (heldout.py)")
    ap.add_argument('--init', help='start from this model')
    a = ap.parse_args()
    CROP, OPENINGS, EXCLUDE_HELDOUT = a.crop, a.openings, a.exclude_heldout
    meta, patches = load_scan()
    ex = examples(json.loads(Path(a.decode).read_text()), meta)
    for k, pair in enumerate(a.extra, 1):
        dec, work = pair.split('@')
        m2, p2 = load_scan(work); sc2 = np.load(Path(work) / SCAN / 'die-score.npy')
        offset = len(patches)
        more = examples(json.loads(Path(dec).read_text()), m2, sc2, k, work)
        for e in more: e['tracks'] = [t + offset for t in e['tracks']]; e['game'] = 1000 * k + e['game']
        patches = np.concatenate([patches, p2]); ex += more
    train = [e for e in ex if e['game'] not in a.holdout_games]; test = [e for e in ex if e['game'] in a.holdout_games]
    print('examples', len(ex), 'train', len(train), 'test', len(test))
    if a.eval_only: a.steps = 0
    net = FaceNet().to(dev)
    if a.eval_only: net = load_net(a.out)
    elif a.init: net.load_state_dict(torch.load(a.init, map_location='cpu').get('state_dict', None) or torch.load(a.init, map_location='cpu')); net.to(dev)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=max(1, a.steps))
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
        if name == 'test':
            for gid in sorted({e['game'] for e in part}):
                es = [e for e in part if e['game'] == gid and len(e['sets']) == 1]
                hit = sum(max(pp := pair_prob(read_track(net, patches, e['tracks'][0][:15]), read_track(net, patches, e['tracks'][1][:15])), key=pp.get) == f"{max(e['faces'])}-{min(e['faces'])}" for e in es)
                print(f'  test game {gid}: {hit} / {len(es)}')
    if not a.eval_only: torch.save({'state_dict': net.cpu().state_dict(), 'crop': CROP}, a.out)
