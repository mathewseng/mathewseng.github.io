// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const env={...process.env,NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'};
test('replacement cache/cube/checker study keeps its committed sample, implementations and independent seeds',()=>{
 execFileSync('python3',['backgammon/scripts/summarize-cube-policy-study-v2.py','--validate-plan'],{env});
});
test('paired policy effects cancel shared noise and reject incomplete or changed samples',()=>{
 const script=`import importlib.util,json,copy,pathlib
s=importlib.util.spec_from_file_location('r',pathlib.Path('backgammon/scripts/summarize-cube-policy-study-v2.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
i=json.loads(pathlib.Path('backgammon/docs/cube-policy-study-v2-inputs.json').read_bytes());i['trials']=128;d=i['plan'][0];records=[]
shifts={'legacy':0,'cache':.001,'matched':.003,'wide':.023,'deep':.033}
for p in i['policies']:
 for batch in range(4):
  for c in d['candidates']:
   eq=.5+batch*.3+(shifts[p['id']]-.01 if c['role']=='xg-choice' else 0)
   value={**p,'samples':32,'equity':eq,'cubeless':0.,'probabilities':[.5,.1,.01,.1,.01],'standardError':.01,'maxCube':4,'cubeActions':[0]*10}
   records.append({'key':f"{p['id']}|{batch}|{c['role']}",'id':d['id'],'policy':p['id'],'board':c['board'],'role':c['role'],'batch':batch,'seed':(d['seedBase']+batch*65536)%2**32,'value':value})
r=m.summarize(i,records)
assert r['totalTrials']==1280
assert r['policies'][0]['gap']['direction']=='alternative-ahead'
assert r['policies'][-1]['gap']['direction']=='XG-choice-ahead'
assert abs(r['effects'][2]['difference']-.02)<1e-12
assert r['effects'][2]['standardError']<1e-12
assert all(c['referenceCredit']['author'] for p in r['policies'] for c in p['candidates'])
for mutation in ['missing','duplicate','seed','rules','cache','samples','counter','cube','nonfinite']:
 bad=copy.deepcopy(records)
 if mutation=='missing':bad.pop()
 elif mutation=='duplicate':bad.append(bad[0])
 elif mutation=='seed':bad[0]['seed']+=1
 elif mutation=='rules':bad[0]['value']['rulesMode']=3
 elif mutation=='cache':bad[0]['value']['cacheContext']=1
 elif mutation=='samples':bad[0]['value']['samples']=31
 elif mutation=='counter':bad[0]['value']['cubeActions'][0]=-1
 elif mutation=='cube':bad[0]['value']['maxCube']=3
 else:bad[0]['value']['equity']=float('nan')
 try:m.summarize(i,bad)
 except ValueError:pass
 else:raise AssertionError(mutation+' accepted')
`;
 execFileSync('python3',['-c',script],{env});
});
test('shard provenance rejects altered worker validation, missing evidence and changed records',()=>{
 const script=`import importlib.util,json,copy,pathlib,tempfile
s=importlib.util.spec_from_file_location('r',pathlib.Path('backgammon/scripts/merge-cube-policy-shards.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
i=json.loads(pathlib.Path('backgammon/docs/cube-policy-study-v2-inputs.json').read_bytes())
validation=json.loads(pathlib.Path('backgammon/docs/cube-policy-v2-linux-validation.json').read_bytes())
with tempfile.TemporaryDirectory() as folder:
 root=pathlib.Path(folder)
 for shard in range(20):
  d=root/f'cube-policy-v2-shard-{shard}';d.mkdir();records=[]
  for batch in range(shard,512,20):
   for policy in i['policies']:
    for role in ['xg-choice','previous-choice']:
     records.append({'key':f"{policy['id']}|{batch}|{role}",'batch':batch,'policy':policy['id'],'role':role,'value':{'equity':.5}})
  (d/'inputs.json').write_text(json.dumps(i))
  (d/'platform-validation.json').write_text(json.dumps(validation))
  (d/'complete.json').write_text(json.dumps({'signature':i['signature'],'shard':shard,'shards':20,'records':len(records),'completedAt':'2026-10-22T15:00:00Z'}))
  (d/'batches.jsonl').write_bytes(m.encode_records(records))
 raw,complete=m.merge(root,i,'1');records=[json.loads(line) for line in raw.splitlines()]
 assert len(records)==5120
 for mutation in ['raw','missing','duplicate','record','worker','fixture','script','architecture','tolerance','difference']:
  evidence=copy.deepcopy(complete);data=raw;rows=copy.deepcopy(records)
  if mutation=='raw':data+=b' '
  elif mutation=='missing':evidence['shards'].pop()
  elif mutation=='duplicate':evidence['shards'][-1]=evidence['shards'][0]
  elif mutation=='record':rows[0]['value']['equity']+=.1
  elif mutation=='worker':evidence['shards'][0]['validation']['allWithinTolerance']=False
  elif mutation=='difference':evidence['shards'][0]['validation']['maxNumericDifference']=.0001
  else:
   field={'fixture':'fixtureSHA256','script':'scriptSHA256','architecture':'architecture','tolerance':'tolerance'}[mutation]
   evidence['shards'][0]['validation'][field]='changed'
  try:m.validate_execution(evidence,i,data,rows)
  except ValueError:pass
  else:raise AssertionError(mutation+' accepted')
 bad=root/'cube-policy-v2-shard-0'/'batches.jsonl';original=bad.read_bytes();bad.write_bytes(original.rstrip())
 try:m.merge(root,i,'1')
 except ValueError:pass
 else:raise AssertionError('partial checkpoint accepted')
`;
 execFileSync('python3',['-c',script],{env});
});
test('published replacement estimates, paired effects and provenance recompute from every raw batch',()=>{
 const f=new URL('../docs/cube-policy-study-v2-comparison.json',import.meta.url);
 if(!fs.existsSync(f))return;
 const report=JSON.parse(fs.readFileSync(f));assert.equal(report.complete,true);assert.equal(report.records,5120);assert.equal(report.totalTrials,163840);assert.equal(report.policies.length,5);assert.equal(report.effects.length,4);assert.equal(report.candidateEffects.length,8);
 for(const p of report.policies)for(const c of p.candidates)assert.equal(c.samples,16384);
 assert.equal(fs.readFileSync(f,'utf8'),fs.readFileSync(new URL('../data/cube-policy-study-comparison.json',import.meta.url),'utf8'));
 const script=`import importlib.util,json,gzip,pathlib
s=importlib.util.spec_from_file_location('r',pathlib.Path('backgammon/scripts/summarize-cube-policy-study-v2.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
root=pathlib.Path('backgammon/docs');prefix='cube-policy-study-v2'
inputs=(root/f'{prefix}-inputs.json').read_bytes();p=m.validate_plan(inputs)
raw=gzip.decompress((root/f'{prefix}-batches.jsonl.gz').read_bytes());records=[json.loads(line) for line in raw.splitlines()]
published=json.loads((root/f'{prefix}-comparison.json').read_bytes());evidence=(root/f'{prefix}-execution.json').read_bytes();complete=json.loads(evidence)
assert published['inputsSHA256']==m.HASH(inputs)
assert published['rawSHA256']==m.HASH(raw)
assert published['executionSHA256']==m.HASH(evidence)
assert published['nativeBinarySHA256']==p['build']['binarySHA256']
m.execution.validate_execution(complete,p,raw,records)
recomputed=m.summarize(p,records)
for key,value in recomputed.items():
 if key!='recordedAt':assert value==published[key],key+' does not reproduce'
`;
 execFileSync('python3',['-c',script],{env});
});
