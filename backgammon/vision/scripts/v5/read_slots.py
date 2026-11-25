"""Read slot classes for rectified frames with a trained SlotNet."""
import numpy as np, torch
import slots
from train_slots import SlotNet, to_tensor


# A single checker is often left short of the rail (a checker entered from the bar in a corner of the
# Nov 24 15:31 view sits about 20 px out): the rail slot then reads empty. When it does, the rail slot is
# read again further out (RAIL_OFFSETS px) and a checker read there with RAIL_THRESH or more is taken.
RAIL_OFFSETS, RAIL_THRESH = (12, 18), .8


class Reader:
    def __init__(self, weights, device='cpu'):
        self.net = SlotNet(); self.net.load_state_dict(torch.load(weights, map_location='cpu')); self.net.eval().to(device)
        self.device = device

    @torch.no_grad()
    def probs_batch(self, imgs, offsets=(-6, 0, 6)):
        n = len(imgs); best = None; conf = None
        for dy in offsets:
            P = np.stack([slots.patches(im, dy) for im in imgs]).reshape(-1, slots.PATCH, slots.PATCH, 3)
            pr = torch.softmax(self.net(to_tensor(P).to(self.device)), 1).cpu().numpy().reshape(n, 24, slots.NSLOT, -1)
            c = pr.max(-1)
            if best is None: best, conf = pr, c
            else:
                m = c > conf; best[m] = pr[m]; conf[m] = c[m]
        for dy in RAIL_OFFSETS:  # a checker short of the rail (see RAIL_OFFSETS)
            P = np.stack([slots.patches(im, dy)[:, 0] for im in imgs]).reshape(-1, slots.PATCH, slots.PATCH, 3)
            pr = torch.softmax(self.net(to_tensor(P).to(self.device)), 1).cpu().numpy().reshape(n, 24, -1)
            b0 = best[:, :, 0]; hit = (b0.argmax(-1) == slots.EMPTY) & (pr[..., 1:3].max(-1) >= RAIL_THRESH)
            b0[hit] = pr[hit]; best[:, :, 0] = b0
        return best

    @torch.no_grad()
    def probs(self, img, offsets=(-6, 0, 6)):
        """Return [24, NSLOT, C] probabilities, taking the most confident vertical offset per slot."""
        return self.probs_batch([img], offsets)[0]


def counts(pr):
    """Signed count and confidence per point from slot probabilities [24, NSLOT, C].

    Checkers stack from the rail without gaps, so a point's count is the run of filled slots from
    the rail: a slot past the first empty one (a checker on the bar overlapping the strip's tip, the
    cube, a checker in a hand) does not count, and an occluded slot (class 3) only makes the point
    unknown when it lies within that run or right after it. Confidence is the least confident slot
    up to and including the first empty slot (0 when unknown)."""
    cls = pr.argmax(-1); top = pr.max(-1)
    pos, conf = [0] * 24, [0.0] * 24
    for p in range(24):
        n, colour, c, ok = 0, 0, 1.0, True
        for k in range(pr.shape[1]):
            c = min(c, float(top[p, k]))
            if cls[p, k] == slots.EMPTY: break
            if cls[p, k] == 3 or (colour and cls[p, k] != colour): ok = False; break
            colour = int(cls[p, k]); n += 1
        pos[p] = n if colour == slots.WHITE else -n
        conf[p] = round(c, 3) if ok else 0.0
    return pos, conf


def position(pr):
    """Signed counts per point from slot probabilities (count occupied slots of the majority colour)."""
    cls = pr.argmax(-1)
    out = {}
    for p in range(24):
        w, d = int((cls[p] == slots.WHITE).sum()), int((cls[p] == slots.DARK).sum())
        if w or d: out[p + 1] = w if w >= d else -d
    return out
