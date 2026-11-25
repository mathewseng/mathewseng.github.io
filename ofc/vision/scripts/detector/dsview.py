"""dsview.py DS OUT N [pattern]: random training images with their labels (canvas res, 1.0x) tiled 2 columns."""
import sys, glob, random, cv2, numpy as np
ds, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3]); pat = sys.argv[4] if len(sys.argv) > 4 else '*'
fs = sorted(glob.glob(f'{ds}/images/train/{pat}.jpg')); random.seed(int(sys.argv[5]) if len(sys.argv) > 5 else 1); fs = random.sample(fs, min(n, len(fs)))
ims = []
for f in fs:
    im = cv2.imread(f)
    for l in open(f.replace('/images/', '/labels/').replace('.jpg', '.txt')):
        v = l.split()
        if len(v) < 9: continue
        q = (np.array(v[1:], float).reshape(4, 2) * [1024, 480]).astype(np.int32); cv2.polylines(im, [q], True, (60, 255, 60), 1)
    cv2.putText(im, f.split('/')[-1], (5, 20), 0, 0.6, (0, 255, 255), 2); ims.append(im[40:440, 150:950])
if len(ims) % 2: ims.append(np.zeros_like(ims[0]))
cv2.imwrite(out, np.vstack([np.hstack(ims[i:i + 2]) for i in range(0, len(ims), 2)]), [cv2.IMWRITE_JPEG_QUALITY, 85])
