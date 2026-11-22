#!/usr/bin/env python3
"""Track the orange Office-3 board and rectify it to a fixed canonical image.

The reference is one clear frame with the four outer case corners marked.
Each sampled frame is matched to the reference with SIFT features inside the
case, then a RANSAC homography maps the canonical board into the frame.
"""
from __future__ import annotations
import json
from pathlib import Path
import cv2
import numpy as np

W, H = 800, 590
CANON = np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], np.float32)


class Tracker:
    def __init__(self, ref_image: np.ndarray, corners):
        self.corners = np.array(corners, np.float32)
        self.sift = cv2.SIFT_create(nfeatures=4000, contrastThreshold=0.02)
        gray = cv2.cvtColor(ref_image, cv2.COLOR_BGR2GRAY)
        mask = np.zeros(gray.shape, np.uint8)
        cv2.fillConvexPoly(mask, self.corners.astype(np.int32), 255)
        self.kp, self.des = self.sift.detectAndCompute(gray, mask)
        self.matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))
        self.canon_to_ref = cv2.getPerspectiveTransform(CANON, self.corners)
        self.last = None  # last canon->frame homography

    def find(self, frame: np.ndarray):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mask = np.zeros(gray.shape, np.uint8)
        poly = self.corners if self.last is None else cv2.perspectiveTransform(CANON[None], self.last)[0]
        centre = poly.mean(0)
        grown = (poly - centre) * 1.25 + centre
        cv2.fillConvexPoly(mask, grown.astype(np.int32), 255)
        kp, des = self.sift.detectAndCompute(gray, mask)
        if des is None or len(kp) < 20:
            return None, {'status': 'untracked', 'matches': 0}
        pairs = self.matcher.knnMatch(self.des, des, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 25:
            return None, {'status': 'untracked', 'matches': len(good)}
        src = np.float32([self.kp[m.queryIdx].pt for m in good])
        dst = np.float32([kp[m.trainIdx].pt for m in good])
        Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0, maxIters=4000, confidence=0.999)
        if Hm is None:
            return None, {'status': 'untracked', 'matches': len(good)}
        n_in = int(inl.sum())
        full = Hm @ self.canon_to_ref
        quad = cv2.perspectiveTransform(CANON[None], full)[0]
        side = np.linalg.norm(np.roll(quad, -1, 0) - quad, axis=1)
        ref_side = np.linalg.norm(np.roll(self.corners, -1, 0) - self.corners, axis=1)
        ratio = side / ref_side
        if n_in < 30 or ratio.min() < 0.9 or ratio.max() > 1.1:
            return None, {'status': 'untracked', 'matches': n_in}
        self.last = full
        return full, {'status': 'tracked', 'inliers': n_in, 'corners': quad.round(2).tolist()}


def rectify(frame, canon_to_frame):
    return cv2.warpPerspective(frame, np.linalg.inv(canon_to_frame), (W, H), flags=cv2.INTER_LINEAR)


def load_reference(path: Path):
    meta = json.loads(path.read_text())
    image = cv2.imread(str(path.parent / meta['image']))
    return Tracker(image, meta['corners'])
