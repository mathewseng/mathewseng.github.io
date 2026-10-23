import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../core/rules.mjs';
import { createEvaluator } from '../engine/evaluate.mjs';
import { runAdaptive } from '../engine/adaptive.mjs';
import { PRESETS } from '../engine/metadata.mjs';
import { leadInfo, forecastNext, nextCandidateCount, chooseSearchDecision } from '../engine/search-policy.mjs';

const level = (plies, best='a', gap=.1, stageMs=100) => ({type:'checker',settings:{plies},stageMs,
  candidates:[{key:best,equity:.2},{key:best==='a'?'b':'a',equity:.2-gap}]});
const state = () => initialState({phase:'move',dice:[3,1],matchLength:0,rules:{cube:false}});

test('lead gap tracks resulting boards, not notation, and cannot invent a runner-up',()=>{
  assert.deepEqual(leadInfo(level(2),level(1)),{gap:.1,previousGap:.1,stable:true});
  assert.equal(leadInfo(level(2,'b'),level(1)).stable,false);
  assert.equal(leadInfo({...level(2),candidates:[{key:'a',equity:.2}]},level(1)),null);
  assert.equal(leadInfo({...level(2),candidates:[{key:'a',equity:NaN},{key:'b',equity:0}]},level(1)),null);
});

test('next-stage plan retains the earlier winner and submitted move beyond the narrower shortlist',()=>{
  const deep={...level(2),candidates:Array.from({length:9},(_,i)=>({key:String(i),equity:-i*.03})),actual:{key:'8'}};
  const expert={...level(3),candidates:[{key:'6',equity:.1},{key:'0',equity:0}]};
  assert.equal(nextCandidateCount([level(1),deep,expert]),4);
});

test('runtime estimates scale with observed device speed instead of assuming desktop milliseconds',()=>{
  const levels=[level(1,'a',.1,30),level(2,'a',.1,100)];
  const a=forecastNext(state(),levels),b=forecastNext(state(),levels.map(l=>({...l,stageMs:l.stageMs*4})));
  assert(a.estimateMs>0 && a.lowMs<=a.highMs);
  assert(Math.abs(b.estimateMs/a.estimateMs-4)<1e-10);
  assert.equal(forecastNext(state(),[level(0),level(1)]),null);
});

test('optional four-ply admission accounts for capped-model uncertainty and measured tree growth',()=>{
  const s=initialState({phase:'move',dice:[4,1],matchLength:0,rules:{cube:true,immediateRedoubles:2}});
  const rows=n=>Array.from({length:n},(_,i)=>({key:String(i),equity:-i*.004}));
  const evaluations=[{...level(2,'0',.004,204),candidates:rows(16)},
    {...level(3,'0',.004,1644),candidates:rows(8)}];
  const forecast=forecastNext(s,evaluations);
  assert.ok(forecast.estimateMs>10000);
  assert.ok(forecast.estimateMs>=forecast.observedGrowthMs);
  assert.equal(chooseSearchDecision(s,evaluations).reason,'predicted-cost');
  const affordable=evaluations.map(r=>({...r,stageMs:r.stageMs/100}));
  assert.equal(chooseSearchDecision(s,affordable).reason,'searching','4 ply still runs when affordable');
});

test('clear-lead shortcut is unavailable to unstable, close, match or submitted-move decisions',()=>{
  const levels=[level(2,'a',.1,40),level(3,'a',.1,200)];
  const broad=chooseSearchDecision(state(),levels);
  assert.equal(broad.reason,'clear-lead');
  for(const [s,ls,submitted] of [
    [state(),[level(2,'b',.1,40),level(3,'a',.1,200)],null],
    [state(),[level(2,'a',.001,40),level(3,'a',.001,200)],null],
    [{...state(),matchLength:7,scores:[2,4]},levels,null],
    [state(),levels,[{from:24,to:21,die:3}]],
  ]) assert.notEqual(chooseSearchDecision(s,ls,submitted).reason,'clear-lead');
});

test('neither a clear lead nor an expensive forecast can end Auto at two ply',()=>{
  for (const type of ['checker','cube']) {
    for (const gap of [.001,.5]) {
      const levels=[level(1,'a',gap,1000),level(2,'a',gap,10000)].map(r=>({...r,type}));
      assert.ok(forecastNext(state(),levels).estimateMs>5000);
      assert.equal(chooseSearchDecision(state(),levels).reason,'searching');
    }
  }
});

test('moderate leads now deepen; only a large, stable lead skips optional fourth ply',()=>{
  for (const [cube, moderate, large] of [[false,.05,.09],[true,.10,.17]]) {
    const s={...state(),rules:{cube}};
    const levels=(previous,current)=>[level(2,'a',previous,40),level(3,'a',current,200)];
    assert.equal(chooseSearchDecision(s,levels(.05,moderate)).reason,'searching');
    assert.equal(chooseSearchDecision(s,levels(.03,large)).reason,'searching','preceding depth must also be decisive');
    assert.equal(chooseSearchDecision(s,levels(.05,large)).reason,'clear-lead');
    const cheap=levels(.05,large).map(r=>({...r,stageMs:r.stageMs/1000}));
    assert.equal(chooseSearchDecision(s,cheap).reason,'searching','very cheap deeper work remains worthwhile');
  }
});

test('Auto completes fourth ply for a moderate lead that previously stopped at three',()=>{
  const updates=[];let clock=0;
  const result=runAdaptive({analyze(s,preset){
    const depth=PRESETS[preset].plies;
    clock += [10,20,40,200,1000][depth];
    return {...level(depth,'a',.05),status:'complete'};
  }},state(),'checker',null,r=>updates.push(r.settings.plies),()=>clock);
  assert.deepEqual(updates,[0,1,2,3,4]);
  assert.equal(result.settings.plies,4);
  assert.equal(result.budget.reason,'maximum-depth');
});

test('adaptive search publishes its stopping reason and passes each winner to the next stage',()=>{
  const updates=[], calls=[]; let clock=0;
  const result=runAdaptive({analyze(s,preset,kind,submitted,options){
    const depth=PRESETS[preset].plies;
    calls.push(options);
    clock += [10,40,200,800][depth];
    return {...level(depth),status:'complete'};
  }},state(),'checker',null,r=>updates.push(r),()=>clock);
  assert.deepEqual(updates.map(r=>r.settings.plies),[0,1,2,3]);
  assert.deepEqual(calls.map(c=>c.retainKeys),[[],['a'],['a'],['a']]);
  assert.equal(result.budget.reason,'clear-lead');
  assert.equal(result.settings.searchPolicy,'minimum-three-v2');
  assert.equal(result.budget.forecast.nextPlies,4);
  assert.equal(result.stageMs,800);
});

test('automatic 4-ply search evaluates the 3-ply winner even when its 2-ply rank is outside Research',()=>{
  const keys=new Map();
  const engine=createEvaluator({
    cwrap(name){if(name==='init')return()=>0;return(original,after,depth)=>{
      if(!keys.has(after))keys.set(after,keys.size);
      const i=keys.get(after),equity=depth>=3&&i===2?.1:-i*.03;
      return JSON.stringify({equity,cubeless:equity,mwc:null,probabilities:[.5,0,0,0,0]});
    };},UTF8ToString:x=>x,_free(){},
  });
  const s=state();engine.analyze(s,'quick');engine.analyze(s,'deep','checker',null,{automatic:true});
  const expert=engine.analyze(s,'expert','checker',null,{automatic:true});
  const wanted=expert.candidates[0].key;
  const guarded=engine.analyze(s,'research','checker',null,{automatic:true});
  assert(guarded.candidates.some(c=>c.key===wanted),'Research itself must preserve the Expert leader');
  const retained=engine.analyze(s,'research','checker',null,{automatic:true,retainKeys:[wanted]});
  assert.equal(retained.candidates[0].key,wanted);
  assert(retained.candidates.every(c=>Number.isFinite(c.equity)));
  assert.equal(engine.analyze(s,'research').candidates[0].key,wanted,'Fixed Research must preserve the leader too');
});

test('optional fourth-ply cost gate uses the ten-second next-stage threshold',()=>{
  const s=state(), base=[level(2,'a',.001,30),level(3,'a',.001,100)];
  const prediction=forecastNext(s,base).estimateMs;
  for(const [estimate,reason] of [[4999,'searching'],[7500,'searching'],[9999,'searching'],[10001,'predicted-cost']]) {
    const scaled=base.map(l=>({...l,stageMs:l.stageMs*estimate/prediction}));
    assert.equal(chooseSearchDecision(s,scaled).reason,reason);
  }
  const cube=[level(2),level(3)].map(l=>({...l,type:'cube'}));
  assert.equal(chooseSearchDecision(state(),cube).reason,'cube-depth-limit');
});

test('a slow start does not prevent an affordable next depth',()=>{
  const evals=[level(0,'a',.001,8000),level(1,'a',.001,2000),level(2,'a',.001,10),level(3,'a',.001,10)];
  assert.ok(forecastNext(state(),evals).estimateMs<5000);
  assert.equal(chooseSearchDecision(state(),evals).reason,'searching');
});
