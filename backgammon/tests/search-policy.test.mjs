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

test('clear-lead shortcut is unavailable to unstable, close, match or submitted-move decisions',()=>{
  const levels=[level(1,'a',.1,40),level(2,'a',.1,200)];
  const broad=chooseSearchDecision(state(),levels,240,1000);
  assert.equal(broad.reason,'clear-lead');
  for(const [s,ls,submitted] of [
    [state(),[level(1,'b',.1,40),level(2,'a',.1,200)],null],
    [state(),[level(1,'a',.001,40),level(2,'a',.001,200)],null],
    [{...state(),matchLength:7,scores:[2,4]},levels,null],
    [state(),levels,[{from:24,to:21,die:3}]],
  ]) assert.notEqual(chooseSearchDecision(s,ls,240,1000,submitted).reason,'clear-lead');
});

test('adaptive search publishes its stopping reason and passes each winner to the next stage',()=>{
  const updates=[], calls=[]; let clock=0;
  const result=runAdaptive({analyze(s,preset,kind,submitted,options){
    const depth=PRESETS[preset].plies;
    calls.push(options);
    clock += [10,40,200][depth];
    return {...level(depth),status:'complete'};
  }},state(),'checker',null,r=>updates.push(r),()=>clock);
  assert.deepEqual(updates.map(r=>r.settings.plies),[0,1,2]);
  assert.deepEqual(calls.map(c=>c.retainKeys),[[],['a'],['a']]);
  assert.equal(result.budget.reason,'clear-lead');
  assert.equal(result.settings.searchPolicy,'gap-time-v1');
  assert.equal(result.budget.forecast.nextPlies,3);
  assert.equal(result.stageMs,200);
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
  const old=engine.analyze(s,'research','checker',null,{automatic:true});
  assert(!old.candidates.some(c=>c.key===wanted),'Fixture must expose the narrower-screen omission');
  const retained=engine.analyze(s,'research','checker',null,{automatic:true,retainKeys:[wanted]});
  assert.equal(retained.candidates[0].key,wanted);
  assert(retained.candidates.every(c=>Number.isFinite(c.equity)));
  assert(!engine.analyze(s,'research').candidates.some(c=>c.key===wanted),'Automatic retention must not alter fixed presets');
});
