"""Read slot classes for rectified frames with a trained SlotNet."""
import numpy as np, torch
import slots
from train_slots import SlotNet, to_tensor


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
        return best

    @torch.no_grad()
    def probs(self, img, offsets=(-6, 0, 6)):
        """Return [24, NSLOT, 3] probabilities, taking the most confident vertical offset per slot."""
        best = None; conf = None
        for dy in offsets:
            P = slots.patches(img, dy).reshape(-1, slots.PATCH, slots.PATCH, 3)
            pr = torch.softmax(self.net(to_tensor(P).to(self.device)), 1).cpu().numpy().reshape(24, slots.NSLOT, -1)
            c = pr.max(-1)
            if best is None: best, conf = pr, c
            else:
                m = c > conf; best[m] = pr[m]; conf[m] = c[m]
        return best


def position(pr):
    """Signed counts per point from slot probabilities (count occupied slots of the majority colour)."""
    cls = pr.argmax(-1)
    out = {}
    for p in range(24):
        w, d = int((cls[p] == slots.WHITE).sum()), int((cls[p] == slots.DARK).sum())
        if w or d: out[p + 1] = w if w >= d else -d
    return out
