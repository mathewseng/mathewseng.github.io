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
    centers = test['centers']
    reposition = test.get('reposition')
    if reposition:
        moved_centers = reposition['centers']
        shared = [center for center in centers if center in moved_centers]
        if len(centers) != 2 or len(moved_centers) != 2 or len(shared) != 1:
            raise ValueError('A repositioned roll must have one unchanged die location.')
        move = reposition['search']
        frames.update(reposition['visible'], range(*move), range(onset[1], move[1]))
        centers = centers + [center for center in moved_centers if center not in centers]
    data = patches(game, frames, centers)

    def template(index, visible):
        def median(keys):
            return np.median([data[key][index] for key in keys], axis=0).astype(np.uint8)
        die, background = median(visible), median(empty)
        return (index, die, background, difference(die, background))

    def supporting(frame, signature, occupied):
        index, die, background, scale = signature
        if scale < 12:
            return False
        match, mismatch, multiplier, limit = (die, background, .45, 22) if occupied else (background, die, .40, 18)
        near = difference(data[frame][index], match)
        far = difference(data[frame][index], mismatch)
        return near <= min(limit, multiplier * scale) and far - near > .25 * scale

    initial = [template(index, occupied) for index in range(len(test['centers']))]
    final = initial
    start = sustained(onset, lambda frame: all(supporting(frame, die, True) for die in initial), 6)
    if start is not None and reposition:
        anchor = initial[centers.index(shared[0])]
        vacated = next(die for die in initial if die is not anchor)
        new_location = next(center for center in moved_centers if center != shared[0])
        relocated = template(centers.index(new_location), reposition['visible'])
        final = [anchor, relocated]
        moved = sustained(move, lambda frame: supporting(frame, vacated, False) and
                          all(supporting(frame, die, True) for die in final), 6)
        # Check the shared die at both endpoints and reject a confirmed
        # removal in between. Brief occlusions need no visible pip match.
        if moved is None or sustained((start, moved + 6), lambda frame: supporting(frame, anchor, False), 6) is not None:
            return {'start': None, 'clear': None}
    # Removal needs a positive match for the empty board on both locations.
    # Lack of a die match during a hand occlusion is insufficient.
    clear = sustained(pickup, lambda frame: all(supporting(frame, die, False) for die in final), 6) if start is not None else None
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
        results.append({'game': game, 'previousStart': case['previousStart'], **result, 'expected': case['expected'],
                        **({'repositioned': True} if case.get('reposition') else {})})
    args.output.write_text(json.dumps(results, indent=2) + '\n')
    print(results)
