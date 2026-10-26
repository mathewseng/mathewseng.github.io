import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvaluator} from '../engine/evaluate.mjs';
import {initialState,transition} from '../core/rules.mjs';

function fixture(equity=.25) {
  const calls=[];
  const engine=createEvaluator({cwrap(name){
    if(name==='init'||name==='shutdown')return()=>0;
    return(...args)=>{calls.push([name,...args]);return JSON.stringify({action:'roll',equity,cubeless:equity,
      probabilities:[.6,.1,0,.05,0],outcomes:[equity,equity*2,1],mwc:null});};
  },UTF8ToString:p=>p,_free(){}});
  return {engine,calls};
}

test('yielding cube analysis retains double/take/pass/beaver/raccoon branches and values',async()=>{
  const state=initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:2}});
  for(const s of [state,transition(state,{type:'double'},0)]) {
    const a=fixture(),b=fixture();let checkpoints=0;
    const {elapsedMs:x,...expected}=a.engine.analyze(s,'expert','cube');
    const {elapsedMs:y,...actual}=await b.engine.analyzeAsync(s,'expert','cube',null,{},async()=>{checkpoints++;});
    assert.deepEqual(actual,expected);assert.deepEqual(a.calls,b.calls);
    assert.ok(checkpoints>1,'native cube branches are separate cancellation boundaries');
  }
});

test('unlimited cube replies reuse one normalized accepted value and choose the alternating action',()=>{
 for(const [depth,q,action] of [[2,-.25,'beaver'],[3,.25,'raccoon']]) {
  let s=initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:-1}});
  s=transition(s,{type:'double'},0);
  for(let i=0;i<depth;i++)s=transition(s,{type:i%2?'raccoon':'beaver'},1-s.pending.by);
  const f=fixture(q),result=f.engine.analyze(s,'expert','cube');
  assert.equal(result.action,action);
  assert.equal(f.calls.filter(c=>c[0]==='bg_value').length,1,'long chains require only one accepted-position search');
  assert.ok(f.calls.every(c=>c[3]===1),'native evaluation has beavers enabled for the no-limit rule');
  assert.ok(Number.isFinite(result.equity));
 }
});

test('additional rational replies preserve ordinary opening-book cube values',()=>{
 // Invariant normalized take equity after cube ownership has been established.
 // Exhaust both advantage signs, players, cube scales and the ordinary offer.
 for(const turn of [0,1])for(const stake of [1,16,4096,2**26])for(let i=-24;i<=24;i++) {
  const q=i/8;
  for(const phase of ['roll','double']) {
   const evaluate=limit=>{
    let state=initialState({turn,phase:'roll',matchLength:0,cube:{value:stake,owner:null},rules:{jacoby:true,immediateRedoubles:limit}});
    if(phase==='double')state=transition(state,{type:'double'},turn);
    return fixture(q).engine.analyze(state,'quick','cube');
   };
   const finite=evaluate(2),unlimited=evaluate(-1);
   assert.equal(unlimited.equity,finite.equity,`${turn}/${stake}/${q}/${phase}`);
   assert.equal(unlimited.action,finite.action);
  }
 }
});
