#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Require every fixed shard before exposing the combined sample to analysis."""
import argparse
import hashlib
import json
import math
from pathlib import Path

FAMILY = Path(__file__).resolve().parents[1]
HASH = lambda b: hashlib.sha256(b).hexdigest()


def encode_records(records):
    ordered = sorted(records, key=lambda r: (r['batch'], r['policy'], r['role']))
    return ''.join(json.dumps(r, separators=(',', ':'), allow_nan=False) + '\n' for r in ordered).encode()


def validate_worker(validation, plan):
    reference = json.loads((FAMILY / 'docs/cube-policy-v2-linux-validation.json').read_bytes())
    fixed = ['schema', 'binarySHA256', 'platform', 'architecture', 'cases', 'legacyCases',
             'policyCases', 'trialsPerCase', 'tolerance', 'fixtureSHA256', 'scriptSHA256']
    if (any(validation.get(k) != reference[k] for k in fixed)
            or validation['binarySHA256'] != plan['build']['binarySHA256']
            or validation.get('allWithinTolerance') is not True
            or not math.isfinite(validation.get('maxNumericDifference', math.inf))
            or not 0 <= validation['maxNumericDifference'] <= reference['tolerance']):
        raise ValueError('Unvalidated worker')


def validate_execution(complete, plan, raw, records):
    if (complete.get('signature') != plan['signature'] or complete.get('records') != 5120
            or complete.get('rawSHA256') != HASH(raw)
            or not str(complete.get('runId', '')).isdigit()):
        raise ValueError('Changed or incomplete execution')
    shards = complete.get('shards', [])
    if len(shards) != plan['shards'] or {s['shard'] for s in shards} != set(range(plan['shards'])):
        raise ValueError('Missing or repeated shard evidence')
    for shard in shards:
        validate_worker(shard['validation'], plan)
        rows = [r for r in records if r['batch'] % plan['shards'] == shard['shard']]
        expected = sum(b % plan['shards'] == shard['shard'] for b in range(plan['trials'] // plan['batchSize'])) * len(plan['policies']) * 2
        if (len(rows) != expected or shard['records'] != expected
                or shard['recordsSHA256'] != HASH(encode_records(rows))
                or not shard.get('completedAt')):
            raise ValueError('Changed shard records')


def merge(artifacts, plan, run_id):
    shards, records = [], []
    for shard in range(plan['shards']):
        root = artifacts / f'cube-policy-v2-shard-{shard}'
        complete = json.loads((root / 'complete.json').read_bytes())
        if complete['signature'] != plan['signature'] or complete['shard'] != shard or complete['shards'] != plan['shards']:
            raise ValueError('Incomplete or changed shard')
        if json.loads((root / 'inputs.json').read_bytes()) != plan:
            raise ValueError('Inputs changed')
        validation = json.loads((root / 'platform-validation.json').read_bytes())
        validate_worker(validation, plan)
        raw = (root / 'batches.jsonl').read_bytes()
        if not raw.endswith(b'\n'):
            raise ValueError('Partial checkpoint')
        rows = [json.loads(line) for line in raw.splitlines()]
        expected = sum(b % plan['shards'] == shard for b in range(plan['trials'] // plan['batchSize'])) * len(plan['policies']) * 2
        if len(rows) != expected or complete['records'] != expected or any(r['batch'] % plan['shards'] != shard for r in rows):
            raise ValueError('Wrong shard batch count')
        shards.append({'shard': shard, 'records': len(rows), 'rawSHA256': HASH(raw),
                       'recordsSHA256': HASH(encode_records(rows)), 'validation': validation,
                       'completedAt': complete['completedAt']})
        records += rows
    if len(records) != 5120 or len({r['key'] for r in records}) != 5120:
        raise ValueError('Missing or duplicated experiment records')
    raw = encode_records(records)
    complete = {'signature': plan['signature'], 'records': len(records), 'runId': str(run_id),
                'shards': shards, 'rawSHA256': HASH(raw)}
    validate_execution(complete, plan, raw, records)
    return raw, complete


def main():
    p = argparse.ArgumentParser()
    p.add_argument('artifacts', type=Path)
    p.add_argument('--run-id', required=True)
    p.add_argument('--out', type=Path, default=FAMILY / 'test-results/cube-policy-study-v2')
    args = p.parse_args()
    plan = json.loads((FAMILY / 'docs/cube-policy-study-v2-inputs.json').read_bytes())
    raw, complete = merge(args.artifacts, plan, args.run_id)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'inputs.json').write_text(json.dumps(plan, indent=2) + '\n')
    (args.out / 'batches.jsonl').write_bytes(raw)
    (args.out / 'complete.json').write_text(json.dumps(complete, indent=2) + '\n')
    print('All 20 shards complete: 5,120 unique batches, 163,840 trials; ready for fixed-sample validation')


if __name__ == '__main__':
    main()
