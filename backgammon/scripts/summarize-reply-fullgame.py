#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Validate and summarize the fixed six-reply full-game precision experiment."""
import argparse
import gzip
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path

FAMILY = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ablation', Path(__file__).with_name('summarize-fullgame-ablation.py'))
ablation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ablation)
PREFIX = 'reply-fullgame-precision'
EXPECTED_SIGNATURE = 'e8cf1918cc466768cb3965f412618bf4ad8b3d40926d646bdb76b9cec1856e5e'
TOLERANCE = .005

def validate(input_bytes):
    inputs = json.loads(input_bytes)
    script = "const fs=require('fs'),c=require('crypto'),{signature,...v}=JSON.parse(fs.readFileSync(0));process.stdout.write(c.createHash('sha256').update(JSON.stringify(v)).digest('hex'));"
    signature = subprocess.check_output([os.getenv('NODE', 'node'), '-e', script], input=input_bytes).decode()
    if signature != inputs['signature'] or signature != EXPECTED_SIGNATURE:
        raise ValueError('Fixed experiment signature changed')
    if inputs['trials'] != 32768 or inputs['batchSize'] != 32 or inputs['gapComparisons'] != 6 or inputs['retainedComparisons'] != 14:
        raise ValueError('Sample size or confidence family changed')
    if inputs['policies'] != [{'id':'full-strong', **dict(zip(ablation.FIELDS, ablation.POLICIES['full-strong']))}]:
        raise ValueError('Continuation policy changed')
    parent_bytes = (FAMILY/'docs/fullgame-precision-inputs.json').read_bytes()
    parent = json.loads(parent_bytes)
    ablation.validate_provenance(parent_bytes, parent)
    opening_bytes = (FAMILY/'docs/opening-fullgame-precision-inputs.json').read_bytes()
    opening = json.loads(opening_bytes)
    ablation.validate_provenance(opening_bytes, opening)
    selection_bytes = (FAMILY/'docs/fullgame-precision-comparison.json').read_bytes()
    selection = json.loads(selection_bytes)
    selected = {r['id'] for r in selection['rows'] if r['kind']=='reply' and not r['policies']['full-strong']['agrees']}
    if len(selected)!=6 or len(inputs['plan'])!=6 or {d['id'] for d in inputs['plan']}!=selected or sum(len(d['candidates']) for d in inputs['plan'])!=20:
        raise ValueError('Selected cohort or retained candidates changed')
    if inputs['selectionSHA256'] != hashlib.sha256(selection_bytes).hexdigest() or inputs['precisionOf']!=parent['signature'] or inputs['priorOpeningSignature']!=opening['signature'] or inputs['build']!=parent['build']:
        raise ValueError('Parent provenance changed')
    used = set()
    for prefix in ('rollout-policy','rollout-diagnostic'):
        for line in gzip.decompress((FAMILY/f'docs/{prefix}-batches.jsonl.gz').read_bytes()).splitlines():
            r=json.loads(line)
            used.update((r['seed']+i*256)%2**32 for i in range(r['value']['samples']))
    used.update((seed+256*i)%2**32 for seed in (123456789,987654321) for i in range(2))
    for prefix in ('fullgame-ablation','opening-fullgame-confirmation','fullgame-precision','opening-fullgame-precision'):
        prior=json.loads((FAMILY/f'docs/{prefix}-inputs.json').read_bytes())
        used.update((d['seedBase']+(i//32)*65536+(i%32)*256)%2**32 for d in prior['plan'] for i in range(prior['trials']))
    for d in inputs['plan']:
        previous=next(p for p in parent['plan'] if p['id']==d['id'])
        if {k:v for k,v in d.items() if k not in ('seedBase','seedNonce')} != {k:v for k,v in previous.items() if k not in ('seedBase','seedNonce')}:
            raise ValueError('Candidate, reference or position changed')
        seed=int(hashlib.sha256(f"{PREFIX}-v1:{d['id']}:{d['seedNonce']}".encode()).hexdigest()[:8],16)
        seeds={(seed+(i//32)*65536+(i%32)*256)%2**32 for i in range(inputs['trials'])}
        if seed!=d['seedBase'] or len(seeds)!=inputs['trials'] or used&seeds:
            raise ValueError('Seed overlap or changed seed')
        used.update(seeds)
    return inputs

def reference_credits():
    source_bytes = (FAMILY/'docs/deep-book-xg-reference.json').read_bytes()
    credit_bytes = (FAMILY/'docs/xg-reference-attribution.json').read_bytes()
    credits = json.loads(credit_bytes)
    if credits['sourceSHA256'] != hashlib.sha256(source_bytes).hexdigest():
        raise ValueError('Reference attribution source changed')
    script = """import fs from 'node:fs';
import {normalizeReference} from './backgammon/scripts/deep-book-comparison.mjs';
const source=JSON.parse(fs.readFileSync('backgammon/docs/deep-book-xg-reference.json'));
const credits=JSON.parse(fs.readFileSync('backgammon/docs/xg-reference-attribution.json'));
const entries={};
for(const d of normalizeReference(source))entries[d.board+'|'+d.roll]=Object.fromEntries(d.candidates.map(c=>[c.board,{equity:c.equity,credit:credits.sources[d.url].positions[d.title].find(a=>a.rank===c.rank)}]));
process.stdout.write(JSON.stringify(entries));"""
    entries = json.loads(subprocess.check_output([os.getenv('NODE','node'),'--input-type=module','-e',script],cwd=FAMILY.parent))
    return entries, hashlib.sha256(credit_bytes).hexdigest()

def summarize(inputs, records):
    report=ablation.summarize(inputs,records)
    credits, report['referenceAttributionSHA256'] = reference_credits()
    report.pop('effectComparisons',None)
    report['retainedComparisons']=inputs['retainedComparisons']
    report['equityTolerance']=TOLERANCE
    for row in report['rows']:
        d=next(d for d in inputs['plan'] if d['id']==row['id'])
        policy=row['policies']['full-strong']
        for c in policy['candidates']:
            ref=next(v['reference'] for v in d['candidates'] if v['board']==c['board'])
            published = credits[d['board']+'|'+d['roll']][c['board']]
            if abs(published['equity']-c['referenceEquity']) > 1e-12:
                raise ValueError('Reference candidate attribution mismatch')
            c['referenceCredit'] = published['credit']
            c['referenceDifference']=c['equity']-c['referenceEquity']
            c['withinTolerance']=abs(c['referenceDifference'])<=TOLERANCE
            c['referenceConfidenceHalfWidth']=ref.get('confidenceHalfWidth')
        gaps=policy['retainedReferenceGaps']
        row['conclusion']='persistent-policy-disagreement' if any(g['direction']=='alternative-ahead' for g in gaps) else 'XG-choice-supported' if all(g['direction']=='XG-ahead' for g in gaps) else 'unresolved'
        row['sampledLeaderAgrees']=policy['agrees']
    report['conclusions']={name:sum(r['conclusion']==name for r in report['rows']) for name in ('persistent-policy-disagreement','XG-choice-supported','unresolved')}
    report['absoluteEV']={'moves':20,'withinTolerance':sum(c['withinTolerance'] for r in report['rows'] for c in r['policies']['full-strong']['candidates']),
        'interpretation':'Descriptive distance from the published reference. Our confidence intervals do not include XG sampling error, the beaver-rule difference or continuation-policy error.'}
    return report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');parser.add_argument('--validate-plan',action='store_true');args=parser.parse_args()
    if args.validate_plan:
        inputs=validate((FAMILY/f'docs/{PREFIX}-inputs.json').read_bytes());print(inputs['signature']);return
    out=Path(os.getenv('BG_ABLATION_OUT',FAMILY/f'test-results/{PREFIX}-v1'))
    input_bytes=(out/'inputs.json').read_bytes();inputs=validate(input_bytes)
    completion=json.loads((out/'complete.json').read_bytes())
    raw=(out/'batches.jsonl').read_bytes();records=[json.loads(line) for line in raw.splitlines()]
    if not raw.endswith(b'\n') or completion['signature']!=inputs['signature'] or completion['records']!=20480 or len(records)!=20480:
        raise ValueError('Incomplete fixed sample')
    report=summarize(inputs,records)
    report.update(inputSHA256=hashlib.sha256(input_bytes).hexdigest(),rawSHA256=hashlib.sha256(raw).hexdigest(),build=inputs['build'],sourceSHA256=inputs['sourceSHA256'])
    encoded=(json.dumps(report,indent=2,allow_nan=False)+'\n').encode();(out/'comparison.json').write_bytes(encoded)
    if args.publish:
        if json.loads((FAMILY/f'docs/{PREFIX}-inputs.json').read_bytes())!=inputs:raise ValueError('Committed plan differs')
        (FAMILY/f'docs/{PREFIX}-inputs.json').write_bytes(input_bytes)
        (FAMILY/f'docs/{PREFIX}-comparison.json').write_bytes(encoded)
        (FAMILY/f'docs/{PREFIX}-batches.jsonl.gz').write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
        (FAMILY/f'data/{PREFIX}-comparison.json').write_bytes((json.dumps(report,separators=(',',':'),allow_nan=False)+'\n').encode())
    print(json.dumps({'conclusions':report['conclusions'],'absoluteEV':report['absoluteEV']},indent=2))

if __name__=='__main__':main()
