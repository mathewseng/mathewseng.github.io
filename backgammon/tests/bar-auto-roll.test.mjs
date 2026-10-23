import test from 'node:test';
import assert from 'node:assert/strict';
import {BarAutoRoll,canAutoRollFromBar} from '../core/bar-auto-roll.mjs';
const model = (player=0) => ({id:'game',started:true,state:{phase:'roll',turn:player,
  gameNumber:1,sequence:10,points:Array.from({length:24},(_,i)=>i===(player?0:23)?(player?2:-2):0),bar:player ? [0,2] : [2,0]}});
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


test('auto roll needs a checker on the bar and a made opposing point in the entry board',()=>{
  for (const player of [0,1]) {
    const m=model(player),s=m.state,start=player?0:18,opponent=player?1:-1;
    for (let offset=0;offset<6;offset++) {
      s.points.fill(0);s.points[start+offset]=opponent*2;
      assert.equal(canAutoRollFromBar(s),true,`player ${player}, entry ${offset+1}`);
      s.points[start+offset]=opponent;
      assert.equal(canAutoRollFromBar(s),false,'a blot does not block entry');
      s.points[start+offset]=-opponent*2;
      assert.equal(canAutoRollFromBar(s),false,'own checkers do not block entry');
    }
    s.points.fill(0);s.points[player?6:17]=opponent*2;
    assert.equal(canAutoRollFromBar(s),false,'opposing points outside the entry board do not count');
    s.points[start]=opponent*2;s.bar[player]=0;
    assert.equal(canAutoRollFromBar(s),false,'a player off the bar cannot enable auto roll');
  }
});

test('all-open entries hide and disable auto roll, including when the last blocking point opens',()=>{
  for (const player of [0,1]) {
    const a=new BarAutoRoll(),m=model(player);
    m.state.points.fill(0);
    a.noteRoll(m,gesture);assert.equal(a.gesture,null);
    assert.equal(a.repeat(m,{...gesture,at:1100}),false);
    m.state.points[player?0:23]=player?2:-2;
    a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});assert.ok(a.active);
    m.state.points[player?0:23]=player?1:-1;
    assert.equal(a.sync(m),null,'opening the last made point cancels existing auto roll');
    assert.equal(a.canRoll(m),false);
  }
});
