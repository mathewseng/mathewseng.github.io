import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineClient } from '../engine/client.mjs';
import { runAdaptiveAsync } from '../engine/adaptive.mjs';
import { initialState, legalTurns, positionKey } from '../core/rules.mjs';
import { PRESETS, ENGINE_VERSION } from '../engine/metadata.mjs';
class Worker {
  messages=[];
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  reply(data){this.onmessage({data});}
}
const tick=()=>new Promise(r=>setTimeout(r,0));
const source=()=>initialState({phase:'move',dice:[4,1],matchLength:7});
const result=(state,plies)=>({status:'complete',type:'checker',engine:ENGINE_VERSION,positionKey:positionKey(state),
  settings:{name:PRESETS[Object.keys(PRESETS)[plies]].name,plies},
  candidates:legalTurns(state).slice(0,3).map((t,i)=>({key:t.key,steps:t.steps,equity:.3-i*.02})),
  actual:null,budget:{reason:'searching'},units:'normalized-match-equity'});
const harness=()=>{const workers=[];const client=new EngineClient({openingBook:null,workerFactory:()=>{const w=new Worker();workers.push(w);return w;}});
  return {client,workers,start:async()=>{workers.at(-1).reply({id:0,type:'ready',elapsedMs:1});await tick();return client.active.id;}};};

test('live Auto asks for a complete 3-ply result and never accepts 0/1/2 ply',async()=>{
  const h=harness(),s=source();let resolved=false;
  try{
    const pending=h.client.analyze(s,{preset:'auto',readyOnly:true}).then(r=>{resolved=true;return r;});
    const id=await h.start(),w=h.workers[0];
    assert.equal(w.messages.at(-1).readyOnly,true);
    for(const depth of [0,1,2]){w.reply({id,type:'evaluation',result:result(s,depth)});await tick();assert.equal(resolved,false);assert.equal(h.client.readyResult(s),null);assert.equal(h.client.decisions.size,0);}
    const three={...result(s,3),budget:{reason:'ready-to-play'}};
    w.reply({id,type:'evaluation',result:three});w.reply({id,type:'result',result:three});
    assert.equal((await pending).settings.plies,3);
    assert.equal(w.terminated,undefined,'normal live completion keeps warm worker');
    assert.equal(h.client.cache.size,0,'live stop cannot masquerade as a full adaptive result');
    assert.equal((await h.client.analyze(s,{preset:'auto',readyOnly:true})).cached,true);
    const full=h.client.analyze(s,{preset:'auto'});await tick();
    assert.equal(w.messages.at(-1).readyOnly,false,'explicit review can still search deeper');
    w.reply({id:h.client.active.id,type:'result',result:{...result(s,3),budget:{reason:'predicted-cost'}}});await full;
  }finally{h.client.destroy();}
});

test('bot consumes deepest completed stage immediately while optional deeper WASM is running',async()=>{
  const h=harness(),s=source();
  try{
    const speculative=h.client.analyze(s,{preset:'auto',priority:-20});
    const id=await h.start(),old=h.workers[0];
    old.reply({id,type:'evaluation',result:result(s,2)});
    old.reply({id,type:'evaluation',result:result(s,3)});
    const played=await h.client.analyze({...s,dice:[1,4]},{preset:'auto',readyOnly:true});
    assert.equal(played.settings.plies,3);assert.equal(old.terminated,true);
    assert.equal(played.positionKey,positionKey({...s,dice:[1,4]}));
    assert.equal((await speculative).settings.plies,3);
    old.reply({id,type:'result',result:result(s,4)});
    assert.equal(h.client.readyResult(s).settings.plies,3,'terminated late packet cannot replace live result');
    h.client.rememberDecision({key:h.client.decisions.keys().next().value,state:s,preset:'auto'},result(s,2));
    assert.equal(h.client.readyResult(s).settings.plies,3,'revisiting a position never downgrades its completed checkpoint');
    const job={key:h.client.decisions.keys().next().value,state:s,preset:'auto'};
    h.client.rememberDecision(job,result(s,4));
    h.client.rememberDecision(job,result(s,3));
    assert.equal(h.client.readyResult(s).settings.plies,4,'a newer minimum-depth stage cannot overwrite a deeper answer');
    played.candidates[0].equity=999;
    assert.equal(h.client.readyResult(s).candidates[0].equity,.3);
    for(const other of [{...s,dice:[2,3]},{...s,turn:1},{...s,scores:[1,0]}, {...s,cube:{value:2,owner:0}}])
      assert.equal(h.client.readyResult(other),null,'ready results stay in exact decision context');
    assert.equal(h.client.readyResult(s,{submitted:legalTurns(s).at(-1).steps}),null,'unlisted choice never borrows a different move grade');
    assert.ok(Math.abs(h.client.readyResult(s,{submitted:played.candidates[1].steps}).error-.02)<1e-8);
  }finally{h.client.destroy();}
});

test('promotion requests a cooperative stop; worker failures are retryable',async()=>{
  const h=harness(),s=source();
  try{
    const background=h.client.analyze(s,{preset:'auto',priority:-5});
    const rejected=assert.rejects(background,/failed/);
    const id=await h.start(),w=h.workers[0];
    const live=h.client.analyze(s,{preset:'auto',readyOnly:true,priority:20});
    const liveRejected=assert.rejects(live,/failed/);
    assert.deepEqual(w.messages.at(-1),{id,type:'finish-ready'});
    w.onerror({message:'worker failed'});await rejected;await liveRejected;
    const retry=h.client.analyze(s,{preset:'auto',readyOnly:true});const next=await h.start();
    h.workers[1].reply({id:next,type:'result',result:result(s,3)});
    assert.equal((await retry).settings.plies,3);
  }finally{h.client.destroy();}
});

test('retained speculation is bounded by candidate rows, including screening payloads',()=>{
  const h=harness(),s=source();
  try{
    for(let i=0;i<100;i++){
      const r={...result(s,3),screening:{excluded:Array(600).fill({equity:0})}};
      const job={key:String(i),state:s,preset:'auto'};
      h.client.rememberDecision(job,r);h.client.cache.set(job.key,r);h.client.trimCache();
    }
    assert.ok(h.client.decisions.size<=16);assert.ok(h.client.cache.size<=6);
    assert.equal([...h.client.decisions.values()][0].result.screening.excluded,undefined,'checkpoints discard excluded shallow paths');
    h.client.destroy();assert.equal(h.client.decisions.size,0);
  }finally{h.client.destroy();}
});

test('adaptive worker yields between depths and stops after 3 when play needs its answer',async()=>{
  const depths=[];let ready=false;
  const r=await runAdaptiveAsync({analyze(s,preset){depths.push(PRESETS[preset].plies);return {status:'complete',type:'checker',settings:PRESETS[preset],candidates:[{key:'a',equity:.2},{key:'b',equity:.199}]};}},
    source(),'checker',null,()=>{},()=>ready,async()=>{ready=true;});
  assert.deepEqual(depths,[0,1,2,3]);assert.equal(r.budget.reason,'ready-to-play');
});

test('a failure during optional work preserves a live completed three-ply answer',async()=>{
  const h=harness(),s=source();
  try{
    const pending=h.client.analyze(s,{preset:'auto',readyOnly:true});
    const id=await h.start(),w=h.workers[0];
    w.reply({id,type:'evaluation',result:result(s,3)});
    w.onerror({message:'worker failed after checkpoint'});
    assert.equal((await pending).settings.plies,3);
    assert.equal(h.client.worker,null);
    assert.equal(h.client.readyResult(s).settings.plies,3);
  }finally{h.client.destroy();}
});

test('a failed live search cannot fall back to a completed two-ply checkpoint',async()=>{
  const h=harness(),s=source();
  try {
    const pending=h.client.analyze(s,{preset:'auto',readyOnly:true});
    const rejected=assert.rejects(pending,/worker failed/);
    const id=await h.start(),w=h.workers[0];
    w.reply({id,type:'evaluation',result:result(s,2)});
    w.onerror({message:'worker failed before three ply'});
    await rejected;
    assert.equal(h.client.readyResult(s),null);
    assert.equal(h.client.cache.size,0);
  } finally {h.client.destroy();}
});

test('background deadline preserves completed three ply for immediate live reuse',async()=>{
  const h=harness(),s=source();
  try {
    const pending=h.client.analyze(s,{preset:'auto',priority:-20});
    const rejected=assert.rejects(pending,{name:'AbortError'});
    const id=await h.start(),w=h.workers[0];
    w.reply({id,type:'evaluation',result:result(s,3)});
    h.client.cancelWhere(job=>job.priority===-20);
    await rejected;
    assert.equal(w.terminated,true);
    const ready=await h.client.analyze(s,{preset:'auto',readyOnly:true});
    assert.equal(ready.settings.plies,3);
    assert.equal(ready.cached,true);
    assert.equal(h.workers.length,1,'live reuse starts no replacement search');
  } finally {h.client.destroy();}
});

test('completed optional four ply is used by the next live action without another search',async()=>{
  const h=harness(),s=source();
  try {
    const pending=h.client.analyze(s,{preset:'auto',priority:-20});
    const id=await h.start(),w=h.workers[0];
    w.reply({id,type:'evaluation',result:result(s,3)});
    w.reply({id,type:'result',result:{...result(s,4),budget:{reason:'maximum-depth'}}});
    await pending;
    const ready=await h.client.analyze(s,{preset:'auto',readyOnly:true});
    assert.equal(ready.settings.plies,4);
    assert.equal(ready.cached,true);
    assert.equal(w.messages.filter(m=>m.type==='analyze').length,1);
  } finally {h.client.destroy();}
});

test('cooperative cancellation reuses the warm worker and ignores cancelled checkpoints',async()=>{
  const h=harness(),s=source();
  try {
    const obsolete=h.client.analyze(s,{preset:'auto',priority:-20});
    const rejected=assert.rejects(obsolete,{name:'AbortError'});
    const id=await h.start(),w=h.workers[0];h.client.startup.cooperativeCancellation=true;
    const nextState={...s,dice:[5,2]};
    const next=h.client.analyze(nextState,{preset:'auto',priority:20});
    await rejected;
    assert.equal(w.terminated,undefined);
    assert.deepEqual(w.messages.at(-1),{type:'cancel',id});
    assert.equal(h.client.active,null,'replacement cannot overlap a still-running native call');
    w.reply({id,type:'evaluation',result:result(s,4)});
    assert.equal(h.client.readyResult(s),null,'cancelled work cannot publish stale checkpoints');
    w.reply({id,type:'cancelled'});await tick();
    assert.equal(h.workers.length,1);
    assert.equal(w.messages.at(-1).type,'analyze');
    w.reply({id:h.client.active.id,type:'result',result:result(nextState,3)});
    assert.equal((await next).settings.plies,3);
  } finally {h.client.destroy();}
});

test('completed live answer is immediate while optional work cooperatively stops',async()=>{
  const h=harness(),s=source();
  try {
    const background=h.client.analyze(s,{preset:'auto',priority:-20});
    const id=await h.start(),w=h.workers[0];h.client.startup.cooperativeCancellation=true;
    w.reply({id,type:'evaluation',result:result(s,3)});
    const ready=await h.client.analyze(s,{preset:'auto',readyOnly:true});
    assert.equal(ready.settings.plies,3);
    assert.equal((await background).settings.plies,3);
    assert.equal(w.terminated,undefined);
    // Completion can race the cancellation message. Either is a safe idle acknowledgement.
    w.reply({id,type:'result',result:result(s,4)});
    assert.equal(h.client.retiring,null);
    assert.equal(h.client.readyResult(s).settings.plies,3);
    assert.equal(h.client.worker,w);
  } finally {h.client.destroy();}
});

test('foreground work bounds an unresponsive cooperative cancellation',async()=>{
  const h=harness(),s=source();
  try {
    const old=h.client.analyze(s,{preset:'auto',priority:-20});
    const rejected=assert.rejects(old,{name:'AbortError'});
    const id=await h.start(),w=h.workers[0];h.client.startup.cooperativeCancellation=true;
    h.client.cancelWhere(job=>job.priority<0);await rejected;
    const next=h.client.analyze({...s,dice:[5,2]},{preset:'auto',priority:20});
    await new Promise(resolve=>setTimeout(resolve,140));
    assert.equal(w.terminated,true,'a hung native call cannot hold up the next decision');
    const nextId=await h.start();
    w.reply({id,type:'cancelled'});
    w.reply({id,type:'result',result:result(s,4)});
    h.workers[1].reply({id:nextId,type:'result',result:result({...s,dice:[5,2]},3)});
    assert.equal((await next).settings.plies,3);
    assert.equal(h.workers.length,2);
  } finally {h.client.destroy();}
});

test('a slow background checkpoint keeps its heap when no foreground decision is waiting',async()=>{
  const h=harness(),s=source();
  try {
    const old=h.client.analyze(s,{preset:'auto',priority:-20});
    const rejected=assert.rejects(old,{name:'AbortError'});
    const id=await h.start(),w=h.workers[0];h.client.startup.cooperativeCancellation=true;
    h.client.cancelWhere(job=>job.priority<0);await rejected;
    await new Promise(resolve=>setTimeout(resolve,1150));
    assert.equal(w.terminated,undefined,'background-only work can reach a slow native checkpoint');
    w.reply({id,type:'cancelled'});
    const next=h.client.analyze({...s,dice:[5,2]},{preset:'auto',priority:20});
    await tick();
    assert.equal(h.workers.length,1,'the already initialized engine is reused');
    w.reply({id:h.client.active.id,type:'result',result:result({...s,dice:[5,2]},3)});
    assert.equal((await next).settings.plies,3);
  } finally {h.client.destroy();}
});

test('destroy releases a retiring worker and never revives queued work',async()=>{
  const h=harness(),s=source();
  const old=h.client.analyze(s,{preset:'auto',priority:-20});
  const rejected=assert.rejects(old,{name:'AbortError'});
  const id=await h.start(),w=h.workers[0];h.client.startup.cooperativeCancellation=true;
  h.client.cancelWhere(job=>job.priority<0);await rejected;
  h.client.destroy();
  w.reply({id,type:'cancelled'});await tick();
  assert.equal(w.terminated,true);assert.equal(h.client.retiring,null);
  assert.equal(h.workers.length,1);assert.equal(h.client.worker,null);
});
