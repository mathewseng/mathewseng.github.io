import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, legalTurns, transition, assertState, positionKey } from '../core/rules.mjs';
import { localConfig } from '../core/play-session.mjs';
import { Prethink, PRETHINK, chanceRolls, continuations } from '../core/prethink.mjs';

const evaluate = state => state.phase === 'move' ? {
  candidates:legalTurns(state).slice(0,5).map((c,i)=>({...c,equity:0.3-i*.01})),
} : {action:'roll',decisionOptions:[{action:'roll',equity:.3},{action:'double',equity:.1}]};
const source = () => initialState({phase:'move',dice:[4,1],matchLength:0});

test('chance expansion covers all 36 unbiased outcomes in 21 order-independent rolls',()=>{
  const rolls=chanceRolls(); assert.equal(rolls.length,21);
  assert.equal(new Set(rolls.map(r=>r.dice.join())).size,21);
  assert.ok(Math.abs(rolls.reduce((s,r)=>s+r.weight,0)-1)<1e-12);
  assert.equal(rolls.filter(r=>r.weight===1/36).length,6);
});
test('near-best branches preserve full context and legal states without mutating or drawing dice',()=>{
  const state=source(), original=structuredClone(state);
  const first=continuations({state,turns:0,weight:1},evaluate(state));
  assert.equal(first.length,3); assert.deepEqual(state,original);
  for(const n of first) {
    assertState(n.state); assert.equal(n.state.turn,1); assert.equal(n.turns,1);
    assert.deepEqual(n.state.rules,state.rules); assert.deepEqual(n.state.scores,state.scores);
    const next=continuations(n,evaluate(n.state)); assert.equal(next.length,21);
    for(const child of next) { assertState(child.state); assert.equal(child.state.phase,'move'); }
  }
  assert.deepEqual(continuations({state,turns:PRETHINK.turns,weight:1},evaluate(state)),[]);
});
test('cube speculation retains near-best doubles and minimizes the roller equity for opposing replies',()=>{
  const state=initialState({phase:'roll',matchLength:0,rules:{cube:true,jacoby:true,immediateRedoubles:2}});
  const next=continuations({state,turns:0,weight:1},{action:'roll',decisionOptions:[{action:'roll',equity:.5},{action:'double',equity:.49}]});
  assert.equal(next.filter(n=>n.state.phase==='move').length,21);
  assert.equal(next.filter(n=>n.state.phase==='double').length,1);
  const offered=transition(state,{type:'double'});
  const replies=continuations({state:offered,turns:0,weight:1},{action:'beaver',decisionOptions:[{action:'take',equity:.3},{action:'pass',equity:1},{action:'beaver',equity:-.1}]});
  assert.equal(replies.length,1); assert.equal(replies[0].state.pending.depth,1);
});
test('illegal doubling is skipped exactly, forced continuations need no speculative engine call',()=>{
  const roll=initialState({phase:'roll',cube:{value:2,owner:1}});
  assert.equal(continuations({state:roll,turns:0,weight:1},null).length,21);
  const points=Array(24).fill(0);points[0]=1;points[23]=-1;
  const forced=initialState({phase:'move',dice:[6,5],points,off:[14,14]});
  assert.equal(continuations({state:forced,turns:0,weight:1},null)[0].state.phase,'over');
});
function harness({mode='computer',limits={...PRETHINK,nodes:2},deferred=false}={}) {
  const game={id:'preparation',started:true,state:source(),config:{...localConfig({mode}),mode}};
  const view={game,enabled:true,idle:true,submitted:null},calls=[],cancelled=[];
  let settle;
  const engine={cancelWhere:predicate=>cancelled.push(predicate),analyze:async(state,options)=>{
    calls.push({state:structuredClone(state),...options});
    if(deferred) await new Promise(r=>settle=r);
    return evaluate(state);
  }};
  const p=new Prethink({engine,view:()=>view,limits});
  const tick=async()=>{p.update();clearTimeout(p.timer);await p.run();clearTimeout(p.timer);};
  return{p,view,calls,cancelled,tick,resolve:()=>settle?.()};
}
test('prepare current decision, then actual draft before bounded future work at lower priority',async()=>{
  const h=harness();
  try {
    await h.tick(); assert.equal(h.calls[0].priority,-5);
    h.view.submitted=legalTurns(h.view.game.state).at(-1).steps;
    await h.tick(); assert.deepEqual(h.calls[1].submitted,h.view.submitted);assert.equal(h.calls[1].priority,-4);
    for(let i=0;i<8;i++) await h.tick();
    assert.equal(h.calls.filter(c=>c.priority===-20).length,2);
    const before=h.calls.length; await h.tick(); assert.equal(h.calls.length,before);
    assert.ok(h.calls.every(c=>c.preset==='auto'));
    assert.equal(h.view.game.events,undefined,'no game mutation / speculative event history');
  } finally {h.p.pause();}
});
test('opt-out, hidden/inactive views, human games and foreground work do not start speculation',async()=>{
  for(const mode of ['local','online']) {
    const h=harness({mode}); await h.tick();assert.equal(h.calls.length,0);h.p.pause();
  }
  const h=harness();
  try {h.view.idle=false;await h.tick();assert.equal(h.calls.length,0);
    h.view.idle=true;h.view.enabled=false;await h.tick();assert.equal(h.calls.length,0);
  } finally {h.p.pause();}
});
test('stale completions cannot seed another game; pause cancels background only, not promoted foreground work',async()=>{
  const h=harness({deferred:true});
  try {
    const pending=h.tick();await Promise.resolve();
    h.view.game={...h.view.game,id:'new-game'};h.p.update();clearTimeout(h.p.timer);
    h.resolve();await pending;
    assert.equal(h.p.scope.root,null);assert.equal(h.p.scope.queue.length,0);
    h.p.pause();const cancel=h.cancelled.at(-1);
    assert.equal(cancel({priority:-20}),true);assert.equal(cancel({priority:-5}),true);
    assert.equal(cancel({priority:20}),false);assert.equal(cancel({priority:-10}),false);
  } finally {h.p.pause();}
});
