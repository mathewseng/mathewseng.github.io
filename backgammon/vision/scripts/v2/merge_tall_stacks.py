"""Add the supplemental tall-stack readings to archived camera detections."""
import argparse
import gzip
import json
from pathlib import Path

from vision import ARTIFACT_DIR, record_stack_readings

PRIMARY = ARTIFACT_DIR / 'v2/state'
COLORS = ('white', 'dark')


def extend(state, candidate):
    if not state or not candidate or state['handRegions'] or state.get('position') or state['checkerStatus'] == 'ambiguous':
        return []
    revisions = list(state.get('stackReadings', ()))
    added = []
    totals = state['visibleCheckerTotals'].copy()
    for reading in candidate.get('stackReadings', ()):
        color = COLORS.index(reading['color'])
        point = reading['point'] - 1
        primary = state['points'][point]
        count = candidate['points'][point][color]
        delta = count - primary[color]
        if (reading['method'] != 'learned-stack-appearance' or reading['confidence'] < .9
                or count < 6 or primary[color] < 2 or primary[1 - color] or delta <= 0
                or totals[color] + delta > 15 or (state['trayEvidence'][color] and primary[color] < 3)):
            continue
        primary[color] = count
        totals[color] += delta
        revision = {**reading, 'added': delta, 'method': 'supplemental-tall-stack-reader'}
        revisions.append(revision)
        added.append(revision)
    if added:
        record_stack_readings(state, totals, revisions)
    return added


def merge(primary, candidate, destination):
    staged = destination.with_suffix('.part.gz')
    frames = additions = completed = 0
    with gzip.open(primary, 'rt') as current, gzip.open(candidate, 'rt') as trial, \
            gzip.open(staged, 'wt', compresslevel=2) as output:
        for first, second in zip(current, trial, strict=True):
            row, alternate = json.loads(first), json.loads(second)
            if (row['frame'], row['outputPts90k'], row['clip']) != (
                    alternate['frame'], alternate['outputPts90k'], alternate['clip']):
                raise ValueError(f'Misaligned camera observation in {primary.name} at frame {row["frame"]}')
            before = bool(row['state'] and row['state'].get('position'))
            revisions = extend(row['state'], alternate['state'])
            frames += 1
            additions += len(revisions)
            completed += int(bool(revisions and not before and row['state'].get('position')))
            output.write(json.dumps(row, separators=(',', ':')) + '\n' if revisions else first)
    staged.replace(destination)
    return {'source': primary.name, 'frames': frames, 'pointCorrections': additions, 'completedBoards': completed}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate_dir', type=Path)
    parser.add_argument('output_dir', type=Path)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output in (PRIMARY.resolve(), (ARTIFACT_DIR / 'state').resolve(), args.candidate_dir.resolve()):
        parser.error('Choose a separate directory for supplemental observations.')
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for primary in sorted(PRIMARY.glob('*.jsonl.gz')):
        summary = merge(primary, args.candidate_dir / primary.name, output / primary.name)
        results.append(summary)
        print(json.dumps(summary), flush=True)
    (output / 'summary.json').write_text(json.dumps(results) + '\n')


if __name__ == '__main__':
    main()
