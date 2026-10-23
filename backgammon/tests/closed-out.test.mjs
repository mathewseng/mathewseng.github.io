import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, replay, positionKey, canDouble } from '../core/rules.mjs';
import { canAutoPassClosedOut, closedOutCubeMargin, CLOSED_OUT_MARGIN } from '../core/closed-out.mjs';
import { playAction, takebackTarget } from '../core/table.mjs';
import { localPlayAction, futureLocalRoll } from '../core/local-rolls.mjs';
import { continuations } from '../core/prethink.mjs';
import { decisionHistory } from '../core/decision-history.mjs';
import { gradeCube } from '../engine/cube-grade.mjs';
import { historyTree } from '../core/history-tree.mjs';
import { itemRecord, validateItem } from '../core/storage.mjs';

function closed(turn = 0, overrides = {}) {
  const points = Array(24).fill(0); points[5] = 14; points[17] = -3;
  for (let i = 18; i < 24; i++) points[i] = -2;
  return initialState({phase:'roll', matchLength:0, turn,
    points:turn ? points.toReversed().map(n => -n) : points, bar:turn ? [0,1] : [1,0], ...overrides});
}
function result(s, margin = .25) {
  return {type:'cube', status:'complete', available:true, perspective:s.turn, positionKey:positionKey(s),
    settings:{plies:2,cubeful:true,noise:0},
    units:s.matchLength ? 'normalized-match-equity' : 'current-cube-points', outcomes:[0,-margin,1]};
}
const table = s => ({id:'closed', started:true, initial:s, state:s, events:[]});

test('only a fully blocked bar turn with an unavailable or clearly inferior cube can auto-pass', () => {
  assert.equal(CLOSED_OUT_MARGIN,.25);
  for (const turn of [0,1]) {
    const s = closed(turn);
    for (const margin of [-.2,0,.1,.24999999,.25,.7])
      assert.equal(canAutoPassClosedOut(s,result(s,margin)),margin >= .25);
    assert.equal(canAutoPassClosedOut(s),false,'missing evaluation retains cube decision');
    for (const unavailable of [
      {...s,cube:{value:2,owner:1-turn}}, {...s,rules:{...s.rules,cube:false}},
      {...s,matchLength:5,crawford:true,scores:turn ? [4,0] : [0,4]},
      {...s,matchLength:5,cube:{value:2,owner:turn},scores:turn ? [0,3] : [3,0]},
    ]) {
      assert.equal(canDouble(unavailable),false);
      assert.equal(canAutoPassClosedOut(unavailable),true);
    }
    for (let point = turn ? 0 : 18; point < (turn ? 6 : 24); point++) {
      for (const n of [0,1]) {
        const open = structuredClone(s);open.points[point]=(turn ? 1 : -1)*n;
        assert.equal(canAutoPassClosedOut(open,result(open,2)),false,'one open entry always retains rolling');
        assert.equal(canAutoPassClosedOut({...open,rules:{...open.rules,cube:false}}),false);
      }
    }
    assert.equal(canAutoPassClosedOut({...s,bar:[0,0]},result(s,2)),false);
    for (const phase of ['move','opening','double','resign','over'])
      assert.equal(canAutoPassClosedOut({...s,phase},result(s,2)),false);
    assert.equal(canAutoPassClosedOut({...s,pending:{type:'double',by:turn}},result(s,2)),false);
  }
});
test('partial, shallow, noisy, stale or incorrectly normalized evaluations cannot skip a cube', () => {
  const s = closed(), good = result(s,.8);
  for (const edit of [
    {status:'partial'}, {type:'checker'}, {available:false}, {perspective:1},
    {positionKey:'other'}, {units:'match-winning-chance'}, {outcomes:[NaN,-1,1]},
    {settings:{...good.settings,plies:0}}, {settings:{...good.settings,plies:1}},
    {settings:{...good.settings,plies:NaN}}, {settings:{...good.settings,cubeful:false}},
    {settings:{...good.settings,noise:.01}},
  ]) assert.equal(canAutoPassClosedOut(s,{...good,...edit}),false);
  for (const changed of [
    {...s,cube:{value:2,owner:0}}, {...s,rules:{...s.rules,jacoby:true}},
    {...s,rules:{...s.rules,immediateRedoubles:2}}, {...s,matchLength:7,scores:[2,4]},
  ]) assert.equal(canAutoPassClosedOut(changed,good),false);
  const match = closed(0,{matchLength:7,scores:[2,4]});
  assert.equal(canAutoPassClosedOut(match,result(match)),true);
});
test('use the actual response tree including immediate redoubles, in current-cube units', () => {
  const s = closed(0,{cube:{value:8,owner:0},rules:{immediateRedoubles:2}});
  const r = {...result(s,0),decisionOptions:[{action:'roll',equity:-.2},{action:'double',equity:-.5}]};
  assert.ok(Math.abs(closedOutCubeMargin(s,r)-.3)<1e-12);
  assert.equal(canAutoPassClosedOut(s,r),true);
  r.decisionOptions[1].equity=-.4;
  assert.equal(canAutoPassClosedOut(s,r),false,'do not multiply the margin by the cube value');
});
test('a no-dice pass is legal only while fully closed out, preserves the board and replays', () => {
  for (const turn of [0,1]) {
    const s = closed(turn), passed = transition(s,{type:'skip-roll'},turn);
    assert.equal(passed.turn,1-turn);assert.equal(passed.phase,'roll');assert.deepEqual(passed.dice,[]);
    for (const field of ['points','bar','off','cube','scores','rules']) assert.deepEqual(passed[field],s[field]);
    assert.equal(passed.sequence,s.sequence+1);
    assert.throws(()=>transition(s,{type:'skip-roll',dice:[1,1]}),/closed-out/);
    assert.throws(()=>transition(s,{type:'skip-roll'},1-turn),/not your turn/);
    assert.throws(()=>transition(transition(s,{type:'double'}),{type:'skip-roll'},1-turn),/closed-out/);
    assert.throws(()=>transition(initialState({phase:'roll'}),{type:'skip-roll'}),/closed-out/);
    const t = playAction(table(s),{type:'skip-roll'},turn,{autoPass:true,cubeEvaluation:result(s)});
    assert.equal(t.events.length,1);assert.equal(t.events[0].automatic,true);
    assert.equal(t.events[0].action.dice,undefined);assert.equal(takebackTarget(t),null);
    assert.deepEqual(replay(t.initial,t.events).at(-1),t.state);
    assert.equal(historyTree(t).nodes.length,2);
    assert.deepEqual(decisionHistory(t),[],'automatic no-double is not a human decision');
    assert.ok(validateItem(itemRecord('match',{initial:s,events:t.events})));
    assert.throws(()=>playAction(table(s),{type:'skip-roll'},turn,{autoPass:true}),/cube decision/);
    assert.throws(()=>playAction(table(s),{type:'skip-roll'},turn,{autoPass:true,cubeEvaluation:result(s,.249)}),/cube decision/);
  }
});
test('a deliberate no-double/pass remains a gradeable cube decision and advances turn numbering', () => {
  const s=closed(), t=playAction(table(s),{type:'skip-roll'});
  assert.equal(t.events[0].automatic,undefined);
  t.events[0].evaluation={result:gradeCube(s,result(s,-.1),'skip-roll')};
  const rows=decisionHistory(t);
  assert.equal(rows.length,1);assert.equal(rows[0].label,'No double · pass');
  assert.equal(rows[0].result.error,.1);assert.equal(rows[0].turn,1);
  const next=playAction(t,{type:'double'});
  assert.deepEqual(decisionHistory(next).map(r=>r.turn),[1,2]);
});
test('closed-out passes consume neither seeded dice nor a fresh random roll, including after a take', async () => {
  const s=closed(), source={...table(s),config:{mode:'computer'},localRolls:{version:1,seed:'39'.padStart(64,'0'),cursor:7}};
  const expected=await futureLocalRoll(source);
  for (const type of ['roll','skip-roll']) {
    const t=await localPlayAction(source,{type});
    assert.equal(t.localRolls.cursor,7);assert.equal(t.events.length,1);
    assert.deepEqual(t.events[0].action,{type:'skip-roll'});
    assert.deepEqual(await futureLocalRoll(t),expected,'next actual roll keeps the same sequence index');
  }
  const offered=await localPlayAction(source,{type:'double'});
  const taken=await localPlayAction(offered,{type:'take'});
  const passed=await localPlayAction(taken,{type:'roll'}, {autoPass:true});
  assert.equal(passed.localRolls.cursor,7);assert.equal(passed.state.turn,1);
  assert.deepEqual(passed.events.map(e=>e.action.type),['double','take','skip-roll']);
  const legacy={...source,replayDice:[{actor:0,dice:[2,3]},{actor:1,dice:[4,5]}]};
  const recovered=await localPlayAction(legacy,{type:'skip-roll'});
  assert.deepEqual(recovered.replayDice,[{actor:1,dice:[4,5]}]);
  assert.deepEqual(await futureLocalRoll(recovered,0,1),[4,5]);
  assert.deepEqual(legacy.replayDice,[{actor:0,dice:[2,3]},{actor:1,dice:[4,5]}]);
});
test('prethinking advances a closed-out turn without enumerating or consuming any roll', () => {
  for (const available of [true,false]) {
    const s=closed(0,available ? {} : {cube:{value:2,owner:1}});
    const children=continuations({state:s,turns:0,rolls:2,weight:1},available ? {action:'roll'} : null);
    assert.equal(children.length,1);assert.equal(children[0].turns,1);assert.equal(children[0].rolls,2);
    assert.equal(children[0].state.turn,1);assert.deepEqual(children[0].state.dice,[]);
  }
});
