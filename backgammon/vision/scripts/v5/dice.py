"""Dice candidates in rectified frames: coloured blobs of die size."""
import cv2, numpy as np

PLAY = (100, 6, 690, 584)  # x1, y1, x2, y2: playing surface incl. bar


def colour_masks(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    red = ((h <= 9) | (h >= 168)) & (s >= 80) & (v >= 70) & (v <= 240)
    yellow = (h >= 21) & (h <= 34) & (s >= 65) & (v >= 70) & (v <= 215)
    return {'red': red, 'yellow': yellow}


STATIC = None
def load_static(path):
    global STATIC
    d = np.load(path); STATIC = {k: d[k] for k in d.files}


def candidates(img):
    out = []
    for colour, m in colour_masks(img).items():
        if STATIC is not None: m = m & ~STATIC[colour]
        m = m.astype(np.uint8)
        x1, y1, x2, y2 = PLAY
        mask = np.zeros_like(m); mask[y1:y2, x1:x2] = m[y1:y2, x1:x2]
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(mask)
        for i in range(1, n):
            x, y, w, hh, area = st[i]
            if 12 <= area <= 500 and max(w, hh) <= 34:
                out.append({'colour': colour, 'x': float(cen[i][0]), 'y': float(cen[i][1]), 'area': int(area)})
    return out


def patch(img, x, y, size=32):
    pad = cv2.copyMakeBorder(img, size, size, size, size, cv2.BORDER_REFLECT)
    xi, yi = int(round(x)) + size - size // 2, int(round(y)) + size - size // 2
    return pad[yi:yi + size, xi:xi + size]
