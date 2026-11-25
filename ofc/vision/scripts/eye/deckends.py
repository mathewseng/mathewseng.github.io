"""deckends.py SIM: hand ends with the share of boxes v3 is unsure about (best < 0.3 or none) per hand = jumbo deck marker."""
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ends import hand_ends
sim = json.load(open(sys.argv[1]))
pr = np.load('../scan/n1532/probs-v3.npz'); idx = {n: i for i, n in enumerate(pr['names'])}
p = (pr['p1'].astype(np.float32) + pr['p2'].astype(np.float32)) / 2
unsure = (p[:, :52].max(1) < 0.3) | (p.argmax(1) == 52)
prev = 0
for e, t, n, tab in hand_ends(sim):
    cs = [b['crop'] for f in sim if prev <= f['t'] < e for b in f['bodies'] if b['crop'] in idx]
    u = np.mean([unsure[idx[c]] for c in cs]) if cs else 0
    print(f'{prev:7.1f}-{e:7.1f} end-frame {t:7.1f} boxes {n:3d} crops {len(cs):5d} v3-unsure {u:.2f}')
    prev = e
