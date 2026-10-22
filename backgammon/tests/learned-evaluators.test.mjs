import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('learned-evaluator evidence has complete independent searches and recomputable tolerance counts',()=>{
 const manifest=JSON.parse(read('docs/learned-evaluator-inputs.json')),report=JSON.parse(read('docs/learned-evaluator-comparison.json'));
 assert.equal(hash(read('docs/deep-book-xg-reference.json')),manifest.referenceSHA256);
 assert.equal(hash(read('docs/deep-book-comparison.json')),manifest.historicalBookSHA256);
 assert.equal(report.matchedBook.positions,666);assert.equal(report.matchedBook.candidates,1494);
 assert.deepEqual(report.matchedBook.rows.map(r=>r.matches),[631,625,644]);
 for(const run of manifest.runs) {
  const bytes=read(run.file);assert.equal(hash(bytes),run.sha256);
  const raw=gunzipSync(bytes).toString().trim().split('\n').map(JSON.parse);assert.ok(raw.shift().metadata);
  assert.equal(raw.length,729);assert.equal(new Set(raw.map(r=>r.id)).size,729);
  assert.equal(raw.reduce((n,r)=>n+r.moves.length,0),16091);
  const result=report.datasets.find(d=>d.id===run.id);assert.equal(result.rows.length,729);
  const candidates=result.rows.flatMap(r=>r.candidates);assert.equal(candidates.length,2584);
  assert.equal(result.summary.withinTolerance,candidates.filter(c=>Math.abs(c.equity-c.referenceEquity)<=.005).length);
  assert.equal(result.summary.matches,result.rows.filter(r=>r.agrees).length);
  assert.ok(Math.abs(result.summary.meanAbsoluteDifference-candidates.reduce((n,c)=>n+Math.abs(c.equity-c.referenceEquity),0)/2584)<1e-12);
 }
 const pure=report.datasets.find(d=>d.id==='puretd1');
 assert.equal(pure.summary.matches,704);assert.equal(pure.summary.withinTolerance,1669);
 assert.ok(pure.summary.meanAbsoluteDifference<.005&&pure.summary.maximumAbsoluteDifference>.03);
 const focus=pure.rows.find(r=>r.id==='41$-44');assert.equal(focus.agrees,true);
 assert.ok(focus.candidates[0].difference>.02,'focus EV remains outside tolerance');
 const wide=report.datasets.find(d=>d.id==='puretd-wide1');
 assert.equal(wide.summary.matches,705);assert.equal(wide.summary.withinTolerance,1881);
 assert.ok(wide.summary.meanAbsoluteDifference<.0038&&wide.summary.maximumAbsoluteDifference>.028);
 assert.ok(wide.rows.find(r=>r.id==='41$-44').candidates[0].difference>.017,'wider model still has a focus EV discrepancy');
});
