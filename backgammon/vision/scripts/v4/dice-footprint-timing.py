"""Find when the same two stationary dice appear and when both locations clear."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR


def patches(game, frames, centers):
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
            if offset != previous + 1:
                capture.set(cv2.CAP_PROP_POS_FRAMES, offset)
            ok, image = capture.read()
            if not ok:
                raise ValueError(f'Cannot read {source} frame {offset}')
            height, width = image.shape[:2]
            if any(not 11 <= x < width - 11 or not 11 <= y < height - 11 for x, y in centers):
                raise ValueError(f'Die center outside the camera crop in game {game}')
            result[frame] = [cv2.cvtColor(image[y-11:y+12, x-11:x+12], cv2.COLOR_BGR2GRAY) for x, y in centers]
            previous = offset
        capture.release()
    return result


def difference(patch, reference):
    # Track the visual signature at each location even when the face reader
    # drops it. The surrounding pixels allow for a small shift in rectification.
    result = cv2.matchTemplate(patch, reference[4:19, 4:19], cv2.TM_SQDIFF)
    return (max(0, result.min()) / 225) ** .5


def sustained(window, supported, minimum):
    count = 0
    for frame in range(*window):
        count = count + 1 if supported(frame) else 0
        if count == minimum:
            return frame - minimum + 1
    return None


def verify(game, test):
    occupied, empty = test['visible'], test['empty']
    onset, pickup = test['search'], test['clearSearch']
    frames = set(occupied + empty).union(range(*onset), range(*pickup))
    data = patches(game, frames, test['centers'])
    templates = lambda keys: np.median([data[key] for key in keys], axis=0).astype(np.uint8)
    dice, background = templates(occupied), templates(empty)
    contrast = [difference(die, blank) for die, blank in zip(dice, background)]
    if min(contrast) < 12:
        return {'start': None, 'clear': None}

    def supporting(frame, reference, alternative, multiplier, limit):
        for patch, match, mismatch, scale in zip(data[frame], reference, alternative, contrast):
            near = difference(patch, match)
            far = difference(patch, mismatch)
            if near > min(limit, multiplier * scale) or far - near <= .25 * scale:
                return False
        return True

    start = sustained(onset, lambda frame: supporting(frame, dice, background, .45, 22), 6)
    # Removal needs a positive match for the empty board on both locations.
    # Lack of a die match during a hand occlusion is insufficient.
    clear = sustained(pickup, lambda frame: supporting(frame, background, dice, .40, 18), 6) if start is not None else None
    return {'start': start, 'clear': clear}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cases', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    cv2.setNumThreads(1)
    results = []
    for case in json.loads(args.cases.read_text()):
        game = case['game']
        result = verify(game, case)
        for key, interval in case['expected'].items():
            agrees = result[key] is None if interval is None else result[key] is not None and interval[0] <= result[key] <= interval[1]
            if not agrees:
                raise AssertionError(f'Game {game} {key} was {result[key]}, expected frame range {interval}')
        results.append({'game': game, 'previousStart': case['previousStart'], **result, 'expected': case['expected']})
    args.output.write_text(json.dumps(results, indent=2) + '\n')
    print(results)
