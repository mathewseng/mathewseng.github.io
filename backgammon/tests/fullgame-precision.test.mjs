// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const bytes=p=>readFileSync(new URL(p,import.meta.url)),read=p=>JSON.parse(bytes(p));
const hash=v=>createHash('sha256').update(v).digest('hex');
for(const [prefix,positions,trials,records,candidates,batches,effects,gaps] of [
 ['fullgame-precision',15,4096,13440,45,128,30,45],
 ['opening-fullgame-precision',1,32768,8192,4,1024,2,3],
])test(`${prefix} publishes exactly its independent fixed sample and paired statistics`,()=>{
 const inputBytes=bytes(`../docs/${prefix}-inputs.json`),inputs=JSON.parse(inputBytes),report=read(`../docs/${prefix}-comparison.json`),{signature,...unsigned}=inputs;
 assert.equal(hash(JSON.stringify(unsigned)),signature);assert.equal(report.signature,signature);assert.equal(report.inputSHA256,hash(inputBytes));
 const raw=gunzipSync(bytes(`../docs/${prefix}-batches.jsonl.gz`)),rows=raw.toString().trim().split('\n').map(JSON.parse);
 assert.equal(hash(raw),report.rawSHA256);assert.equal(rows.length,records);assert.equal(new Set(rows.map(r=>r.key)).size,records);
 assert.ok(rows.every(r=>r.value.samples===32&&['local','mattgpt'].includes(r.executionHost)));
 assert.equal(report.complete,true);assert.equal(report.rows.length,positions);assert.equal(report.totalTrials,records*32);assert.equal(report.trialsPerMovePolicy,trials);
 assert.equal(report.effectComparisons,effects);assert.equal(report.gapComparisons,gaps);
 assert.equal(report.rows.reduce((n,r)=>n+r.policies['full-strong'].candidates.length,0),candidates);
 for(const row of report.rows)for(const p of Object.values(row.policies)){
  assert.equal(p.gap.batches,batches);assert.ok(p.candidates.every(c=>c.samples===trials));
 }
 if(positions===15){
  assert.equal(Object.keys(report.cohortEffects).length,2);
  for(const [name,e] of Object.entries(report.cohortEffects)){assert.equal(e.comparisons,2);assert.equal(e.positions,15);assert.equal(e.batches,128);assert.ok(Math.abs(e.difference-report.effectSummary[name].meanShift)<1e-12);}
 }else{
  const strong=report.rows[0].policies['full-strong'],reference=strong.candidates.find(c=>c.role==='xg-choice');
  assert.equal(strong.retainedReferenceGaps.length,3);
  for(const g of strong.retainedReferenceGaps){assert.equal(g.batches,1024);assert.ok(Math.abs(g.difference-reference.equity+strong.candidates.find(c=>c.board===g.board).equity)<1e-12);}
 }
 assert.deepEqual(read(`../data/${prefix}-comparison.json`),report);
 const script=`import importlib.util,json,pathlib,gzip
p=pathlib.Path('backgammon/scripts/summarize-fullgame-ablation.py');s=importlib.util.spec_from_file_location('a',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
prefix='${prefix}';b=pathlib.Path('backgammon/docs/'+prefix+'-inputs.json').read_bytes();i=json.loads(b);m.validate_provenance(b,i)
records=[json.loads(line) for line in gzip.decompress(pathlib.Path('backgammon/docs/'+prefix+'-batches.jsonl.gz').read_bytes()).splitlines()]
r=m.summarize(i,records);published=json.loads(pathlib.Path('backgammon/docs/'+prefix+'-comparison.json').read_bytes())
assert all(r.get(k)==published.get(k) for k in ['rows','summaries','effectSummary','cohortEffects','totalTrials','records'])`;
 execFileSync('python3',['-c',script],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NODE:process.execPath}});
});
test('the published book follows the fresh acceptance rules and preserves every other entry',()=>{
 const report=read('../docs/fullgame-precision-comparison.json'),opening=read('../docs/opening-fullgame-precision-comparison.json'),inputs=read('../docs/fullgame-precision-inputs.json');
 const index=read('../engine/opening-book-data/rollout/index.json'),baseline=read('../docs/fullgame-book-baseline.json');
 const base=report.summaries.short,next=report.summaries['full-strong'],o=opening.rows[0],strong=o.policies['full-strong'];
 const cohortAccepted=next.meanAbsoluteGapError<base.meanAbsoluteGapError&&next.pairMeanFavorsXG>=base.pairMeanFavorsXG&&Object.values(report.cohortEffects).some(e=>e.familywise95.upper<0);
 const openingAccepted=strong.retainedReferenceGaps.every(g=>g.familywise95.lower>0)&&Math.abs(strong.gap.difference-o.referenceGap)<Math.abs(o.policies.short.gap.difference-o.referenceGap)&&Object.values(o.effects).some(e=>e.familywise95.upper<0);
 const promoted=cohortAccepted?inputs.plan:openingAccepted?inputs.plan.filter(d=>d.kind==='opening'):[];
 assert.equal(baseline.entries.length,66);
 for(const d of baseline.entries){
  const selected=promoted.find(p=>p.board===d.board&&p.roll===d.roll),entry=index.entries[d.board][d.roll];
  if(!selected){assert.equal(hash(JSON.stringify(entry)),d.sha256);continue;}
  const source=selected.kind==='opening'?opening:report,values=source.rows.find(r=>r.id===selected.id).policies['full-strong'].candidates;
  assert.equal(entry.settings.policyId,'strong');assert.equal(entry.settings.truncationPlies,0);assert.equal(entry.samples,selected.kind==='opening'?32768:4096);
  assert.equal(entry.comparisonSignature,source.signature);assert.deepEqual(entry.rows.map(r=>r[1]),values.map(c=>c.equity));assert.deepEqual(entry.standardErrors,values.map(c=>c.standardError));
 }
 if(promoted.length){
  assert.equal(index.id,'jacoby-rollout-v2');assert.equal(index.provenance.fullgamePrecision.positions,promoted.length);
  assert.equal(index.provenance.fullgamePrecision.cohortAccepted,cohortAccepted);assert.equal(index.provenance.fullgamePrecision.openingSeparatelyQualified,openingAccepted);
 }else assert.equal(index.provenance.fullgamePrecision,undefined);
});
