import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,decisionPlayer,canImmediateRedouble,immediateRedoubleAction,offerDepth,offerName,assertState,replay,MAX_CUBE} from '../core/rules.mjs';
import {defaultPlayRules} from '../core/play-session.mjs';
import {shareURL,sharedPosition,toXGID} from '../core/xgid.mjs';

test('unlimited alternating replies preserve actor, stake, first owner, replay and saved links',()=>{
 for(const turn of [0,1]) {
  const initial=initialState({turn,phase:'roll',matchLength:0,rules:defaultPlayRules(0)}),events=[];
  assert.equal(initial.rules.immediateRedoubles,-1);
  let s=initial;
  const act=type=>{const event={actor:decisionPlayer(s),action:{type}};events.push(event);s=transition(s,event.action,event.actor);};
  act('double');
  for(let depth=0;depth<=28;depth++) {
   assertState(s);
   assert.equal(offerDepth(s),depth);
   assert.equal(offerName(s),depth===0?'Double':depth%2?'Beaver':'Raccoon');
   assert.equal(decisionPlayer(s),depth%2?turn:1-turn);
   assert.equal(s.cube.value,2**depth);
   if(depth) assert.equal(s.cube.owner,1-turn);
   const drop=transition(s,{type:'pass'},decisionPlayer(s));
   assert.equal(drop.result.points,s.cube.value);
   assert.equal(drop.result.winner,s.pending.by);
   const take=transition(s,{type:'take'},decisionPlayer(s));
   assert.deepEqual(take.cube,{value:2**(depth+1),owner:1-turn});
   assert.equal(take.turn,turn);
   assert.equal(take.phase,'roll');
   if(depth===28) {
    assert.equal(canImmediateRedouble(s),false,'numeric safety ceiling still holds');
    assert.equal(take.cube.value,MAX_CUBE);
   } else {
    assert.ok(canImmediateRedouble(s));
    const action=depth%2?'raccoon':'beaver';
    assert.equal(immediateRedoubleAction(s),action);
    assert.throws(()=>transition(s,{type:action==='beaver'?'raccoon':'beaver'},decisionPlayer(s)));
    act(action);
   }
  }
  assert.deepEqual(replay(initial,events).at(-1),s);
  assert.deepEqual(sharedPosition(new URLSearchParams(new URL(shareURL(s)).hash.slice(1))),s);
  assertState(JSON.parse(JSON.stringify(s)));
 }
});

test('no-limit rule remains optional and XGID never silently loses it',()=>{
 const s=initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:-1}});
 assert.throws(()=>toXGID(s),/preserve/);
 assert.doesNotThrow(()=>toXGID(s,{engine:true}));
 for(const limit of [0,1,2]) {
  let state=initialState({phase:'roll',matchLength:0,rules:{immediateRedoubles:limit}});
  state=transition(state,{type:'double'},0);
  for(let depth=0;depth<limit;depth++)state=transition(state,{type:immediateRedoubleAction(state)},decisionPlayer(state));
  assert.equal(canImmediateRedouble(state),false);
 }
 assert.equal(defaultPlayRules(5).immediateRedoubles,0);
 assert.throws(()=>initialState({matchLength:5,rules:{immediateRedoubles:-1}}),/unlimited session/);
});
