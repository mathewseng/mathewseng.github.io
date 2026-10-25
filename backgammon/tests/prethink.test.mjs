import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, legalTurns, transition, assertState, positionKey, boardKey, commitTurn } from '../core/rules.mjs';
import { localConfig } from '../core/play-session.mjs';
import { Prethink, PRETHINK, NEXT_CUBE_PRIORITY, chanceRolls, continuations } from '../core/prethink.mjs';
import { futureLocalRoll } from '../core/local-rolls.mjs';

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
test('seeded preparation explores the actual future roll on every near-best branch without advancing it',async()=>{
  const h=harness({limits:{...PRETHINK,nodes:24}});
  h.view.game.localRolls={version:1,seed:'b7'.repeat(32),cursor:5};
  try {
    const expected=await futureLocalRoll(h.view.game),original=structuredClone(h.view.game);
    for(let i=0;i<12;i++)await h.tick();
    const next=h.calls.filter(c=>c.state.phase==='move' && c.state.turn===1);
    assert.ok(next.length>=2,'prepares several near-best continuations');
    assert.ok(next.every(c=>JSON.stringify(c.state.dice)===JSON.stringify(expected)));
    assert.ok(h.calls.every(c=>!('localRolls' in c.state)&&!('seed' in c)),'engine never sees the seed');
    assert.deepEqual(h.view.game,original);
  } finally {h.p.pause();}
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
    const result=evaluate(state);
    if(options.submitted)result.actual={...legalTurns(state).find(t=>t.key===boardKey(commitTurn(state,options.submitted))),equity:.25};
    return result;
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
    assert.ok(h.calls.every(c=>c.preset===(c.priority===-20&&c.state.phase!=='move'?'quick':'auto')),'only hypothetical cube routing uses a quick score');
    assert.equal(h.view.game.events,undefined,'no game mutation / speculative event history');
  } finally {h.p.pause();}
});

test('completed actual draft prepares its own next decision ahead of hypothetical best lines',async()=>{
  const h=harness();
  try {
    await h.tick();
    const source=structuredClone(h.view.game.state);
    h.view.submitted=legalTurns(source).at(-1).steps;
    await h.tick();await h.tick();
    assert.equal(h.calls[2].priority,-20);
    assert.deepEqual(h.calls[2].state,transition(source,{type:'move',steps:h.view.submitted}));
    assert.deepEqual(h.view.game.state,source,'forecast never moves real pieces or draws real dice');
  }finally{h.p.pause();}
});

test('cold engine loading does not consume the bounded speculative search budget',async()=>{
  const h=harness();let time=0,starts=0;
  h.p.now=()=>time;
  try {
    await h.tick();
    h.p.engine.start=async()=>{starts++;time+=8000;h.p.engine.ready=true;};
    await h.tick();
    assert.equal(starts,1);
    assert.equal(h.calls.at(-1).priority,-20);
    assert.equal(h.p.scope.spent,0,'eight seconds of cold compilation is separate from search time');
    await h.tick();
    assert.equal(h.p.scope.nodes,2,'the next known roll still gets prepared');
    assert.equal(starts,1,'the warm worker is reused');
  }finally{h.p.pause();}
});
test('opening-book play warms one shared worker and respects the analysis-ahead opt-out',async()=>{
  const h=harness();let starts=0;
  h.p.engine.start=async()=>{starts++;};
  h.view.game.state=initialState();
  try {
    h.view.enabled=false;h.p.update();assert.equal(starts,0);
    h.view.enabled=true;h.p.update();h.p.update();
    assert.equal(starts,1,'opening animation warms the engine once per game');
    assert.equal(h.calls.length,0,'warming itself does not evaluate speculative positions');
  }finally{h.p.pause();}
});

test('a chosen bot move prepares the next cube decision during animation and respects opt-out',async()=>{
  const h=harness();
  try {
    h.view.game.config.humanSide=1;
    const source=structuredClone(h.view.game.state),action={type:'move',steps:legalTurns(source)[0].steps};
    h.view.idle=false;h.p.prepareAfter(source,action);await Promise.resolve();
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].priority,NEXT_CUBE_PRIORITY);
    assert.ok(h.calls[0].priority>0 && h.calls[0].priority<10,'display and old grades cannot interrupt the next cube; real actions can');
    assert.equal(h.calls[0].readyOnly,true,'Auto prepares the playable minimum first');
    assert.deepEqual(h.calls[0].state,transition(source,action));
    assert.deepEqual(h.view.game.state,source);
    h.view.enabled=false;h.p.prepareAfter(source,action);assert.equal(h.calls.length,1);
  }finally{h.p.pause();}
});
test('current human cube starts immediately, reuses the active preparation and preserves fixed depth',async()=>{
  const h=harness();
  try {
    h.view.game.state=initialState({phase:'roll',matchLength:0});
    h.view.game.config.reviewStrength='research';
    h.p.update();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(h.calls[0].priority,NEXT_CUBE_PRIORITY);
    assert.equal(h.calls[0].preset,'research','explicit depth is never reduced');
    assert.equal(h.calls[0].readyOnly,true);
    const cancel=h.cancelled[0];
    assert.equal(cancel({priority:NEXT_CUBE_PRIORITY,state:h.view.game.state}),false,'entering the turn keeps its in-flight cube check');
    h.p.pause();
    assert.equal(h.cancelled.at(-1)({priority:NEXT_CUBE_PRIORITY}),true,'opt-out cancels owned work');
    assert.equal(h.cancelled.at(-1)({priority:10}),false,'opt-out leaves foreground work alone');
  }finally{h.p.pause();}
});
test('the speculative deadline cannot discard a cube check after its turn has begun',async()=>{
 for (const sameGame of [true,false]) {
  const h=harness({deferred:true,limits:{...PRETHINK,milliseconds:20}});
  try {
    h.view.game.config.humanSide=1;h.view.idle=false;
    const source=h.view.game.state,action={type:'move',steps:legalTurns(source)[0].steps};
    h.p.prepareAfter(source,action);
    const pending=h.calls[0];
    h.view.game={...h.view.game,id:sameGame ? h.view.game.id : 'different-game',state:transition(source,action)};
    await new Promise(resolve=>setTimeout(resolve,30));
    const cancel=h.cancelled.at(-1);
    assert.equal(cancel(pending),!sameGame,'only the current game’s cube check survives the speculative deadline');
    assert.equal(cancel({...pending,priority:20}),false);
  }finally{h.p.pause();h.resolve();}
 }
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

test('completing a real draft preempts a speculative job before Confirm is clicked',async()=>{
  const h=harness();let finish;
  try {
    await h.tick();
    const analyze=h.p.engine.analyze;
    h.p.engine.analyze=(state,options)=>options.priority===-20
      ? new Promise(resolve=>{finish=()=>resolve(evaluate(state));}) : analyze(state,options);
    const future=h.p.run();await Promise.resolve();
    assert.equal(h.p.job.priority,-20);
    h.view.submitted=legalTurns(h.view.game.state).at(-1).steps;
    h.p.update();clearTimeout(h.p.timer);
    const cancels=h.cancelled.at(-1);
    assert.equal(cancels({priority:-20}),true);
    assert.equal(cancels({priority:20}),false,'never cancel a promoted foreground action');
    assert.equal(h.p.job,null);
    await h.p.run();clearTimeout(h.p.timer);
    assert.equal(h.calls.at(-1).priority,-4);
    const queue=structuredClone(h.p.scope.queue);
    finish();await future;clearTimeout(h.p.timer);
    assert.deepEqual(h.p.scope.queue,queue,'late cancelled work cannot expand the plan');
  }finally{h.p.pause();}
});

test('chosen bot continuation prepares the seeded checker roll while foreground animation is busy', async()=>{
  const h=harness();
  try {
    h.view.game.localRolls={version:1,seed:'b7'.repeat(32),cursor:5};
    h.view.idle=false;
    const original=structuredClone(h.view.game), action={type:'move',steps:legalTurns(original.state)[0].steps};
    const expected=await futureLocalRoll(original);
    h.p.prepareAfter(original.state, action);
    for(let i=0;i<30 && !h.calls.some(c=>c.state.phase==='move');i++) await new Promise(r=>setTimeout(r,0));
    const checker=h.calls.find(c=>c.state.phase==='move');
    assert.ok(checker,'next checker search starts before playback finishes');
    assert.deepEqual(checker.state.dice,expected);
    assert.equal(checker.state.turn,1);
    assert.equal(checker.readyOnly,false,'chosen next checker position may deepen during animation');
    assert.ok(h.calls.filter(c=>c.state.phase!=='move').every(c=>c.readyOnly),'cube preparation stops at its minimum');
    assert.deepEqual(h.view.game,original,'preparation consumes no real roll');
    // Committing the chosen action must not kill its already-running next-roll work.
    h.view.game={...original,state:transition(original.state,action)};
    h.p.update();clearTimeout(h.p.timer);
    assert.equal(h.cancelled.at(-1)({priority:-20,state:checker.state}),false);
    h.p.pause();assert.equal(h.p.plan,null);
  }finally{h.p.pause();}
});

test('future cube preparation keeps the mandatory minimum and hard speculative deadline',async()=>{
  const h=harness({limits:{...PRETHINK,nodes:8,milliseconds:20}});
  let rejectFuture, pendingJob;
  try{
    await h.tick();
    assert.equal(h.calls[0].readyOnly,false,'current-position analysis may deepen while idle');
    h.p.engine.analyze=(state,options)=>{
      pendingJob={state,...options};
      assert.equal(state.phase,'roll');
      assert.equal(options.readyOnly,true,'future cube work stops at its minimum');
      return new Promise((resolve,reject)=>{rejectFuture=reject;});
    };
    h.p.engine.cancelWhere=predicate=>{
      assert.equal(predicate({...pendingJob,priority:20}),false,'deadline cannot cancel a live promoted job');
      if(predicate(pendingJob))rejectFuture(new DOMException('Budget exhausted','AbortError'));
    };
    await h.p.run();clearTimeout(h.p.timer);
    assert.ok(h.p.scope.spent>=20);
    let restarted=false;
    h.p.engine.analyze=()=>{restarted=true;return Promise.resolve(evaluate(source()));};
    await h.p.run();clearTimeout(h.p.timer);assert.equal(restarted,false,'deadline never creates a retry loop');
  }finally{h.p.engine.cancelWhere=()=>{};h.p.pause();}
});

test('only the highest-priority future Auto checker position can deepen per idle scope',async()=>{
  const h=harness({limits:{...PRETHINK,nodes:24}});
  try {
    h.view.game.localRolls={version:1,seed:'b7'.repeat(32),cursor:5};
    await h.tick();
    h.view.submitted=legalTurns(h.view.game.state).at(-1).steps;
    await h.tick();
    assert.equal(h.calls[1].readyOnly,true,'actual-move grading stays responsive');
    for(let i=0;i<18;i++)await h.tick();
    const checkers=h.calls.filter(c=>c.priority===-20&&c.state.phase==='move');
    assert.ok(checkers.length>=2,'exercise both the preferred branch and alternatives');
    assert.equal(checkers[0].readyOnly,false);
    assert.deepEqual(checkers[0].state.points,transition(h.view.game.state,{type:'move',steps:h.view.submitted}).points);
    assert.ok(checkers.slice(1).every(c=>c.readyOnly),'alternatives cannot all launch optional fourth ply');
    assert.ok(h.calls.filter(c=>c.priority===-20&&c.state.phase!=='move').every(c=>c.readyOnly));
  } finally {h.p.pause();}
});

test('optional future checker deepening cannot exceed the hard budget or restart itself',async()=>{
  const h=harness({limits:{...PRETHINK,nodes:8,milliseconds:20}});
  let pendingJob,rejectFuture;
  try {
    await h.tick();
    // Isolate a future checker node so the deadline expires in optional checker work.
    h.p.scope.queue=[{state:{...source(),dice:[3,1]},turns:1,weight:1}];
    h.p.engine.analyze=(state,options)=>{
      pendingJob={state,...options};
      assert.equal(options.readyOnly,false);
      return new Promise((resolve,reject)=>{rejectFuture=reject;});
    };
    h.p.engine.cancelWhere=predicate=>{
      assert.equal(predicate({...pendingJob,priority:20}),false);
      if(predicate(pendingJob))rejectFuture(new DOMException('Budget exhausted','AbortError'));
    };
    await h.p.run();clearTimeout(h.p.timer);
    assert.ok(h.p.scope.spent>=20);
    assert.equal(h.p.scope.deepened,true);
    h.p.engine.analyze=()=>{assert.fail('budget expiry must not launch a retry');};
    await h.p.run();clearTimeout(h.p.timer);
  } finally {h.p.engine.cancelWhere=()=>{};h.p.pause();}
});
