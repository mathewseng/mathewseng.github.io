"""Attach camera-trained die colors to archived tracks without rerunning face inference."""
from concurrent.futures import ProcessPoolExecutor
import json
from pathlib import Path
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from v2.dice_body import DiceBodyReader
from v3.dice_tracks import pistes, read_patches, state_rows


def annotate(clip):
    cv2.setNumThreads(1)
    reader = DiceBodyReader.load(ARTIFACT_DIR / 'calibration/dice-body-model.json')
    index = clip['clip']
    tracks = pistes(state_rows(index))
    assert len(clip['dice']) == len(tracks)
    images = read_patches(index, tracks)
    for archived, detected, crops in zip(clip['dice'], tracks, images, strict=True):
        assert archived['start'] == detected['start'] and archived['end'] == detected['end']
        if len(crops) < 5:
            continue
        dark = [reader.darkness(crop) for crop in crops]
        low, high = np.quantile(dark, [.2, .8])
        if low >= .85 or high <= .15:
            archived['bodyColor'] = 'dark' if low >= .85 else 'white'
            archived['bodyConfidence'] = round(float(max(low, 1 - high)), 4)
            archived['bodySamples'] = len(crops)
    return clip


def main():
    archived = json.loads((ARTIFACT_DIR / 'v3/value-tracks.json').read_text())
    with ProcessPoolExecutor(max_workers=4) as pool:
        tracks = list(pool.map(annotate, archived))
    total = sum(len(clip['dice']) for clip in tracks)
    read = sum('bodyColor' in track for clip in tracks for track in clip['dice'])
    out = ARTIFACT_DIR / 'calibration/value-tracks-body.json'
    out.write_text(json.dumps(tracks, separators=(',', ':')) + '\n')
    print(f'Die color corroborated in {read}/{total} stationary tracks.')


if __name__ == '__main__':
    main()
