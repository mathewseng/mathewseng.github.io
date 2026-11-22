#!/usr/bin/env python3
"""Render a rectified frame with White's point numbers for manual labelling."""
import sys, cv2, av
import geometry as g


def frame_at(video, n):
    with av.open(str(video)) as c:
        for i, f in enumerate(c.decode(video=0)):
            if i == n: return f.to_ndarray(format='bgr24')


def overlay(img):
    v = cv2.copyMakeBorder(img, 22, 22, 0, 0, cv2.BORDER_CONSTANT, value=(30, 30, 30))
    for p in range(1, 25):
        x1, y1, x2, y2 = g.strip_box(p)
        y = 16 if g.is_top(p) else v.shape[0] - 5
        cv2.putText(v, str(p), (int(g.point_x(p)) - 9, y), 0, .5, (0, 255, 255), 1)
        cv2.rectangle(v, (x1, y1 + 22), (x2, y2 + 22), (0, 200, 0) if p % 2 else (200, 0, 200), 1)
    return v

if __name__ == '__main__':
    img = frame_at(sys.argv[1], int(sys.argv[2]))
    cv2.imwrite(sys.argv[3], overlay(img))
