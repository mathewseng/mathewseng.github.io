import test from 'node:test';
import assert from 'node:assert/strict';
import {BarAutoRoll,canAutoRollFromBar,canAutoRollAfterBarPass,forcedRollChance} from '../core/bar-auto-roll.mjs';
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
    const entered=[0,0];
    assert.ok(a.sync(m,{...m.state,phase:'move',bar},true,true),'a checker choice with a checker still on the bar keeps auto roll');
    assert.equal(a.sync(m,{...m.state,phase:'move',bar:entered},true,true),null,'the final entry with a checker choice stops it');
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
  assert.ok(a.sync(m,{...m.state,bar:[0,0]}),'a forced final entry keeps rolling');
  assert.equal(a.sync(m,{...m.state,phase:'move',bar:[0,0]},true,true),null,'the first checker choice off the bar stops it');
});

test('unrelated clicks cannot enable automation; any roll can',()=>{
  for (const second of [{...gesture,at:1451},{...gesture,at:999},{...gesture,x:160,at:1100}]) {
    const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);
    assert.equal(a.repeat(m,second),false);assert.equal(a.active,null);
  }
  const a=new BarAutoRoll(),m=model();m.state.bar=[0,0];m.state.points.fill(0);m.state.points[0]=2;m.state.points[23]=-2;
  a.noteRoll(m,gesture);
  assert.equal(a.repeat(m,{...gesture,at:1100}),true,'off the bar and with every point open');
  assert.ok(a.canRoll(m));
  m.state={...m.state,phase:'move',sequence:11};
  assert.ok(a.sync(m,m.state,false,false),'a forced turn keeps auto roll');
  assert.equal(a.sync(m,m.state,true,true),null,'a checker choice ends it');
});

test('the auto-roll hint needs at least a 25% chance of a forced roll',async()=>{
  const {initialState}=await import('../core/rules.mjs');
  assert.equal(forcedRollChance(initialState({phase:'roll'})),0);
  assert.equal(canAutoRollFromBar(initialState({phase:'roll'})),false);
  for (const player of [0,1]) {
    const m=model(player),s=m.state,start=player?0:18,opponent=player?1:-1;
    s.points.fill(0);for(let i=0;i<5;i++)s.points[start+i]=opponent*2;
    assert.ok(forcedRollChance(s)>=0.25);assert.equal(canAutoRollFromBar(s),true,`player ${player}, five points closed`);
    assert.equal(canAutoRollFromBar({...s,phase:'move'}),false,'only offered on a roll');
    s.points.fill(0);s.points[start]=opponent;s.points[player?12:11]=-opponent*14;s.bar=player?[0,1]:[1,0];
    assert.ok(forcedRollChance(s)<0.25);assert.equal(canAutoRollFromBar(s),false,'open entry leaves choices');
  }
  // Every non-double of a lone checker in its home board is forced.
  const race=initialState({phase:'roll',points:Object.assign(Array(24).fill(0),{3:1,20:-15}),off:[14,0]});
  assert.equal(canAutoRollFromBar(race),true);
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

test('a second double tap skips, while its first tap suspends automatic rolling',()=>{
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  assert.equal(a.skipping,false,'enabling auto roll alone keeps animations');
  a.noteSkip(m,{...gesture,at:2000});
  assert.equal(a.canRoll(m),false,'the first stop tap cannot race the next roll');
  assert.equal(a.repeat(m,{...gesture,at:2100}),true);
  assert.equal(a.skipping,true);assert.equal(a.canRoll(m),true);
  m.state={...m.state,phase:'move',bar:[1,0],sequence:11};
  a.sync(m);assert.equal(a.skipping,true,'a forced partial entry can be skipped');
  a.sync(m,m.state,true);assert.equal(a.skipping,false,'a checker/cube choice stops skipping');
  assert.ok(a.active,'normal auto roll survives a choice with checkers still on the bar');
});

test('skip can finish a forced entry and opponent turn, but never survive a new decision/session',()=>{
  for(const change of [m=>m.id='new',m=>m.state.gameNumber++,m=>m.state.sequence--,
    m=>m.state.phase='over',m=>m.reviewingTurn=true,m=>m.undoRequest={}]) {
    const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
    a.noteSkip(m,gesture);a.repeat(m,{...gesture,at:1200});
    change(m);a.sync(m);assert.equal(a.skipping,false);
  }
  const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
  a.noteSkip(m,gesture);a.repeat(m,{...gesture,at:1200});
  m.state={...m.state,bar:[0,0],turn:1,sequence:12};
  assert.ok(a.sync(m),'a fully forced entry keeps auto roll');assert.equal(a.skipping,true,'finish the opponent turn after a fully forced entry');
  m.state={...m.state,turn:0,sequence:13};a.sync(m,m.state,true);
  assert.equal(a.skipping,false,'the next roll stops skipping');
  assert.equal(a.canRoll(m),true,'auto roll continues until a checker choice');
  m.state={...m.state,phase:'move',sequence:14};a.sync(m,m.state,true,true);
  assert.equal(a.canRoll({...m,state:{...m.state,phase:'roll',sequence:15}}),false,'a checker choice off the bar ends it');
});

test('unrelated/late second taps never skip, and explicit stop clears the pending gesture',()=>{
  for(const second of [{...gesture,at:1451},{...gesture,x:160,at:1100}]) {
    const a=new BarAutoRoll(),m=model();a.noteRoll(m,gesture);a.repeat(m,{...gesture,at:1100});
    a.noteSkip(m,gesture);assert.equal(a.repeat(m,second),false);
    assert.equal(a.skipping,false);a.reset();
    assert.equal(a.repeat(m,{...gesture,at:1200}),false);
    assert.equal(a.waitingForRepeat,false);
  }
});

test('auto roll is advertised from a 25% chance that the roll leaves nothing to decide',()=>{
  for (const player of [0,1]) {
    const at=i=>player?23-i:i,mine=player?-1:1;
    const state=(blocked,bar,spare=[])=>{
      const points=Array(24).fill(0);
      for(const entry of blocked)points[at(24-entry)]=-mine*2;
      for(const [point,n] of spare)points[at(point-1)]=mine*n;
      return {phase:'roll',turn:player,points,bar:player?[0,bar]:[bar,0],off:[0,0]};
    };
    assert.equal(canAutoRollFromBar(state([6],1,[[13,2],[8,2]])),false,'one blocked point: the checker enters and the other die is a choice (1/36)');
    assert.equal(canAutoRollFromBar(state([6,5],1,[[13,2],[8,2]])),false,'only 6-6, 5-5 and 6-5 are forced (4/36)');
    assert.equal(canAutoRollFromBar(state([6],2,[[13,2]])),true,'two checkers on the bar use both dice to enter');
    assert.equal(canAutoRollFromBar(state([6],1)),true,'a lone checker has one way to play each roll');
    assert.equal(canAutoRollFromBar(state([],2,[[13,2]])),true,'two checkers on the bar enter with both dice on every non-double');
  }
});
