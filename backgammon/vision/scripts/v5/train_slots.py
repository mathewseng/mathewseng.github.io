#!/usr/bin/env python3
"""Train the slot classifier (empty / white / dark checker) from labelled frames.

Labels: a JSON list of {"frame": n, "points": {"6": 5, ...}} entries where
counts are signed (+White, -Black). Jittered patches are cut on the fly.
"""
import argparse, json, random
from pathlib import Path
import numpy as np, torch, torch.nn as nn, cv2
import frames, slots
from session import WORK

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'


class SlotNet(nn.Module):
    def __init__(self, classes=4):
        super().__init__()
        def block(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(), nn.MaxPool2d(2))
        self.f = nn.Sequential(block(3, 24), block(24, 48), block(48, 96), block(96, 128))
        self.h = nn.Sequential(nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.2), nn.Linear(128, classes))
    def forward(self, x): return self.h(self.f(x))


def to_tensor(batch):
    x = torch.from_numpy(np.ascontiguousarray(batch[..., ::-1])).float().permute(0, 3, 1, 2).contiguous() / 255.
    return (x - 0.5) / 0.25


def held_block(frame):
    """Held-out frames for slots_eval.py: one 3-minute block in five, so no held-out frame shares a
    position interval with a training frame."""
    return (int(frame) // 4500) % 5 == 2


EXCLUDE_HELDOUT = False  # --exclude-heldout: leave out the object test's held-out games (heldout.py)


def load_packed(path, role='all'):
    """A later session's labels packed with their frames (slots_add.py), already in the Nov 21 view."""
    import re, heldout
    z = np.load(path, allow_pickle=True)
    out = []; name = re.search(r'extra-slots-(\w+)\.npz', str(path)); name = name.group(1) if name else None
    for e, jpeg in zip(json.loads(str(z['labels'])), z['jpegs']):
        if role != 'all' and held_block(e['frame']) != (role == 'held'): continue
        if EXCLUDE_HELDOUT and name and heldout.held(name, int(e['frame'])): continue
        img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        out.append((img, {int(k): v for k, v in e['points'].items()}, e.get('ignore', []), e.get('occluded'), e.get('ignore_slots')))
    return out


def load(label_files, packed_role='train', json_role='all'):
    """Label files are JSON lists for the current session's frames, or .npz sets from slots_add.py.
    Packed sets are split by held_block for slots_eval.py (role 'train' or 'held'); JSON lists
    are used whole unless json_role is 'train' or 'held' as well."""
    entries = []; packed = []
    for f in label_files:
        if str(f).endswith('.npz'):
            packed += load_packed(f, packed_role)
            continue
        import heldout; session = heldout.session_of_work(WORK)
        for e in json.loads(Path(f).read_text()):
            if json_role != 'all' and held_block(e['frame']) != (json_role == 'held'): continue
            if EXCLUDE_HELDOUT and session and heldout.held(session, int(e['frame'])): continue
            entries.append((int(e['frame']), {int(k): v for k, v in e['points'].items()}, e.get('ignore', []),
                            e.get('occluded'), e.get('ignore_slots')))
    imgs = dict(frames.read([e[0] for e in entries])) if entries else {}
    return [(imgs[n], pts, ign, occ, isl) for n, pts, ign, occ, isl in entries] + packed


HANDS = []
def load_hands(directory):
    for p in sorted(Path(directory).glob('hand-*.png')):
        im = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
        if im is not None and im.shape[0] > 40 and im.shape[1] > 40: HANDS.append(im)


def paste_hand(patch):
    """Overlay a random region of a real hand cut-out; return patch and covered fraction."""
    h = random.choice(HANDS)
    y = random.randint(0, h.shape[0] - 48) if h.shape[0] > 48 else 0
    x = random.randint(0, h.shape[1] - 48) if h.shape[1] > 48 else 0
    crop = h[y:y + 48, x:x + 48]
    if crop.shape[:2] != (48, 48): return patch, 0.0
    if random.random() < .5: crop = crop[:, ::-1]
    dy, dx = random.randint(-30, 30), random.randint(-30, 30)
    crop = np.roll(np.roll(crop, dy, 0), dx, 1)
    alpha = (crop[..., 3:4] / 255.).astype(np.float32)
    if dy > 0: alpha[:dy] = 0
    elif dy < 0: alpha[dy:] = 0
    if dx > 0: alpha[:, :dx] = 0
    elif dx < 0: alpha[:, dx:] = 0
    out = patch * (1 - alpha) + crop[..., :3].astype(np.float32) * alpha
    return out, float(alpha.mean())


def sample(data, n):
    X, Y = [], []
    for _ in range(n):
        img, pts, ign, occ, isl = random.choice(data)
        dy, dx = random.randint(-9, 9), random.randint(-5, 5)
        P = slots.patches(img, dy, dx); L = slots.slot_labels(pts)
        if occ is not None: L = np.where(np.array(occ) == 1, 3, L)
        for _ in range(24):
            p, k = random.randrange(24), random.randrange(slots.NSLOT)
            if p + 1 in ign: continue
            if isl is not None and isl[p][k]: continue
            patch = P[p, k].astype(np.float32); label = L[p, k]
            if HANDS and label != 3 and random.random() < .2:
                patch, cov = paste_hand(patch)
                if cov > .3: label = 3
                elif cov > .05: continue
            patch = patch * random.uniform(.8, 1.15) + random.uniform(-18, 18)
            if random.random() < .3: patch = cv2.GaussianBlur(patch, (3, 3), random.uniform(.3, 1.2))
            X.append(np.clip(patch, 0, 255).astype(np.uint8)); Y.append(label)
    return to_tensor(np.stack(X)), torch.tensor(Y)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('labels', nargs='+')
    ap.add_argument('--steps', type=int, default=1500); ap.add_argument('--init')
    ap.add_argument('--hold-json', action='store_true', help='leave out the held-out blocks of the JSON label lists too')
    ap.add_argument('--exclude-heldout', action='store_true', help="leave out the object test's held-out games (heldout.py)")
    ap.add_argument('--packed-role', default='train', help='train (slots_eval.py split) or all')
    a = ap.parse_args()
    EXCLUDE_HELDOUT = a.exclude_heldout
    data = load(a.labels, packed_role=a.packed_role, json_role='train' if a.hold_json else 'all'); print('frames', len(data))
    load_hands(Path(a.labels[0]).parent / 'hands'); print('hand cut-outs', len(HANDS))
    net = SlotNet()
    if a.init: net.load_state_dict(torch.load(a.init, map_location='cpu'))
    net.to(dev); opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=a.steps)
    for step in range(a.steps):
        X, Y = sample(data, 8)
        net.train(); loss = nn.functional.cross_entropy(net(X.to(dev)), Y.to(dev), label_smoothing=0.02)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 250 == 0: print(step, round(loss.item(), 4), flush=True)
    net.eval().cpu(); torch.save(net.state_dict(), a.out); print('saved', a.out)
