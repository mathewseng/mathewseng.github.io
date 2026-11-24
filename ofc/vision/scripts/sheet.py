import cv2, numpy as np
def sheet(ims, labels, path, cols=10, scale=2):
    tiles = []
    for im, lab in zip(ims, labels):
        t = cv2.resize(im, (im.shape[1]*scale, im.shape[0]*scale), interpolation=cv2.INTER_CUBIC)
        t = cv2.copyMakeBorder(t, 0, 22, 0, 0, cv2.BORDER_CONSTANT, value=(255,255,255))
        cv2.putText(t, lab, (2, t.shape[0]-6), cv2.FONT_HERSHEY_SIMPLEX, .45, (0,0,0), 1)
        tiles.append(cv2.copyMakeBorder(t, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=(80,80,80)))
    if not tiles: return
    while len(tiles) % cols: tiles.append(np.full_like(tiles[0], 255))
    cv2.imwrite(path, np.vstack([np.hstack(tiles[i:i+cols]) for i in range(0, len(tiles), cols)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
