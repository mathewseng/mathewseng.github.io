"""Find when the same two stationary dice appear and when both locations clear."""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

from dice_footprints import difference, patches


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
    color = test.get('color', False)
    data = patches(game, frames, centers, color=color)

    def template(index, visible):
        def median(keys):
            return np.median([data[key][index] for key in keys], axis=0).astype(np.uint8)
        die, background = median(visible), median(empty)
        return (index, die, background, difference(die, background))

    def supporting(frame, signature, occupied):
        index, die, background, scale = signature
        if scale < 12:
            return False
        match, mismatch, multiplier, limit = (die, background, .45, 22) if occupied else (background, die, .40, 8 if color else 18)
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
    # A hand can resemble the empty board. A later repeated appearance at
    # both locations takes precedence over an apparent clear during occlusion.
    last_visible = next((frame for frame in reversed(range(pickup[0] + 2, pickup[1]))
                         if all(supporting(sample, die, True)
                                for sample in range(frame - 2, frame + 1) for die in final)), pickup[0] - 1)
    clear = sustained((last_visible + 1, pickup[1]),
        lambda frame: all(supporting(frame, die, False) for die in final), 6) if start is not None else None
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
