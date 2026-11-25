"""gtsheet.py FRAME [SC]: truth frame overlay: auto amodal labels numbered (green boxed / yellow unboxed / magenta raw),
ignore boxes red, and each truth object's label (white text at its centre) for building the geometry truth."""
import sys, os, json, glob, cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__)); from amodal import quad
from sessions import frame_at
EV = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eval')
ROOT = os.environ.get('OFC_DET_ROOT', os.getcwd())  # scratch: canvas/, labels/, det/, scan/
def truth(name):
    p = glob.glob(f'{EV}/*/objects/{name}.json')[0]; obj = json.load(open(p))
    lab = {}
    for line in open(p.replace('/objects/', '/labels/').replace('.json', '.txt')):
        line = line.split('#')[0].strip()
        if line and line[0].isdigit(): i, l = line.split()[:2]; lab[int(i)] = l
    return obj, lab
def frame_labels(sess, t):
    best = None
    for l in open(f'{ROOT}/labels/{sess}.jsonl'):
        f = json.loads(l)
        if best is None or abs(f['t'] - t) < abs(best['t'] - t): best = f
    return best
if __name__ == '__main__':
    name = sys.argv[1]; sc = float(sys.argv[2]) if len(sys.argv) > 2 else 2.0
    obj, lab = truth(name); sess, t = obj['session'], obj['t']
    f = frame_labels(sess, t); img = frame_at(sess, t)
    x0, y0, x1, y1 = obj['crop']; x0, y0, x1, y1 = max(x0 - 20, 0), max(y0 - 20, 0), min(x1 + 20, 1920), min(y1 + 20, 1080)
    ov = cv2.resize(img[y0:y1, x0:x1], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
    for g in f['ignore']:
        cv2.polylines(ov, [((quad(*g) - [x0, y0]) * sc).astype(np.int32)], True, (40, 40, 230), 1)
    for i, l in enumerate(f['labels']):
        c = (255, 0, 255) if l['src'] == 'raw' else ((60, 230, 60) if l['boxed'] else (0, 220, 255))
        cv2.polylines(ov, [((quad(l['x'], l['y'], l['w'], l['h'], l['deg']) - [x0, y0]) * sc).astype(np.int32)], True, c, 1)
        p = (int((l['x'] - x0) * sc) - 8, int((l['y'] - y0) * sc) - 6)
        cv2.putText(ov, str(i), p, cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3); cv2.putText(ov, str(i), p, cv2.FONT_HERSHEY_SIMPLEX, 0.5, c, 1)
    for o in obj['objects']:
        L = lab.get(o['id'], '-')
        p = (int((o['x'] - x0) * sc) - 10, int((o['y'] - y0) * sc) + 14)
        cv2.putText(ov, f"{o['id']}:{L}", p, cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 0, 0), 3); cv2.putText(ov, f"{o['id']}:{L}", p, cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1)
    for gx in range((x0 // 50 + 1) * 50, x1, 50): cv2.putText(ov, str(gx), (int((gx - x0) * sc), 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    for gy in range((y0 // 50 + 1) * 50, y1, 50): cv2.putText(ov, str(gy), (2, int((gy - y0) * sc)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    cv2.imwrite(f'{ROOT}/sheets/gt-{name}.jpg', ov, [cv2.IMWRITE_JPEG_QUALITY, 90])
