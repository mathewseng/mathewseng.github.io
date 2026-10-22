#!/usr/bin/env python3
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

FAMILY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('filtered_summary', FAMILY / 'scripts/summarize-filtered-rollout-study.py')
summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(summary)
execution = summary.execution


class FilteredStudyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = json.loads((FAMILY / 'docs/filtered-rollout-v1-inputs.json').read_bytes())
        # Entirely synthetic values: never inspect partial research estimates.
        cls.plan['runtime'] = {'binaries': {'fixed': 'synthetic-fixed', 'legacy': 'synthetic-control'},
                               'fixtureSHA256': 'synthetic-fixture'}
        cls.records = []
        for key, (d, p, c, batch) in execution.expected_records(cls.plan).items():
            shift = {'fixed-normal': 0., 'buggy-normal': -.01, 'fixed-deep': .002}[p['id']]
            common = .02 if batch % 2 else -.02
            value = {k: p[k] for k in execution.FIELDS}
            value.update({'samples': 32, 'equity': c['reference']['xgEquity'] + common + shift,
                          'cubeless': .1, 'standardError': 0., 'probabilities': [.5, .1, .01, .1, .01],
                          'cubeActions': [0] * 10, 'maxCube': 1})
            cls.records.append({'key': key, 'id': d['id'], 'policy': p['id'], 'runtime': p['runtime'],
                'candidateId': c['candidateId'], 'role': c['role'], 'board': c['board'], 'batch': batch,
                'seed': (d['seedBase'] + batch * 65536) % 2**32, 'value': value})

    def test_complete_summary_preserves_pairing_and_separates_reference_tolerance(self):
        result = summary.summarize(self.plan, self.records)
        self.assertEqual(result['totalTrials'], 458752)
        cells = [c for row in result['rows'] for p in row['policies'] for c in p['candidates']]
        gaps = [g for row in result['rows'] for p in row['policies'] for g in p['gaps']]
        self.assertEqual((len(cells), len(gaps), len(result['effects']), len(result['candidateEffects'])), (28, 19, 2, 4))
        for gap in gaps:
            self.assertAlmostEqual(gap['difference'], gap['referenceGap'], places=12)
            self.assertLess(gap['standardError'], 1e-14)  # common block noise cancels
        for effect in result['effects']:
            self.assertAlmostEqual(effect['difference'], 0., places=12)
        for effect in result['candidateEffects']:
            self.assertAlmostEqual(effect['difference'], .01 if effect['after'] == 'fixed-normal' else .002, places=12)
        normal = result['rows'][0]['policies'][0]['candidates'][0]
        self.assertTrue(normal['withinTolerance'])
        self.assertGreater(normal['standardError'], normal['pooledTrialStandardError'])
        control = next(p for row in result['rows'] for p in row['policies'] if p['id'] == 'buggy-normal')
        self.assertTrue(all(not c['withinTolerance'] for c in control['candidates']))

    def test_incomplete_duplicate_identity_seed_and_policy_changes_rejected(self):
        for records in [self.records[:-1], [*self.records[:-1], self.records[0]]]:
            with self.assertRaises(ValueError):
                summary.summarize(self.plan, records)
        for field, value in [('seed', 1), ('candidateId', 'unknown'), ('runtime', 'wrong'), ('batch', False)]:
            rows = self.records.copy()
            rows[0] = {**rows[0], field: value}
            with self.assertRaises(ValueError):
                execution.validate_records(rows, self.plan)
        for field, value in [('checkerPlies', 0), ('samples', 31), ('maxCube', 3), ('equity', float('nan'))]:
            rows = self.records.copy()
            rows[0] = {**rows[0], 'value': {**rows[0]['value'], field: value}}
            with self.assertRaises(ValueError):
                execution.validate_records(rows, self.plan)

    def test_twenty_shard_merge_requires_exact_worker_evidence_and_complete_sample(self):
        validation = {'schema': 1, 'platform': 'linux', 'architecture': 'arm64', 'cases': 12,
            'trialsPerCase': 2, 'tolerance': 1e-5, 'allWithinTolerance': True,
            'binaries': self.plan['runtime']['binaries'], 'fixtureSHA256': 'synthetic-fixture',
            'scriptSHA256': execution.HASH((FAMILY / 'scripts/validate-filtered-rollout-platform.py').read_bytes()),
            'maxNumericDifference': 0.}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for shard in range(20):
                folder = root / f'filtered-rollout-v1-shard-{shard}'
                folder.mkdir()
                rows = [r for r in self.records if r['batch'] % 20 == shard]
                (folder / 'batches.jsonl').write_bytes(execution.encode_records(rows))
                (folder / 'inputs.json').write_text(json.dumps(self.plan))
                (folder / 'platform-validation.json').write_text(json.dumps(validation))
                (folder / 'complete.json').write_text(json.dumps({'signature': self.plan['signature'],
                    'records': len(rows), 'shard': shard, 'shards': 20, 'completedAt': 'synthetic'}))
            raw, complete = execution.merge(root, self.plan, '12345')
            self.assertEqual(complete['records'], 14336)
            execution.validate_execution(complete, self.plan, raw, self.records)
            altered = copy.deepcopy(complete)
            altered['shards'][0]['validation']['binaries']['fixed'] = 'wrong'
            with self.assertRaises(ValueError):
                execution.validate_execution(altered, self.plan, raw, self.records)
            (root / 'filtered-rollout-v1-shard-19/complete.json').unlink()
            with self.assertRaises(FileNotFoundError):
                execution.merge(root, self.plan, '12345')


if __name__ == '__main__':
    unittest.main()
