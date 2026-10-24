import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const summary=JSON.parse(fs.readFileSync(new URL('../docs/internal-pruning-audit.json',import.meta.url)));
const bytes=fs.readFileSync(new URL('../docs/internal-pruning-audit-data.json.gz',import.meta.url));
const raw=JSON.parse(gunzipSync(bytes));
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);

test('pruning audit preserves complete independently selected inputs and paired candidate sets',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),summary.dataSHA256);
  assert.equal(raw.plan.cases.length,180);assert.equal(raw.results.length,180);
  const selected=raw.plan.cases.filter(c=>c.context==='cubeless');
  assert.equal(new Set(selected.map(c=>c.record.split(/\s+/)[1])).size,60);
  for(const c of selected)assert.ok(!raw.plan.excludedKeys.includes(c.record.split(/\s+/)[1]));
  assert.equal(raw.results.reduce((s,r)=>s+r.arms.pruned.candidates.length,0),1914);
  assert.equal(new Set(raw.results.map(r=>r.id)).size,180);
  for(const r of raw.results){
    assert.ok(raw.plan.cases.some(c=>c.id===r.id));assert.equal(r.depth,2);
    assert.deepEqual(new Set(r.arms.pruned.candidates.map(c=>c.key)),new Set(r.arms.unpruned.candidates.map(c=>c.key)));
  }
  assert.equal(raw.results.filter(r=>r.arms.pruned.candidates[0].key!==r.arms.unpruned.candidates[0].key).length,1);
  assert.equal(raw.researchResults.length,18);
  assert.equal(raw.researchResults.reduce((s,r)=>s+r.arms.pruned.candidates.length,0),45);
  assert.ok(raw.researchResults.every(r=>r.arms.pruned.candidates[0].key===r.arms.unpruned.candidates[0].key));
});

test('reference errors are recomputable from covered cubeless moves without inventing missing values',()=>{
  const cases=new Map(raw.plan.cases.map(c=>[c.id,c]));
  for(const arm of ['pruned','unpruned']){
    const maErrors=[],regrets=[],selectedErrors=[];let covered=0;
    for(const row of raw.results){
      const c=cases.get(row.id);if(c.context!=='cubeless')continue;
      const refs=new Map(c.reference.map(v=>[v.key,v]));
      const scores=row.arms[arm].candidates,known=scores.filter(s=>refs.has(s.key));
      covered+=known.length;maErrors.push(mean(known.map(s=>Math.abs(s.equity-refs.get(s.key).equity))));
      const best=scores[0],ref=refs.get(best.key);
      if(ref){regrets.push(ref.loss);selectedErrors.push(Math.abs(best.equity-ref.equity));}
    }
    const expected=summary.reference[arm];assert.equal(covered,263);assert.equal(regrets.length,57);
    near(mean(maErrors),expected.rootEqualWeightedMAE);
    near(mean(regrets),expected.selectedMeanRegret);
    near(mean(selectedErrors),expected.selectedMeanAbsError);
  }
});

test('focused no-pruning result retains the unresolved direction and raw diagnostics',()=>{
  const rows=raw.focusResults.filter(r=>r.depth===4);
  for(const prune of [0,1]){
    const choices=rows.filter(r=>r.prune===prune);assert.equal(choices.length,2);
    const eight=choices.find(r=>r.move.startsWith('8/4'));
    const thirteen=choices.find(r=>r.move.startsWith('13/9'));
    assert.ok(eight.equity>thirteen.equity);
  }
  for(const [name,source] of Object.entries(raw.sources))
    assert.equal(createHash('sha256').update(source).digest('hex'),raw.sourceHashes[name]);
  assert.equal(raw.validation.cases,36);assert.ok(raw.validation.maxDifference<=1e-7);
});
