import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,legalPaths,matchingPaths,applyStep,assertState} from '../core/rules.mjs';
import {undoDieDraft} from '../core/draft.mjs';

const custom=(dice,own,other,bar=0)=>{
  const points=Array(24).fill(0);
  for(const [p,n] of own)points[p-1]=n;
  for(const [p,n] of other)points[p-1]=-n;
  return initialState({phase:'move',dice,points,bar:[bar,0],off:[15-bar-own.reduce((s,[,n])=>s+n,0),15-other.reduce((s,[,n])=>s+n,0)]});
};
const at=(s,d)=>d.reduce((state,step)=>applyStep(state,step),s);
const mirror=s=>({...structuredClone(s),turn:1,points:s.points.toReversed().map(n=>-n),bar:s.bar.toReversed(),off:s.off.toReversed()});

test('tapping either used die removes only its independent move, regardless of play order',()=>{
  const state=custom([4,1],[[13,1],[6,14]],[[24,15]]),paths=legalPaths(state);
  const moves=[{from:12,to:8,die:4},{from:5,to:4,die:1}];
  for(const draft of [moves,moves.toReversed()])for(const index of [0,1]){
    assert.ok(matchingPaths(paths,draft).length);
    assert.deepEqual(undoDieDraft(state,paths,draft,index),[draft[1-index]]);
  }
});

test('each doubles slot preserves the other three independent moves',()=>{
  const state=custom([2,2],[[13,1],[10,1],[7,1],[4,1]],[[24,15]]),paths=legalPaths(state);
  const draft=[12,9,6,3].map(from=>({from,to:from-2,die:2}));
  for(let index=0;index<4;index++)assert.deepEqual(undoDieDraft(state,paths,draft,index),draft.filter((_,i)=>i!==index));
});

test('die undo restores a hit while retaining an unrelated later move',()=>{
  const state=custom([4,1],[[13,1],[6,14]],[[9,1],[24,14]]),paths=legalPaths(state);
  const draft=[{from:12,to:8,die:4},{from:5,to:4,die:1}];
  assert.equal(at(state,draft).bar[1],1);
  const after=at(state,undoDieDraft(state,paths,draft,0));
  assert.equal(after.bar[1],0);assert.equal(after.points[8],-1);
  assert.equal(after.points[4],1);assert.equal(after.points[12],1);
});

test('same-checker continuations rebase while unrelated moves and bar/bearoff legality are preserved',()=>{
  const state=custom([2,2],[[13,1],[6,14]],[[24,15]]),paths=legalPaths(state);
  const draft=[{from:12,to:10,die:2},{from:5,to:3,die:2},{from:10,to:8,die:2},{from:3,to:1,die:2}];
  assert.deepEqual(undoDieDraft(state,paths,draft,0),[draft[1],draft[0],draft[3]],'same-checker continuation rebases; unrelated chain stays');
  assert.deepEqual(undoDieDraft(state,paths,draft,1),[draft[0],draft[2],draft[1]]);
  const bar=custom([4,1],[[6,14]],[[12,15]],1);
  assert.deepEqual(undoDieDraft(bar,legalPaths(bar),[{from:'bar',to:20,die:4},{from:5,to:4,die:1}],0),[]);
  const home=custom([2,1],[[7,1],[1,14]],[[24,15]]);
  assert.deepEqual(undoDieDraft(home,legalPaths(home),[{from:6,to:4,die:2},{from:0,to:'off',die:1}],0),[]);
});


test('undoing either die of a combined move keeps the other die when legal',()=>{
  const state=custom([4,1],[[13,1],[6,14]],[[24,15]]),paths=legalPaths(state);
  const draft=[{from:12,to:8,die:4},{from:8,to:7,die:1}];
  assert.deepEqual(undoDieDraft(state,paths,draft,0),[{from:12,to:11,die:1}]);
  assert.deepEqual(undoDieDraft(state,paths,draft,1),[draft[0]]);
  const blocked=custom([4,1],[[13,1],[6,14]],[[12,2],[24,13]]);
  assert.deepEqual(undoDieDraft(blocked,legalPaths(blocked),draft,0),[],'blocked alternate route cannot be invented');
  const hit=custom([4,1],[[13,1],[6,14]],[[9,1],[24,14]]);
  const restored=at(hit,undoDieDraft(hit,legalPaths(hit),draft,0));
  assert.equal(restored.points[8],-1,'revising the journey restores the removed hit');
  assert.equal(restored.bar[1],0);assert.equal(restored.points[11],1);
  const bar=custom([4,1],[[6,14]],[[12,15]],1);
  assert.deepEqual(undoDieDraft(bar,legalPaths(bar),[{from:'bar',to:20,die:4},{from:20,to:19,die:1}],0),[{from:'bar',to:23,die:1}]);
});

test('all die undos preserve prior steps, forced prefixes and complete-turn legality in both directions',()=>{
  const fixtures=[initialState({phase:'move',dice:[2,2]}),initialState({phase:'move',dice:[4,1]}),
    custom([4,1],[[6,14]],[[12,15]],1),custom([3,3],[[6,10],[3,4],[1,1]],[[24,15]])];
  let checked=0;
  for(const base of fixtures)for(const state of [base,mirror(base)]){
    const paths=legalPaths(state);
    for(const path of paths)for(let length=1;length<=path.steps.length;length++){
      const draft=path.steps.slice(0,length),original=JSON.stringify(draft);
      for(let index=0;index<length;index++){
        const remaining=undoDieDraft(state,paths,draft,index,index);
        checked++;assert.ok(remaining.length<length);
        assert.deepEqual(remaining.slice(0,index),draft.slice(0,index));
        assert.ok(matchingPaths(paths,remaining).length);assertState(at(state,remaining));
        assert.equal(undoDieDraft(state,paths,draft,index,index+1),null,'forced die stays locked');
        const single=draft.filter((_,i)=>i!==index);
        if(matchingPaths(paths,single).length)assert.deepEqual(remaining,single,'never undo extra steps when one suffices');
      }
      assert.equal(JSON.stringify(draft),original);
    }
  }
  assert.ok(checked>500);
});
