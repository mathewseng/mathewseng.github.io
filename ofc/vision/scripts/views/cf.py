import cv2, numpy as np
def hand_cover(crop, m=0.1):
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    skin = (cv2.inRange(hsv, (0, 40, 70), (25, 200, 255)) | cv2.inRange(hsv, (165, 40, 70), (180, 200, 255))) > 0
    n, lab = cv2.connectedComponents(skin.astype(np.uint8))
    if n <= 1: return 0.0
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    hand = np.isin(lab, edge[edge > 0]); H, W = hand.shape
    y, x = round(H * m / (1 + m) / 2), round(W * m / (1 + m) / 2)
    return float(hand[y:H - y, x:W - x].mean())
def sharp(crop):
    g = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY); return float(cv2.Laplacian(g, cv2.CV_64F).var())
