"""courtref.py OUT: reference crops of hand-checked court cards (labels/*.json, training sessions): per code up to 6 crops from distinct tracks."""
import json, glob, math, cv2, numpy as np, collections, os, sys
L = '/private/tmp/claude-501/ofc-wt9/ofc/vision/labels'; S = '/private/tmp/claude-501/ofc-vision/scan'
want = [s + r for s in 'SHCD' for r in 'JQK']; got = collections.defaultdict(list)
for f in sorted(glob.glob(L + '/s*.json')):
    d = json.load(open(f)); sess = d['session']
    if not os.path.exists(f'{S}/{sess}/state.jsonl'): continue
    tr = [t for t in d['tracks'] if t['label'] in want]
    if not tr: continue
    rows = [json.loads(l) for l in open(f'{S}/{sess}/state.jsonl')]
    for t in tr:
        if len(got[t['label']]) >= 8: continue
        mid = (t['firstSeconds'] + t['lastSeconds']) / 2
        best = None
        for r in rows:
            if abs(r['t'] - mid) > 3: continue
            for dd in r['dets']:
                if dd.get('crop') and math.hypot(dd['x'] - t['x'], dd['y'] - t['y']) < 6 and dd['conf'] > .6: best = dd['crop']; break
            if best: break
        if best: got[t['label']].append(cv2.resize(cv2.imread(f'{S}/{sess}/crops/{best}'), (96, 144)))
blank = np.zeros((144, 96, 3), np.uint8); out = []
for c in want:
    row = got[c][:8] + [blank] * (8 - len(got[c][:8])); r = np.hstack(row); h = np.zeros((144, 50, 3), np.uint8)
    cv2.putText(h, c, (5, 70), 0, 0.8, (0, 255, 255), 2); out.append(np.hstack([h, r]))
cv2.imwrite(sys.argv[1], np.vstack(out)); print({c: len(got[c]) for c in want})
