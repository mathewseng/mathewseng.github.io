import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {family,createPlan,jobsFor,FOCUS} from '../scripts/filtered-rollout-plan.mjs';

test('corrected rollout plan freezes all retained candidates, disjoint seeds, and complete shard coverage',()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(family,'docs/filtered-rollout-v1-inputs.json')));
 assert.equal(createPlan(plan.runtime).signature,plan.signature);
 assert.equal(plan.plan.length,7);assert.equal(plan.plan.reduce((n,d)=>n+d.candidates.length,0),24);
 const originals=plan.sources.flatMap(s=>JSON.parse(fs.readFileSync(path.join(family,s.file))).plan);
 for(const d of plan.plan){
  const old=originals.find(x=>x.id===d.id);
  assert.deepEqual(d.candidates.map(({candidateId,...c})=>c),old.candidates);
  assert.deepEqual(d.referenceBest,old.referenceBest);
  assert.equal(new Set(d.candidates.map(c=>c.candidateId)).size,d.candidates.length);
 }
 const jobs=jobsFor(plan),allKeys=new Set(jobs.map(j=>j.key));
 assert.equal(jobs.length,14336);assert.equal(allKeys.size,jobs.length);
 assert.equal(jobs.length*plan.batchSize,458752);
 assert.equal(jobs.filter(j=>j.policy==='fixed-normal').length,12288);
 for(const p of ['fixed-deep','buggy-normal']){const subset=jobs.filter(j=>j.policy===p);assert.equal(subset.length,1024);assert.ok(subset.every(j=>j.id===FOCUS));}
 const shards=Array.from({length:20},(_,i)=>jobsFor(plan,i));
 assert.equal(shards.flat().length,jobs.length);assert.equal(new Set(shards.flat().map(j=>j.key)).size,jobs.length);
 for(let i=0;i<20;i++)assert.ok(shards[i].every(j=>j.batch%20===i));
 assert.deepEqual(plan.seedExclusions.diagnosticSeeds,[123456789,987654321,31811004]);
 assert.equal(plan.seedExclusions.diagnosticOffsets,64);
 assert.deepEqual(Object.fromEntries(['moveGaps','policyGapEffects','candidatePolicyEffects','absoluteEquities'].map(k=>[k,plan.comparisons[k]])),{moveGaps:19,policyGapEffects:2,candidatePolicyEffects:4,absoluteEquities:28});
 assert.equal(plan.collectionEnabled,!!plan.runtime);
 assert.equal(plan.referenceAttributions['opening-21'].c0.trials,46656);
 assert.equal(plan.referenceAttributions['opening-21'].c2.trials,5184,'candidate attribution must not copy the leader');
 assert.equal(plan.referenceAttributions['opening-21'].c2.author,'Stick Rice');
});

test('corrected runtime cannot be skipped by same-second make timestamps',()=>{
 const builder=fs.readFileSync(path.join(family,'scripts/build-filtered-rollout-native.mjs'),'utf8');
 const objectDelete=builder.indexOf("fs.unlinkSync(path.join(out,'obj/eval.o'))"),targetDelete=builder.indexOf("fs.unlinkSync(path.join(out,'gnubg-core'))");
 const rebuild=builder.indexOf("execFileSync('make'",targetDelete);
 assert.ok(objectDelete>=0&&targetDelete>objectDelete&&rebuild>targetDelete);
 const fixture=JSON.parse(fs.readFileSync(path.join(family,'docs/filtered-rollout-v1-smoke-fixture.json')));
 assert.notEqual(fixture.binaries.fixed,fixture.binaries.legacy);
 const build=JSON.parse(fs.readFileSync(path.join(family,'docs/filtered-rollout-v1-mac-build.json')));
 assert.deepEqual(build.binaries,fixture.binaries);
 const isolation=build.sourceIsolation;
 for(const [before,after,want] of [['sourceBefore','sourceAfter',['src/eval.c']],['objectsBefore','objectsAfter',['obj/eval.o']]]){
  assert.deepEqual(Object.keys(isolation[before]),Object.keys(isolation[after]));
  assert.deepEqual(Object.keys(isolation[after]).filter(k=>isolation[before][k]!==isolation[after][k]),want);
 }
});
