import sys, cv2, numpy as np
from eval_cls import rows, decide
from sheet import sheet
R = rows(sys.argv[1]); P = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
W = [r for r in R if (d := decide(r, P, 0.3)) and d != r['gt']]
seen = {}; pick = []
for r in W:
    if seen.get(r['track'], 0) < 3: pick.append(r); seen[r['track']] = seen.get(r['track'], 0) + 1
sheet([cv2.imread(f"../scan/{r['s']}/crops/{r['crop']}") for r in pick], [f"{r['track'][-5:]} {r['gt']}>{decide(r, P, 0.3)}" for r in pick], sys.argv[2])
print(len(W), 'wrong;', len(pick), 'shown;', sorted(seen.items()))
