"""Compare the production reader variants at source-reviewed stationary dice."""
import gzip
import json
from pathlib import Path
from math import dist
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

# Replay frame ranges and fixed board-space die centers, followed by the face.
SPOTS = [
    (4, 2425, 2475, [(408, 222, 4), (326, 210, 6)]),
    (5, 12450, 12500, [(104, 368, 4), (224, 320, 1)]),
]


def results(file, start, stop, dice):
    counts = dict(correct=0, misread=0, unread=0, pair=0)
    with gzip.open(file, 'rt') as rows:
        for frame, line in enumerate(rows):
            if frame >= stop:
                break
            if frame < start:
                continue
            row = json.loads(line)
            assert row['frame'] == frame
            state = row['state'] or {}
            all_correct = True
            for x, y, expected in dice:
                nearby = [die for die in state.get('dice', []) if dist((x, y), die['center']) <= 11]
                value = max(nearby, key=lambda die: die['score'])['value'] if nearby else None
                counts['unread'] += value is None
                counts['misread'] += value is not None and value != expected
                counts['correct'] += value == expected
                all_correct &= value == expected
            counts['pair'] += all_correct
    assert sum(counts[key] for key in ('correct', 'misread', 'unread')) == len(dice) * (stop - start)
    return counts


def main():
    baseline = ARTIFACT_DIR / 'v2'
    directory = ARTIFACT_DIR / 'calibration'
    spots = []
    for game, start, stop, dice in SPOTS:
        recording = json.loads((baseline / f'game-{game}-analysis.json').read_text())
        segment = next(part for part in reversed(recording['segments']) if part['firstGameFrame'] <= start)
        offset = segment['firstFrame'] - segment['firstGameFrame']
        assert stop + offset <= segment['lastExclusive']
        filename = Path(segment['source']).with_suffix('.jsonl.gz').name
        spot = dict(game=game, firstFrame=start, frames=stop-start, expected=[face for _, _, face in dice])
        spot['current'] = results(baseline / 'state' / filename, start+offset, stop+offset, dice)
        spot['candidate'] = results(directory / 'candidate-state' / filename, start+offset, stop+offset, dice)
        spots.append(spot)
    (directory / 'spot-validation.json').write_text(json.dumps(spots, indent=2) + '\n')
    print(json.dumps(spots))


if __name__ == '__main__':
    main()
