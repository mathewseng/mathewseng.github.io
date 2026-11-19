"""Fit die body color on independently reviewed camera crops."""
import argparse
import json
from pathlib import Path
import sys

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from v2.dice_body import DiceBodyReader, color_features, legacy_color


def train(patches, records, labels):
    assert len(patches) == len(records) == len(labels)
    train_indices = [i for i, row in enumerate(records) if row['split'] == 'train' and labels[i] != '?']
    test_indices = [i for i, row in enumerate(records) if row['split'] == 'test' and labels[i] != '?']
    assert not {records[i]['clip'] for i in train_indices} & {records[i]['clip'] for i in test_indices}
    features = np.stack([color_features(patches[i]) for i in train_indices])
    normalized = StandardScaler().fit(features)
    model = LogisticRegression(C=2, random_state=172)
    model.fit(normalized.transform(features), [labels[i] == 'd' for i in train_indices])
    weights = model.coef_[0] / normalized.scale_
    offset = model.intercept_[0] - weights @ normalized.mean_
    reader = DiceBodyReader({'weights': weights.tolist(), 'offset': float(offset)})
    tests = []
    for i in test_indices:
        patch = patches[i]
        expected = 'dark' if labels[i] == 'd' else 'white'
        tests.append(dict(index=i, game=records[i]['game'], clip=records[i]['clip'],
                          expected=expected, baseline=legacy_color(patch), candidate=reader.predict(patch),
                          darkness=round(reader.darkness(patch), 4)))
    return reader.model, {
        'reviewed': len(labels), 'unreadable': labels.count('?'), 'training': len(train_indices),
        'heldOut': len(tests), 'baselineCorrect': sum(t['baseline'] == t['expected'] for t in tests),
        'candidateCorrect': sum(t['candidate'] == t['expected'] for t in tests),
        'tests': tests,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=ARTIFACT_DIR / 'calibration')
    directory = parser.parse_args().directory
    path = Path(__file__).with_name('dice-body-labels.txt')
    labels = [value for line in path.read_text().splitlines() if not line.startswith('#') for value in line.split()]
    records = json.loads((directory / 'samples.json').read_text())['dice']
    patches = np.load(directory / 'dice.npy')
    model, validation = train(patches, records, labels)
    (directory / 'dice-body-model.json').write_text(json.dumps(model, indent=2) + '\n')
    (directory / 'dice-body-validation.json').write_text(json.dumps(validation, indent=2) + '\n')
    print({key: value for key, value in validation.items() if key != 'tests'})


if __name__ == '__main__':
    main()
