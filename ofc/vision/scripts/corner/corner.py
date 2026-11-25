"""Corner patches of a 64x96 card crop: each of the 4 corners, rotated so that corner sits at top-left, 36x36."""
import os, sys
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')); sys.path.insert(0, REPO)
import cv2, numpy as np
from ofc_card_vision import corner_patches as corners, CORNER as S
def ink(p):
    """share of the rank-glyph spot (rows 3-27, cols 3-14) that is dark or red ink"""
    r = p[3:27, 3:14].astype(np.int16); g = r.mean(2); white = np.percentile(p.reshape(-1, 3).mean(1), 90)
    felt = (r[:, :, 0] - r[:, :, 2] > 35)
    return float(np.mean(((g < white - 45) & ~felt) | (r[:, :, 2] - r[:, :, 0] > 50)))
