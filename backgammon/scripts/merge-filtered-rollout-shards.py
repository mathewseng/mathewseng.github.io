#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Reject incomplete or changed executions before exposing study estimates."""
import argparse
import hashlib
import json
import math
import os
import subprocess
from pathlib import Path

FAMILY = Path(__file__).resolve().parents[1]
PREFIX = 'filtered-rollout-v1'
HASH = lambda b: hashlib.sha256(b).hexdigest()
FIELDS = ['checkerPlies', 'cubePlies', 'truncationPlies', 'lateAfterPlies', 'lateCheckerPlies',
          'lateCubePlies', 'rulesMode', 'filter', 'vrPlies', 'cacheContext']


def validate_plan():
    raw = (FAMILY / f'docs/{PREFIX}-inputs.json').read_bytes()
    plan = json.loads(raw)
    if not plan['collectionEnabled'] or not plan['runtime']:
        raise ValueError('Final runtime has not been frozen')
    regenerated = json.loads(subprocess.check_output([
        os.getenv('NODE', 'node'), str(FAMILY / 'scripts/filtered-rollout-plan.mjs'),
        str(FAMILY / f'docs/{PREFIX}-runtime.json')]))
    if regenerated != plan:
        raise ValueError('Frozen plan or source changed')
    runtime = plan['runtime']
    if (runtime['platform'] != 'linux' or runtime['architecture'] != 'arm64'
            or HASH((FAMILY / runtime['bundle']).read_bytes()) != runtime['bundleSHA256']
            or HASH((FAMILY / 'engine/source' / runtime['sourceArchive']).read_bytes()) != runtime['sourceArchiveSHA256']):
        raise ValueError('Frozen runtime changed')
    return plan, raw


def expected_records(plan):
    expected = {}
    for batch in range(plan['trials'] // plan['batchSize']):
        for d in plan['plan']:
            for policy in plan['policies']:
                if d['id'] not in policy['caseIds']:
                    continue
                for candidate in d['candidates']:
                    key = '|'.join([d['id'], policy['id'], str(batch), candidate['candidateId']])
                    expected[key] = (d, policy, candidate, batch)
    if len(expected) != plan['plannedRecords']:
        raise ValueError('Invalid planned count')
    return expected


def validate_records(records, plan, shard=None):
    expected = {k: v for k, v in expected_records(plan).items()
                if shard is None or v[3] % plan['shards'] == shard}
    seen = set()
    for row in records:
        key = row['key']
        if key not in expected or key in seen:
            raise ValueError('Unexpected or duplicate record')
        seen.add(key)
        d, policy, candidate, batch = expected[key]
        identity = {'id': d['id'], 'policy': policy['id'], 'runtime': policy['runtime'],
                    'candidateId': candidate['candidateId'], 'role': candidate['role'],
                    'board': candidate['board'], 'batch': batch,
                    'seed': (d['seedBase'] + batch * 65536) % 2**32}
        if any(row.get(k) != v for k, v in identity.items()) or type(row['batch']) is not int:
            raise ValueError('Changed batch identity')
        v = row['value']
        if v['samples'] != plan['batchSize'] or any(v[k] != policy[k] for k in FIELDS):
            raise ValueError('Changed policy or sample')
        if (len(v['probabilities']) != 5 or not all(math.isfinite(x) for x in
                [v['equity'], v['cubeless'], v['standardError'], *v['probabilities']])
                or v['standardError'] < 0):
            raise ValueError('Invalid estimates')
        if (len(v['cubeActions']) != 10 or any(type(x) is not int or x < 0 for x in v['cubeActions'])
                or type(v['maxCube']) is not int or not 1 <= v['maxCube'] <= 1024
                or v['maxCube'] & (v['maxCube'] - 1)):
            raise ValueError('Invalid cube telemetry')
    if seen != set(expected):
        raise ValueError('Incomplete planned sample')


def encode_records(records):
    rows = sorted(records, key=lambda r: (r['batch'], r['id'], r['policy'], r['candidateId']))
    return ''.join(json.dumps(r, separators=(',', ':'), allow_nan=False) + '\n' for r in rows).encode()


def validate_worker(v, plan):
    fixed = {'schema': 1, 'platform': 'linux', 'architecture': 'arm64', 'cases': 12,
             'trialsPerCase': 2, 'tolerance': 1e-5, 'allWithinTolerance': True,
             'binaries': plan['runtime']['binaries'], 'fixtureSHA256': plan['runtime']['fixtureSHA256'],
             'scriptSHA256': HASH((FAMILY / 'scripts/validate-filtered-rollout-platform.py').read_bytes())}
    if (any(v.get(k) != want for k, want in fixed.items())
            or not math.isfinite(v.get('maxNumericDifference', math.inf))
            or not 0 <= v['maxNumericDifference'] <= fixed['tolerance']):
        raise ValueError('Unvalidated worker runtime')


def validate_execution(complete, plan, raw, records):
    if (complete.get('signature') != plan['signature'] or complete.get('records') != plan['plannedRecords']
            or complete.get('rawSHA256') != HASH(raw) or not str(complete.get('runId', '')).isdigit()
            or complete.get('binaries') != plan['runtime']['binaries']):
        raise ValueError('Changed or incomplete execution')
    shards = complete.get('shards', [])
    if len(shards) != 20 or {s['shard'] for s in shards} != set(range(20)):
        raise ValueError('Missing or repeated shard evidence')
    validate_records(records, plan)
    for shard in shards:
        validate_worker(shard['validation'], plan)
        rows = [r for r in records if r['batch'] % 20 == shard['shard']]
        validate_records(rows, plan, shard['shard'])
        if (shard['records'] != len(rows) or shard['recordsSHA256'] != HASH(encode_records(rows))
                or not shard.get('completedAt')):
            raise ValueError('Changed shard evidence')


def merge(artifacts, plan, run_id):
    shards, records = [], []
    for shard in range(plan['shards']):
        root = artifacts / f'{PREFIX}-shard-{shard}'
        complete = json.loads((root / 'complete.json').read_bytes())
        if (complete.get('signature') != plan['signature'] or complete.get('shard') != shard
                or complete.get('shards') != 20 or not complete.get('completedAt')):
            raise ValueError('Incomplete or changed shard')
        if json.loads((root / 'inputs.json').read_bytes()) != plan:
            raise ValueError('Inputs changed')
        validation = json.loads((root / 'platform-validation.json').read_bytes())
        validate_worker(validation, plan)
        raw = (root / 'batches.jsonl').read_bytes()
        if not raw.endswith(b'\n'):
            raise ValueError('Partial checkpoint')
        rows = [json.loads(line) for line in raw.splitlines()]
        validate_records(rows, plan, shard)
        if complete['records'] != len(rows):
            raise ValueError('Wrong shard count')
        shards.append({'shard': shard, 'records': len(rows), 'rawSHA256': HASH(raw),
                       'recordsSHA256': HASH(encode_records(rows)), 'validation': validation,
                       'completedAt': complete['completedAt']})
        records += rows
    raw = encode_records(records)
    complete = {'signature': plan['signature'], 'records': len(records), 'runId': str(run_id),
                'binaries': plan['runtime']['binaries'], 'shards': shards, 'rawSHA256': HASH(raw)}
    validate_execution(complete, plan, raw, records)
    return raw, complete


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('artifacts', type=Path)
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--out', type=Path, default=FAMILY / 'test-results' / PREFIX)
    args = parser.parse_args()
    plan, input_bytes = validate_plan()
    raw, complete = merge(args.artifacts, plan, args.run_id)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'inputs.json').write_bytes(input_bytes)
    (args.out / 'batches.jsonl').write_bytes(raw)
    (args.out / 'complete.json').write_text(json.dumps(complete, indent=2) + '\n')
    print('All 20 shards complete: 14,336 unique records, 458,752 trials; ready for fixed-sample analysis')


if __name__ == '__main__':
    main()
