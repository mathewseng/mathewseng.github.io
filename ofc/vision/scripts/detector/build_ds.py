"""build_ds.py OUT: YOLO-OBB dataset (1024x480 canvases) from labels/*.jsonl + det/eye-labels.json.
Held out entirely: s1836, s0023 and every n1501/n1532 hand holding a truth frame (hands.py). Ignore regions are painted grey."""
import sys, os, json, glob, bisect, random, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from amodal import quad, to_canvas, patch, poly_iou
from hands import excluded, hands
ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())  # scratch: canvas/, labels/, det/, scan/
OUT = sys.argv[1]
TRAIN = {'s1524': 6, 's2310': 6, 's1931': 4, 's1953': 3, 'n1501': 3, 'n1532': 2}  # keyframe stride
VAL = {'n1501': [(980, 1092)]}
EYE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'labels', 'n1532-right-columns.json')))
for d in ('images/train', 'labels/train', 'images/val', 'labels/val'): os.makedirs(f'{OUT}/{d}', exist_ok=True)

def canvas_files(sess):
    files = sorted(glob.glob(f'{ROOT}/canvas/{sess}/*.jpg')); return files, [float(os.path.basename(p)[:-4]) for p in files]

def inside_rect(x, y, r): return r[0] <= x <= r[2] and r[1] <= y <= r[3]

def line(q):
    c = to_canvas(q); c[:, 0] = np.clip(c[:, 0], 0, 1023) / 1024; c[:, 1] = np.clip(c[:, 1], 0, 479) / 480
    return '0 ' + ' '.join(f'{v:.6f}' for v in c.reshape(-1))

random.seed(0)
stats = dict(train=0, val=0, labels=0, eye=0, eyeign=0)
for sess, stride in TRAIN.items():
    files, ft = canvas_files(sess)
    ex = excluded(sess) if sess in ('n1501', 'n1532') else []
    eyes = [e for e in EYE if e['sess'] == sess]
    refs = {}
    for e in eyes:
        i = min(range(len(ft)), key=lambda i: abs(ft[i] - e['t'])); ref = cv2.GaussianBlur(cv2.imread(files[i]), (3, 3), 0)
        refs[id(e)] = [patch(ref, quad(*c)) for c in e['cards']]
    k = 0
    for line_ in open(f'{ROOT}/labels/{sess}.jsonl'):
        f = json.loads(line_); t = f['t']
        if any(a <= t <= b for a, b in ex): continue
        split = 'val' if any(a <= t <= b for a, b in VAL.get(sess, [])) else 'train'
        eh = [e for e in eyes if e['hand'][0] <= t <= e['hand'][1]]
        k += 1
        if not eh and split == 'train' and k % stride: continue
        i = bisect.bisect_left(ft, t - 0.01)
        if i >= len(ft) or abs(ft[i] - t) > 0.01: continue
        img = cv2.imread(files[i]); blur = cv2.GaussianBlur(img, (3, 3), 0)
        VISMIN = float(os.environ.get('VISMIN', 0))
        labels = [quad(l['x'], l['y'], l['w'], l['h'], l['deg']) for l in f['labels'] if l['vis'] is None or l['vis'] >= VISMIN]
        ignore = [quad(*g) for g in f['ignore']] + [quad(l['x'], l['y'], l['w'], l['h'], l['deg']) for l in f['labels'] if l['vis'] is not None and l['vis'] < VISMIN]
        for e in eh:
            r = e['region']
            labels = [q for q in labels if not inside_rect(*q.mean(0), r)]
            ignore = [q for q in ignore if not inside_rect(*q.mean(0), r)]
            for c, ref in zip(e['cards'], refs[id(e)]):
                q = quad(*c); m = float((np.abs(patch(blur, q) - ref).max(-1) <= 30).mean())
                if m >= 0.6: labels.append(q); stats['eye'] += 1
                elif m >= 0.25: ignore.append(q); stats['eyeign'] += 1
            ignore += [quad(*g) for g in e['ignore']]
        if ignore:
            mask = np.zeros(img.shape[:2], np.uint8)
            for q in ignore: cv2.fillConvexPoly(mask, to_canvas(q).round().astype(np.int32), 255)
            for q in labels: cv2.fillConvexPoly(mask, to_canvas(q).round().astype(np.int32), 0)
            img[mask > 0] = 114
        name = f'{sess}_{t:08.3f}'
        reps = 2 if eh else 1
        if not labels and split == 'train' and random.random() > 0.3: continue
        nm0 = f'{random.getrandbits(40):010x}_' if split == 'train' else ''
        for rep in range(reps if split == 'train' else 1):
            nm = nm0 + name + (f'_r{rep}' if rep else '')
            cv2.imwrite(f'{OUT}/images/{split}/{nm}.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 92])
            open(f'{OUT}/labels/{split}/{nm}.txt', 'w').write('\n'.join(line(q) for q in labels) + '\n')
            stats[split] += 1; stats['labels'] += len(labels)
    print(sess, stats, flush=True)
open(f'{OUT}/data.yaml', 'w').write(f'path: {OUT}\ntrain: images/train\nval: images/val\nnames:\n  0: card\n')
