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
 assert.deepEqual(certainBearoff({...base,phase:'move',dice:[6,6]}),{winner:0,level:1});
 assert.equal(certainBearoff({...base,phase:'double',pending:{type:'double',by:1}}),null);
 const bar=structuredClone(base);bar.bar[1]=1;bar.points[23]++;assert.equal(certainBearoff(bar),null);
 const contact=position([0,0,1],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,7]);
 assert.equal(certainBearoff(contact),null);
  assert.deepEqual(certainBearoff(position([1],Array(22).fill(0).concat(15))),{winner:0,level:3},'a backgammon is awarded once no roll or play can avoid it');
  assert.equal(certainBearoff(position([0,0,0,0,0,2],Array(22).fill(0).concat(15))),null,'the loser may or may not leave the winner’s home board in time');
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

test('a known roll can seal either player’s win before any checker moves',()=>{
 const before=position([0,0,2],[5]);
 assert.equal(certainBearoff(before),null);
 for(const flipped of [false,true]){
  const s=flipped?mirror(before):before;
  const rolled=transition(s,{type:'roll',dice:[1,1]});
  assert.deepEqual(certainBearoff(rolled),{winner:flipped?1:0,level:1});
  const t=playAction({id:'rolled',started:true,initial:s,state:s,events:[]},{type:'roll',dice:[1,1]});
  assert.equal(t.state.phase,'move','sealed roll waits for its dice reveal');
  assert.equal(t.events.length,1,'no forced checker movement before the award');
  const won=playAction(t,{type:'finish-race'});
  assert.deepEqual(won.state.points,s.points);
  assert.deepEqual(replay(s,won.events).at(-1),won.state);
  assert.deepEqual(undoTurn(won,takebackTarget(won),s.turn).state,rolled,'explicit undo restores the actual rolled position');
 }
 const canLose=position([0,0,0,0,0,1],[1]);
 assert.equal(certainBearoff(canLose),null);
 assert.deepEqual(certainBearoff(transition(canLose,{type:'roll',dice:[1,2]})),{winner:1,level:1});
 assert.deepEqual(certainBearoff(transition(canLose,{type:'roll',dice:[6,2]})),{winner:0,level:1});
 assert.equal(certainBearoff(transition(position([0,0,0,0,0,1],[4]),{type:'roll',dice:[3,2]})),null,'a future double can still change the winner');
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
 // Independent oracle: enumerate the CURRENT roll with the canonical rules,
 // then compare exhaustive fastest/slowest future finishes of both players.
 // An exact roll must not turn 'usually winning' into a premature award.
 for(const white of homes.filter((_,i)=>i%3===0))for(const black of homes.filter((_,i)=>i%3===0))
  for(const turn of [0,1])for(let a=1;a<=6;a++)for(let b=a;b<=6;b++){
   const s=position(white,black,turn,{phase:'move',dice:[a,b]});
   const winners=legalTurns(s).map(t=>{
    if(t.state.off[turn]===15)return turn;
    const times=[timing(t.state.points.slice(0,6)),timing(t.state.points.slice(18).toReversed().map(n=>-n))];
    return [0,1].find(w=>times[w].max<=times[1-w].min-((1-turn)===1-w?1:0));
   });
   const expected=winners.every(w=>w!==undefined&&w===winners[0])?{winner:winners[0],level:1}:null;
   assert.deepEqual(certainBearoff(s),expected,`${boardKey(s)} ${a}-${b}, turn ${turn}`);
  }
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


test('queued local rolls finish an already sealed game without consuming private or replay dice',async()=>{
 const {localPlayAction}=await import('../core/local-rolls.mjs');
 for(const turn of [0,1])for(const mode of ['computer','local'])for(const queued of [false,true]){
  const initial=position([1],[7],turn);
  const source={id:'queued-certain',started:true,initial,state:initial,events:[],config:{mode},
   ...(mode==='computer'?{localRolls:{version:1,seed:'ab'.repeat(32),cursor:19}}:{}),
   ...(queued?{replayDice:[{actor:turn,dice:[6,6]}]}:{})};
  const before=structuredClone(source),ended=await localPlayAction(source,{type:'roll'});
  assert.deepEqual(source,before);
  assert.deepEqual(ended.events.map(e=>e.action),[{type:'finish-race'}]);
  assert.equal(ended.state.result.winner,0);
  assert.deepEqual(ended.localRolls,source.localRolls);
  assert.deepEqual(ended.replayDice,source.replayDice);
  assert.deepEqual(replay(initial,ended.events).at(-1),ended.state);
  await assert.rejects(()=>localPlayAction({...source,state:{...initial,phase:'move',dice:[1,2]}},{type:'roll'}));
 }
});

test('an online roll request cannot draw dice before a known certain result',async()=>{
 const {session,accept,envelope,verifyHistory}=await import('../core/protocol.mjs');
 const players=[{id:'host',name:'White'},{id:'guest',name:'Black'}];
 for(const turn of [0,1]){
  const table=session(players,position([1],[7],turn),'sealed-before-roll');table.started=true;
  const options={hostId:'host',connected:['host','guest'],dice:()=>{throw Error('must not roll a sealed game');}};
  const id=players[turn].id;
  const ended=accept(table,id,envelope(table,id,{type:'roll'},'queued-roll'),options);
  assert.deepEqual(ended.events.map(e=>e.action),[{type:'finish-race'}]);
  assert.equal(ended.state.result.winner,0);assert.ok(verifyHistory(ended));
  assert.deepEqual(accept(ended,id,envelope(table,id,{type:'roll'},'queued-roll'),options),ended);
  assert.throws(()=>accept(table,id,envelope(table,id,{type:'roll',dice:[1,2]},'forged-dice'),options),/Only the host supplies dice/);
 }
});

test('races are decided before either side is home, including gammons and backgammons',()=>{
 const far=points=>{const side=[];for(const [point,n] of points)side[point-1]=n;return Array.from(side,n=>n||0);};
 // One checker eight pips away always needs at most three turns; four checkers
 // on the 24 point need at least two turns each before the first can come home.
 const outside=position(far([[8,1]]),far([[13,15]]),0);
 assert.deepEqual(certainBearoff(outside),{winner:0,level:2},'a gammon is certain with the winner still outside home');
 assert.deepEqual(certainBearoff(mirror(outside)),{winner:1,level:2});
 assert.deepEqual(certainBearoff({...outside,rules:{...outside.rules,jacoby:true}}),{winner:0,level:1});
 assert.deepEqual(certainBearoff(position(far([[8,1]]),far([[13,14]]),0)),{winner:0,level:1},'a borne-off checker rules out the gammon');
 assert.equal(certainBearoff(position(far([[8,1]]),far([[7,1],[1,14]]),0)),null,'the loser can still save the gammon');
 const backgammon=position(far([[1,2]]),far([[23,15]]),1);
 assert.deepEqual(certainBearoff(backgammon),{winner:0,level:3},'four sixes cannot clear fifteen checkers in one turn');
 assert.equal(certainBearoff(position(far([[1,1]]),far([[19,1],[1,14]]),1)),null,'four sixes still bring the last checker home and off');
 assert.equal(certainBearoff(position(far([[1,1]]),far([[19,2],[12,13]]),1)),null,'the loser chooses whether to leave the winner’s home board');
 // Gammons stop mattering once a single game wins the match.
 const match={matchLength:5,scores:[4,0],crawford:true};
 assert.deepEqual(certainBearoff(position([0,0,0,0,0,1],[0,0,0,0,0,15],1,match)),{winner:0,level:1});
 assert.equal(certainBearoff(position([0,0,0,0,0,1],[0,0,0,0,0,15],1,{...match,scores:[3,0],crawford:false})),null);
 assert.deepEqual(certainBearoff(position([0,0,0,0,0,1],[0,0,0,0,0,15],1,{...match,scores:[3,0],crawford:false,cube:{value:2,owner:0}})),{winner:0,level:1});
});

test('a known roll is checked against every legal play outside the home board',()=>{
 const far=points=>{const side=[];for(const [point,n] of points)side[point-1]=n;return Array.from(side,n=>n||0);};
 const before=position(far([[10,1]]),far([[6,1],[5,1]]),0);
 assert.equal(certainBearoff(before),null,'a small roll leaves the opponent a winning double');
 assert.deepEqual(certainBearoff(transition(before,{type:'roll',dice:[6,4]})),{winner:0,level:1});
 assert.deepEqual(certainBearoff(transition(before,{type:'roll',dice:[3,3]})),{winner:0,level:1});
 assert.equal(certainBearoff(transition(before,{type:'roll',dice:[2,1]})),null);
});

test('general race proofs agree with exhaustive timing of both sides',()=>{
 const sides=[];
 for(let a=0;a<11;a++)for(let b=a;b<11;b+=2){const h=Array(11).fill(0);h[a]++;h[b]++;sides.push(h);}
 for(let a=0;a<14;a+=2){const h=Array(14).fill(0);h[a]=1;sides.push(h);}
 const memo=new Map();
 const timing=h=>{
  const key=h.join();if(memo.has(key))return memo.get(key);
  if(!h.some(Boolean))return {min:0,max:0};
  let min=Infinity,max=0;
  for(let a=1;a<=6;a++)for(let b=a;b<=6;b++){
   const state=position(h,[15],0,{phase:'move',dice:[a,b]});
   for(const turn of legalTurns(state)){
    const t=timing(turn.state.points.slice(0,h.length));min=Math.min(min,1+t.min);max=Math.max(max,1+t.max);
   }
  }
  const result={min,max};memo.set(key,result);return result;
 };
 let proved=0,outside=0;
 for(const white of sides)for(const black of sides){
  if(white.length+black.length>24)continue;
  for(const turn of [0,1]){
   const s=position(white,black,turn),times=[timing(white),timing(black)];
   const winners=[0,1].filter(w=>times[w].max<=times[1-w].min-(turn===1-w?1:0));
   assert.deepEqual(certainBearoff(s),winners.length?{winner:winners[0],level:1}:null,boardKey(s));
   if(winners.length){proved++;if(white.slice(6).some(Boolean)||black.slice(6).some(Boolean))outside++;}
  }
 }
 assert.ok(proved>60&&outside>40,`${proved} proofs, ${outside} outside home`);
});
