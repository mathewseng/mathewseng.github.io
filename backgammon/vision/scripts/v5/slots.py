"""Slot patches along each point and their labels from a known position."""
import numpy as np
import cv2
import geometry as g

SLOT0, PITCH, NSLOT, PATCH = 34, 45, 6, 48
EMPTY, WHITE, DARK = 0, 1, 2
START = {6: 5, 8: 3, 13: 5, 24: 2, 1: -2, 12: -5, 17: -3, 19: -5}


def slot_labels(points):
    """points: dict point->signed count (+White, -Black). Returns [24, NSLOT] labels."""
    out = np.zeros((24, NSLOT), np.int64)
    for p, n in points.items():
        if not n: continue
        colour = WHITE if n > 0 else DARK
        out[p - 1, :min(abs(n), NSLOT)] = colour
    return out


def patches(img, dy=0, dx=0):
    """Return [24, NSLOT, PATCH, PATCH, 3] patches from a rectified BGR frame."""
    res = np.zeros((24, NSLOT, PATCH, PATCH, 3), np.uint8)
    pad = cv2.copyMakeBorder(img, 40, 40, 40, 40, cv2.BORDER_REFLECT)
    for p in range(1, 25):
        x = g.point_x(p) + dx
        for k in range(NSLOT):
            off = SLOT0 + PITCH * k + dy
            y = g.TOP[0] + off if g.is_top(p) else g.BOTTOM[1] - off
            x1, y1 = int(round(x - PATCH / 2)) + 40, int(round(y - PATCH / 2)) + 40
            crop = pad[y1:y1 + PATCH, x1:x1 + PATCH]
            res[p - 1, k] = crop if g.is_top(p) else crop[::-1, ::-1]
    return res
