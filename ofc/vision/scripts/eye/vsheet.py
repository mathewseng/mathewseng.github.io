"""vsheet.py SIM PREFIX: best-view tiles (4x) with the runtime's reported name at the hand-end frame printed under each."""
import sys, json, cv2, numpy as np
sys.path.insert(0, '/private/tmp/claude-501/ofc-vision/work')
from render_truth import frame_at
from zoom import warp
sim = json.load(open(sys.argv[1])); pre = sys.argv[2]; d = json.load(open(pre + '-objects.json')); t = d['t']
fr = next(f for f in sim if abs(f['t'] - t) < 1e-3)
byslot = {b['slot']: b for b in fr['bodies']}; tab = {s['slotId']: s for s in fr['table']}
tiles = []
for o in d['objects']:
    if o['slot'] is None: rt = 'weak'
    elif o['slot'] in byslot: rt = str(byslot[o['slot']]['hand'])
    else: rt = 'hid ' + str(tab[o['slot']]['card'])
    bt = o.get('best') or t
    a = cv2.resize(warp(frame_at(d['session'], bt), o['x'], o['y'], o['w'], o['h'], o['deg'], 4, 1.25), (220, 330))
    lab = np.zeros((30, 220, 3), np.uint8)
    cv2.putText(lab, f"#{o['id']} {rt}", (3, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255) if rt not in ('None', 'weak', 'hid None') else (120, 120, 255), 2)
    tiles.append(np.pad(np.vstack([lab, a]), ((3, 3), (3, 3), (0, 0))))
blank = np.zeros_like(tiles[0])
for k in range(0, len(tiles), 21):
    ch = tiles[k:k + 21]; ch += [blank] * ((-len(ch)) % 7)
    cv2.imwrite(f'{pre}-v{k // 21}.jpg', np.vstack([np.hstack(ch[i:i + 7]) for i in range(0, len(ch), 7)]), [cv2.IMWRITE_JPEG_QUALITY, 90])
