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
for mutation in ['missing','duplicate','seed','rules','cache','samples','counter']:
 bad=copy.deepcopy(records)
 if mutation=='missing':bad.pop()
 elif mutation=='duplicate':bad.append(bad[0])
 elif mutation=='seed':bad[0]['seed']+=1
 elif mutation=='rules':bad[0]['value']['rulesMode']=3
 elif mutation=='cache':bad[0]['value']['cacheContext']=1
 elif mutation=='samples':bad[0]['value']['samples']=31
 else:bad[0]['value']['cubeActions'][0]=-1
 try:m.summarize(i,bad)
 except ValueError:pass
 else:raise AssertionError(mutation+' accepted')
`;
 execFileSync('python3',['-c',script],{env});
});
test('replacement results contain the entire fixed experiment and retain the independent reference book',()=>{
 const f=new URL('../docs/cube-policy-study-v2-comparison.json',import.meta.url);
 if(!fs.existsSync(f))return;
 const report=JSON.parse(fs.readFileSync(f));assert.equal(report.complete,true);assert.equal(report.records,5120);assert.equal(report.totalTrials,163840);assert.equal(report.policies.length,5);assert.equal(report.effects.length,4);assert.equal(report.candidateEffects.length,8);
 for(const p of report.policies)for(const c of p.candidates)assert.equal(c.samples,16384);
 assert.equal(fs.readFileSync(f,'utf8'),fs.readFileSync(new URL('../data/cube-policy-study-comparison.json',import.meta.url),'utf8'));
});
