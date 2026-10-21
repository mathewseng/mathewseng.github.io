import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, assertState} from '../core/rules.mjs';
import {editorOwner, editorCount, editorTargets, transferChecker} from '../core/position-editor.mjs';

test('editor transfers either color freely while preserving totals, context and source',()=>{
  const initial=initialState({phase:'move',dice:[3,1],matchLength:0});
  const original=JSON.stringify(initial);
  for(const from of Array.from({length:24},(_,i)=>i)) for(const to of editorTargets(initial,from)) {
    if(from===to)continue;
    const owner=editorOwner(initial,from), next=transferChecker(initial,from,to);
    assertState(next);
    assert.equal(editorCount(next,from),editorCount(initial,from)-1);
    assert.equal(editorCount(next,to),editorCount(initial,to)+1);
    assert.equal(editorOwner(next,to),owner);
    for(const key of ['turn','dice','cube','phase','scores','rules']) assert.deepEqual(next[key],initial[key]);
    assert.deepEqual(transferChecker(next,to,from),initial);
  }
  assert.equal(JSON.stringify(initial),original);
});
test('editor never mixes colors, creates checkers or transfers into the other player’s tray',()=>{
  const s=initialState({phase:'move',dice:[3,1]});
  for(const [from,to] of [[7,18],[7,'bar1'],[7,'off1'],['off0',9],['bar1',5],[25,0],[null,0],[7,7],[7,24]])
    assert.equal(transferChecker(s,from,to),null);
});
test('bar and off supplies support repeated placement and full stacks in either direction',()=>{
  let s={...initialState({phase:'move',dice:[3,1]}),points:Array(24).fill(0),bar:[0,0],off:[15,15]};
  for(const owner of [0,1]) {
    const target=owner?18:5;
    for(let i=0;i<15;i++) { s=transferChecker(s,`off${owner}`,target);assertState(s); }
    assert.equal(editorCount(s,target),15);
    assert.equal(transferChecker(s,`off${owner}`,target),null);
    s=transferChecker(s,target,`bar${owner}`);assertState(s);
    s=transferChecker(s,`bar${owner}`,`off${owner}`);assertState(s);
  }
});

test('setup taps remove checkers and add the selected color without changing dice or totals',async()=>{
  const {editChecker,clearPosition,swapPositionColors}=await import('../core/position-editor.mjs');
  const s=initialState({phase:'move',dice:[6,2],matchLength:5,scores:[1,3],cube:{value:2,owner:0}});
  for(const point of [7,18]) {
    const player=editorOwner(s,point),removed=editChecker(s,point,1-player,true);
    assertState(removed);assert.equal(removed.off[player],1);
    assert.deepEqual(editChecker(removed,point,player),s);
  }
  assert.equal(editChecker(s,9,0),null,'cannot add from an empty tray');
  let empty=clearPosition(s);assert.deepEqual(empty.off,[15,15]);
  empty=editChecker(empty,9,0);assert.equal(editChecker(empty,9,1),null);
  empty=editChecker(empty,'bar1',1);assertState(empty);
  empty=editChecker(empty,'bar1',0,true);assert.equal(empty.bar[1],0);assert.equal(empty.off[1],15);
  const swapped=swapPositionColors(s);assertState(swapped);
  assert.equal(swapped.turn,1);assert.equal(swapped.cube.owner,1);assert.deepEqual(swapped.scores,[3,1]);
  assert.deepEqual(swapPositionColors(swapped),s,'swapping twice restores exact context');
  const offer={...s,phase:'double',dice:[],pending:{type:'double',by:0}};
  assert.equal(swapPositionColors(offer).pending.by,1);
});
