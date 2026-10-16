import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { initialState, legalTurns, replay } from '../core/rules.mjs';
import { localConfig } from '../core/play-session.mjs';
import { seededLocalRoll, futureLocalRoll, ensureLocalRolls, localPlayAction } from '../core/local-rolls.mjs';
import { undoTurn } from '../core/table.mjs';
import { session, validateSession } from '../core/protocol.mjs';
const seed = 'b7'.repeat(32);
const model = () => { const s=initialState({phase:'roll',matchLength:0});return {
  id:'seeded',config:localConfig(),started:true,initial:s,state:s,events:[],localRolls:{version:1,seed,cursor:0},
};};
test('indexed local rolls match independent HMAC vectors and use rejection sampling',async()=>{
  let rejected=0;
  for(let cursor=0;cursor<128;cursor++) {
    const bytes=createHmac('sha256',Buffer.from(seed,'hex')).update(`backgammon-local-roll-v1:${cursor}:0`).digest();
    rejected += [...bytes.slice(0,2)].filter(b=>b>=252).length;
    const expected=[...bytes].filter(b=>b<252).slice(0,2).map(b=>b%6+1);
    assert.deepEqual(await seededLocalRoll({version:1,seed,cursor}),expected);
  }
  assert.ok(rejected>0,'fixture exercises rejected bytes');
});
test('peek, analysis order, cloned saves and disabled analysis cannot change committed rolls',async()=>{
  let a=model(),b=model();
  for(let i=0;i<12;i++) {
    const peek=await futureLocalRoll(a);
    await Promise.all([7,1,3,0].map(offset=>futureLocalRoll(a,offset)));
    const before=JSON.stringify(a);
    const c=await localPlayAction(a,{type:'roll'});
    assert.equal(JSON.stringify(a),before);
    assert.deepEqual(c.events.at(-1).action.dice || c.events.at(-2).action.dice,peek);
    b=await localPlayAction(JSON.parse(JSON.stringify(b)),{type:'roll'});
    assert.deepEqual(c,b);
    const action={type:'move',steps:legalTurns(c.state)[0].steps};
    a=await localPlayAction(c,action);b=await localPlayAction(b,action);
    assert.deepEqual(a,b);
  }
  assert.equal(a.localRolls.cursor,12);
  assert.deepEqual(replay(a.initial,a.events).at(-1),a.state);
});
test('takeback consumes recorded rolls before continuing the unchanged seed cursor',async()=>{
  let a=await localPlayAction(model(),{type:'roll'});
  a=await localPlayAction(a,{type:'move',steps:legalTurns(a.state)[0].steps});
  const target=a.events.length-1;
  a=await localPlayAction(a,{type:'roll'});
  const oldDice=a.state.dice;
  const returned=undoTurn(a,target,0);
  assert.equal(returned.localRolls.cursor,2);
  assert.deepEqual(await futureLocalRoll(returned,0,1),oldDice);
  const next=await localPlayAction(returned,{type:'move',steps:legalTurns(returned.state)[0].steps});
  const played=await localPlayAction(next,{type:'roll'});
  assert.deepEqual(played.state.dice,oldDice);assert.equal(played.localRolls.cursor,2);
  assert.deepEqual(await futureLocalRoll(played),await seededLocalRoll(a.localRolls));
});
test('opening ties consume exactly one indexed roll; invalid actions consume none',async()=>{
  const s=initialState();let a={...model(),state:s,initial:s};
  while((await futureLocalRoll(a))[0] !== (await futureLocalRoll(a))[1]) a.localRolls.cursor++;
  const cursor=a.localRolls.cursor;
  a=await localPlayAction(a,{type:'opening'});
  assert.equal(a.state.phase,'opening');assert.equal(a.localRolls.cursor,cursor+1);
  const before=structuredClone(a);
  await assert.rejects(()=>localPlayAction(a,{type:'roll'}));assert.deepEqual(a,before);
});
test('local seeds are cryptographic, validated, and prohibited in online snapshots',async()=>{
  const a=model(),b=model();delete a.localRolls;delete b.localRolls;
  ensureLocalRolls(a);ensureLocalRolls(b);
  assert.match(a.localRolls.seed,/^[a-f0-9]{64}$/);assert.notEqual(a.localRolls.seed,b.localRolls.seed);
  const online=session([{id:'a',name:'A'},{id:'b',name:'B'}]);online.localRolls=a.localRolls;
  assert.throws(()=>validateSession(online),/Private local dice/);
  assert.throws(()=>ensureLocalRolls({config:{mode:'online'}}),/Online dice/);
  assert.equal(await futureLocalRoll({...a,config:{mode:'online'}}),null);
  for(const bad of [{version:2,seed,cursor:0},{version:1,seed:'x',cursor:0},{version:1,seed,cursor:-1}])
    await assert.rejects(()=>seededLocalRoll(bad),/Invalid saved/);
});
