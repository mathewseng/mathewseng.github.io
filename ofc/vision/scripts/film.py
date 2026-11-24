"""Filmstrip review sheets: one row per hand-state track, N crops spread over its life, with reads and old labels.
python3 film.py SESSION OUTPREFIX [track ids...]"""
import json, sys, cv2, numpy as np
from collections import defaultdict
from hand_state import run
from eval_state import truth
def tracks(session, **kw):
    out = run(session, **kw); f = truth(session); T = defaultdict(list)
    for fr in out:
        for b in fr['bodies']:
            l = f(fr['t'], b['x'], b['y'])
            T[b['track']].append(dict(t=fr['t'], crop=b.get('crop'), read=b.get('read'), carried=b.get('carried'), x=b['x'], y=b['y'],
                                      old=l['label'] if l else '-'))
    return T
def sheet(session, T, ids, path, n=10):
    rows = []
    for tid in ids:
        v = [o for o in T[tid] if o['crop']]
        if not v: continue
        pick = [v[round(i * (len(v) - 1) / max(n - 1, 1))] for i in range(min(n, len(v)))]
        row = np.full((210, 150 * n + 260, 3), 30, np.uint8)
        names = sorted({o['carried'] for o in T[tid] if o['carried']}); olds = sorted({o['old'] for o in T[tid]})
        reads = defaultdict(int)
        for o in T[tid]:
            if o['read']: reads[o['read']] += 1
        txt = [f'#{tid}', f"{T[tid][0]['t']:.0f}-{T[tid][-1]['t']:.0f}s n{len(T[tid])}", 'carry ' + ','.join(names),
               'reads ' + ' '.join(f'{k}:{c}' for k, c in reads.items()), 'old ' + ','.join(olds)[:28],
               f"xy {T[tid][0]['x']:.0f},{T[tid][0]['y']:.0f}"]
        for i, s in enumerate(txt): cv2.putText(row, s, (6, 24 + 30 * i), 0, 0.55, (255, 255, 255), 1)
        for i, o in enumerate(pick):
            im = cv2.resize(cv2.imread(f'../scan/{session}/crops/{o["crop"]}'), (128, 192), interpolation=cv2.INTER_CUBIC)
            x = 260 + 150 * i; row[2:194, x:x + 128] = im
            cv2.putText(row, f"{o['t']:.0f} {o['read'] or ''}", (x, 207), 0, 0.42, (120, 255, 120) if o['read'] else (200, 200, 200), 1)
        rows.append(row)
    cv2.imwrite(path, np.vstack(rows))
if __name__ == '__main__':
    s = sys.argv[1]; T = tracks(s)
    ids = [int(x) for x in sys.argv[3:]] or sorted(T)
    for k in range(0, len(ids), 7): sheet(s, T, ids[k:k + 7], f'{sys.argv[2]}-{k // 7:02d}.jpg')
