// Independent structural and numeric checks on published benchmark evidence.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {legalTurns,assertState} from '../core/rules.mjs';
import {SEARCH_MODEL} from '../engine/search-model.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../docs/'+name,import.meta.url)));
const traces=read('search-policy-traces.json'),live=read('search-policy-live.json'),replay=read('search-policy-replay.json');
const bytes=fs.readFileSync(new URL('../docs/search-policy-traces.json',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),SEARCH_MODEL.traceSha256);
assert.equal(traces.samples.length,360);assert.equal(new Set(traces.samples.map(s=>s.id)).size,360);
const cases=new Map(traces.cases.map(c=>[c.id,c]));let n=0,censored=0;
for(const sample of traces.samples){
 assert(!sample.error);const state=cases.get(sample.id).state;assertState(state);
 const legal=new Set(legalTurns(state).map(t=>t.key));let previous;
 for(const [i,l] of sample.levels.entries()){
  assert.equal(l.plies,i);assert.equal(l.settings.plies,i);assert(l.wallMs>=0&&Number.isFinite(l.wallMs));
  assert.equal(new Set(l.candidates.map(c=>c.key)).size,l.candidates.length);
  l.candidates.forEach((c,j)=>{assert(legal.has(c.key));assert(Number.isFinite(c.equity));if(j)assert(l.candidates[j-1].equity>=c.equity);});
  if(previous)assert(l.candidates.some(c=>c.key===previous),'Earlier winner omitted');
  previous=l.candidates[0].key;n++;
 }
 if(sample.censored){assert.equal(sample.censored.plies,sample.levels.length);assert(sample.censored.lowerBoundMs>=3990);censored++;}
 else assert.equal(sample.levels.length,5);
}
assert.equal(censored,84);
assert.equal(live.rows.length,68);assert(live.finishedAt);
assert.equal(new Set(live.rows.map(r=>r.id)).size,68);
for(const arm of ['baseline','policy']){
 const mean=live.rows.reduce((s,r)=>s+r[arm].elapsedMs,0)/68;
 assert(Math.abs(mean-live.summary[arm].meanMs)<1e-8);
}
for(const r of live.rows){assert(replay.rows.some(s=>s.id===r.id&&s.split==='test'));assert.equal(r.changed,r.baseline.best!==r.policy.best);}
assert.equal(live.changed,live.rows.filter(r=>r.changed).length);
for(const [name,hash] of Object.entries(traces.hashes).filter(([n])=>n.includes('vendor/')||n.includes('core/'))){
 assert.equal(createHash('sha256').update(fs.readFileSync(name)).digest('hex'),hash,`Published asset changed: ${name}`);
}
console.log(`Verified ${n} completed stages, ${censored} censored stages, 360 legal source contexts, 68 live pairs, hashes and means.`);
