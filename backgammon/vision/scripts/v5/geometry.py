"""Canonical orange-board geometry (800x590 rectified image).

Points use White's numbering: White's home board is the top-right quadrant and
White bears off into the top-right tray. Black's home board is bottom-right.
"""
import numpy as np

LEFT = [140.0, 183.3, 226.6, 270.0, 313.3, 356.5]
RIGHT = [444.0, 488.6, 533.2, 577.8, 622.4, 667.0]
STRIP_W = 50
TOP = (10, 292)      # top strips span y from the rail to just past the centre line
BOTTOM = (298, 580)
BAR_X = (364, 408)
OFF_WHITE = (692, 18, 772, 292)   # x1, y1, x2, y2 of the top-right tray
OFF_DARK = (692, 298, 772, 574)


def point_x(p):
    if 1 <= p <= 6: return RIGHT[6 - p]
    if 7 <= p <= 12: return LEFT[12 - p]
    if 13 <= p <= 18: return LEFT[p - 13]
    if 19 <= p <= 24: return RIGHT[p - 19]
    raise ValueError(p)


def is_top(p):
    return p <= 12


def strip_box(p):
    x = point_x(p)
    y1, y2 = TOP if is_top(p) else BOTTOM
    return int(round(x - STRIP_W / 2)), y1, int(round(x + STRIP_W / 2)), y2


def strip(img, p):
    """Crop a point strip, oriented so the point's base (rail) is at the top."""
    x1, y1, x2, y2 = strip_box(p)
    crop = img[y1:y2, x1:x2]
    return crop if is_top(p) else crop[::-1, ::-1]
