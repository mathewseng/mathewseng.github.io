import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator } from '../engine/evaluate.mjs';
import { initialState, legalTurns, boardKey, commitTurn } from '../core/rules.mjs';
import { toXGID } from '../core/xgid.mjs';

function fixture(state=initialState({phase:'move',dice:[3,3],matchLength:0})) {
  const turns=legalTurns(state),calls=[];
  const boards=turns.map(t=>toXGID({...t.state,phase:'roll',dice:[]},{engine:true}).split(':')[0]);
  let failNext=false;
  const module={ cwrap(name){
    if(name==='init'||name==='shutdown')return()=>0;
    return (original,after,depth)=>{
      calls.push({original,after,depth});
      if(failNext){failNext=false;return JSON.stringify({error:'temporary failure'});}
      const i=boards.indexOf(after.split(':')[0]);assert.ok(i>=0);
      const equity=(depth>=3&&i===4?.02:-i*.015)+depth*.001;
      return JSON.stringify({equity,cubeless:equity-.001,mwc:null,probabilities:[.5,.1,.01,.08,.005]});
    };
  },UTF8ToString:p=>p,_free(){}};
  return {state,turns,calls,engine:createEvaluator(module),fail:()=>{failNext=true;}};
}
const count=(f,d)=>f.calls.filter(c=>c.depth===d).length;

test('an unlisted Research move adds only its own four-ply evaluation, retaining the full comparison',()=>{
  const f=fixture(),hint=f.engine.analyze(f.state,'research');
  const others=f.turns.filter(t=>!hint.candidates.some(c=>c.key===t.key));
  let previous=count(f,4);
  for(const turn of others.slice(0,3)){
    const result=f.engine.analyze(f.state,'research','checker',turn.steps);
    assert.equal(count(f,4)-previous,1,'do not recompute completed four-ply finalists');previous=count(f,4);
    assert.equal(result.actual.key,turn.key);
    for(const c of hint.candidates)assert.deepEqual(result.candidates.find(t=>t.key===c.key),c);
    assert.equal(result.error,Math.max(0,result.candidates[0].equity-result.actual.equity));
  }
  f.engine.analyze(f.state,'research');assert.equal(count(f,4),previous);
});

test('returned candidate, actual, step and probability mutations cannot corrupt later grades',()=>{
  const f=fixture(),first=f.engine.analyze(f.state,'research');
  const expected=structuredClone(first.candidates),steps=structuredClone(first.candidates[0].steps);
  first.candidates[0].equity=99;first.candidates[0].probabilities[0]=0;first.candidates[0].steps[0].to=99;
  const n=count(f,4),grade=f.engine.analyze(f.state,'research','checker',steps);
  assert.equal(count(f,4),n);assert.deepEqual(grade.candidates,expected);
  grade.actual.probabilities[1]=88;
  assert.deepEqual(f.engine.analyze(f.state,'research').candidates,expected);
});

test('only exact full decision and root contexts reuse high-depth scores; depths never mix',()=>{
  const f=fixture(),s=f.state;
  const variants=[s,{...s,cube:{value:2,owner:0}},{...s,cube:{value:2,owner:1}},
    {...s,rules:{...s.rules,jacoby:true}},{...s,rules:{...s.rules,immediateRedoubles:1}},
    {...s,rules:{...s.rules,cube:false}},{...s,matchLength:7,scores:[2,4]},
    {...s,matchLength:7,scores:[4,2]},{...s,matchLength:7,scores:[6,2],crawford:true},
    {...s,matchLength:7,scores:[6,2],crawfordPlayed:true}];
  for(const state of variants){
    const before=count(f,4),a=f.engine.analyze(state,'research');
    assert.ok(count(f,4)>before);const after=count(f,4);
    assert.deepEqual(f.engine.analyze(structuredClone(state),'research').candidates,a.candidates);
    assert.equal(count(f,4),after);
    const expert=f.engine.analyze(state,'expert');
    const common=expert.candidates.find(c=>a.candidates.some(d=>d.key===c.key));
    assert.ok(Math.abs(a.candidates.find(c=>c.key===common.key).equity-common.equity-.001)<1e-12);
  }
  f.engine.analyze(s,'research');const n=count(f,4);
  f.engine.analyze(s,'research','checker',null,{automatic:true});
  assert.ok(count(f,4)>n,'an automatically screened root list has separate identity');
});

test('arbitrary grading is bounded, evicted results are rescored, and invalid paths are never accepted by cache',()=>{
  const f=fixture(),s=f.state,submissions=f.turns.slice(10,52);
  for(const t of submissions)f.engine.analyze(s,'research','checker',t.steps);
  const n=count(f,4);f.engine.analyze(s,'research','checker',submissions[0].steps);
  assert.ok(count(f,4)>n,'old results must leave the bounded cache');
  const before=f.calls.length;
  assert.throws(()=>f.engine.analyze(s,'research','checker',[{from:23,to:17,die:6}]),/legal|complete|Invalid/i);
  assert.equal(f.calls.length,before,'validation precedes any cached grade');
  const result=f.engine.analyze(s,'research','checker',submissions.at(-1).steps);
  assert.equal(result.actual.key,boardKey(commitTurn(s,submissions.at(-1).steps)));
});

test('failed evaluations do not populate a high-depth cache',()=>{
  const f=fixture(),hint=f.engine.analyze(f.state,'research');
  const turn=f.turns.find(t=>!hint.candidates.some(c=>c.key===t.key));
  f.fail();assert.throws(()=>f.engine.analyze(f.state,'research','checker',turn.steps),/temporary failure/);
  const n=count(f,4),result=f.engine.analyze(f.state,'research','checker',turn.steps);
  assert.equal(result.actual.key,turn.key);assert.equal(count(f,4)-n,1);
});

test('shutdown releases caches and another evaluator never inherits them',()=>{
  const a=fixture(),b=fixture(a.state);
  a.engine.analyze(a.state,'research');
  b.engine.analyze(b.state,'research');assert.ok(count(b,4)>0);
  const before=count(a,4);a.engine.shutdown();
  // The mock supports calls after shutdown so disposal can be observed; a real
  // worker is destroyed and creates a new evaluator before subsequent work.
  a.engine.analyze(a.state,'research');assert.ok(count(a,4)>before);
});
