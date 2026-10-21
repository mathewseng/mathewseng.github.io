# SPDX-License-Identifier: GPL-3.0-or-later
import importlib.util
import copy
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('ablation',Path(__file__).resolve().parents[1]/'scripts/summarize-fullgame-ablation.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)

def fixture():
    candidates=[{'board':b,'notation':b,'role':role,'reference':{'xgEquity':eq}} for b,role,eq in [('old','previous-choice',0),('xg','xg-choice',.01),('third','other-retained',-.03)]]
    policies=[{'id':name,**dict(zip(a.FIELDS,values))} for name,values in a.POLICIES.items()]
    inputs={'plan':[{'id':'p','kind':'opening','roll':'21','source':'https://example.test','seedBase':7,'candidates':candidates,'referenceBest':{'board':'xg'}}], 'trials':128,'batchSize':32,'policies':policies,'signature':'fixture','method':'fixture'}
    records=[]
    for p in policies:
        for c in candidates:
            if c['role']=='other-retained' and p['id']!='full-strong':continue
            for i in range(4):
                gap={'short':.02,'full-matched':.01,'full-strong':-.01,'full-cube3':-.012}[p['id']]
                # Large shared noise cancels both within pairs and across policies.
                eq=(gap if c['board']=='old' else 0 if c['board']=='xg' else -.03)+[1,-1,2,-2][i]
                value={'equity':eq,'standardError':.1,'cubeless':eq,'samples':32,'probabilities':[.5,.1,.01,.1,.01],**{k:p[k] for k in a.FIELDS[:-1]}}
                records.append({'id':'p','policy':p['id'],'board':c['board'],'role':c['role'],'batch':i,'seed':7+65536*i,'key':'|'.join(['p',p['id'],str(i),c['board']]),'value':value})
    return inputs,records

class Tests(unittest.TestCase):
    def test_paired_difference_of_differences(self):
        inputs,records=fixture();r=a.summarize(inputs,records);row=r['rows'][0]
        for name,expected in [('cutoff',-.01),('checker',-.02),('cube',-.002)]:
            effect=row['effects'][name]
            self.assertAlmostEqual(effect['difference'],expected)
            self.assertLess(effect['standardError'],1e-14)
            self.assertEqual(effect['direction'],'toward-XG')
        self.assertEqual(row['policies']['full-strong']['bestBoard'],'xg')
        self.assertEqual(len(row['policies']['full-strong']['candidates']),3)
        self.assertEqual(len(row['policies']['full-cube3']['candidates']),2)
        self.assertAlmostEqual(row['referenceGap'],-.01)
    def test_incomplete_and_duplicate_rejected(self):
        inputs,records=fixture()
        with self.assertRaisesRegex(ValueError,'Incomplete'):a.summarize(inputs,records[:-1])
        with self.assertRaisesRegex(ValueError,'duplicate'):a.summarize(inputs,records+[records[0]])
    def test_seed_policy_and_statistics_rejected(self):
        inputs,records=fixture()
        for mutate,message in [(lambda r:r.update(seed=8),'seed'),(lambda r:r['value'].update(cubePlies=0),'Policy'),(lambda r:r['value'].update(equity=float('nan')),'statistics'),(lambda r:r.update(role='xg-choice'),'identity')]:
            broken=copy.deepcopy(records);mutate(broken[0])
            with self.assertRaisesRegex(ValueError,message):a.summarize(inputs,broken)
    def test_opening_confirmation_uses_its_predeclared_families(self):
        inputs,records=fixture()
        inputs.update(effectComparisons=2,gapComparisons=3)
        inputs['policies']=[p for p in inputs['policies'] if p['id']!='full-cube3']
        records=[r for r in records if r['policy']!='full-cube3']
        report=a.summarize(inputs,records)
        self.assertEqual(set(report['rows'][0]['effects']),{'cutoff','checker'})
        self.assertEqual(set(report['effectSummary']),{'cutoff','checker'})
        self.assertEqual(report['effectComparisons'],2)
        self.assertEqual(report['gapComparisons'],3)
        self.assertAlmostEqual(report['rows'][0]['effects']['cutoff']['familywise95']['criticalValue'],a.stats.critical(3,.05/2))
    def test_cohort_effect_averages_blocks_before_estimating_uncertainty(self):
        blocks = [[{'batch': i, 'value': {'equity': x}} for i,x in enumerate(xs)] for xs in [[-1,-2,-3,-4], [0,1,2,3]]]
        effect = a.cohort_effect(blocks)
        self.assertEqual(effect['difference'], -.5)
        self.assertEqual(effect['standardError'], 0)
        self.assertEqual(effect['positions'], 2)
        self.assertEqual(effect['comparisons'], 3)
        self.assertEqual(effect['direction'], 'toward-XG')
        with self.assertRaisesRegex(ValueError, 'Unaligned'):
            a.cohort_effect([blocks[0], blocks[1][:-1]])
    def test_precision_retained_comparisons_preserve_pairing_and_separate_family(self):
        inputs, records = fixture()
        inputs['retainedComparisons'] = 3
        report = a.summarize(inputs, records)
        gaps = report['rows'][0]['policies']['full-strong']['retainedReferenceGaps']
        self.assertEqual(len(gaps), 2)
        for gap, expected in zip(gaps, [.01, .03]):
            self.assertAlmostEqual(gap['difference'], expected)
            self.assertLess(gap['standardError'], 1e-14)
            self.assertEqual(gap['direction'], 'XG-ahead')
            self.assertAlmostEqual(gap['familywise95']['criticalValue'], a.stats.critical(3, .05/3))
    def test_large_sample_critical_values_match_independent_quadrature(self):
        # mpmath 1.3.0: direct Student-t density integration/root finding at 45 digits,
        # independent of the production incomplete-beta implementation.
        for comparisons, expected in [(1,1.9622856196472682),(2,2.244707006352135),(3,2.397923956454708)]:
            self.assertLess(abs(a.stats.critical(1023,.05/comparisons)-expected),1e-8)
    def test_pairing_cannot_be_lost(self):
        _,records=fixture();x=records[:4];y=copy.deepcopy(x);y[0]['seed']+=1
        with self.assertRaisesRegex(ValueError,'Unpaired'):a.difference_records(x,y)

if __name__=='__main__':unittest.main()
