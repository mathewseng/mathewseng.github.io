import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialState,legalPaths,matchingPaths,nextSteps,applyStep,assertState} from '../core/rules.mjs';
import {checkerUndoRoutes,originalReturnRoutes} from '../core/draft.mjs';
import {advancedAction} from '../core/advanced-input.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/origin-return.json',import.meta.url)));
const at=(s,d)=>d.reduce((state,step)=>applyStep(state,step),s);
const mirror=s=>({...structuredClone(s),turn:1,points:s.points.toReversed().map(n=>-n),bar:s.bar.toReversed(),off:s.off.toReversed()});
const custom=(dice,own,other,bar=0)=>{
  const points=Array(24).fill(0);
  for(const [p,n] of own)points[p-1]=n;
  for(const [p,n] of other)points[p-1]=-n;
  return initialState({phase:'move',dice,points,bar:[bar,0],off:[15-bar-own.reduce((s,[,n])=>s+n,0),15-other.reduce((s,[,n])=>s+n,0)]});
};

test('checker tap returns its whole editable journey to the original location',()=>{
  for(const turn of [0,1])for(const minDraft of [0,1,2]){
    const state=turn?mirror(fixture.state):fixture.state,p=n=>turn?23-n:n;
    const draft=fixture.draft.map(s=>({...s,from:p(s.from),to:p(s.to)})),paths=legalPaths(state);
    const checkerReturns=checkerUndoRoutes(state,paths,draft,minDraft),returns=originalReturnRoutes(state,paths,draft,minDraft);
    const options={candidates:nextSteps(paths,draft),returns,checkerReturns,preferred:3,dice:state.dice,turn};
    const action=advancedAction({...options,point:p(7),checker:true});
    if(minDraft===2){assert.equal(action,null);continue;}
    assert.equal(action.type,'undo');assert.equal(action.route.to,p(minDraft?10:15));
    assert.deepEqual(action.route.remaining,draft.slice(0,minDraft));
    assert.deepEqual(action.route.steps,draft.slice(minDraft));
    assert.equal(action.route.die,minDraft?3:8);
    assert.equal(at(state,action.route.remaining).points[p(minDraft?10:15)],turn?-1:1);
    if(minDraft===0)assert.deepEqual(advancedAction({...options,point:p(15),checker:false}).route.remaining,[]);
    else assert.deepEqual(returns,[],'forced entry to the journey remains locked');
  }
});

test('whole-checker return preserves unrelated doubles moves and restores hits and bearoffs',()=>{
  const state=custom([2,2],[[13,2],[8,13]],[[24,14],[9,1]]),paths=legalPaths(state);
  const draft=[{from:12,to:10,die:2},{from:7,to:5,die:2},{from:10,to:8,die:2},{from:8,to:6,die:2}];
  assert.ok(matchingPaths(paths,draft).length);
  const route=checkerUndoRoutes(state,paths,draft).find(r=>r.from===6);
  assert.equal(route.to,12);assert.deepEqual(route.remaining,[draft[1]]);
  assert.deepEqual(route.steps,[draft[0],draft[2],draft[3]]);assert.equal(route.die,6);
  const restored=at(state,route.remaining);
  assert.equal(restored.points[8],-1,'undo of the hit restores opponent blot');assert.equal(restored.bar[1],0);
  assert.equal(restored.points[5],1,'unrelated move retained');
  const home=custom([3,3],[[6,15]],[[24,15]]),hp=legalPaths(home);
  const hd=[{from:5,to:2,die:3},{from:2,to:'off',die:3}];
  const off=checkerUndoRoutes(home,hp,hd).find(r=>r.from==='off');
  assert.equal(off.to,5);assert.deepEqual(off.remaining,[]);
  assert.equal(at(home,off.remaining).off[0],0);
});

test('checker undo preserves bar priority and cannot remove a step enabling later bearing off',()=>{
  const state=custom([4,1],[[6,14]],[[12,15]],1),paths=legalPaths(state);
  const entry={from:'bar',to:20,die:4},continuation={from:20,to:19,die:1};
  const fullReturn=checkerUndoRoutes(state,paths,[entry,continuation])[0];
  assert.equal(fullReturn.to,'bar');assert.deepEqual(fullReturn.remaining,[]);
  assert.deepEqual(checkerUndoRoutes(state,paths,[entry,continuation],1)[0].remaining,[entry]);
  const independent={from:5,to:4,die:1};
  assert.ok(matchingPaths(paths,[entry,independent]).length);
  assert.equal(checkerUndoRoutes(state,paths,[entry,independent]).some(r=>r.from===20),false,'cannot restore bar while retaining another checker move');
  const enteringHome=custom([2,1],[[7,1],[1,14]],[[24,15]]),hp=legalPaths(enteringHome);
  const draft=[{from:6,to:4,die:2},{from:0,to:'off',die:1}];
  assert.ok(matchingPaths(hp,draft).length);
  assert.equal(checkerUndoRoutes(enteringHome,hp,draft).some(r=>r.from===4),false,'cannot undo home entry while retaining bearoff');
});

test('a shared stack returns its most recent checker to its own origin',()=>{
  const state=custom([2,2],[[13,1],[11,1],[6,13]],[[24,15]]),paths=legalPaths(state);
  const draft=[{from:12,to:10,die:2},{from:10,to:8,die:2},{from:10,to:8,die:2},{from:8,to:6,die:2}];
  assert.ok(matchingPaths(paths,draft).length);
  const route=checkerUndoRoutes(state,paths,draft).find(r=>r.from===6);
  assert.equal(route.to,10,'the second checker started on 11, not 13');
  assert.deepEqual(route.remaining,draft.slice(0,2),'the first checker remains on 9');
  const restored=at(state,route.remaining);
  assert.equal(restored.points[8],1);assert.equal(restored.points[10],1);
});

test('all checker returns retain complete-turn legality and forced prefixes, in either direction',()=>{
  const fixtures=[fixture.state,initialState({phase:'move',dice:[2,2]}),initialState({phase:'move',dice:[4,1]}),
    custom([4,1],[[6,14]],[[12,15]],1),custom([3,3],[[6,10],[3,4],[1,1]],[[24,15]])];
  let checked=0;
  for(const base of fixtures)for(const state of [base,mirror(base)]){
    assertState(state);const paths=legalPaths(state),snapshot=JSON.stringify(state);
    for(const path of paths)for(let length=1;length<=path.steps.length;length++)for(let min=0;min<=length;min++){
      const draft=path.steps.slice(0,length),original=JSON.stringify(draft);
      for(const route of checkerUndoRoutes(state,paths,draft,min)){
        checked++;assert.equal(route.remaining.length,length-route.steps.length);assert.ok(route.steps.length>=1);
        assert.deepEqual(route.remaining.slice(0,min),draft.slice(0,min));
        assert.ok(matchingPaths(paths,route.remaining).length);assertState(at(state,route.remaining));
        assert.equal(route.from,route.steps.at(-1).to);assert.equal(route.to,route.steps[0].from);
        for(let i=1;i<route.steps.length;i++)assert.equal(route.steps[i].from,route.steps[i-1].to);
      }
      assert.equal(JSON.stringify(draft),original);
    }
    assert.equal(JSON.stringify(state),snapshot);
  }
  assert.ok(checked>500);
});
