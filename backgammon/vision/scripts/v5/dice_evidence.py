#!/usr/bin/env python3
"""Per-turn dice evidence: when the roller's dice settled and P(roll) from the face reader.

usage: dice_evidence.py decode.json faces.pt out.json
"""
import json, sys
import numpy as np, torch
import dice_faces as df

decode = json.load(open(sys.argv[1]))
net = df.FaceNet(); net.load_state_dict(torch.load(sys.argv[2], map_location='cpu')); net.eval().to(df.dev)
meta, patches = df.load_scan()
out = []
for gi, g in enumerate(decode['games'], 1):
    prev = g['startFrame']; turns = []
    for t in g['turns']:
        red = 1 if t['player'] == 'dark' else 0
        start = t.get('fromFrame', prev)
        tr = df.tracks(meta, start, t['frame'], red)
        e = {'frame': t['frame'], 'player': t['player'], 'tracks': len(tr)}
        # roll onset: first time the roller's dice are detected at least 3 times within 2 s
        sel = np.nonzero((meta[:, 0] > start - 125) & (meta[:, 0] <= t['frame']) & (meta[:, 4] == red) & (df.DIE_SCORE > .5))[0]
        fs = np.sort(meta[sel, 0])
        for k in range(len(fs) - 2):
            if fs[k + 2] - fs[k] <= 50: e['onsetFrame'] = int(fs[k]); break
        if len(tr) >= 2:
            a, b = tr[0], tr[1]
            e['rollFrame'] = int(max(meta[a, 0].min(), meta[b, 0].min()))
            e['pickupFrame'] = int(min(meta[a, 0].max(), meta[b, 0].max()))
            lp = df.pair_prob(df.read_track(net, patches, a[:20]), df.read_track(net, patches, b[:20]))
            e['rollLogProb'] = {k: round(v, 3) for k, v in lp.items()}
        elif len(tr) == 1:
            e['rollFrame'] = int(meta[tr[0], 0].min())
        if 'onsetFrame' in e: e['rollFrame'] = min(e.get('rollFrame', e['onsetFrame']), e['onsetFrame'])
        turns.append(e); prev = t['frame']
    out.append(turns)
json.dump(out, open(sys.argv[3], 'w'))
print('turns with two dice', sum(1 for g in out for t in g if 'rollLogProb' in t), 'of', sum(len(g) for g in out))
