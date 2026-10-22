// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const plan=JSON.parse(readFileSync(new URL('../docs/reply-fullgame-precision-inputs.json',import.meta.url)));
test('the six-reply plan preserves every retained move and uses independent fixed seeds',()=>{
 const {signature,...unsigned}=plan;
 assert.equal(createHash('sha256').update(JSON.stringify(unsigned)).digest('hex'),signature);
 assert.equal(plan.plan.length,6);assert.equal(plan.plan.reduce((n,d)=>n+d.candidates.length,0),20);
 assert.equal(plan.trials,32768);assert.equal(plan.retainedComparisons,14);
 execFileSync('python3',['backgammon/scripts/summarize-reply-fullgame.py','--validate-plan'],{env:{...process.env,NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'}});
});
test('paired inference tests a third retained leader and rejects missing or mismatched batches',()=>{
 const script=`import importlib.util,json,copy,pathlib
s=importlib.util.spec_from_file_location('r',pathlib.Path('backgammon/scripts/summarize-reply-fullgame.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
i=json.loads(pathlib.Path('backgammon/docs/reply-fullgame-precision-inputs.json').read_bytes());i['trials']=64
records=[]
for d in i['plan']:
 for batch in range(2):
  for j,c in enumerate(d['candidates']):
   equity=0.1 if c['board']==d['referenceBest']['board'] else 0.05
   if d['id']=='reply-2fda09c519d84905-32' and j==3:equity=0.15
   value={**i['policies'][0],'samples':32,'equity':equity,'cubeless':0.,'probabilities':[.5,.1,.01,.1,.01],'standardError':.01}
   records.append({'key':'|'.join([d['id'],'full-strong',str(batch),c['board']]),'id':d['id'],'policy':'full-strong','board':c['board'],'role':c['role'],'batch':batch,'seed':(d['seedBase']+batch*65536)%2**32,'value':value})
r=m.summarize(i,records)
assert r['conclusions']=={'persistent-policy-disagreement':1,'XG-choice-supported':5,'unresolved':0}
third=next(r for r in r['rows'] if r['id']=='reply-2fda09c519d84905-32')
assert third['policies']['full-strong']['gap']['difference']<0
assert third['conclusion']=='persistent-policy-disagreement'
for bad in [records[:-1],records+[records[0]],copy.deepcopy(records)]:
 if len(bad)==len(records):bad[0]['seed']+=1
 try:m.summarize(i,bad)
 except ValueError:pass
 else:raise AssertionError('Malformed paired sample accepted')
`;
 execFileSync('python3',['-c',script],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
});

test('the completed precision refinement preserves all other entries and never publishes partial results',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),hash=b=>createHash('sha256').update(b).digest('hex');
 const index=read('../engine/opening-book-data/rollout/index.json'),baseline=read('../docs/reply-fullgame-book-baseline.json');
 assert.equal(baseline.signature,plan.signature);assert.equal(baseline.entries.length,66);
 const reportFile=new URL('../docs/reply-fullgame-precision-comparison.json',import.meta.url);
 if(!existsSync(reportFile)){
  assert.equal(index.provenance.replyFullgamePrecision,undefined);
  for(const d of baseline.entries)assert.equal(hash(JSON.stringify(index.entries[d.board][d.roll])),d.sha256);
  return;
 }
 const report=JSON.parse(readFileSync(reportFile));assert.equal(report.complete,true);
 assert.equal(report.records,20480);assert.equal(report.totalTrials,655360);assert.equal(report.signature,plan.signature);
 assert.deepEqual(index.provenance.replyFullgamePrecision.promotedIds,plan.plan.map(d=>d.id));
 for(const d of baseline.entries){const selected=plan.plan.find(p=>p.board===d.board&&p.roll===d.roll),entry=index.entries[d.board][d.roll];
  if(!selected){assert.equal(hash(JSON.stringify(entry)),d.sha256);continue;}
  const values=report.rows.find(r=>r.id===selected.id).policies['full-strong'].candidates;
  assert.equal(entry.samples,32768);assert.equal(entry.comparisonSignature,plan.signature);
  assert.equal(entry.settings.policyId,'strong');assert.equal(entry.settings.truncationPlies,0);
  assert.deepEqual(entry.rows.map(r=>r[1]),values.map(c=>c.equity));assert.deepEqual(entry.standardErrors,values.map(c=>c.standardError));
 }
});
