// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('full-game ablations preserve paired covariance and reject invalid samples',()=>{
 execFileSync('python3',['backgammon/tests/fullgame-ablation.py'],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fromXGID} from '../core/xgid.mjs';
import {legalTurns,commitTurn} from '../core/rules.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
test('published full-game ablations bind complete legal candidates and all planned policy contrasts',()=>{
 const inputs=read('../docs/fullgame-ablation-inputs.json'),report=read('../docs/fullgame-ablation-comparison.json');
 const {signature,...unsigned}=inputs,hash=v=>createHash('sha256').update(v).digest('hex');
 assert.equal(hash(JSON.stringify(unsigned)),signature);
 assert.equal(hash(readFileSync(new URL('../docs/fullgame-ablation-inputs.json',import.meta.url))),report.inputSHA256);
 const raw=gunzipSync(readFileSync(new URL('../docs/fullgame-ablation-batches.jsonl.gz',import.meta.url)));
 assert.equal(hash(raw),report.rawSHA256);
 const records=raw.toString().trim().split('\n').map(JSON.parse);
 assert.equal(records.length,4320);assert.equal(new Set(records.map(r=>r.key)).size,4320);
 assert.equal(report.complete,true);assert.equal(report.rows.length,15);assert.equal(report.totalTrials,138240);
 assert.equal(report.trialsPerMovePolicy,1024);assert.equal(inputs.plan.reduce((n,d)=>n+d.candidates.length,0),45);
 for(const d of inputs.plan)for(const c of d.candidates){
  const state=fromXGID(c.original);
  assert.equal(bookBoardKey(state),d.board);
  assert.ok(legalTurns(state).some(t=>bookBoardKey(commitTurn(state,t.steps))===c.board));
  assert.equal(bookBoardKey(commitTurn(state,c.steps)),c.board);
  assert.equal(bookBoardKey(fromXGID(c.after)),c.board);
 }
 for(const r of report.rows){
  for(const p of Object.values(r.policies)){
   assert.equal(p.gap.batches,32);assert.ok(p.candidates.every(c=>c.samples===1024));
   assert.ok(p.gap.familywise95.halfWidth>=p.gap.interval95.halfWidth);
  }
  for(const effect of Object.values(r.effects)){
   assert.equal(effect.batches,32);assert.ok(effect.familywise95.halfWidth>=effect.interval95.halfWidth);
   assert.ok(Math.abs(effect.difference-(r.policies[effect.after].gap.difference-r.policies[effect.before].gap.difference))<1e-12);
  }
 }
 assert.equal(Object.keys(report.cohortEffects).length,3);
 for(const [name,e] of Object.entries(report.cohortEffects)){assert.equal(e.positions,15);assert.equal(e.batches,32);assert.equal(e.comparisons,3);assert.ok(Math.abs(e.difference-report.effectSummary[name].meanShift)<1e-12);}
 assert.deepEqual(read('../data/fullgame-ablation-comparison.json'),report);
 const script=`import importlib.util,json,pathlib
p=pathlib.Path('backgammon/scripts/summarize-fullgame-ablation.py')
s=importlib.util.spec_from_file_location('ablation',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
b=pathlib.Path('backgammon/docs/fullgame-ablation-inputs.json').read_bytes();i=json.loads(b);m.validate_provenance(b,i)
import gzip
records=[json.loads(line) for line in gzip.decompress(pathlib.Path('backgammon/docs/fullgame-ablation-batches.jsonl.gz').read_bytes()).splitlines()]
r=m.summarize(i,records);published=json.loads(pathlib.Path('backgammon/docs/fullgame-ablation-comparison.json').read_bytes())
assert all(r[k]==published[k] for k in ['rows','summaries','effectSummary','totalTrials','records','cohortEffects'])`;
 execFileSync('python3',['-c',script],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
test('independent opening confirmation completes all alternatives and excludes all primary experiment seeds',()=>{
 const inputs=read('../docs/opening-fullgame-confirmation-inputs.json'),report=read('../docs/opening-fullgame-confirmation-comparison.json');
 const primary=read('../docs/fullgame-ablation-inputs.json');
 const hash=v=>createHash('sha256').update(v).digest('hex'),{signature,...unsigned}=inputs;
 assert.equal(hash(JSON.stringify(unsigned)),signature);assert.equal(inputs.parentSignature,primary.signature);
 const raw=gunzipSync(readFileSync(new URL('../docs/opening-fullgame-confirmation-batches.jsonl.gz',import.meta.url)));
 assert.equal(hash(raw),report.rawSHA256);assert.equal(report.inputSHA256,hash(readFileSync(new URL('../docs/opening-fullgame-confirmation-inputs.json',import.meta.url))));
 const records=raw.toString().trim().split('\n').map(JSON.parse);
 assert.equal(records.length,1024);assert.equal(new Set(records.map(r=>r.key)).size,1024);
 assert.equal(report.totalTrials,32768);assert.equal(report.trialsPerMovePolicy,4096);
 assert.equal(report.rows.length,1);assert.equal(report.rows[0].id,'opening-21');
 assert.equal(report.rows[0].policies['full-strong'].candidates.length,4);
 for(const p of Object.values(report.rows[0].policies))assert.ok(p.candidates.every(c=>c.samples===4096));
 assert.equal(report.effectComparisons,2);assert.equal(report.gapComparisons,3);
 assert.deepEqual(read('../data/opening-fullgame-confirmation-comparison.json'),report);
 const script=`import importlib.util,json,pathlib,gzip
p=pathlib.Path('backgammon/scripts/summarize-fullgame-ablation.py')
s=importlib.util.spec_from_file_location('ablation',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
b=pathlib.Path('backgammon/docs/opening-fullgame-confirmation-inputs.json').read_bytes();i=json.loads(b);m.validate_provenance(b,i)
records=[json.loads(line) for line in gzip.decompress(pathlib.Path('backgammon/docs/opening-fullgame-confirmation-batches.jsonl.gz').read_bytes()).splitlines()]
r=m.summarize(i,records);published=json.loads(pathlib.Path('backgammon/docs/opening-fullgame-confirmation-comparison.json').read_bytes())
assert all(r[k]==published[k] for k in ['rows','summaries','effectSummary','totalTrials','records'])`;
 execFileSync('python3',['-c',script],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
test('storage recovery preserves every previously completed raw batch byte',()=>{
 const recovery=read('../docs/fullgame-storage-recovery.json');
 for(const run of recovery.runs){
  const prefix=run.checkpoint.replace(/-v1$/,'');
  const raw=gunzipSync(readFileSync(new URL(`../docs/${prefix}-batches.jsonl.gz`,import.meta.url)));
  const saved=raw.subarray(0,run.prefixBytes);
  assert.equal(createHash('sha256').update(saved).digest('hex'),run.prefixSHA256);
  assert.equal(saved.toString().trim().split('\n').length,run.completedBatches);
 }
});
test('the original full-game study cannot replace the book after failing its recorded criteria',()=>{
 const file=new URL('../engine/opening-book-data/rollout/index.json',import.meta.url),before=readFileSync(file);
 assert.throws(()=>execFileSync(process.execPath,['backgammon/scripts/publish-fullgame-book.mjs'],{stdio:'pipe'}),error=>{
  assert.match(String(error.stderr),/predeclared full-game promotion criteria were not met/);return true;
 });
 assert.deepEqual(readFileSync(file),before);
});
test('precision follow-up plans fix all candidates, confidence families and independent seeds',()=>{
 const script=`import importlib.util,json,pathlib
p=pathlib.Path('backgammon/scripts/summarize-fullgame-ablation.py');s=importlib.util.spec_from_file_location('a',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
for prefix,positions,trials in [('fullgame-precision',15,4096),('opening-fullgame-precision',1,32768)]:
 b=pathlib.Path('backgammon/docs/'+prefix+'-inputs.json').read_bytes();i=json.loads(b);m.validate_provenance(b,i)
 assert len(i['plan'])==positions and i['trials']==trials and len(i['policies'])==3`;
 execFileSync('python3',['-c',script],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
