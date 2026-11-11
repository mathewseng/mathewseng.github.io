import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,transition,positionKey} from '../core/rules.mjs';
import {RaceAutoPlay,bearingOffRace,clearRaceCubeAction,raceBearoffMove,RACE_CUBE_MARGIN} from '../core/race-auto-play.mjs';
import {legalTurns} from '../core/rules.mjs';

const race = (player=0) => {
  const points=Array(24).fill(0);points[2]=15;points[21]=-15;
  return initialState({phase:'roll',points,turn:player,matchLength:0,rules:{cube:true,jacoby:true,immediateRedoubles:2}});
};
const model = (player=0) => ({id:'race',started:true,state:race(player)});
const tap={x:100,y:120,at:1000};
const activate = m => {const a=new RaceAutoPlay();a.noteRoll(m,tap);assert.ok(a.repeat(m,{...tap,at:1100}));return a;};
const result = (s,outcomes=[0,-.3,1]) => ({type:'cube',status:'complete',available:true,
  positionKey:positionKey(s),perspective:s.turn,settings:{plies:3,cubeful:true,noise:0},
  units:s.matchLength?'normalized-match-equity':'current-cube-points',outcomes});

test('offer race auto play only after all own checkers are home and contact is impossible',()=>{
  for(const player of [0,1]) {
    const s=race(player);assert.ok(bearingOffRace(s));
    const away=structuredClone(s);away.points[player?17:6]=player?-1:1;
    assert.equal(bearingOffRace(away),false);
    const contact=structuredClone(s);contact.points[player?23:0]=player?1:-1;
    assert.equal(bearingOffRace(contact),false);
    for(const bar of [[1,0],[0,1]])assert.equal(bearingOffRace({...s,bar}),false);
    for(const phase of ['opening','resign','over'])assert.equal(bearingOffRace({...s,phase}),false);
    const approaching=structuredClone(s);approaching.points[player?8:15]=player?1:-1;
    assert.equal(bearingOffRace(approaching),true,'opponent may still be racing home');
  }
});
test('requires a deliberate double tap and follows only its player across forced turns',()=>{
  for(const player of [0,1]) {
    const m=model(player),a=new RaceAutoPlay();a.noteRoll(m,tap);assert.equal(a.active,null);
    m.state={...m.state,turn:1-player,sequence:2};
    assert.ok(a.repeat(m,{...tap,at:1250}));assert.equal(a.active.player,player);
    a.sync(m);assert.ok(a.active,'opponent turn does not cancel intent');
    m.state={...m.state,turn:player,sequence:4,phase:'move',dice:[1,2]};
    a.sync(m,m.state,true);assert.ok(a.active,'a checker choice left to the player does not end auto play');
  }
  for(const next of [{...tap,at:1451},{...tap,at:999},{...tap,x:145,at:1100}]) {
    const a=new RaceAutoPlay(),m=model();a.noteRoll(m,tap);assert.equal(a.repeat(m,next),false);
  }
});
test('race intent resets for takebacks, game changes, end, control changes and explicit stop',()=>{
  for(const change of [m=>m.id='other',m=>m.state.gameNumber++,m=>m.state.sequence--,
    m=>m.state.phase='over',m=>m.reviewingTurn=true,m=>m.undoRequest={},m=>m.state.bar=[1,0]]) {
    const m=model(),a=activate(m);change(m);assert.equal(a.sync(m),null);
  }
  const m=model(),a=activate(m);a.reset();assert.equal(a.active,null);assert.equal(a.gesture,null);
});
test('cube auto play stops inside the close window and uses the decision maker’s perspective',()=>{
  assert.equal(RACE_CUBE_MARGIN,.05);
  for(const player of [0,1]) {
    const s=race(player);
    for(const margin of [-.3,-.05,-.049,0,.049,.05,.3]) {
      const choice=clearRaceCubeAction(s,result(s,[0,-margin,1]));
      assert.deepEqual(choice,Math.abs(margin)<=.05?null:{type:margin>0?'roll':'double'});
    }
    const offered=transition(s,{type:'double'});
    assert.deepEqual(clearRaceCubeAction(offered,result(offered,[0,.5,1])),{type:'take'});
    assert.deepEqual(clearRaceCubeAction(offered,result(offered,[0,1.5,1])),{type:'pass'});
    assert.equal(clearRaceCubeAction(offered,result(offered,[0,.99,1])),null);
    const beaver={...result(offered),decisionOptions:[{action:'take',equity:.5},{action:'pass',equity:1},{action:'beaver',equity:.2}]};
    assert.deepEqual(clearRaceCubeAction(offered,beaver),{type:'beaver'});
    const redoubled=transition(offered,{type:'beaver'},1-player);
    assert.deepEqual(clearRaceCubeAction(redoubled,{...result(redoubled),decisionOptions:[{action:'take',equity:.5},{action:'pass',equity:-2},{action:'raccoon',equity:.8}]}),{type:'raccoon'});
  }
});
test('missing, stale, shallow, noisy or incompatible cube analysis never authorizes a choice',()=>{
  const s=race(),good=result(s);
  assert.equal(clearRaceCubeAction(s,null),null);
  for(const change of [{status:'partial'},{available:false},{type:'checker'},{positionKey:'stale'},
    {perspective:1},{units:'points'},{outcomes:[0,NaN,1]},
    {settings:{...good.settings,plies:2}},{settings:{...good.settings,plies:NaN}},
    {settings:{...good.settings,cubeful:false}},{settings:{...good.settings,noise:.01}},
    {decisionOptions:[{action:'roll',equity:0},{action:'made-up',equity:1}]}])
    assert.equal(clearRaceCubeAction(s,{...good,...change}),null);
  const owned={...s,cube:{value:2,owner:1}};
  assert.equal(clearRaceCubeAction(owned,result(owned,[0,.5,1])),null,'never offer an unavailable double');
});

test('a second double tap skips ahead only until the player’s next real choice',()=>{
  const m=model(),a=activate(m);
  assert.equal(a.skipping,false);
  const gesture=a.noteSkip(m,{...tap,at:2000});
  assert.ok(gesture&&a.waitingForRepeat,'the first tap holds automatic actions');
  assert.equal(a.repeat(m,{...tap,at:2500}),false,'too slow to count as a double tap');
  a.noteSkip(m,{...tap,at:3000});assert.ok(a.repeat(m,{...tap,at:3100}));
  assert.ok(a.skipping&&a.active&&!a.waitingForRepeat);
  m.state={...m.state,turn:1,sequence:3};a.sync(m);assert.ok(a.skipping,'the opponent’s turn keeps skipping');
  m.state={...m.state,turn:0,sequence:5,phase:'move',dice:[1,2]};
  a.sync(m,m.state,true);
  assert.equal(a.skipping,false,'a choice ends skipping');assert.ok(a.active,'and auto play resumes after it');
  const idle=new RaceAutoPlay();assert.equal(idle.noteSkip(m,tap),null,'nothing to skip without auto play');
  a.noteSkip(m,{...tap,at:4000});a.repeat(m,{...tap,at:4100});a.reset();
  assert.equal(a.skipping,false);assert.equal(a.active,null);
});
test('auto play bears off only when the best evaluated move takes off every checker this roll can',()=>{
  const position=(home,dice)=>{
    const points=Array(24).fill(0);home.forEach((n,i)=>points[i]=n);points[21]=-15;
    return initialState({phase:'move',dice,points,off:[15-home.reduce((a,b)=>a+b,0),0],turn:0,matchLength:0});
  };
  const analysed=(s,steps,extra={})=>({type:'checker',status:'complete',positionKey:positionKey(s),perspective:s.turn,
    settings:{plies:3,noise:0},candidates:[{steps,equity:.5}],...extra});
  const offCount=steps=>steps.filter(step=>step.to==='off').length;
  const s=position([0,2,0,0,2,3],[5,1]);
  const turns=legalTurns(s),most=Math.max(...turns.map(t=>offCount(t.steps)));
  assert.equal(most,1,'5-1 bears one checker off here');
  const bearing=turns.find(t=>offCount(t.steps)===1),quiet=turns.find(t=>offCount(t.steps)===0);
  assert.deepEqual(raceBearoffMove(s,analysed(s,bearing.steps)),{type:'move',steps:bearing.steps});
  assert.ok(quiet,'this roll can also be played without bearing off');
  assert.equal(raceBearoffMove(s,analysed(s,quiet.steps)),null,'a better quiet move is left to the player');
  // Two can come off with 2-1 from the ace and deuce points; one alone is not the maximum.
  const two=position([1,1,0,0,0,3],[2,1]),plays=legalTurns(two);
  const both=plays.find(t=>offCount(t.steps)===2),one=plays.find(t=>offCount(t.steps)===1);
  assert.deepEqual(raceBearoffMove(two,analysed(two,both.steps)).steps,both.steps);
  if(one)assert.equal(raceBearoffMove(two,analysed(two,one.steps)),null);
  const none=position([0,0,0,0,3,3],[2,1]);
  assert.equal(raceBearoffMove(none,analysed(none,legalTurns(none)[0].steps)),null,'no bearoff available: the player decides');
  for(const change of [{status:'partial'},{type:'cube'},{positionKey:'stale'},{perspective:1},
    {settings:{plies:3,noise:.02}},{candidates:[]},{candidates:[{steps:[{from:5,to:'off',die:6}]}]}])
    assert.equal(raceBearoffMove(s,analysed(s,bearing.steps,change)),null);
  assert.equal(raceBearoffMove(s,null),null);
  const contact=structuredClone(s);contact.points[0]=-1;contact.points[21]=-14;
  assert.equal(raceBearoffMove(contact,analysed(contact,bearing.steps)),null,'never outside a contact-free bearoff');
});
