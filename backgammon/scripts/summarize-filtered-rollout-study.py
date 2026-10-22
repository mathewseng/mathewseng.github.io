#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Analyze only the complete, fixed corrected-checker study."""
import argparse
import gzip
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

FAMILY = Path(__file__).resolve().parents[1]
PREFIX = 'filtered-rollout-v1'
FOCUS = 'reply-7985255600f3563f-44'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


execution = load('filtered_execution', 'merge-filtered-rollout-shards.py')
ablation = load('filtered_statistics', 'summarize-fullgame-ablation.py')
stats = ablation.stats


def contrast(a, b, comparisons, positive, negative):
    result = stats.contrast(a, b, comparisons)
    result.pop('classification')
    result['direction'] = (positive if result['familywise95']['lower'] > 0 else
                           negative if result['familywise95']['upper'] < 0 else 'unresolved')
    return result


def summarize(plan, records):
    # Calling this helper directly must not provide an incomplete-sample escape.
    execution.validate_records(records, plan)
    lookup = {r['key']: r for r in records}
    batches = plan['trials'] // plan['batchSize']
    counts = plan['comparisons']
    tolerance = counts['equityTolerance']
    lists, gaps, rows = {}, {}, []
    absolute_count = gap_count = 0
    for d in plan['plan']:
        best = next(c for c in d['candidates'] if c['board'] == d['referenceBest']['board'])
        policy_rows = []
        for policy in plan['policies']:
            pid = policy['id']
            if d['id'] not in policy['caseIds']:
                continue
            candidates = []
            for c in d['candidates']:
                key = (d['id'], pid, c['candidateId'])
                data = [lookup['|'.join([d['id'], pid, str(b), c['candidateId']])] for b in range(batches)]
                lists[key] = data
                ref = [{**r, 'value': {**r['value'], 'equity': c['reference']['xgEquity']}} for r in data]
                comparison = contrast(data, ref, counts['absoluteEquities'], 'above-XG', 'below-XG')
                estimate = stats.estimate(data)
                # Inference uses independent block means, consistently with paired effects.
                estimate['pooledTrialStandardError'] = estimate['standardError']
                estimate['standardError'] = comparison['standardError']
                ci = comparison['familywise95']
                candidates.append({'candidateId': c['candidateId'], 'role': c['role'],
                    'move': c['notation'], 'board': c['board'], **estimate,
                    'referenceEquity': c['reference']['xgEquity'],
                    'referenceConfidenceHalfWidth': c['reference']['confidenceHalfWidth'],
                    'referenceCredit': plan['referenceAttributions'][d['id']][c['candidateId']],
                    'referenceDifference': comparison['difference'],
                    'withinTolerance': abs(comparison['difference']) <= tolerance,
                    'intervalWithinTolerance': ci['lower'] >= -tolerance and ci['upper'] <= tolerance,
                    'absoluteComparison': comparison})
                absolute_count += 1
            move_gaps = []
            for c in d['candidates']:
                if c['candidateId'] == best['candidateId']:
                    continue
                a = lists[(d['id'], pid, best['candidateId'])]
                b = lists[(d['id'], pid, c['candidateId'])]
                gap = contrast(a, b, counts['moveGaps'], 'XG-choice-ahead', 'alternative-ahead')
                move_gaps.append({'xgCandidateId': best['candidateId'], 'alternativeCandidateId': c['candidateId'],
                                  'referenceGap': best['reference']['xgEquity'] - c['reference']['xgEquity'], **gap})
                gaps[(d['id'], pid, c['candidateId'])] = ablation.difference_records(a, b)
                gap_count += 1
            leader = max(candidates, key=lambda c: c['equity'])
            cell_records = [r for c in d['candidates'] for r in lists[(d['id'], pid, c['candidateId'])]]
            policy_rows.append({'id': pid, 'label': policy['label'], 'runtime': policy['runtime'],
                'candidates': candidates, 'gaps': move_gaps,
                'sampledLeader': leader['candidateId'], 'sampledLeaderAgrees': leader['candidateId'] == best['candidateId'],
                'cubeActions': [sum(r['value']['cubeActions'][i] for r in cell_records) for i in range(10)],
                'maxCube': max(r['value']['maxCube'] for r in cell_records)})
        rows.append({'id': d['id'], 'kind': d['kind'], 'roll': d['roll'], 'source': d['source'],
                     'referenceBest': d['referenceBest'], 'policies': policy_rows})
    effects, candidate_effects = [], []
    focus = next(d for d in plan['plan'] if d['id'] == FOCUS)
    alternative = next(c for c in focus['candidates'] if c['board'] != focus['referenceBest']['board'])
    for after, before in counts['gapEffects']:
        effect = contrast(gaps[(FOCUS, after, alternative['candidateId'])],
                          gaps[(FOCUS, before, alternative['candidateId'])], counts['policyGapEffects'],
                          'positive-gap-shift', 'negative-gap-shift')
        effects.append({'id': FOCUS, 'after': after, 'before': before, **effect})
        for c in focus['candidates']:
            effect = contrast(lists[(FOCUS, after, c['candidateId'])], lists[(FOCUS, before, c['candidateId'])],
                              counts['candidatePolicyEffects'], 'positive-EV-shift', 'negative-EV-shift')
            candidate_effects.append({'id': FOCUS, 'candidateId': c['candidateId'], 'move': c['notation'],
                                      'after': after, 'before': before, **effect})
    if ((gap_count, len(effects), len(candidate_effects), absolute_count) !=
            (counts['moveGaps'], counts['policyGapEffects'], counts['candidatePolicyEffects'], counts['absoluteEquities'])):
        raise ValueError('Comparison families changed')
    return {'schema': 1, 'id': PREFIX, 'signature': plan['signature'], 'complete': True,
            'recordedAt': datetime.now(timezone.utc).isoformat(), 'records': len(records),
            'totalTrials': sum(r['value']['samples'] for r in records), 'trialsPerMovePolicy': plan['trials'],
            'method': plan['method'], 'comparisons': counts, 'equityTolerance': tolerance,
            'nativeBinaries': plan['runtime']['binaries'], 'rows': rows, 'effects': effects,
            'candidateEffects': candidate_effects,
            'limits': 'Selected seven-position cohort. Confidence intervals describe sampling under the executed policies, not model error. Absolute intervals center on printed XG point estimates; the retained XG margins are not a joint simultaneous reference interval. No historical samples are pooled.'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--validate-plan', action='store_true')
    parser.add_argument('--out', type=Path, default=FAMILY / 'test-results' / PREFIX)
    args = parser.parse_args()
    plan, input_bytes = execution.validate_plan()
    if args.validate_plan:
        print('Frozen source, runtime, complete candidate set and independent seed plan verified')
        return
    if json.loads((args.out / 'inputs.json').read_bytes()) != plan:
        raise ValueError('Changed run inputs')
    complete = json.loads((args.out / 'complete.json').read_bytes())
    raw = (args.out / 'batches.jsonl').read_bytes()
    if not raw.endswith(b'\n'):
        raise ValueError('Partial checkpoint')
    records = [json.loads(line) for line in raw.splitlines()]
    execution.validate_execution(complete, plan, raw, records)
    execution_bytes = (json.dumps(complete, indent=2) + '\n').encode()
    result = summarize(plan, records)
    result.update({'inputsSHA256': execution.HASH(input_bytes), 'rawSHA256': execution.HASH(raw),
                   'executionSHA256': execution.HASH(execution_bytes),
                   'executionUrl': 'https://github.com/mathewseng/mathewseng.github.io/actions/runs/' + complete['runId']})
    encoded = (json.dumps(result, indent=2, allow_nan=False) + '\n').encode()
    (FAMILY / f'docs/{PREFIX}-comparison.json').write_bytes(encoded)
    (FAMILY / f'data/{PREFIX}-comparison.json').write_bytes(encoded)
    (FAMILY / f'docs/{PREFIX}-batches.jsonl.gz').write_bytes(gzip.compress(raw, mtime=0))
    (FAMILY / f'docs/{PREFIX}-execution.json').write_bytes(execution_bytes)
    print('Complete fixed-sample summary written: 7 positions, 28 candidate/policy cells, 458,752 trials')


if __name__ == '__main__':
    main()
