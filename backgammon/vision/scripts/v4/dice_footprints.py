"""Read tracked board patches and compare a die or empty felt by appearance."""
from collections import defaultdict
import json
from pathlib import Path
import sys

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR


def patches(game, frames, centers, *, color=False):
    manifest = ARTIFACT_DIR / 'v2' / f'game-{game}-analysis.json'
    segments = json.loads(manifest.read_text())['segments']
    requested = defaultdict(list)
    floor = min(frames)
    for frame in sorted(frames):
        segment = next(part for part in reversed(segments) if part['firstGameFrame'] <= frame)
        offset = frame - segment['firstGameFrame'] + segment['firstFrame']
        if offset >= segment['lastExclusive'] or (segment['discontinuity'] and floor < segment['firstGameFrame']):
            raise ValueError(f'Timing samples cross missing footage in game {game}')
        requested[segment['source']].append((frame, offset))

    result = {}
    for source, requests in requested.items():
        capture = cv2.VideoCapture(str(ARTIFACT_DIR / 'board' / source))
        previous = -2
        for frame, offset in requests:
            if 1 < offset - previous <= 20 and previous >= 0:
                for _ in range(offset - previous - 1):
                    if not capture.grab():
                        raise ValueError(f'Cannot advance {source} to frame {offset}')
            elif offset != previous + 1:
                capture.set(cv2.CAP_PROP_POS_FRAMES, offset)
            ok, image = capture.read()
            if not ok:
                raise ValueError(f'Cannot read {source} frame {offset}')
            height, width = image.shape[:2]
            if any(not 11 <= x < width - 11 or not 11 <= y < height - 11 for x, y in centers):
                raise ValueError(f'Die center outside the camera crop in game {game}')
            crops = [image[y-11:y+12, x-11:x+12] for x, y in centers]
            result[frame] = [crop.copy() for crop in crops] if color else [
                cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) for crop in crops]
            previous = offset
        capture.release()
    return result


def difference(patch, reference):
    # Track the visual signature at each location even when the face reader
    # drops it. The surrounding pixels allow for a small shift in rectification.
    result = cv2.matchTemplate(patch, reference[4:19, 4:19], cv2.TM_SQDIFF)
    pixels = reference[4:19, 4:19].size
    return (max(0, float(result.min())) / pixels) ** .5
