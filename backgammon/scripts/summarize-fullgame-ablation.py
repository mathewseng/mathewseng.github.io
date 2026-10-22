#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Paired, one-factor-at-a-time continuation-policy and cutoff comparisons."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import math
import os
import subprocess
import tarfile
from pathlib import Path
from datetime import datetime, timezone
FAMILY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('diagnostic', Path(__file__).with_name('summarize-rollout-diagnostic.py'))
stats = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stats)
POLICIES = {
    'short': [2, 2, 5, 2, 1, 2, 2],
    'full-matched': [2, 2, 0, 2, 1, 2, 2],
    'full-strong': [2, 2, 0, 0, 2, 2, 2],
    'full-cube3': [2, 3, 0, 0, 2, 3, 2],
}
FIELDS = ['checkerPlies', 'cubePlies', 'truncationPlies', 'lateAfterPlies', 'lateCheckerPlies', 'lateCubePlies', 'endpointPlies']
EFFECTS = {'cutoff': ('short', 'full-matched'), 'checker': ('full-matched', 'full-strong'), 'cube': ('full-strong', 'full-cube3')}

def difference_records(a, b):
    """Preserve the pairing when forming each batch's move gap."""
    if len(a) != len(b):
        raise ValueError('Unpaired difference')
    out = []
    for x, y in zip(a, b):
        if any(x[k] != y[k] for k in ('batch', 'seed')) or x['value']['samples'] != y['value']['samples']:
            raise ValueError('Unpaired difference')
        out.append({**x, 'value': {**x['value'], 'equity': x['value']['equity'] - y['value']['equity']}})
    return out

def cohort_effect(position_blocks, comparisons=3):
    """Equal position weights; preserve complete blocks before estimating uncertainty."""
    if not position_blocks or len(position_blocks[0]) < 2:
        raise ValueError('Incomplete cohort blocks')
    n = len(position_blocks[0])
    if any(len(rows) != n or [r['batch'] for r in rows] != list(range(n)) for rows in position_blocks):
        raise ValueError('Unaligned cohort blocks')
    means = [{'batch': i, 'seed': i, 'value': {'samples': 1,
              'equity': math.fsum(rows[i]['value']['equity'] for rows in position_blocks) / len(position_blocks)}} for i in range(n)]
    zero = [{**r, 'value': {**r['value'], 'equity': 0}} for r in means]
    effect = stats.contrast(means, zero, comparisons=comparisons)
    effect['direction'] = 'toward-XG' if effect['familywise95']['upper'] < 0 else 'away-from-XG' if effect['familywise95']['lower'] > 0 else 'unresolved'
    del effect['classification']
    return {'positions': len(position_blocks), 'comparisons': comparisons, **effect}

def summarize(inputs, records):
    plan = {d['id']: d for d in inputs['plan']}
    n = inputs['trials'] // inputs['batchSize']
    policies = {p['id']: p for p in inputs['policies']}
    lookup = {}
    for r in records:
        d, policy = plan.get(r['id']), policies.get(r['policy'])
        candidate = next((c for c in d['candidates'] if c['board'] == r['board']), None) if d else None
        v = r['value']
        key = '|'.join((r['id'], r['policy'], str(r['batch']), r['board']))
        if not policy or not candidate or candidate['role'] != r['role'] or r['key'] != key or key in lookup:
            raise ValueError('Invalid or duplicate batch identity')
        if candidate['role'] == 'other-retained' and r['policy'] != 'full-strong':
            raise ValueError('Unplanned candidate')
        if type(r['batch']) is not int or not 0 <= r['batch'] < n or r['seed'] != (d['seedBase'] + r['batch'] * 65536) % 2**32 or v['samples'] != inputs['batchSize']:
            raise ValueError('Wrong trial seed or sample count')
        if any(v[k] != policy[k] for k in FIELDS[:-1]):
            raise ValueError('Policy mismatch')
        if len(v['probabilities']) != 5 or not all(math.isfinite(x) for x in [v['equity'], v['cubeless'], v['standardError'], *v['probabilities']]) or v['standardError'] < 0:
            raise ValueError('Invalid native statistics')
        lookup[key] = r
    rows = []
    effect_blocks = {name: [] for name in EFFECTS}
    for d in inputs['plan']:
        paired, by_policy = {}, {}
        for policy_id in policies:
            candidates, lists = [], []
            for c in d['candidates']:
                if c['role'] == 'other-retained' and policy_id != 'full-strong':
                    continue
                batches = [lookup.get('|'.join((d['id'], policy_id, str(i), c['board']))) for i in range(n)]
                if None in batches:
                    raise ValueError('Incomplete fixed experiment')
                lists.append(batches)
                candidates.append({'board': c['board'], 'move': c['notation'], 'role': c['role'], **({'referenceEquity': c['reference']['xgEquity']} if inputs.get('retainedComparisons') else {}), **stats.estimate(batches)})
            paired[policy_id] = difference_records(lists[0], lists[1])
            gap = stats.contrast(lists[0], lists[1], comparisons=inputs.get('gapComparisons',60))
            best = max(candidates, key=lambda c: c['equity'])
            retained = []
            if policy_id == 'full-strong' and inputs.get('retainedComparisons'):
                reference_index = next(i for i,c in enumerate(candidates) if c['board'] == d['referenceBest']['board'])
                for i,c in enumerate(candidates):
                    if i == reference_index:
                        continue
                    contrast = stats.contrast(lists[reference_index], lists[i], comparisons=inputs['retainedComparisons'])
                    contrast['direction'] = 'XG-ahead' if contrast['familywise95']['lower'] > 0 else 'alternative-ahead' if contrast['familywise95']['upper'] < 0 else 'unresolved'
                    del contrast['classification']
                    retained.append({'board': c['board'], 'move': c['move'], **contrast})
            by_policy[policy_id] = {**({'retainedReferenceGaps': retained} if retained else {}), 'gap': gap, 'candidates': candidates, 'bestBoard': best['board'], 'bestMove': best['move'], 'agrees': best['board'] == d['referenceBest']['board']}
        effects = {}
        for name, (before, after) in EFFECTS.items():
            if before not in policies or after not in policies:
                continue
            effect_blocks[name].append(difference_records(paired[after], paired[before]))
            effect = stats.contrast(paired[after], paired[before], comparisons=inputs.get('effectComparisons',45))
            effect['direction'] = 'toward-XG' if effect['familywise95']['upper'] < 0 else 'away-from-XG' if effect['familywise95']['lower'] > 0 else 'unresolved'
            del effect['classification']
            effects[name] = {'before': before, 'after': after, **effect}
        rows.append({'id': d['id'], 'kind': d['kind'], 'roll': d['roll'], 'source': d['source'],
                     'previousMove': d['candidates'][0]['notation'], 'xgMove': d['candidates'][1]['notation'],
                     'referenceGap': d['candidates'][0]['reference']['xgEquity'] - d['candidates'][1]['reference']['xgEquity'],
                     'policies': by_policy, 'effects': effects})
    summaries = {p: {'positions': len(rows), 'meanGap': math.fsum(r['policies'][p]['gap']['difference'] for r in rows) / len(rows),
                     'meanAbsoluteGapError': math.fsum(abs(r['policies'][p]['gap']['difference'] - r['referenceGap']) for r in rows) / len(rows),
                     'pairMeanFavorsXG': sum(r['policies'][p]['gap']['difference'] < 0 for r in rows),
                     'classifications': {label: sum(r['policies'][p]['gap']['classification'] == label for r in rows) for label in ('persistent', 'reversed', 'unresolved')}} for p in policies}
    effects_summary = {name: {'meanShift': math.fsum(r['effects'][name]['difference'] for r in rows) / len(rows),
                             **{label: sum(r['effects'][name]['direction'] == label for r in rows) for label in ('toward-XG', 'away-from-XG', 'unresolved')}} for name,(before,after) in EFFECTS.items() if before in policies and after in policies}
    cohort = {name: cohort_effect(blocks, inputs.get('cohortComparisons', 3)) for name, blocks in effect_blocks.items() if blocks} if len(rows) == 15 else None
    return {'schema': 1, **({'cohortEffects': cohort} if cohort else {}), 'signature': inputs['signature'], 'complete': True, 'recordedAt': datetime.now(timezone.utc).isoformat(),
            'trialsPerMovePolicy': inputs['trials'], 'effectComparisons': inputs.get('effectComparisons',45), 'gapComparisons': inputs.get('gapComparisons',60), 'records': len(records), 'totalTrials': sum(r['value']['samples'] for r in records),
            'method': inputs['method'], 'policies': inputs['policies'], 'summaries': summaries, 'effectSummary': effects_summary, 'rows': rows}

def verify_historical_source(relative, digest):
    """Validate the recorded bytes, even after the current builder evolves."""
    current = FAMILY / relative
    if current.exists() and hashlib.sha256(current.read_bytes()).hexdigest() == digest:
        return
    snapshot = FAMILY / 'engine/source/fullgame-native-v1-inputs.tar.gz'
    with tarfile.open(snapshot) as archive:
        try:
            data = archive.extractfile(relative).read()
        except KeyError:
            raise ValueError('Missing historical build input: ' + relative) from None
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Historical build source mismatch: ' + relative)


def validate_provenance(input_bytes, inputs):
    node = os.getenv('NODE', 'node')
    script = "const fs=require('fs'),c=require('crypto'),{signature,...v}=JSON.parse(fs.readFileSync(0));process.stdout.write(c.createHash('sha256').update(JSON.stringify(v)).digest('hex'));"
    signed = subprocess.check_output([node, '-e', script], input=input_bytes).decode()
    source_bytes = (FAMILY / 'docs/rollout-diagnostic-comparison.json').read_bytes()
    source = json.loads(source_bytes)
    if signed != inputs['signature'] or hashlib.sha256(source_bytes).hexdigest() != inputs['sourceSHA256'] or source['signature'] != inputs['sourceSignature']:
        raise ValueError('Provenance signature mismatch')
    opening = 'parentSignature' in inputs
    precision_opening = 'precisionOf' in inputs
    precision_cohort = 'replicationOf' in inputs
    precision = precision_opening or precision_cohort
    expected_trials = 32768 if precision_opening else 4096 if opening or precision_cohort else 1024
    expected = {r['id'] for r in source['rows'] if r['gap']['classification'] == 'persistent' and (not opening or r['kind']=='opening')}
    if len(inputs['plan']) != (1 if opening else 15) or {d['id'] for d in inputs['plan']} != expected or inputs['trials'] != expected_trials or inputs['batchSize'] != 32:
        raise ValueError('Fixed experiment changed')
    expected_policies = {k:v for k,v in POLICIES.items() if not (opening or precision) or k!='full-cube3'}
    if inputs.get('effectComparisons',45)!=(2 if opening else 30 if precision_cohort else 45) or inputs.get('gapComparisons',60)!=(3 if opening else 45 if precision_cohort else 60):
        raise ValueError('Confidence families changed')
    if inputs.get('cohortComparisons',3) != (2 if precision_cohort else 3) or inputs.get('retainedComparisons',0) != (3 if precision_opening else 0):
        raise ValueError('Additional confidence families changed')
    if {p['id']: [p[k] for k in FIELDS] for p in inputs['policies']} != expected_policies or len(inputs['policies']) != len(expected_policies):
        raise ValueError('Ablation changed')
    build = inputs['build']
    archive = FAMILY / 'engine/source' / build['archive']
    if hashlib.sha256(archive.read_bytes()).hexdigest() != build['archiveSHA256']:
        raise ValueError('Pinned source archive mismatch')
    runtime = json.loads((FAMILY / 'docs/fullgame-runtime-validation.json').read_bytes())
    with tarfile.open(archive) as source_archive:
        expected_assets = {m.name: hashlib.sha256(source_archive.extractfile(m).read()).hexdigest()
                           for m in source_archive.getmembers() if m.isfile() and m.name.startswith('data/')}
    if not runtime['allAssetsMatchArchive'] or runtime['assets'] != expected_assets or runtime['archiveSHA256'] != build['archiveSHA256'] or runtime['binarySHA256'] != build['binarySHA256'] or runtime['hosts'] != ['local', 'mattgpt']:
        raise ValueError('Runtime weights/database provenance mismatch')
    for f, field in [('rollout-ablation.patch', 'ablationPatchSHA256')]:
        verify_historical_source('scripts/' + f, build[field])
    for f, digest in build['inputs'].items():
        verify_historical_source('scripts/' + f, digest)
    verify_historical_source('engine/source/bridge.c', build['bridgeSHA256'])
    previous = json.loads((FAMILY / 'docs/rollout-policy-inputs.json').read_bytes())
    pairs = json.loads((FAMILY / 'docs/rollout-diagnostic-inputs.json').read_bytes())
    used = set()
    for prefix in ('rollout-policy', 'rollout-diagnostic'):
        old = [json.loads(line) for line in gzip.decompress((FAMILY / f'docs/{prefix}-batches.jsonl.gz').read_bytes()).splitlines()]
        used.update((r['seed'] + i * 256) % 2**32 for r in old for i in range(r['value']['samples']))
    used.update((seed + 256*i) % 2**32 for seed in (123456789, 987654321) for i in range(2))
    priors = []
    if opening or precision_cohort:
        priors.append(('fullgame-ablation', 'parentSignature' if opening else 'replicationOf'))
    if precision:
        priors.append(('opening-fullgame-confirmation', 'precisionOf' if precision_opening else 'priorOpeningSignature'))
    if precision_opening:
        priors.append(('fullgame-precision', 'cohortPrecisionSignature'))
    for prefix, field in priors:
        parent_bytes = (FAMILY / f'docs/{prefix}-inputs.json').read_bytes()
        parent = json.loads(parent_bytes)
        validate_provenance(parent_bytes, parent)
        if parent['signature'] != inputs[field] or parent['build'] != build:
            raise ValueError('Parent experiment changed')
        used.update((d['seedBase'] + (i//32)*65536 + (i%32)*256) % 2**32 for d in parent['plan'] for i in range(parent['trials']))
    prefix = 'opening-fullgame-precision' if precision_opening else 'fullgame-precision' if precision_cohort else 'opening-fullgame-confirmation' if opening else 'fullgame-ablation'
    for d in inputs['plan']:
        original = next(p for p in previous['plan'] if p['id'] == d['id'])
        pair = next(p for p in pairs['plan'] if p['id'] == d['id'])
        expected_candidates = pair['candidates'] + [{**c, 'role': 'other-retained'} for c in original['candidates'] if c['board'] not in {v['board'] for v in pair['candidates']}]
        if d['candidates'] != expected_candidates or any(d[k] != original[k] for k in ('board', 'roll', 'kind', 'source', 'referenceBest')):
            raise ValueError('Fixed candidate/position changed')
        seed = int(hashlib.sha256(f"{prefix}-v1:{d['id']}:{d['seedNonce']}".encode()).hexdigest()[:8], 16)
        seeds = {(seed + (i//32)*65536 + (i%32)*256) % 2**32 for i in range(inputs['trials'])}
        if seed != d['seedBase'] or len(seeds) != inputs['trials'] or seeds & used:
            raise ValueError('Reused or changed trial seeds')
        used.update(seeds)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--opening-confirmation', action='store_true')
    mode.add_argument('--precision', action='store_true')
    mode.add_argument('--opening-precision', action='store_true')
    args = parser.parse_args()
    prefix='opening-fullgame-precision' if args.opening_precision else 'fullgame-precision' if args.precision else 'opening-fullgame-confirmation' if args.opening_confirmation else 'fullgame-ablation'
    out = Path(os.getenv('BG_ABLATION_OUT', FAMILY / f'test-results/{prefix}-v1'))
    input_bytes, raw = (out/'inputs.json').read_bytes(), (out/'batches.jsonl').read_bytes()
    inputs = json.loads(input_bytes)
    validate_provenance(input_bytes, inputs)
    if (args.opening_confirmation or args.opening_precision) != ('parentSignature' in inputs) or args.opening_precision != ('precisionOf' in inputs) or args.precision != ('replicationOf' in inputs):
        raise ValueError('Wrong experiment mode')
    records = [json.loads(line) for line in raw.splitlines()]
    report = summarize(inputs, records)
    completion = json.loads((out/'complete.json').read_bytes())
    if not raw.endswith(b'\n') or completion['signature'] != inputs['signature'] or completion['records'] != len(records) or len(records) != (8192 if args.opening_precision else 13440 if args.precision else 1024 if args.opening_confirmation else 4320):
        raise ValueError('Incomplete fixed experiment')
    report.update(inputSHA256=hashlib.sha256(input_bytes).hexdigest(), rawSHA256=hashlib.sha256(raw).hexdigest(), build=inputs['build'], sourceSHA256=inputs['sourceSHA256'])
    if prefix == 'fullgame-ablation':
        secondary_bytes = (FAMILY / 'docs/fullgame-cohort-analysis-plan.json').read_bytes()
        secondary = json.loads(secondary_bytes)
        if secondary['experimentSignature'] != inputs['signature'] or secondary['comparisons'] != 3 or secondary['positions'] != 15:
            raise ValueError('Secondary cohort plan mismatch')
        report['cohortPlanSHA256'] = hashlib.sha256(secondary_bytes).hexdigest()
    encoded = (json.dumps(report, indent=2, allow_nan=False)+'\n').encode()
    (out/'comparison.json').write_bytes(encoded)
    if args.publish:
        (FAMILY/f'docs/{prefix}-inputs.json').write_bytes(input_bytes)
        (FAMILY/f'docs/{prefix}-batches.jsonl.gz').write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
        (FAMILY/f'docs/{prefix}-comparison.json').write_bytes(encoded)
        (FAMILY/f'data/{prefix}-comparison.json').write_bytes((json.dumps(report, separators=(',', ':'), allow_nan=False)+'\n').encode())
    print(json.dumps({'summaries': report['summaries'], 'effects': report['effectSummary'], 'opening': report['rows'][0]}, indent=2))
if __name__ == '__main__':
    main()
