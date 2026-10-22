#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Validate the complete fixed 41$-44 experiment before paired inference."""
import argparse, gzip, hashlib, importlib.util, json, math, os, subprocess
from pathlib import Path
from datetime import datetime, timezone
FAMILY=Path(__file__).resolve().parents[1]
PREFIX='cube-policy-study'
SIGNATURE='0294775ccc5713adcddbe80e50b70319cf315bb3c3f5fd358e22e0002be15a72'
spec=importlib.util.spec_from_file_location('ablation',Path(__file__).with_name('summarize-fullgame-ablation.py'))
ablation=importlib.util.module_from_spec(spec);spec.loader.exec_module(ablation)
stats=ablation.stats
FIELDS=['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','rulesMode','filter','vrPlies']
HASH=lambda b:hashlib.sha256(b).hexdigest()
def validate_plan(data):
    p=json.loads(data)
    script="const fs=require('fs'),c=require('crypto'),{signature,...v}=JSON.parse(fs.readFileSync(0));process.stdout.write(c.createHash('sha256').update(JSON.stringify(v)).digest('hex'));"
    signature=subprocess.check_output([os.getenv('NODE','node'),'-e',script],input=data).decode()
    if signature!=SIGNATURE or signature!=p['signature']:raise ValueError('Frozen signature changed')
    previous=(FAMILY/'docs/reply-fullgame-precision-inputs.json').read_bytes()
    q=json.loads(previous);old=next(d for d in q['plan'] if d['id']=='reply-7985255600f3563f-44');d=p['plan'][0]
    clean=lambda d:{k:v for k,v in d.items() if k not in ('seedBase','seedNonce')}
    if len(p['plan'])!=1 or clean(d)!=clean(old) or p['priorSignature']!=q['signature'] or p['priorInputsSHA256']!=HASH(previous):raise ValueError('Candidate provenance changed')
    if p['trials']!=16384 or p['batchSize']!=32 or p['gapComparisons']!=5 or p['effectComparisons']!=4 or p['candidateEffectComparisons']!=8:raise ValueError('Fixed sample changed')
    for file,want in p['build']['cubeStudyInputs'].items():
        if HASH((FAMILY/'scripts'/file).read_bytes())!=want:raise ValueError('Cube source changed')
    if HASH((FAMILY/'scripts/run-cube-policy-study.mjs').read_bytes())!=p['runnerSHA256']:raise ValueError('Runner changed')
    if HASH((FAMILY/'docs/cube-policy-native-validation.json').read_bytes())!=p['validationSHA256']:raise ValueError('Validation changed')
    used=set()
    for prefix in ['rollout-policy','rollout-diagnostic']:
        for line in gzip.decompress((FAMILY/f'docs/{prefix}-batches.jsonl.gz').read_bytes()).splitlines():
            r=json.loads(line);used.update((r['seed']+i*256)%2**32 for i in range(r['value']['samples']))
    for prefix in ['fullgame-ablation','opening-fullgame-confirmation','fullgame-precision','opening-fullgame-precision','reply-fullgame-precision']:
        prior=json.loads((FAMILY/f'docs/{prefix}-inputs.json').read_bytes())
        used.update((x['seedBase']+(i//prior['batchSize'])*65536+(i%prior['batchSize'])*256)%2**32 for x in prior['plan'] for i in range(prior['trials']))
    used.update((seed+i*256)%2**32 for seed in [123456789,987654321,31811004] for i in range(8))
    base=int(HASH(f"{PREFIX}-v1:{d['id']}:{d['seedNonce']}".encode())[:8],16)
    seeds={(base+(i//32)*65536+(i%32)*256)%2**32 for i in range(p['trials'])}
    if base!=d['seedBase'] or len(seeds)!=p['trials'] or used&seeds:raise ValueError('Seed overlap')
    return p

def direction(contrast):
    c={k:v for k,v in contrast.items() if k!='classification'}
    c['direction']='XG-choice-ahead' if c['familywise95']['lower']>0 else 'alternative-ahead' if c['familywise95']['upper']<0 else 'unresolved'
    return c

def summarize(p,records):
    d=p['plan'][0];n=p['trials']//p['batchSize'];policies={x['id']:x for x in p['policies']}
    candidates={c['role']:c for c in d['candidates']};lookup={}
    previous=json.loads((FAMILY/'docs/reply-fullgame-precision-comparison.json').read_bytes())
    credit_row=next(r for r in previous['rows'] if r['id']==d['id'])
    credits={c['board']:c['referenceCredit'] for c in credit_row['policies']['full-strong']['candidates']}
    for r in records:
        policy=policies.get(r['policy']);c=candidates.get(r['role']);v=r['value']
        key=f"{r['policy']}|{r['batch']}|{r['role']}"
        if not policy or not c or r['key']!=key or key in lookup or r['id']!=d['id'] or r['board']!=c['board']:raise ValueError('Invalid/duplicate batch identity')
        if type(r['batch']) is not int or not 0<=r['batch']<n or r['seed']!=(d['seedBase']+r['batch']*65536)%2**32 or v['samples']!=p['batchSize']:raise ValueError('Wrong seed/sample')
        if any(v[k]!=policy[k] for k in FIELDS):raise ValueError('Policy changed')
        if len(v['probabilities'])!=5 or not all(math.isfinite(x) for x in [v['equity'],v['cubeless'],v['standardError'],*v['probabilities']]) or v['standardError']<0:raise ValueError('Invalid statistics')
        if len(v['cubeActions'])!=10 or any(type(x) is not int or x<0 for x in v['cubeActions']) or type(v['maxCube']) is not int or v['maxCube']<1 or (policy['rulesMode'] and v['maxCube']>1024):raise ValueError('Invalid cube telemetry')
        lookup[key]=r
    if len(lookup)!=n*len(policies)*len(candidates):raise ValueError('Incomplete fixed experiment')
    lists={};gaps={};rows=[]
    for policy in p['policies']:
        pid=policy['id'];lists[pid]={};estimates=[]
        for role,c in candidates.items():
            batches=[lookup[f'{pid}|{b}|{role}'] for b in range(n)];lists[pid][role]=batches
            estimate=stats.estimate(batches);diff=estimate['equity']-c['reference']['xgEquity']
            estimates.append({'role':role,'move':c['notation'],'board':c['board'],**estimate,'referenceEquity':c['reference']['xgEquity'],'referenceDifference':diff,'withinTolerance':abs(diff)<=.005,'referenceConfidenceHalfWidth':c['reference']['confidenceHalfWidth'],'referenceCredit':credits[c['board']]})
        a=lists[pid]['xg-choice'];b=lists[pid]['previous-choice']
        gaps[pid]=ablation.difference_records(a,b)
        gap=direction(stats.contrast(a,b,p['gapComparisons']))
        telemetry=[sum(r['value']['cubeActions'][i] for batches in lists[pid].values() for r in batches) for i in range(10)]
        rows.append({'id':pid,'label':policy['label'],'candidates':estimates,'gap':gap,'sampledLeaderAgrees':gap['difference']>0,'cubeActions':telemetry,'maxCube':max(r['value']['maxCube'] for batches in lists[pid].values() for r in batches)})
    effects=[];candidate_effects=[]
    for after,before in p['effects']:
        effect=direction(stats.contrast(gaps[after],gaps[before],p['effectComparisons']))
        effect['direction']='positive-shift' if effect['familywise95']['lower']>0 else 'negative-shift' if effect['familywise95']['upper']<0 else 'unresolved'
        effect['identicalGapBlocks']=sum(x['value']['equity']==y['value']['equity'] for x,y in zip(gaps[after],gaps[before]))
        effects.append({'after':after,'before':before,**effect})
        for role in candidates:
            e=direction(stats.contrast(lists[after][role],lists[before][role],p['candidateEffectComparisons']))
            e.pop('direction')
            candidate_effects.append({'after':after,'before':before,'role':role,**e})
    return {'schema':1,'signature':p['signature'],'complete':True,'recordedAt':datetime.now(timezone.utc).isoformat(),'records':len(records),'totalTrials':sum(r['value']['samples'] for r in records),'trialsPerMovePolicy':p['trials'],'method':p['method'],'source':d['source'],'referenceGap':d['referenceBest']['equity']-candidates['previous-choice']['reference']['xgEquity'],'equityTolerance':.005,'policies':rows,'effects':effects,'candidateEffects':candidate_effects,'gapComparisons':p['gapComparisons'],'effectComparisons':p['effectComparisons'],'candidateEffectComparisons':p['candidateEffectComparisons']}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--validate-plan',action='store_true');parser.add_argument('--out',type=Path,default=FAMILY/'test-results/cube-policy-study-v1');args=parser.parse_args()
    input_bytes=(FAMILY/f'docs/{PREFIX}-inputs.json').read_bytes();p=validate_plan(input_bytes)
    if args.validate_plan:print('Frozen policy study, source, sample and independent seeds verified');return
    complete=json.loads((args.out/'complete.json').read_bytes())
    if complete['signature']!=p['signature'] or complete['records']!=5120:raise ValueError('No complete fixed experiment')
    if json.loads((args.out/'inputs.json').read_bytes())!=p:raise ValueError('Run inputs differ')
    raw=(args.out/'batches.jsonl').read_bytes()
    if not raw.endswith(b'\n'):raise ValueError('Partial raw line')
    r=summarize(p,[json.loads(line) for line in raw.splitlines()]);r['inputsSHA256']=HASH(input_bytes);r['rawSHA256']=HASH(raw);r['nativeBinarySHA256']=p['build']['binarySHA256']
    encoded=(json.dumps(r,indent=2)+'\n').encode()
    (FAMILY/f'docs/{PREFIX}-comparison.json').write_bytes(encoded)
    (FAMILY/f'data/{PREFIX}-comparison.json').write_bytes(encoded)
    (FAMILY/f'docs/{PREFIX}-batches.jsonl.gz').write_bytes(gzip.compress(raw,mtime=0))
    print(json.dumps({'totalTrials':r['totalTrials'],'policies':[{'id':x['id'],'gap':x['gap'],'EVs':[c['equity'] for c in x['candidates']]} for x in r['policies']],'effects':r['effects']},indent=2))
if __name__=='__main__':main()
