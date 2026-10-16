import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyStep, boardKey, legalPaths, commitTurn, seededDice } from '../core/rules.mjs';
import { compactNotation, presentMove, presentAnalysis } from '../core/move-presentation.mjs';
import { moveTrace } from '../core/move-trace.mjs';
const step = (from, to, die) => ({from:from === 'bar' ? from : from-1,to:to === 'off' ? to : to-1,die});
const after = (source, steps) => steps.reduce(applyStep, source);
const fixture = () => {
  const s=initialState({phase:'move',dice:[3,3],matchLength:0});s.points.fill(0);
  for(const [point,count] of [[11,1],[10,1],[9,2],[8,2],[7,2],[6,2],[5,2],[4,2],[1,1],[3,-2],[18,-1],[19,-4],[20,-3],[21,-1],[22,-2],[23,-1]])s.points[point-1]=count;
  s.bar=[0,1];return s;
};
test('reverse-ordered screenshot solution becomes 11/2 10/7 and two arrows',()=>{
  const s=fixture(),steps=[step(5,2,3),step(8,5,3),step(10,7,3),step(11,8,3)];
  const result=presentMove(s,steps);
  assert.equal(result.notation,'11/2 10/7');
  assert.equal(boardKey(commitTurn(s,result.steps)),boardKey(commitTurn(s,steps)));
  assert.equal(moveTrace(after(s,result.steps),s.turn,result.steps,s.dice).checkers.length,2);
  assert.deepEqual(steps,[step(5,2,3),step(8,5,3),step(10,7,3),step(11,8,3)],'recorded steps unchanged');
});
test('notation retains intermediate hits, bar/off and repeated journeys',()=>{
  const s=initialState({phase:'move',dice:[6,3],matchLength:0});s.points.fill(0);
  s.points[13]=1;s.points[0]=14;s.points[7]=-1;s.points[23]=-14;
  const hit=[step(14,8,6),step(8,5,3)],shown=presentMove(s,hit);
  assert.equal(shown.notation,'14/8*/5');
  assert.equal(commitTurn(s,shown.steps).bar[1],1,'intermediate hit is retained in the legal solution');
  const bar={...s,points:[...s.points],bar:[1,0]};bar.points[13]=0;
  assert.equal(presentMove(bar,[step('bar',22,3),step(22,16,6)]).notation,'bar/16');
  const off=initialState({phase:'move',dice:[6,6]});off.points.fill(0);off.points[5]=2;off.off=[13,15];
  assert.equal(presentMove(off,[step(6,'off',6),step(6,'off',6)]).notation,'6/off(2)');
  const mirrored={...s,turn:1,points:s.points.toReversed().map(n=>-n)};
  assert.equal(presentMove(mirrored,[step(11,17,6),step(17,20,3)]).notation,'14/8*/5');
});
test('simplified choices preserve legal outcomes, dice count and evaluation metadata',()=>{
  const roll=seededDice(236),s=initialState({phase:'move',dice:[6,6]});
  for(let i=0;i<8;i++){
    const source={...s,dice:roll()},paths=legalPaths(source);
    for(const path of paths.filter((_,i)=>i%Math.max(1,Math.floor(paths.length/8))===0)){
      const view=presentAnalysis(source,{type:'checker',error:.02,candidates:[{steps:path.steps,key:boardKey(path.state),equity:.123}],actual:null});
      assert.equal(view.error,.02);assert.equal(view.candidates[0].equity,.123);
      assert.equal(boardKey(commitTurn(source,view.candidates[0].steps)),boardKey(path.state));
      assert.equal(view.candidates[0].steps.length,path.steps.length);
    }
  }
});
test('partial drafts do not acquire unplayed dice',()=>{
  const source=fixture(),steps=[step(11,8,3)];
  assert.deepEqual(presentMove(source,steps).steps,steps);
});

test('large engine result sets only format visible leaders and the actual choice',()=>{
  const source=fixture(),steps=[step(5,2,3),step(8,5,3),step(10,7,3),step(11,8,3)];
  const candidates=Array.from({length:640},()=>({steps,notation:'raw',equity:.1}));
  const result=presentAnalysis(source,{type:'checker',candidates,actual:candidates[639]});
  assert.equal(result.candidates[9].notation,'11/2 10/7');
  assert.equal(result.candidates[10],candidates[10],'hidden alternatives are not repeatedly reformatted');
  assert.equal(result.actual.notation,'11/2 10/7');
  assert.equal(result.candidates.length,640,'all engine alternatives remain available');
});
