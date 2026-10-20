#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Package-free analysis of fixed, independent paired rollout confirmations."""
import argparse
import functools
import gzip
import hashlib
import json
import math
import os
import subprocess
from pathlib import Path
from datetime import datetime, timezone

FAMILY = Path(__file__).resolve().parents[1]

def student_cdf(x, df):
    """Student-t CDF using composite Simpson quadrature on the positive half."""
    if df < 1 or not math.isfinite(x):
        raise ValueError('Invalid t argument')
    if x < 0:
        return 1 - student_cdf(-x, df)
    n = 4096
    h = x / n
    norm = math.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / math.sqrt(df * math.pi)
    def density(v):
        return norm * math.exp(-(df + 1) / 2 * math.log1p(v * v / df))
    integral = h / 3 * (density(0) + density(x) + math.fsum((4 if i % 2 else 2) * density(i * h) for i in range(1, n)))
    return .5 + integral

@functools.lru_cache(None)
def critical(df, alpha=.05):
    if df < 1 or not 0 < alpha < 1:
        raise ValueError('Invalid confidence level')
    target = 1 - alpha / 2
    lo, hi = 0., 1.
    while student_cdf(hi, df) < target:
        hi *= 2
    for _ in range(45):
        mid = (lo + hi) / 2
        if student_cdf(mid, df) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2

def contrast(a, b, comparisons=24):
    if len(a) != len(b) or len(a) < 2:
        raise ValueError('Need at least two equal paired batches')
    for x, y in zip(a, b):
        if any(x[k] != y[k] for k in ('batch', 'seed')) or x['value']['samples'] != y['value']['samples']:
            raise ValueError('Unpaired batches')
    differences = [x['value']['equity'] - y['value']['equity'] for x, y in zip(a, b)]
    n = len(differences)
    mean = math.fsum(differences) / n
    se = math.sqrt(math.fsum((x - mean) ** 2 for x in differences) / (n * (n - 1)))
    def interval(alpha):
        t = critical(n - 1, alpha)
        half = t * se
        return {'halfWidth': half, 'lower': mean - half, 'upper': mean + half, 'criticalValue': t}
    ordinary, familywise = interval(.05), interval(.05 / comparisons)
    classification = 'persistent' if familywise['lower'] > 0 else 'reversed' if familywise['upper'] < 0 else 'unresolved'
    return {'difference': mean, 'standardError': se, 'batches': n, 'interval95': ordinary,
            'familywise95': familywise, 'classification': classification}

def estimate(records):
    values = [r['value'] for r in records]
    n = sum(v['samples'] for v in values)
    mean = math.fsum(v['equity'] * v['samples'] for v in values) / n
    m2 = math.fsum(v['standardError'] ** 2 * v['samples'] * (v['samples'] - 1) + v['samples'] * (v['equity'] - mean) ** 2 for v in values)
    return {'samples': n, 'equity': mean, 'standardError': math.sqrt(m2 / (n * (n - 1))),
            'cubeless': math.fsum(v['cubeless'] * v['samples'] for v in values) / n,
            'probabilities': [math.fsum(v['probabilities'][i] * v['samples'] for v in values) / n for i in range(5)]}

def summarize(inputs, records, partial=False):
    plan = {d['id']: d for d in inputs['plan']}
    count = inputs['trials'] // inputs['batchSize']
    lookup = {}
    for r in records:
        d = plan.get(r['id'])
        c = next((c for c in d['candidates'] if c['board'] == r['board']), None) if d else None
        v = r['value']
        key = '|'.join((r['id'], str(r['batch']), r['board']))
        if not c or r['role'] != c['role'] or r['key'] != key or key in lookup or not isinstance(r['batch'], int) or not 0 <= r['batch'] < count:
            raise ValueError('Invalid or duplicate record identity')
        if r['seed'] != (d['seedBase'] + r['batch'] * 65536) % 2 ** 32 or v['samples'] != inputs['batchSize']:
            raise ValueError('Wrong seed or sample count')
        if any(v[k] != inputs['policy'][k] for k in ('checkerPlies', 'cubePlies', 'truncationPlies', 'lateAfterPlies', 'lateCheckerPlies', 'lateCubePlies')):
            raise ValueError('Policy mismatch')
        if not all(math.isfinite(x) for x in [v['equity'], v['cubeless'], v['standardError'], *v['probabilities']]) or v['standardError'] < 0 or len(v['probabilities']) != 5:
            raise ValueError('Invalid statistics')
        lookup[key] = r
    rows = []
    complete = True
    for d in inputs['plan']:
        batches = []
        for c in d['candidates']:
            items = []
            for batch in range(count):
                r = lookup.get('|'.join((d['id'], str(batch), c['board'])))
                if r is None:
                    break
                items.append(r)
            batches.append(items)
        n = min(map(len, batches))
        if n != count:
            complete = False
            if not partial:
                raise ValueError('Incomplete fixed sample: ' + d['id'])
        if n < 2:
            continue
        batches = [b[:n] for b in batches]
        a, b = d['candidates']
        if a['role'] != 'previous-choice' or b['role'] != 'xg-choice':
            raise ValueError('Contrast direction changed')
        gap = contrast(*batches, comparisons=len(plan))
        xg_gap = b['reference']['xgEquity'] - a['reference']['xgEquity']
        halves = [c['reference'].get('confidenceHalfWidth') for c in (a, b)]
        reference_span = sum(halves) if all(isinstance(x, (int, float)) for x in halves) else None
        rows.append({'id': d['id'], 'kind': d['kind'], 'roll': d['roll'], 'source': d['source'],
            'previousMove': a['notation'], 'xgMove': d['referenceBest']['move'], 'previousGap': d['previousGap'],
            'gap': gap, 'estimates': [dict(role=c['role'], board=c['board'], move=c['notation'], **estimate(r)) for c, r in zip((a, b), batches)],
            'treeGaps': {label: a[field]['equity'] - b[field]['equity'] for label, field in [('3', 'historical'), ('4', 'fourPly'), ('5', 'fivePly')]},
            'reference': {'preferredGap': xg_gap, 'marginalHalfWidthSum': reference_span,
                'marginalIntervalsSeparate': reference_span is not None and xg_gap > reference_span,
                'note': 'Sum of reported marginal half-widths, not a paired XG confidence interval or a familywise bound; shared-dice covariance is unavailable.',
                'candidates': [a['reference'], b['reference']], 'preferredMethod': d['referenceBest']['method'], 'preferredPolicy': d['referenceBest'].get('policy'), 'preferredTrials': d['referenceBest'].get('trials')}})
    classifications = {key: sum(r['gap']['classification'] == key for r in rows) for key in ('persistent', 'reversed', 'unresolved')}
    return {'schema': 1, 'signature': inputs['signature'], 'complete': complete, 'recordedAt': datetime.now(timezone.utc).isoformat(),
        'engine': 'gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg7-native', 'trialsPerMove': inputs['trials'],
        'coverage': {'positions': len(plan), 'candidates': len(plan) * 2, 'records': len(records), 'classified': len(rows)},
        'method': inputs['method'], 'classifications': classifications, 'rows': rows,
        'limitations': ['Independent confirmation of 24 previously selected pairs, not a general-strength benchmark or a full reranking of all legal moves.',
            'Familywise intervals use paired batch means and a Bonferroni correction over 24 fixed contrasts; their coverage relies on the usual Student-t approximation.',
            'Persistent means the previous choice remains preferred within this fixed GNUbg pipeline, beyond estimated sampling noise. It does not prove XG is correct or isolate a neural-network defect.',
            'Truncation, checker/cube policies, move filters, neural evaluation, cube modeling and reference error can all contribute. XG enables beavers; our rollouts do not.',
            'XG marginal intervals cannot recover the paired uncertainty of its move gap. The published opening book remains unchanged by this two-move diagnostic.']}

def validate_provenance(input_bytes, inputs):
    # JSON.stringify is the original signature encoding (Python float rendering differs).
    signed = subprocess.check_output([os.getenv('NODE', 'node'), '-e',
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const {signature,...v}=JSON.parse(s);process.stdout.write(require('crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex'));});"], input=input_bytes).decode()
    source_bytes = (FAMILY / 'docs/rollout-policy-comparison.json').read_bytes()
    source = json.loads(source_bytes)
    if signed != inputs['signature'] or hashlib.sha256(source_bytes).hexdigest() != inputs['sourceSHA256'] or source['signature'] != inputs['sourceSignature']:
        raise ValueError('Provenance signature mismatch')
    expected = {r['id']: (r['policies']['short-deep']['bestBoard'], r['referenceBest']['board'])
                for r in source['rows'] if not r['policies']['short-deep']['agrees']}
    if len(inputs['plan']) != 24 or len(expected) != 24 or inputs['trials'] != 4096 or inputs['batchSize'] != 32:
        raise ValueError('Fixed confirmation plan changed')
    previous = json.loads((FAMILY / 'docs/rollout-policy-inputs.json').read_bytes())
    if inputs['build'] != previous['build'] or inputs['policy'] != next(p for p in previous['policies'] if p['id'] == 'short-deep'):
        raise ValueError('Engine or policy changed')
    old = [json.loads(line) for line in gzip.decompress((FAMILY / 'docs/rollout-policy-batches.jsonl.gz').read_bytes()).splitlines()]
    used = {(r['seed'] + i * 256) % 2 ** 32 for r in old for i in range(r['value']['samples'])}
    seen = set()
    previous_plan = {d['id']: d for d in previous['plan']}
    for d in inputs['plan']:
        if d['id'] in seen or tuple(c['board'] for c in d['candidates']) != expected.get(d['id']):
            raise ValueError('Fixed pair changed')
        seen.add(d['id'])
        original = previous_plan[d['id']]
        for field in ('board', 'roll', 'kind', 'source', 'referenceBest'):
            if d[field] != original[field]:
                raise ValueError('Original position or reference changed')
        for c in d['candidates']:
            prior = next(v for v in original['candidates'] if v['board'] == c['board'])
            if {k: v for k, v in c.items() if k != 'role'} != prior:
                raise ValueError('Candidate data changed')
        seed = int(hashlib.sha256(f"rollout-diagnostic-v1:{d['id']}:{d['seedNonce']}".encode()).hexdigest()[:8], 16)
        seeds = {(seed + (i // 32) * 65536 + (i % 32) * 256) % 2 ** 32 for i in range(4096)}
        if seed != d['seedBase'] or len(seeds) != 4096 or seeds & used:
            raise ValueError('Reused or changed trial seeds')
        used.update(seeds)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--partial', action='store_true')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    if args.partial and args.publish:
        raise ValueError('Never publish partial results')
    out = Path(os.getenv('BG_DIAGNOSTIC_OUT', FAMILY / 'test-results/rollout-diagnostic-v1'))
    input_bytes = (out / 'inputs.json').read_bytes()
    inputs = json.loads(input_bytes)
    validate_provenance(input_bytes, inputs)
    raw = (out / 'batches.jsonl').read_bytes()
    lines = raw[:raw.rfind(b'\n') + 1].splitlines()
    report = summarize(inputs, [json.loads(line) for line in lines], args.partial)
    report['inputSHA256'] = hashlib.sha256(input_bytes).hexdigest()
    report['rawSHA256'] = hashlib.sha256(raw).hexdigest()
    report['build'] = inputs['build']
    report['sourceSHA256'] = inputs['sourceSHA256']
    def save(file, content):
        temp = file.with_name(file.name + '.tmp')
        temp.write_bytes(content)
        temp.replace(file)
    encoded = (json.dumps(report, indent=2, allow_nan=False) + '\n').encode()
    save(out / ('partial-comparison.json' if args.partial else 'comparison.json'), encoded)
    if args.publish:
        completion = json.loads((out / 'complete.json').read_text())
        if not report['complete'] or len(lines) != 6144 or inputs['trials'] != 4096 or completion['signature'] != inputs['signature'] or completion['records'] != len(lines) or not raw.endswith(b'\n'):
            raise ValueError('Incomplete fixed confirmation')
        save(FAMILY / 'docs/rollout-diagnostic-inputs.json', input_bytes)
        save(FAMILY / 'docs/rollout-diagnostic-batches.jsonl.gz', gzip.compress(raw, compresslevel=9, mtime=0))
        save(FAMILY / 'docs/rollout-diagnostic-comparison.json', encoded)
        compact = {**report, 'rows': [{**r, 'estimates': None} for r in report['rows']]}
        save(FAMILY / 'data/rollout-diagnostic-comparison.json', (json.dumps(compact, separators=(',', ':'), allow_nan=False) + '\n').encode())
    print(json.dumps({'complete': report['complete'], 'coverage': report['coverage'], 'classifications': report['classifications'],
                      'opening21': next((r['gap'] for r in report['rows'] if r['kind'] == 'opening'), None)}, indent=2))

if __name__ == '__main__':
    main()
