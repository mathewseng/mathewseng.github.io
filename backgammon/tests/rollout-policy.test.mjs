import test from 'node:test';
import assert from 'node:assert/strict';
import {runRollout} from '../engine/rollout.mjs';
import {createEvaluator} from '../engine/evaluate.mjs';
import {initialState,legalTurns,positionKey} from '../core/rules.mjs';
import {ENGINE_VERSION} from '../engine/metadata.mjs';
const state=initialState({phase:'move',dice:[2,1],matchLength:0});
function fixture(){
 const calls=[],turns=legalTurns(state).slice(0,2);
 return {calls,evaluator:{
  analyze(){return {engine:ENGINE_VERSION,positionKey:positionKey(state),candidates:turns.map((t,i)=>({key:t.key,steps:t.steps,equity:-i*.01}))};},
  rolloutBatch(s,t,n,seed,policy){calls.push({seed,policy});return {samples:n,equity:.2,standardError:.01,cubeless:.15,probabilities:[.55,.1,0,.05,0],mwc:null};}
 }};
}
test('rollout policy is carried through every batch and prevents cross-policy resume',async()=>{
 const f=fixture();let checkpoint;
 const r=await runRollout(f.evaluator,state,{trials:64,seed:17,policy:'strong'},null,cp=>checkpoint=cp);
 assert.ok(f.calls.every(c=>c.policy==='strong'));
 assert.equal(r.settings.checkerPlies,2);assert.equal(r.settings.cubePlies,2);
 assert.equal(checkpoint.policy,'strong');
 for(const policy of ['basic','balanced'])await assert.rejects(runRollout(f.evaluator,state,{trials:64,seed:17,policy,resume:checkpoint}),/checkpoint/);
 const resumed=await runRollout(f.evaluator,state,{trials:64,seed:17,policy:'strong',resume:checkpoint});
 assert.equal(f.calls.length,4);assert.deepEqual(resumed.candidates,r.candidates);
 await assert.rejects(runRollout(f.evaluator,state,{trials:64,policy:'unknown'}),/policy/);
 await assert.rejects(runRollout(f.evaluator,state,{trials:64,seed:17,policy:'strong',resume:{...checkpoint,policy:'basic'}}),/checkpoint/);
});
test('native rollout binding receives separate depths and rejects mislabeled native results',()=>{
 let args,last,freed=0,wrong=false;
 const module={cwrap(name){if(name==='init')return()=>0;return(...values)=>{assert.equal(name,'bg_rollout_config');args=values;last={samples:8,checkerPlies:wrong?0:values[4],cubePlies:values[5],truncationPlies:values[6]?5:0,lateAfterPlies:values[6]?2:0,lateCheckerPlies:values[6]?1:values[4],lateCubePlies:values[5],equity:.1,standardError:.02,probabilities:[.5,.1,0,.05,0]};return 1;};},UTF8ToString(){return JSON.stringify(last);},_free(){freed++;}};
 const e=createEvaluator(module),turn=legalTurns(state)[0];
 e.rolloutBatch(state,turn,8,0xffffffff,'strong');assert.deepEqual(args.slice(2),[8,-1,2,2,0]);
 e.rolloutBatch(state,turn,8,1,'balanced');assert.deepEqual(args.slice(4),[1,1,0]);
 e.rolloutBatch(state,turn,8,1,'basic');assert.deepEqual(args.slice(4),[0,0,0]);
 e.rolloutBatch(state,turn,8,1,'short-deep');assert.deepEqual(args.slice(4),[2,2,1]);
 wrong=true;assert.throws(()=>e.rolloutBatch(state,turn,8,1,'strong'),/statistics/);assert.equal(freed,5);
});

import {batchContrast,summarize} from '../scripts/summarize-rollout-disagreements.mjs';
test('paired common-dice intervals retain covariance instead of assuming independent alternatives',()=>{
 const a=[3,7,1,5].map((v,i)=>({batch:i,seed:7+i*65536,value:{samples:32,equity:v}}));
 const b=a.map(r=>({...r,value:{...r.value,equity:r.value.equity-.02}}));
 const paired=batchContrast(a,b);
 assert.ok(Math.abs(paired.difference-.02)<1e-12);assert.ok(paired.standardError<1e-12);assert.ok(paired.lower>0);
 assert.throws(()=>batchContrast(a,b.map((r,i)=>({...r,seed:r.seed+(i===0?1:0)}))),/Unpaired/);
 assert.throws(()=>summarize({plan:[{id:'a',candidates:[{board:'a'}]}],policies:[{id:'strong',checkerPlies:2,cubePlies:2}],trials:64},[]),/incomplete/);
});
