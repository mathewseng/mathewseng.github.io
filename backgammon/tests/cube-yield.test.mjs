import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvaluator} from '../engine/evaluate.mjs';
import {initialState,transition} from '../core/rules.mjs';

function fixture() {
  const calls=[];
  const engine=createEvaluator({cwrap(name){
    if(name==='init'||name==='shutdown')return()=>0;
    return(...args)=>{calls.push([name,...args]);return JSON.stringify({action:'roll',equity:.25,cubeless:.25,
      probabilities:[.6,.1,0,.05,0],outcomes:[.25,.5,1],mwc:null});};
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
