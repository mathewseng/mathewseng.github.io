import test from 'node:test';
import assert from 'node:assert/strict';
import {BarAutoRoll} from '../core/bar-auto-roll.mjs';
const model = (player=0) => ({id:'game',started:true,state:{phase:'roll',turn:player,
  gameNumber:1,sequence:10,bar:player ? [0,2] : [2,0]}});
const gesture = {x:100,y:100,at:1000};

test('single roll never arms automation; a nearby second gesture does, even after an automatic pass',()=>{
  for (const player of [0,1]) {
    const a=new BarAutoRoll(),m=model(player);
    a.noteRoll(m,gesture);assert.equal(a.active,null);
    m.state={...m.state,turn:1-player,sequence:12};
    assert.equal(a.repeat(m,{x:105,y:98,at:1250}),true);
    assert.equal(a.canRoll(m),false,'never roll for the opponent');
    m.state={...m.state,turn:player,sequence:13};
    assert.equal(a.canRoll(m),true);
    m.state.phase='move';assert.equal(a.canRoll(m),false,'never reroll committed dice');
    m.state.phase='double';assert.equal(a.canRoll(m),false,'never answer cube offers automatically');
  }
});

test('auto rolling ends when any checker enters, including a draft with checkers still on the bar',()=>{
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  const draft={...m.state,phase:'move',bar:[1,0]};
  a.sync(m,draft);assert.equal(a.active,null);
  a.sync(m);assert.equal(a.active,null,'undoing entry does not rearm without consent');
});

test('new games, takebacks, game over and explicit stop clear automatic intent',()=>{
  for (const change of [m=>m.id='other',m=>m.state.gameNumber++,m=>m.state.sequence--,
    m=>m.state.phase='over',m=>m.reviewingTurn=true,m=>m.undoRequest={}]) {
    const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
    change(m);assert.equal(a.sync(m),null);
  }
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  a.reset();assert.equal(a.canRoll(m),false);assert.equal(a.gesture,null);
});

test('another hit while waiting does not hide the first successful entry',()=>{
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  m.state={...m.state,bar:[3,0],sequence:12};a.sync(m);
  assert.ok(a.active);
  a.sync(m,{...m.state,bar:[2,0]});assert.equal(a.active,null);
});

test('unrelated clicks and non-bar rolls cannot enable automation',()=>{
  for (const second of [{...gesture,at:1451},{...gesture,at:999},{...gesture,x:160,at:1100}]) {
    const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);
    assert.equal(a.repeat(m,second),false);assert.equal(a.active,null);
  }
  const a=new BarAutoRoll(),m=model();m.state.bar=[0,0];a.noteRoll(m,gesture);
  assert.equal(a.repeat(m,{...gesture,at:1100}),false);
});
