#!/usr/bin/env python3
"""Crop sheets of the roller's dice for turns whose roll the move alone does not fix."""
import json, sys
from pathlib import Path
import cv2, numpy as np
import dice_faces as df
from session import red_player

an, out = Path(sys.argv[1]), Path(sys.argv[2]); games = list(map(int, sys.argv[3:]))
meta, patches = df.load_scan()
score = np.load(df.WORK / df.SCAN / 'die-score.npy')
rows = []
for gnum in games:
    A = json.loads((an / f'game-{gnum:02d}.json').read_text())
    prev = A['startFrame']
    for i, t in enumerate(A['turns']):
        if t.get('cubeOnly'): continue
        if t.get('rollSource') in ('dice', 'ambiguous'):
            red = 1 if t['player'] == red_player() else 0
            f0 = t.get('fromFrame') or prev; f0 = min(f0, t.get('rollFrame') or f0) - 25
            tr = df.tracks(meta, f0, t['resultFrame'] + 25, red)
            tiles = []
            for track in tr[:3]:
                pick = track[np.argsort(-meta[track, 3])][:12]
                pick = pick[np.linspace(0, len(pick) - 1, min(5, len(pick))).astype(int)]
                tiles += [cv2.resize(patches[k], (96, 96), interpolation=cv2.INTER_CUBIC) for k in pick]
                tiles.append(np.full((96, 96, 3), 255, np.uint8)[:, :8].repeat(12, 1)[:, :96] * 0 + 80)
            if not tiles: tiles = [np.zeros((96, 96, 3), np.uint8)]
            tiles += [np.zeros((96, 96, 3), np.uint8)] * (16 - len(tiles))
            strip = np.hstack(tiles[:16])
            head = np.zeros((26, strip.shape[1], 3), np.uint8)
            lab = f"G{gnum} T{i + 1} {t['player']} cands {'/'.join(t['rollCandidates'])}  model {'-'.join(map(str, t['roll'] or []))} ({t['rollSource']})"
            cv2.putText(head, lab, (4, 19), 0, .6, (0, 255, 255), 1)
            rows.append(np.vstack([head, strip]))
        prev = t['resultFrame']
out.mkdir(parents=True, exist_ok=True)
for s in range(0, len(rows), 7):
    cv2.imwrite(str(out / f'dice-{"-".join(map(str, games))}-{s // 7}.jpg'), np.vstack(rows[s:s + 7]), [cv2.IMWRITE_JPEG_QUALITY, 90])
print(len(rows))
