import numpy as np, cv2
CROP = (130, 190, 1781, 835); W, H = 1024, 480
S = min(W / CROP[2], H / CROP[3]); SW, SH = round(CROP[2] * S), round(CROP[3] * S); OX, OY = (W - SW) // 2, (H - SH) // 2
def canvas(frame):
    x0, y0, w, h = CROP
    c = np.full((H, W, 3), 114, np.uint8)
    c[OY:OY + SH, OX:OX + SW] = cv2.resize(frame[y0:y0 + h, x0:x0 + w], (SW, SH), interpolation=cv2.INTER_AREA)
    return c
def to_canvas_xy(x, y): return (x - CROP[0]) * S + OX, (y - CROP[1]) * S + OY
def to_frame_xy(x, y): return (x - OX) / S + CROP[0], (y - OY) / S + CROP[1]
