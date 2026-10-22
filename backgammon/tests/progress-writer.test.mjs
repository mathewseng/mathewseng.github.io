import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressWriter } from '../core/progress-writer.mjs';

const work = n => ({id:'play',game:{id:'match',events:[{n}]},draft:[]});
test('worker captures snapshots and acknowledges work before completing its archive', async()=>{
  const sent=[],worker={postMessage:m=>sent.push(structuredClone(m)),terminate(){}};
  const writer=new ProgressWriter({workerFactory:()=>worker});
  let key,finished=false;
  const data=work(1),p=writer.save(data,{history:true,stored:k=>key=k}).then(()=>finished=true);
  data.game.events[0].n=2;
  assert.equal(JSON.parse(sent[0].payload).game.events[0].n,1);
  assert.equal(typeof sent[0].payload,'string','large game objects are expanded in the worker');
  worker.onmessage({data:{type:'stored',id:1,key:'saved-signature'}});
  assert.equal(key,'saved-signature'); assert.equal(finished,false);
  worker.onmessage({data:{type:'done',id:1}}); await p;
  assert.equal(writer.pending.size,0);
});
test('transport failure preserves grades, drafts and takeback branches in the captured save',async()=>{
  const original={...work(1),feedback:{result:{equity:-.002,probabilities:[.5,.1,0,.2,0]}},
    draft:[{from:5,to:'off',die:6}],game:{id:'match',events:[{actor:0,action:{type:'move',steps:[]},
      evaluation:{result:{equity:.123}},initialDecision:{action:{type:'move',steps:[]}}}],
      takebacks:[{prefix:[],events:[{action:{type:'roll',dice:[6,1]}}]}]}};
  const expected=structuredClone(original);let written,signature;
  const writer=new ProgressWriter({workerFactory:()=>({postMessage(){throw Error('transport');},terminate(){}}),
    write:async(snapshot,history,stored,key)=>{written=snapshot;signature=key;}});
  const pending=writer.save(original,{history:true});
  original.game.events[0].evaluation.result.equity=99;
  original.draft.length=0;original.game.takebacks.length=0;
  await pending;
  assert.deepEqual(written,expected);
  assert.equal(signature,JSON.stringify(expected));
});
test('worker load/crash failure retries exact snapshots in order, then keeps using fallback',async()=>{
  const worker={postMessage(){},terminate(){this.terminated=true;}};
  const writes=[];
  const writer=new ProgressWriter({workerFactory:()=>worker,write:async(snapshot,history,stored)=>{
    await new Promise(resolve=>setTimeout(resolve,2));
    writes.push([snapshot.game.events[0].n,history]); stored(String(writes.length));
  }});
  const a=work(1),one=writer.save(a,{history:true}); a.game.events[0].n=99;
  const two=writer.save(work(2));
  worker.onerror({preventDefault(){}});
  const three=writer.save(work(3));
  await Promise.all([one,two,three]);
  assert.deepEqual(writes,[[1,true],[2,false],[3,false]]);
  assert.equal(worker.terminated,true); assert.equal(writer.pending.size,0);
});
test('unavailable Worker falls back and a storage failure does not block later saves',async()=>{
  const writer=new ProgressWriter({workerFactory:()=>{throw Error('blocked');},
    write:async snapshot=>{if(snapshot.game.events[0].n===1)throw Error('quota');}});
  await assert.rejects(writer.save(work(1)),/quota/);
  await writer.save(work(2)); assert.equal(writer.pending.size,0);
});
test('worker storage errors are reported without silently retrying destructive failures',async()=>{
  const worker={postMessage(){},terminate(){}};
  const writer=new ProgressWriter({workerFactory:()=>worker,write:()=>assert.fail('not a transport failure')});
  const save=writer.save(work(1));
  worker.onmessage({data:{type:'error',id:1,error:'Storage transaction aborted.'}});
  await assert.rejects(save,/aborted/);
  assert.equal(writer.pending.size,0);
});
