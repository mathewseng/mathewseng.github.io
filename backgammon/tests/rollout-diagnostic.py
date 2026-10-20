# SPDX-License-Identifier: GPL-3.0-or-later
import importlib.util
import json
import math
import unittest
from pathlib import Path
from copy import deepcopy

spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).parents[1] / 'scripts/summarize-rollout-diagnostic.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def records(gaps, offset=0):
    return [{'batch': i, 'seed': i * 65536, 'value': {'samples': 32, 'equity': gap + offset + i * .1}} for i, gap in enumerate(gaps)]

class Statistics(unittest.TestCase):
    def test_student_against_analytic_cauchy(self):
        for x in [-5, 0, 1, 12.7]:
            self.assertAlmostEqual(m.student_cdf(x, 1), .5 + math.atan(x) / math.pi, places=10)
        self.assertAlmostEqual(m.critical(1), math.tan(.475 * math.pi), places=8)

    def test_critical_values_and_family_correction(self):
        self.assertAlmostEqual(m.critical(127), 1.978819534703, places=9)
        self.assertAlmostEqual(m.critical(127, .05 / 24), 3.142773233247, places=9)
        self.assertGreater(m.critical(127, .05 / 24), m.critical(127))

    def test_paired_covariance_and_direction(self):
        # Large shared variation cancels; uncertainty must come from within-pair gaps.
        a, b = records([.01, .03, .01, .03]), records([0] * 4)
        result = m.contrast(a, b)
        self.assertAlmostEqual(result['difference'], .02)
        self.assertAlmostEqual(result['standardError'], .01 / math.sqrt(3))
        self.assertAlmostEqual(m.contrast(b, a)['difference'], -.02)
        self.assertGreater(result['familywise95']['halfWidth'], result['interval95']['halfWidth'])
        b[0]['seed'] += 1
        with self.assertRaisesRegex(ValueError, 'Unpaired'):
            m.contrast(a, b)

    def test_classification_is_not_just_sign(self):
        b = records([0] * 128)
        for delta, expected in [(.01, 'persistent'), (-.01, 'reversed'), (0, 'unresolved')]:
            a = records([delta + (i % 2 * 2 - 1) * .001 for i in range(128)])
            self.assertEqual(m.contrast(a, b)['classification'], expected)

    def test_complete_fixed_sample_and_duplicate_rejection(self):
        policy = dict(checkerPlies=2, cubePlies=2, truncationPlies=5,
                      lateAfterPlies=2, lateCheckerPlies=1, lateCubePlies=2)
        def candidate(board, role, ev):
            return dict(board=board, role=role, notation=board, reference=dict(xgEquity=ev, confidenceHalfWidth=.001),
                        historical=dict(equity=ev), fourPly=dict(equity=ev), fivePly=dict(equity=ev))
        d = dict(id='opening-21', seedBase=123, kind='opening', roll='21', source='https://example.test', previousGap=.1,
                 referenceBest=dict(move='B', method='rollout', trials=10000),
                 candidates=[candidate('A', 'previous-choice', 0), candidate('B', 'xg-choice', .01)])
        inputs = dict(plan=[d], trials=4096, batchSize=32, policy=policy, signature='test', method='test')
        rows = []
        for batch in range(128):
            for c in d['candidates']:
                rows.append(dict(id=d['id'], board=c['board'], role=c['role'], batch=batch, seed=123 + batch * 65536,
                    key=f"opening-21|{batch}|{c['board']}", value=dict(policy, samples=32,
                    equity=.1 if c['board']=='A' else .01, cubeless=.01, standardError=.001,
                    probabilities=[.5,.1,.01,.1,.01])))
        report = m.summarize(inputs, rows)
        self.assertTrue(report['complete'])
        self.assertEqual(report['classifications']['persistent'], 1)
        self.assertEqual(report['rows'][0]['estimates'][0]['samples'], 4096)
        self.assertAlmostEqual(report['rows'][0]['gap']['difference'], .09)
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            m.summarize(inputs, rows + [rows[0]])
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            m.summarize(inputs, rows[:-1])
        self.assertFalse(m.summarize(inputs, rows[:-1], partial=True)['complete'])
        wrong_policy = deepcopy(rows)
        wrong_policy[0]['value']['cubePlies'] = 1
        with self.assertRaisesRegex(ValueError, 'Policy'):
            m.summarize(inputs, wrong_policy)

    def test_reject_incomplete_and_wrong_seed(self):
        inputs = json.loads((m.FAMILY / 'docs/rollout-diagnostic-inputs.json').read_bytes())
        with self.assertRaisesRegex(ValueError, 'Incomplete'):
            m.summarize(inputs, [])
        d = inputs['plan'][0]
        c = d['candidates'][0]
        r = {'id': d['id'], 'board': c['board'], 'role': c['role'], 'batch': 0, 'seed': d['seedBase'] ^ 1,
             'key': '|'.join([d['id'], '0', c['board']]), 'value': {'samples': 32}}
        with self.assertRaisesRegex(ValueError, 'Wrong seed'):
            m.summarize(inputs, [r])
        with self.assertRaisesRegex(ValueError, 'signature'):
            changed = deepcopy(inputs)
            changed['trials'] = 8192
            m.validate_provenance(json.dumps(changed).encode(), changed)

if __name__ == '__main__':
    unittest.main()
