import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,legalTurns,transition,replay,boardKey} from '../core/rules.mjs';
import {certainBearoff,homeRollOutcomes} from '../core/certain-bearoff.mjs';
import {playAction,takebackTarget,undoTurn,validateTakebacks} from '../core/table.mjs';
const position=(white,black,turn=0,extra={})=>{
 const points=Array(24).fill(0);
 white.forEach((n,i)=>points[i]=n);black.forEach((n,i)=>points[23-i]-=n);
 return initialState({points,off:[15-white.reduce((a,b)=>a+b,0),15-black.reduce((a,b)=>a+b,0)],turn,phase:'roll',matchLength:0,...extra});
};
const mirror=s=>({...structuredClone(s),turn:1-s.turn,points:s.points.toReversed().map(n=>-n),off:s.off.toReversed(),bar:s.bar.toReversed()});

test('certain singles and gammons account for turn order, arbitrary bad play and Jacoby',()=>{
 const single=position([1],[7],1),gammon=position([1],Array(11).fill(0).concat(15),1);
 for(const base of [single,gammon])for(const flipped of [false,true]){
  const s=flipped?mirror(base):base;
  assert.deepEqual(certainBearoff(s),{winner:flipped?1:0,level:base===single?1:2});
 }
 assert.deepEqual(certainBearoff(position([5],[15],1)),{winner:0,level:1},'even with no checkers off, the loser must save the gammon');
 assert.equal(certainBearoff(position([0,0,0,0,0,1],[1])),null,'one bad roll can still reverse the winner');
 assert.equal(certainBearoff(position([1],[4],1)),null,'the opponent can win before our next turn');
 assert.deepEqual(certainBearoff(position([1],[4],0)),{winner:0,level:1},'the player on roll finishes first on every roll');
 const uncertainLevel=position([0,0,0,0,0,1],[0,0,0,0,0,15],1);
 assert.equal(certainBearoff(uncertainLevel),null,'certain winner is insufficient when single vs gammon still varies');
 assert.deepEqual(certainBearoff({...uncertainLevel,rules:{...uncertainLevel.rules,jacoby:true}}),{winner:0,level:1});
});

test('contact, bars, pending decisions and rounded engine equities cannot finish a race',()=>{
 const base=position([1],[7],1);
 assert.equal(certainBearoff({...base,phase:'move',dice:[6,6]}),null);
 assert.equal(certainBearoff({...base,phase:'double',pending:{type:'double',by:1}}),null);
 const bar=structuredClone(base);bar.bar[1]=1;bar.points[23]++;assert.equal(certainBearoff(bar),null);
 const contact=position([0,0,1],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7]);
 assert.equal(certainBearoff(contact),null);
  assert.equal(certainBearoff(position([1],Array(22).fill(0).concat(15))),null,'passed checkers in the winner’s home board can still produce a backgammon');
 const uncertain=position([0,0,0,0,0,1],[1]);
 assert.equal(certainBearoff({...uncertain,equity:-1}),null);
 assert.throws(()=>transition(uncertain,{type:'finish-race',winner:0,level:1}),/not certain/);
});

test('home outcome enumeration exactly matches canonical legal turns for all dice',()=>{
 const homes=[[1],[0,0,1],[2,0,1],[0,1,0,0,0,1],[0,0,0,0,0,15],[3,2,4,1,2,3]];
 for(const home of homes)for(let a=1;a<=6;a++)for(let b=a;b<=6;b++){
  const s=position(home,[15],0,{phase:'move',dice:[a,b]});
  const expected=legalTurns(s).map(t=>t.state.points.slice(0,6).join(',')).sort();
  const h=Array.from({length:6},(_,i)=>home[i]||0);
  assert.deepEqual(homeRollOutcomes(h,[a,b]).map(h=>h.join(',')).sort(),expected);
 }
});

test('early results replay, award once, and allow finished-turn undo without an automatic loop',()=>{
 const initial=position([0,0,0,1],[7],0,{phase:'move',dice:[1,2],cube:{value:4,owner:0}});
 const table={id:'certain',started:true,initial,state:initial,events:[]};
 const moved=playAction(table,{type:'move',steps:legalTurns(initial)[0].steps});
 const won=playAction(moved,{type:'finish-race'});
 assert.equal(won.state.phase,'over');assert.equal(won.state.result.reason,'certain bearoff');
 assert.equal(won.state.result.points,4);assert.equal(won.state.off[0],14,'no fabricated checker moves');
 assert.ok(won.events.at(-1).automatic);
 assert.deepEqual(replay(won.initial,won.events).at(-1),won.state);
 assert.throws(()=>playAction(won,{type:'finish-race'}),/not certain/);
 const undone=undoTurn(won,takebackTarget(won,0),0);
 assert.deepEqual(undone.state,initial);assert.equal(undone.reviewingTurn,true);validateTakebacks(undone,true);
 const resumed={...table,initial:moved.state,state:moved.state,events:[]};
 const ended=playAction(resumed,{type:'finish-race'});
 assert.equal(takebackTarget(ended,0),0,'resumed certain position remains reviewable');
 assert.deepEqual(undoTurn(ended,0,0).state,moved.state);
 const match=position([1],[7],1,{matchLength:5,scores:[4,2],cube:{value:4,owner:0}});
 assert.deepEqual(transition(match,{type:'finish-race'}).scores,[5,2]);
});

test('proof agrees with exhaustive canonical timing on small home boards',()=>{
 const homes=[];
 for(let a=0;a<6;a++)for(let b=a;b<6;b++){const h=Array(6).fill(0);h[a]++;h[b]++;homes.push(h);}
 for(let a=0;a<6;a++){const h=Array(6).fill(0);h[a]=1;homes.push(h);}
 const memo=new Map();
 const timing=h=>{
  const key=h.join();if(memo.has(key))return memo.get(key);
  if(!h.some(Boolean))return {min:0,max:0};
  let min=Infinity,max=0;
  for(let a=1;a<=6;a++)for(let b=a;b<=6;b++){
   const state=position(h,[15],0,{phase:'move',dice:[a,b]});
   for(const turn of legalTurns(state)){
    const t=timing(turn.state.points.slice(0,6));min=Math.min(min,1+t.min);max=Math.max(max,1+t.max);
   }
  }
  const result={min,max};memo.set(key,result);return result;
 };
 let proved=0;
 for(const white of homes)for(const black of homes)for(const turn of [0,1]){
  const s=position(white,black,turn),result=certainBearoff(s),times=[timing(white),timing(black)];
  const winners=[0,1].filter(w=>times[w].max<=times[1-w].min-(turn===1-w?1:0));
  assert.deepEqual(result,winners.length?{winner:winners[0],level:1}:null,boardKey(s));
  if(result)proved++;
 }
 assert.ok(proved>100);
});

test('online host adjudication is idempotent, recoverable and requires both connected players',async()=>{
 const {session,accept,envelope,recover,checkpoint,verifyHistory}=await import('../core/protocol.mjs');
 const players=[{id:'host',name:'White'},{id:'guest',name:'Black'}];
 let table=session(players,position([1],[7],1),'certain-room');table.started=true;
 const options={hostId:'host',connected:['host','guest'],dice:()=>{throw Error('must not consume dice');}};
 const cmd=envelope(table,'host',{type:'auto'},'finish');
 assert.throws(()=>accept(table,'guest',cmd,options));
 assert.throws(()=>accept(table,'host',cmd,{...options,connected:['host']}));
 table=accept(table,'host',cmd,options);
 assert.equal(table.state.result.reason,'certain bearoff');assert.ok(verifyHistory(table));
 assert.deepEqual(accept(table,'host',cmd,options),table);
 const state=structuredClone(table.state),cp=checkpoint(table);
 table=recover(table,'guest');
 table=accept(table,'host',envelope(table,'host',{type:'recover',checkpoint:cp},'agree'),{...options,hostId:'guest'});
 assert.equal(table.recovery,null);assert.deepEqual(table.state,state);assert.ok(verifyHistory(table));
 const {itemRecord,validateItem,parseBackup}=await import('../core/storage.mjs');
 const item=itemRecord('match',{title:'Certain finish',initial:table.initial,events:table.events,state:table.state});
 assert.ok(validateItem(item));
 assert.ok(parseBackup(JSON.stringify({format:'backgammon-library',version:1,items:[item],progress:[],settings:{}})).items.length);
 const restoredOptions={...options,hostId:'guest'};
 table=accept(table,'host',envelope(table,'host',{type:'undo-request'},'undo'),restoredOptions);
 assert.equal(table.undoRequest.target,0);
 table=accept(table,'guest',envelope(table,'guest',{type:'undo-accept',requestId:'undo'},'accept-undo'),restoredOptions);
 assert.deepEqual(table.state,table.initial);assert.equal(table.reviewingTurn,true);assert.ok(verifyHistory(table));
 assert.throws(()=>accept(table,'guest',envelope(table,'guest',{type:'auto'},'repeat-finish'),restoredOptions),/Confirm the restored turn/);
});
