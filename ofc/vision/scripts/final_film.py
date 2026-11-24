"""Filmstrips of every slot where the runtime reports a carried name on >= 3 views the single-view gate left unnamed."""
import sys, json, cv2, numpy as np
from collections import defaultdict
simf, s, pre = sys.argv[1:4]
sim = json.load(open(simf)); V = defaultdict(list)
for fr in sim:
    for b in fr['bodies']: V[b['slot']].append((fr['t'], b))
ids = [k for k, v in V.items() if sum(1 for _, b in v if b['src'] == 'carried' and not b['card']) >= 3]
rows = []
for k in sorted(ids, key=lambda k: V[k][0][0]):
    v = V[k]; cov = [x for x in v if x[1]['src'] == 'carried' and not x[1]['card']]; clean = [x for x in v if x[1]['card']]
    pick = clean[-2:] + [cov[round(i * (len(cov) - 1) / 5)] for i in range(min(6, len(cov)))]
    row = np.full((200, 160 + 132 * 8, 3), 30, np.uint8)
    names = sorted({b['hand'] for _, b in v if b['hand']})
    for j, txt in enumerate([f'#{k}', f'{v[0][0]:.0f}-{v[-1][0]:.0f}s', ','.join(names), f'cov {len(cov)}']):
        cv2.putText(row, txt, (6, 28 + 30 * j), 0, 0.6, (255, 255, 255), 1)
    for j, (t, b) in enumerate(pick):
        row[2:194, 160 + 132 * j:288 + 132 * j] = cv2.resize(cv2.imread(f"../scan/{s}/crops/{b['crop']}"), (128, 192), interpolation=cv2.INTER_CUBIC)
        cv2.putText(row, f"{t:.0f}{' ' + b['card'] if b['card'] else ''}", (160 + 132 * j, 198), 0, 0.4, (120, 255, 120) if b['card'] else (200, 200, 200), 1)
    rows.append(row)
for j in range(0, len(rows), 8): cv2.imwrite(f'{pre}-{j // 8:02d}.jpg', np.vstack(rows[j:j + 8]))
print(s, len(rows), 'slots,', sum(sum(1 for _, b in V[k] if b['src'] == 'carried' and not b['card']) for k in ids), 'covered views')
