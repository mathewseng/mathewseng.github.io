"""Dice and cube detector for the rectified orange board (800x590).

A small fully convolutional network predicts centre heatmaps at stride 4 for
three classes: yellow die (White's), red die (Black's) and the doubling cube.
Training frames are sampled from every recording of the evening; labels are
kept in objects/labels.json under OBJ_DIR as {"session:frame": {"dice":
[[x, y, red], ...], "cube": [x, y] | null, "reviewed": bool}}.
"""
import json, os, random
from pathlib import Path
import cv2, numpy as np, torch, torch.nn as nn, torch.nn.functional as F

dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
OBJ_DIR = Path(os.environ.get('BG_OBJECT_DIR', Path.home() / 'Downloads/office-3-backgammon-20261121/objects'))
SESSIONS = {
    's1': Path.home() / 'Downloads/office-3-backgammon-20261121',
    's2': Path.home() / 'Downloads/office-3-backgammon-20261121-2133',
    's3': Path.home() / 'Downloads/office-3-backgammon-20261121-2219',
}
W, H, PH = 800, 590, 592  # input is padded to 592 rows (a multiple of 8)
STRIDE = 4
CLASSES = ('yellow', 'red', 'cube')
SIGMA = (2.0, 2.0, 3.5)  # heatmap sigma in output cells
DIE_SIZE, CUBE_SIZE = 18, 46  # typical box sides in rectified pixels


def conv(i, o, s=1, d=1):
    return nn.Sequential(nn.Conv2d(i, o, 3, s, padding=d, dilation=d, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True))


class ObjNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.s2 = nn.Sequential(conv(3, 24, 2), conv(24, 24))
        self.s4 = nn.Sequential(conv(24, 48, 2), conv(48, 48))
        self.s8 = nn.Sequential(conv(48, 96, 2), conv(96, 96), conv(96, 96, d=2), conv(96, 96, d=4))
        self.fuse = nn.Sequential(conv(48 + 96, 64), conv(64, 64))
        self.head = nn.Conv2d(64, len(CLASSES), 1)
        nn.init.constant_(self.head.bias, -4.0)

    def forward(self, x):
        a = self.s4(self.s2(x)); b = self.s8(a)
        b = F.interpolate(b, size=a.shape[-2:], mode='bilinear', align_corners=False)
        return self.head(self.fuse(torch.cat([a, b], 1)))


def to_tensor(img):
    """BGR uint8 HxW -> normalised 3xPHxW tensor (RGB)."""
    if img.shape[0] == H: img = cv2.copyMakeBorder(img, 0, PH - img.shape[0], 0, 0, cv2.BORDER_REPLICATE)
    t = torch.from_numpy(np.ascontiguousarray(img[..., ::-1])).permute(2, 0, 1).float()
    return (t / 255. - .5) / .25


def target(labels, flip=False):
    """Gaussian centre heatmaps (3 x PH/4 x W/4) for one frame's labels."""
    hh, ww = PH // STRIDE, W // STRIDE
    out = np.zeros((len(CLASSES), hh, ww), np.float32)
    ys, xs = np.mgrid[0:hh, 0:ww].astype(np.float32)
    pts = [(x, y, int(red)) for x, y, red in labels.get('dice', [])]
    if labels.get('cube'): pts.append((labels['cube'][0], labels['cube'][1], 2))
    for x, y, c in pts:
        # centre on the label's own cell so that cell is exactly 1 (the focal loss positive)
        cx, cy = min(ww - 1, max(0, int(x // STRIDE))), min(hh - 1, max(0, int(y // STRIDE)))
        out[c] = np.maximum(out[c], np.exp(-((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * SIGMA[c] ** 2)))
    return out


def focal(logits, gt, alpha=2, beta=4):
    p = torch.sigmoid(logits).clamp(1e-4, 1 - 1e-4)
    pos = gt.ge(.99).float()
    pl = -torch.log(p) * (1 - p) ** alpha * pos
    nl = -torch.log(1 - p) * p ** alpha * (1 - gt) ** beta * (1 - pos)
    return (pl.sum() + nl.sum()) / pos.sum().clamp(min=1)


@torch.no_grad()
def peaks(logits, thresh=.3):
    """Local maxima per class -> list of (class, x, y, score) in rectified pixels."""
    p = torch.sigmoid(logits)
    m = F.max_pool2d(p, 5, 1, 2)
    keep = (p == m) & (p > thresh)
    out = []
    for b in range(p.shape[0]):
        rows = []
        for c, y, x in keep[b].nonzero().tolist():
            # sub-cell refinement by the 3x3 weighted centroid
            y0, y1, x0, x1 = max(0, y - 1), y + 2, max(0, x - 1), x + 2
            w = p[b, c, y0:y1, x0:x1]
            gy, gx = torch.meshgrid(torch.arange(y0, y0 + w.shape[0], device=w.device), torch.arange(x0, x0 + w.shape[1], device=w.device), indexing='ij')
            s = w.sum()
            cx = float((w * gx).sum() / s) * STRIDE + 2; cy = float((w * gy).sum() / s) * STRIDE + 2
            rows.append((c, cx, cy, float(p[b, c, y, x])))
        out.append(rows)
    return out


@torch.no_grad()
def die_peaks(logits, thresh=.35):
    """Dice found on one combined die score, 1 - (1 - yellow)(1 - red), instead of per colour: a
    pale die (mostly its white pip face showing) splits its evidence between the colours and can
    score under the threshold in both. Each peak takes the colour of the stronger channel around it.
    Returns per image rows (class, x, y, score) like peaks(); cube peaks are left to peaks()."""
    p = torch.sigmoid(logits[:, :2])
    comb = 1 - (1 - p[:, 0]) * (1 - p[:, 1])
    out = []
    for b, rows in enumerate(peaks(torch.logit(comb[:, None].clamp(1e-6, 1 - 1e-6)), thresh)):
        res = []
        for _, x, y, s in rows:
            cy, cx = int((y - 2) / STRIDE + .5), int((x - 2) / STRIDE + .5)
            y0, x0 = max(0, cy - 1), max(0, cx - 1)
            win = p[b, :, y0:cy + 2, x0:cx + 2].flatten(1).max(1).values
            res.append((int(win[1] > win[0]), x, y, s))
        out.append(res)
    return out


def merge_dice(rows, thresh=.35):
    """Die peaks (class < 2) kept as dice. One die can give several peaks (its coloured side and
    pip face, 10-20 px apart, sometimes of the other colour): peaks of a colour closer than 24 px
    are one die unless both are strong and at least 13 px apart (two touching dice); a peak within
    10 px of a stronger peak of the other colour, or within 22 px of one scoring 0.5 or more and
    at least 1.5 times as much, is the same die. rows: (class, x, y, score); returns the kept rows."""
    import math
    out = []
    for d in sorted([r for r in rows if r[0] < 2 and r[3] >= thresh], key=lambda r: -r[3]):
        near = [o for o in out if o[0] == d[0] and math.hypot(o[1] - d[1], o[2] - d[2]) < 24]
        if near and not (d[3] >= .75 and min(o[3] for o in near) >= .75 and min(math.hypot(o[1] - d[1], o[2] - d[2]) for o in near) >= 13):
            continue
        if any(o[0] != d[0] and (math.hypot(o[1] - d[1], o[2] - d[2]) < 10 or
                                 (o[3] >= .5 and o[3] >= 1.5 * d[3] and math.hypot(o[1] - d[1], o[2] - d[2]) < 22)) for o in out):
            continue
        out.append(d)
    return out


class Ensemble(torch.nn.Module):
    """Several detectors as one: the mean of their probabilities, returned as logits."""
    def __init__(self, nets):
        super().__init__(); self.nets = torch.nn.ModuleList(nets)
    def forward(self, x):
        p = sum(torch.sigmoid(n(x)) for n in self.nets) / len(self.nets)
        return torch.logit(p.clamp(1e-6, 1 - 1e-6))


def load(path):
    """A detector, or the mean of several given as 'a.pt,b.pt' (obj-v8 with obj-v10, the shipped pair)."""
    if ',' in str(path): return Ensemble([load(p) for p in str(path).split(',')]).eval().to(dev)
    net = ObjNet(); net.load_state_dict(torch.load(path, map_location='cpu')); return net.eval().to(dev)


def on_board(x, y):
    """Inside the case's playing surface in the readers' view: dice outside it (on the table, red chips
    below the case on Nov 24 15:31) are not part of play."""
    return 12 <= x <= 788 and 6 <= y <= 578


def extra_sets():
    """Later sessions added to the training set (objects_add.py) and the reviewed hard dice
    (objects_hard_add.py): extra/frames-NAME.npz and extra/labels-NAME.json, stored in the Nov 21
    view. Their keys follow the Nov 21 frames. BG_OBJ_SKIP=name,... leaves sets out."""
    skip = set(filter(None, os.environ.get('BG_OBJ_SKIP', '').split(',')))
    return sorted(p for p in (OBJ_DIR / 'extra').glob('frames-*.npz') if p.stem[len('frames-'):] not in skip)


def load_frames():
    z = np.load(OBJ_DIR / 'frames.npz', allow_pickle=True)
    keys, jpegs = list(z['keys']), z['jpegs']
    for p in extra_sets():
        e = np.load(p, allow_pickle=True)
        keys += list(e['keys']); jpegs = np.concatenate([jpegs, e['jpegs']])
    return keys, jpegs


def load_labels():
    labels = json.loads((OBJ_DIR / 'labels.json').read_text())
    for p in extra_sets():
        labels.update(json.loads((p.parent / p.name.replace('frames-', 'labels-').replace('.npz', '.json')).read_text()))
    return labels


def held_out(keys):
    """Every tenth frame of the training set is held out (as in objects_train.py)."""
    return [k for i, k in enumerate(keys) if i % 10 == 0]


def decode(jpeg):
    return cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
