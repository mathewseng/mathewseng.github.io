import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Deterministic lifecycle races; the browser suite separately runs real workers.
function harness({activeVersion='old', pageVersion='old', published='new'}={}) {
  const timers=new Map(), nodes=new Map(), events=new EventTarget();
  let clock=100, next=0, reloads=0, updates=0, behavior=async()=>{};
  const node=()=>({hidden:false,textContent:'',removeAttribute(){},setAttribute(){}});
  const document=Object.assign(new EventTarget(),{
    hidden:false,body:{append(){}},
    querySelector:()=>({src:`https://site.example/backgammon/app.js?bgv=${pageVersion}`}),
    createElement(){return {setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){},
      querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);}};},
  });
  class Channel {
    constructor(){this.port1={close(){}};this.port2={postMessage:data=>this.port1.onmessage?.({data}),close(){}};}
  }
  const worker=(version,state='activated')=>Object.assign(new EventTarget(),{
    state, postMessage(message,ports){if(message.type==='BACKGAMMON_VERSION')ports[0].postMessage({type:message.type,version});},
  });
  const registration=Object.assign(new EventTarget(),{
    scope:'https://site.example/backgammon/',active:worker(activeVersion),installing:null,waiting:null,
    update(){updates++;return behavior();},
  });
  const serviceWorker=Object.assign(new EventTarget(),{getRegistration:async()=>registration});
  const memory=new Map();
  const source=readFileSync(new URL('../ui/updates.mjs',import.meta.url),'utf8').replace(/export /g,'');
  const scope={document,navigator:{serviceWorker},location:{href:'https://site.example/backgammon/',reload(){reloads++;}},
    sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
    URL,MessageChannel:Channel,AbortSignal,Date:{now:()=>clock},
    fetch:async()=>({ok:true,text:async()=>`importScripts('./offline-manifest.js?v=${published}');`}),
    setTimeout(fn,ms){const id=++next;timers.set(id,{fn,at:clock+ms});return id;},clearTimeout:id=>timers.delete(id),
    addEventListener:events.addEventListener.bind(events),
  };
  runInNewContext(source+'\nglobalThis.begin=startUpdates;',scope);
  const flush=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
  return {registration,worker,events,nodes,document,memory,serviceWorker,
    reloads:()=>reloads,updates:()=>updates,setBehavior:fn=>behavior=fn,
    async start(){scope.begin();await flush();},
    async tick(ms){clock+=ms;for(const[id,t]of [...timers])if(t.at<=clock){timers.delete(id);t.fn();}await flush();},
    async retry(){nodes.get('button').onclick();await flush();},
  };
}

test('an already activated update reloads stale HTML instead of waiting for another install',async()=>{
  const h=harness({activeVersion:'new'});await h.start();await h.tick(2000);
  assert.equal(h.reloads(),1);
  assert.ok(h.memory.get('backgammon.update-resume'),'reload preserves the resume marker');
});

test('a failed installation retries automatically and recovers without manual refresh',async()=>{
  const h=harness();let attempts=0;
  h.setBehavior(async()=>{
    if(++attempts===1)throw new Error('temporary failure');
    h.registration.active=h.worker('new');
  });
  await h.start();await h.tick(1200);await h.tick(1200);
  assert.equal(h.reloads(),1);assert.equal(attempts,2);
});

test('persistent failure has bounded retries; manual Retry starts another attempt',async()=>{
  const h=harness();h.setBehavior(async()=>{throw new Error('offline');});await h.start();
  for(let i=0;i<12;i++)await h.tick(30000);
  assert.ok(h.updates()>=2 && h.updates()<=4,'no unbounded retry/download loop');
  assert.equal(h.reloads(),0);assert.equal(h.nodes.get('button').hidden,false);
  h.setBehavior(async()=>{h.registration.active=h.worker('new');});await h.retry();
  assert.equal(h.reloads(),1);
});

test('a hung update check releases its in-flight lock so Retry can work',async()=>{
  const h=harness();h.setBehavior(()=>new Promise(()=>{}));await h.start();await h.tick(16000);
  h.setBehavior(async()=>{h.registration.active=h.worker('new');});await h.retry();
  assert.equal(h.reloads(),1);
});

test('an unchanged page never reloads or retries',async()=>{
  const h=harness({published:'old'});await h.start();await h.tick(60000);
  assert.equal(h.reloads(),0);assert.equal(h.updates(),1);
});

test('an old worker without the version protocol still checks for a new worker',async()=>{
  const h=harness();h.registration.active.postMessage=()=>{};
  await h.start();await h.tick(1200);
  assert.equal(h.updates(),1);assert.equal(h.reloads(),0);
});

test('reload protection stops stale HTML loops without changing game storage',async()=>{
  const h=harness({activeVersion:'new'});
  h.memory.set('backgammon.update-attempt',JSON.stringify({version:'new',url:'https://site.example/backgammon/',at:99}));
  h.memory.set('backgammon.page-progress./backgammon/play/','draft-checkpoint');
  await h.start();await h.tick(60000);
  assert.equal(h.reloads(),0);
  assert.equal(h.nodes.get('button').hidden,false);
  assert.equal(h.memory.get('backgammon.page-progress./backgammon/play/'),'draft-checkpoint');
  await h.retry();assert.equal(h.reloads(),1);
});

test('closing the startup gate prevents background update failures reloading a live game',async()=>{
  const h=harness({published:'old'});await h.start();
  h.registration.waiting=h.worker('new','installed');
  h.events.dispatchEvent(new Event('online'));await h.tick(30000);
  assert.equal(h.reloads(),0);assert.equal(h.nodes.size,0);
});

test('repeated Safari page-cache restores keep the live game without reloading',async()=>{
  const h=harness({published:'old'});await h.start();
  h.memory.set('backgammon.page-progress./backgammon/play/','draft-checkpoint');
  for(let i=0;i<5;i++){
    h.events.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
    await h.tick(1);
  }
  assert.equal(h.reloads(),0);
  assert.equal(h.updates(),6,'each restore can check for an update');
  assert.equal(h.nodes.size,0,'restoring a live page does not reopen the load gate');
  assert.equal(h.memory.get('backgammon.page-progress./backgammon/play/'),'draft-checkpoint');
  assert.equal(h.memory.has('backgammon.update-resume'),false);
});

test('a staged update stays staged when Safari restores an active game',async()=>{
  const h=harness({published:'old'});await h.start();
  h.registration.waiting=h.worker('new','installed');
  let activations=0;
  h.registration.waiting.postMessage=()=>activations++;
  h.events.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
  await h.tick(30000);
  assert.equal(h.reloads(),0);
  assert.equal(activations,0);
  assert.equal(h.nodes.size,0);
});

test('a failed background check after restoring is harmless and can retry',async()=>{
  const h=harness({published:'old'});await h.start();
  h.setBehavior(async()=>{throw new Error('offline');});
  h.events.dispatchEvent(Object.assign(new Event('pageshow'),{persisted:true}));
  await h.tick(30000);
  h.setBehavior(async()=>{});
  h.events.dispatchEvent(new Event('online'));await h.tick(1);
  assert.equal(h.reloads(),0);
  assert.equal(h.updates(),3);
  assert.equal(h.nodes.size,0);
});

test('retry waits while hidden and foregrounding recovers automatically',async()=>{
  const h=harness();h.setBehavior(async()=>{throw new Error('temporary failure');});
  await h.start();h.document.hidden=true;await h.tick(1200);
  assert.equal(h.updates(),1);
  h.document.hidden=false;h.registration.waiting=h.worker('new','installed');
  // Simulate the previous worker having activated while this tab was hidden.
  h.registration.waiting=null;h.registration.active=h.worker('new');
  h.document.dispatchEvent(new Event('visibilitychange'));await h.tick(1);
  assert.equal(h.reloads(),1);
});

test('Retry is hidden while an automatic attempt is already running',async()=>{
  const h=harness();h.setBehavior(async()=>{throw new Error('temporary failure');});
  await h.start();assert.equal(h.nodes.get('button').hidden,false);
  h.setBehavior(()=>new Promise(()=>{}));await h.tick(1000);
  assert.equal(h.nodes.get('button').hidden,true);
  await h.tick(10000);assert.equal(h.nodes.get('button').hidden,false);
});

test('late download progress cannot erase a failed install and its retry status',async()=>{
  const h=harness(), worker=h.worker('new','installing');
  h.setBehavior(async()=>{
    h.registration.installing=worker;
    h.registration.dispatchEvent(new Event('updatefound'));
    worker.state='redundant';worker.dispatchEvent(new Event('statechange'));
  });
  await h.start();const failed=h.nodes.get('.update-message').textContent;
  assert.match(failed,/Retrying automatically/);
  h.serviceWorker.dispatchEvent(Object.assign(new Event('message'),{
    source:worker,data:{type:'BACKGAMMON_DOWNLOAD',completed:10,total:89},
  }));
  assert.equal(h.nodes.get('.update-message').textContent,failed);
  assert.equal(h.nodes.get('progress').hidden,true);
});
