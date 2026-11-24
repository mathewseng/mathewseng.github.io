"""Overlay images for the page: held-out frames read by ofc_card_vision, cropped to the felt (no faces)."""
import json, sys, cv2
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ofc_card_vision import OfcCardReader, draw
FRAMES = sys.argv[1]  # dir with <session>-<seconds>.jpg full frames
PICK = [('s1836-00962.58', '18:52:12'), ('s1836-00360.98', '18:42:10'), ('s1836-01082.90', '18:54:12'),
        ('s0023-00300.80', '00:28:08'), ('s0023-00541.44', '00:32:09'), ('s1836-01684.94', '19:04:14')]
X0, Y0, X1, Y1 = 470, 200, 1290, 900
r = OfcCardReader(); meta = []
for name, clock in PICK:
    f = cv2.imread(f'{FRAMES}/{name}.jpg'); b = r.read(f)
    cv2.imwrite(f'samples/{name}.jpg', draw(f, b)[Y0:Y1, X0:X1], [cv2.IMWRITE_JPEG_QUALITY, 80])
    meta.append(dict(file=f'samples/{name}.jpg', session=name[:5], clockEST=clock, bodies=len(b),
                     read=sorted(x['card'] for x in b if x['card'])))
json.dump(meta, open('samples/samples.json', 'w'), indent=1); print(json.dumps(meta))
