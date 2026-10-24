import test from 'node:test';
import assert from 'node:assert/strict';
import {BarAutoRoll,canAutoRollFromBar,canAutoRollAfterBarPass} from '../core/bar-auto-roll.mjs';
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

test('partial entries keep auto rolling until the last checker leaves the bar',()=>{
  for (const player of [0,1]) {
    const a=new BarAutoRoll(),m=model(player);a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
    const bar=[...m.state.bar];bar[player]=1;
    const draft={...m.state,phase:'move',bar};
    assert.ok(a.sync(m,draft),'partial draft entry keeps auto roll');
    m.state={...draft,sequence:11};
    assert.equal(a.canRoll(m),false,'does not reroll during a draft');
    m.state={...m.state,phase:'roll',turn:1-player,sequence:12};
    assert.equal(a.canRoll(m),false,'never rolls for the opponent');
    m.state={...m.state,turn:player,sequence:13};
    assert.equal(a.canRoll(m),true,'continues automatically on the next turn');
    a.sync(m,{...m.state,phase:'move',bar:[0,0]});assert.equal(a.active,null);
    a.sync(m);assert.equal(a.active,null,'undoing the final entry does not rearm without consent');
  }
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

test('another hit and partial re-entry still leave auto roll enabled',()=>{
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  m.state={...m.state,bar:[3,0],sequence:12};a.sync(m);
  assert.ok(a.active);
  assert.ok(a.sync(m,{...m.state,bar:[2,0]}));
  assert.ok(a.sync(m,{...m.state,bar:[1,0]}));
  assert.equal(a.sync(m,{...m.state,bar:[0,0]}),null);
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


test('a closed-out opponent allows automatic rolling only without a cube choice',async()=>{
  const {initialState}=await import('../core/rules.mjs');
  for (const turn of [0,1]) {
    const points=Array(24).fill(0);for(let i=0;i<6;i++)points[i]=2;points[5]=5;points[17]=-14;
    const base=initialState({phase:'roll',points,bar:[0,1],matchLength:0,cube:{value:2,owner:1}});
    const s=turn?{...base,turn:1,points:points.toReversed().map(n=>-n),bar:[1,0],cube:{value:2,owner:0}}:base;
    assert.equal(canAutoRollAfterBarPass(s),true);
    for(const owner of [null,turn]) assert.equal(canAutoRollAfterBarPass({...s,cube:{value:2,owner}}),false,'keep every legal cube choice');
    assert.equal(canAutoRollAfterBarPass({...s,cube:{value:2,owner:turn},crawford:true}),true);
    for(const phase of ['opening','move','double','resign','over']) assert.equal(canAutoRollAfterBarPass({...s,phase}),false);
    assert.equal(canAutoRollAfterBarPass({...s,pending:{type:'double',by:turn}}),false);
    assert.equal(canAutoRollAfterBarPass({...s,bar:[0,0]}),false);
    for(let i=0;i<6;i++){
      const open=structuredClone(s);open.points[turn?23-i:i]=turn?-1:1;
      assert.equal(canAutoRollAfterBarPass(open),false,'an open entry without a previous pass stays manual');
      const pass={actor:1-turn,action:{type:'move',steps:[]}};
      assert.equal(canAutoRollAfterBarPass(open,pass),true,'also roll after the opponent failed to enter on their actual dice');
      assert.equal(canAutoRollAfterBarPass(open,{...pass,actor:turn}),false);
      assert.equal(canAutoRollAfterBarPass(open,{...pass,action:{type:'move',steps:[{from:'bar',to:0,die:1}]}}),false);
      assert.equal(canAutoRollAfterBarPass({...open,cube:{value:2,owner:turn}},pass),false);
    }
    const mutual=structuredClone(s);mutual.bar=[1,1];
    for(let i=0;i<6;i++)mutual.points[turn?i:23-i]=turn?2:-2;
    assert.equal(canAutoRollAfterBarPass(mutual),false,'do not spin through mutual closed-out passes');
  }
});
