#!/usr/bin/env python3
"""Train or score the die-face reader on verified face crops (face_labels.py).

Each step draws dice uniformly (a die that lay still for a minute counts once, not 60 times) and
one random crop of each; a die labelled with its face is trained with cross-entropy, a pair whose
order was not decided (face 0) with dice_faces.pair_loss. Sessions are named as in heldout.py.

  --train s1 s2 ...     sessions to learn from; --skip-held leaves out frames in the old test
                        set's held-out games (heldout.held), so the old test set stays unseen
  --test s6 ...         sessions to score; --test-held scores only their held-out frames
  --strong-aug          colour cast, saturation, gamma, blur and lost resolution (other views)
  --touch-aug 0.3       paste another die's centre 13-20 px away in that share of crops (touching dice)
  --squash-aug 0.3      foreshorten that share of crops along a random direction (a die face seen at a slant)

Scores: crops right, dice right (log-probs pooled over a die's first 20 crops, as roll_audit.py
reads a track), and a confusion matrix of crops (rows truth 1-6, columns read).

usage: face_train.py DATA OUT.pt --train s1 s2 s3 s4 s5 --skip-held --test s6 [--steps 4000] [--init M] [--crop lean]
       face_train.py DATA MODEL.pt --eval-only --test s6
"""
import argparse, random
from pathlib import Path
import numpy as np, torch, torch.nn as nn, cv2
import heldout as H, dice_faces as df


def load(data, sessions, held=None):
    """held: None keeps every frame, False drops the old test set's held-out frames, True keeps only
    held-out frames (all of s6, the new test set's session)."""
    parts = []
    for s in sessions:
        z = dict(np.load(Path(data) / f'faces-{s}.npz'))
        if held is False: z['held'] = np.array([H.held(s, f) if s != 's6' else False for f in z['frame']])
        keep = np.ones(len(z['face']), bool) if held is None else (z['held'] == held)
        z = {k: v[keep] for k, v in z.items()}; z['session'] = np.array([s] * len(z['face']))
        z['die'] = np.array([f'{s}:{d}' for d in z['die']]); z['roll'] = np.array([f'{s}:{d}' for d in z['roll']])
        parts.append(z)
    return {k: np.concatenate([p[k] for p in parts]) for k in parts[0]}


def photometric(p):
    """A softer, differently lit view of a crop (uint8 BGR in, float out)."""
    p = p.astype(np.float32)
    p = p * np.random.uniform(.8, 1.2, 3)[None, None]  # white balance
    g = p.mean(2, keepdims=True); p = g + (p - g) * random.uniform(.5, 1.3)  # saturation
    p = 255 * (np.clip(p, 0, 255) / 255) ** random.uniform(.75, 1.35)  # gamma
    if random.random() < .5: p = cv2.GaussianBlur(p, (0, 0), random.uniform(.3, 1.3))
    if random.random() < .3:
        k = random.uniform(.5, .8); p = cv2.resize(cv2.resize(p, None, fx=k, fy=k, interpolation=cv2.INTER_AREA), (40, 40), interpolation=cv2.INTER_LINEAR)
    return np.clip(p, 0, 255)


def touching(p, donors):
    """A second die beside the read one: the centre (18x18) of another die's crop pasted 13-20 px
    from the centre, as touching dice lie (Nov 21 G4 T24, G6 T19). The label stays the centre die's."""
    p = p.copy(); q = donors[random.randrange(len(donors))]
    a = random.uniform(0, 2 * np.pi); r = random.uniform(13, 20)
    cx, cy = int(round(20 + r * np.cos(a))), int(round(20 + r * np.sin(a)))
    x0, y0 = max(0, cx - 9), max(0, cy - 9); x1, y1 = min(40, cx + 9), min(40, cy + 9)
    p[y0:y1, x0:x1] = q[11 + y0 - (cy - 9):11 + y1 - (cy - 9), 11 + x0 - (cx - 9):11 + x1 - (cx - 9)]
    return p


def squash(p):
    """A die face seen at a slant: the crop shrunk along one random direction to 0.4-0.8 of its size about the
    centre, as a die cocked against the rail or lying on a slope shows its top face foreshortened (15:31 G2 T34:
    a red four at the rail whose two rows of pips merge into one line)."""
    a = random.uniform(0, np.pi); k = random.uniform(.4, .8); c, s = np.cos(a), np.sin(a)
    R = np.array([[c, -s], [s, c]]); A = R @ np.diag([k, 1.]) @ R.T
    M = np.hstack([A, (np.eye(2) - A) @ np.array([[19.5], [19.5]])])
    return cv2.warpAffine(np.ascontiguousarray(p), M, (40, 40), borderMode=cv2.BORDER_REFLECT)


TOUCH = 0.  # --touch-aug: share of training crops given a touching neighbour
SQUASH = 0.  # --squash-aug: share of training crops seen at a slant (squash)


def batch_x(patches, strong, donors=None):
    out = []
    for p in patches:
        if donors is not None and TOUCH and random.random() < TOUCH: p = touching(p, donors)
        if SQUASH and random.random() < SQUASH: p = squash(p)
        out.append(df.prep(photometric(p) if strong and random.random() < .7 else p, True))
    return torch.stack(out).to(df.dev)


@torch.no_grad()
def logprobs(net, patches, bs=512):
    out = []
    for i in range(0, len(patches), bs):
        x = torch.stack([df.prep(p, False) for p in patches[i:i + bs]]).to(df.dev)
        out.append(torch.log_softmax(net(x), 1).cpu().numpy())
    return np.concatenate(out) if out else np.zeros((0, 6))


def score(net, T, label=''):
    lab = T['face'] > 0
    lp = logprobs(net, T['patch'][lab]); read = lp.argmax(1) + 1; truth = T['face'][lab]
    conf = np.zeros((6, 6), int)
    for t, r in zip(truth, read): conf[t - 1, r - 1] += 1
    dice = {}
    for d, l, t in zip(T['die'][lab], lp, truth): dice.setdefault(d, [t, []])[1].append(l)
    dok = sum(int(np.mean(v[1][:20], 0).argmax() + 1 == v[0]) for v in dice.values())
    out = {'crops': int(lab.sum()), 'crops right': int((read == truth).sum()), 'dice': len(dice), 'dice right': dok, 'conf': conf}
    for name, m in (('yellow', T['red'][lab] == 0), ('red', T['red'][lab] == 1), ('eye-checked rolls', T['status'][lab] == 1)):
        out[name] = (int((read[m] == truth[m]).sum()), int(m.sum()))
    print(f"{label} crops {out['crops right']}/{out['crops']} ({100 * out['crops right'] / max(1, out['crops']):.1f}%), dice {dok}/{len(dice)}, "
          + ', '.join(f'{k} {out[k][0]}/{out[k][1]}' for k in ('yellow', 'red', 'eye-checked rolls')), flush=True)
    print('   truth\\read ' + ' '.join(f'{i:>5}' for i in range(1, 7)))
    for i in range(6): print(f'   {i + 1:>10} ' + ' '.join(f'{c:>5}' for c in conf[i]))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('data'); ap.add_argument('out')
    ap.add_argument('--train', nargs='*', default=[]); ap.add_argument('--skip-held', action='store_true')
    ap.add_argument('--test', nargs='*', default=[]); ap.add_argument('--test-held', action='store_true')
    ap.add_argument('--steps', type=int, default=4000); ap.add_argument('--init'); ap.add_argument('--lr', type=float, default=2e-3)
    ap.add_argument('--crop', default='lean', choices=('lean', 'full')); ap.add_argument('--strong-aug', action='store_true')
    ap.add_argument('--eval-only', action='store_true'); ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--touch-aug', type=float, default=0., help='share of crops given a touching neighbour die')
    ap.add_argument('--squash-aug', type=float, default=0., help='share of crops foreshortened along a random direction')
    a = ap.parse_args(); global TOUCH, SQUASH; TOUCH = a.touch_aug; SQUASH = a.squash_aug
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed)
    if a.eval_only:
        net = df.load_net(a.out)
    else:
        df.CROP = a.crop
        Tr = load(a.data, a.train, False if a.skip_held else None)
        single = np.nonzero(Tr['face'] > 0)[0]; pairs = np.nonzero(Tr['face'] == 0)[0]
        by_die = {}
        for i in single: by_die.setdefault(Tr['die'][i], []).append(i)
        by_roll = {}
        for i in pairs: by_roll.setdefault(Tr['roll'][i], {}).setdefault(Tr['die'][i], []).append(i)
        by_roll = {k: list(v.values()) for k, v in by_roll.items() if len(v) == 2}
        dice = list(by_die.values()); rolls = list(by_roll.values())
        print('train sessions', a.train, 'crops', len(single) + len(pairs), 'dice', len(dice), 'pair rolls', len(rolls), flush=True)
        net = df.FaceNet().to(df.dev)
        if a.init:
            o = torch.load(a.init, map_location='cpu'); net.load_state_dict(o.get('state_dict', o) if isinstance(o, dict) and 'state_dict' in o else o)
        opt = torch.optim.AdamW(net.parameters(), a.lr, weight_decay=1e-4)
        sched = torch.optim.lr_scheduler.OneCycleLR(opt, a.lr, total_steps=a.steps)
        ce = nn.CrossEntropyLoss()
        for step in range(a.steps):
            net.train()
            idx = [random.choice(d) for d in random.choices(dice, k=96)]
            loss = ce(net(batch_x(Tr['patch'][idx], a.strong_aug, Tr['patch'][single])), torch.as_tensor(Tr['face'][idx] - 1, device=df.dev))
            if rolls:
                rs = random.choices(rolls, k=12)
                x1 = batch_x(Tr['patch'][[random.choice(r[0]) for r in rs]], a.strong_aug)
                x2 = batch_x(Tr['patch'][[random.choice(r[1]) for r in rs]], a.strong_aug)
                hi = torch.as_tensor([Tr['pair'][r[0][0]][0] - 1 for r in rs], device=df.dev)
                lo = torch.as_tensor([Tr['pair'][r[0][0]][1] - 1 for r in rs], device=df.dev)
                loss = loss + .25 * df.pair_loss(net(x1), net(x2), hi, lo)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            if step % 500 == 0: print(step, round(loss.item(), 3), flush=True)
        net.eval()
        torch.save({'state_dict': net.cpu().state_dict(), 'crop': df.CROP}, a.out); net.to(df.dev)
    for s in a.test:
        T = load(a.data, [s], True if a.test_held else None)
        score(net, T, f'{s}{" held" if a.test_held else ""}')


if __name__ == '__main__':
    main()
