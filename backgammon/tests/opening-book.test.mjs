import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initialState, boardKey, legalTurns, commitTurn, positionKey } from '../core/rules.mjs';
import { OpeningBook, bookContext, bookBoardKey, bookResult, BOOK_ENGINE_VERSION } from '../engine/opening-book.mjs';
import { EngineClient } from '../engine/client.mjs';
import { ENGINE_VERSION } from '../engine/metadata.mjs';
import { CONTINUATION_POLICY, thirdBranches, fourthBranches, nextBoard, stateForBoard, rankBranches, nearThirdBranches } from '../scripts/book-branches.mjs';
const base = new URL('../engine/opening-book-data/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', base)));
const state = (dice = [3, 1]) => initialState({ matchLength: 0, phase: 'move', dice, rules: { jacoby: true } });
const mirror = s => ({ ...s, turn: 1-s.turn, points: [...s.points].reverse().map(v=>-v), bar: [...s.bar].reverse(), off: [...s.off].reverse() });
const options = { kind: 'checker', preset: 'auto' };
const read = url => Promise.resolve(new Response(readFileSync(new URL(url.pathname.split('/').at(-1), base))));
const makeBook = () => new OpeningBook({ fetcher: read });
const wait = () => new Promise(r=>setTimeout(r,0));

test('historical book keeps its computation engine and rejects relabeled data', async () => {
  assert.notEqual(BOOK_ENGINE_VERSION, ENGINE_VERSION);
  const engine = new EngineClient({ openingBook: makeBook(), workerFactory: () => { throw Error('Book hit must not load WASM'); } });
  try {
    const result = await engine.analyze(state(), { preset: 'auto' });
    assert.equal(result.engine, BOOK_ENGINE_VERSION);
    assert.equal(result.book.id, index.id);
    assert.equal(result.candidates[0].equity, index.openings['31'].rows[0][1]);
    assert.throws(() => bookResult(state(), index.openings['31'], { ...index, engine: ENGINE_VERSION }, 'auto'), /version mismatch/);
  } finally { engine.destroy(); }
});

test('book covers all 15 opening rolls and every 3-ply opening within .040; every reply roll is legal', () => {
  assert.equal(index.engine, BOOK_ENGINE_VERSION);
  assert.equal(Object.keys(index.openings).length, 15);
  const expectedBoards = new Set();
  for (let a=2;a<=6;a++) for(let b=1;b<a;b++) {
    const s=state([a,b]), entry=index.openings[`${a}${b}`], result=bookResult(s,entry,index,'auto');
    assert.equal(result.candidates.length, legalTurns(s).length, 'exhaustive opening evaluation');
    const near=result.candidates.filter(c=>result.candidates[0].equity-c.equity<=.040+1e-8);
    assert.equal(entry.near.length,near.length);
    for (const n of entry.near) {
      const c=result.candidates.find(c=>c.key===boardKey(commitTurn(s,n.steps)));
      assert.ok(c && near.includes(c));
      assert.ok(Math.abs(n.loss-(result.candidates[0].equity-c.equity))<1e-10);
      const reply=mirror({...commitTurn(s,n.steps),turn:1});
      assert.equal(index.replies[bookBoardKey(reply)].file,`reply-${n.reply}.json`);
    }
    for(const c of near){
      const reply=mirror({...commitTurn(s,c.steps),turn:1});
      const key=bookBoardKey(reply);expectedBoards.add(key);
      assert.ok(index.replies[key],`${a}${b} / ${c.notation}`);
    }
  }
  assert.deepEqual(new Set(Object.keys(index.replies)),expectedBoards);
  let count=0;
  for(const [board,ref] of Object.entries(index.replies)) {
    const bytes=readFileSync(new URL(ref.file,base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256);
    const shard=JSON.parse(bytes);assert.equal(shard.board,board);
    assert.equal(Object.keys(shard.rolls).length,21);
    const values=board.split(',').map(Number);
    for(let a=1;a<=6;a++)for(let b=1;b<=a;b++){
      const s=initialState({...state([a,b]),points:values.slice(0,24),bar:values.slice(24,26),off:values.slice(26)});
      const entry=shard.rolls[`${a}${b}`],r=bookResult(s,entry,index,'auto');
      assert.ok(r.candidates.length>=Math.min(10,entry.total));
      assert.equal(r.settings.plies,3);assert.equal(r.perspective,0);
      const reverse=bookResult(mirror({...s,dice:[b,a]}),entry,index,'auto');
      assert.equal(reverse.candidates[0].notation,r.candidates[0].notation);
      assert.equal(reverse.candidates[0].equity,r.candidates[0].equity);
      assert.equal(bookBoardKey(commitTurn(mirror(s),reverse.candidates[0].steps)),r.candidates[0].key);
      assert.equal(r.screening?.total??r.candidates.length,legalTurns(s).length);
      for(const c of r.candidates)assert.ok(c.probabilities[2]<=c.probabilities[1] && c.probabilities[1]<=c.probabilities[0]+1e-8);
      count++;
    }
  }
  assert.equal(count,expectedBoards.size*21);
  assert.equal(readdirSync(base).filter(f=>f.startsWith('reply-')).length,expectedBoards.size,'no orphan shards');
});

test('lookup mirrors both players, dice order and centered money stakes; grades legal equivalents', async () => {
  const book=makeBook(),s=state(),a=await book.lookup(s,options);
  for(const value of [1,2,4,64,1024])for(const turn of [0,1]){
    const t={...(turn?mirror(s):s),dice:[1,3],cube:{value,owner:null},scores:[17,29],rules:{...s.rules,automaticDoubles:10}};
    const b=await book.lookup(t,options);
    assert.equal(a.candidates[0].equity,b.candidates[0].equity);
    assert.equal(b.positionKey,positionKey(t));assert.equal(b.perspective,turn);
    assert.equal(b.candidates[0].key,boardKey(commitTurn(t,b.candidates[0].steps)));
    const graded=await book.lookup(t,{...options,submitted:b.candidates[0].steps});assert.equal(graded.error,0);
  }
  for(const roll of Object.keys(index.openings)){
    const t=state([...roll].map(Number)),hint=await book.lookup(t,options);
    for(const c of hint.candidates){const r=await book.lookup(t,{...options,submitted:c.steps});assert.equal(r.actual.key,c.key);assert.equal(r.error,Math.max(0,hint.candidates[0].equity-c.equity));}
  }
});

test('book refuses incompatible contexts, unsupported searches and unlisted submitted replies', async () => {
  const book=makeBook(),s=state();
  for(const changed of [ {matchLength:5}, {rules:{...s.rules,jacoby:false}}, {rules:{...s.rules,cube:false}}, {rules:{...s.rules,immediateRedoubles:1}}, {rules:{...s.rules,immediateRedoubles:2}}, {cube:{value:2,owner:0}}, {cube:{value:2,owner:1}}, {pending:{type:'double',by:0}}, {crawfordPlayed:true} ]){
    const t={...s,...changed};assert.equal(bookContext(t),false);assert.equal(await book.lookup(t,options),null);
  }
  for(const changed of [{preset:'research'},{rollout:{}},{kind:'cube'},{useBook:false}])assert.equal(await book.lookup(s,{...options,...changed}),null);
  assert.equal(await book.lookup(state([6,6]),options),null,'doubles are not opening rolls');
  let checked=false;
  for(const [board,ref] of Object.entries(index.replies)){
    const shard=JSON.parse(readFileSync(new URL(ref.file,base))),entry=shard.rolls['66'];
    if(entry.rows.length===entry.total)continue;
    const v=board.split(',').map(Number),t=initialState({...state([6,6]),points:v.slice(0,24),bar:v.slice(24,26),off:v.slice(26)});
    const listed=new Set(bookResult(t,entry,index,'auto').candidates.map(c=>c.key));const other=legalTurns(t).find(t=>!listed.has(t.key));
    let pending=0;
    assert.equal(await book.lookup(t,{...options,submitted:other.steps,onUnlisted:()=>pending++}),null);
    assert.equal(pending,1,'validated unlisted book move notifies before live evaluation');checked=true;break;
  }
  assert.ok(checked);
});

test('book preloads only index and one reply shard; misses, corrupt and mismatched files safely fall back', async () => {
  const calls=[],book=new OpeningBook({fetcher:url=>{calls.push(url.pathname);return read(url);}});
  await book.prepare(initialState({...state(),phase:'opening',dice:[]}));
  assert.equal(calls.length,1);
  const s=state(),best=bookResult(s,index.openings['31'],index,'auto').candidates[0];
  const reply={...commitTurn(s,best.steps),turn:1,phase:'roll',dice:[]};
  await book.prepare(reply);assert.equal(calls.length,2);
  assert.ok(await book.lookup({...reply,phase:'move',dice:[6,6]},options));assert.equal(calls.length,2);
  const bad=structuredClone(index);bad.engine='wrong';
  assert.equal(await new OpeningBook({fetcher:async()=>new Response(JSON.stringify(bad))}).lookup(s,options),null);
  assert.equal(await new OpeningBook({fetcher:async()=>{throw Error('offline');}}).lookup(s,options),null);
  const row=structuredClone(index.openings['31']);row.rows[0][1]=NaN;assert.throws(()=>bookResult(s,row,index,'auto'),/Invalid/);
  row.rows[0][1]=0;row.rows[0][0]=[[1,0,6]];assert.throws(()=>bookResult(s,row,index,'auto'),/Illegal/);
});

test('client resolves book requests without creating a worker; cancellation discards late lookup', async () => {
  const status=[],client=new EngineClient({openingBook:makeBook(),workerFactory:()=>{throw Error('WASM must not start');},onStatus:(...s)=>status.push(s)});
  try{
    const hint=await client.analyze(state(),{preset:'auto'});assert.equal(hint.settings.plies,3);assert.equal(hint.book.stage,'opening');assert.ok(hint.requestId);
    const graded=await client.analyze(state(),{preset:'deep',submitted:hint.candidates[0].steps});assert.equal(graded.error,0);assert.equal(graded.actual.key,hint.candidates[0].key);
    assert.equal(status.at(-1)[1],'Opening book · 3 ply · ready');assert.equal(client.worker,null);
  }finally{client.destroy();}
  let resolve;
  const slow=new EngineClient({openingBook:{lookup:()=>new Promise(r=>resolve=r)}});
  const pending=slow.analyze(state(),{preset:'auto'}),rejected=assert.rejects(pending,{name:'AbortError'});
  slow.cancel();resolve({settings:{plies:3}});await rejected;await wait();assert.equal(slow.cache.size,0);slow.destroy();
});

test('client falls back to the worker on a miss and bypasses the book when requested', async () => {
  let hits=0,worker;
  const client=new EngineClient({openingBook:{lookup:async()=>{hits++;return null;}},workerFactory:()=>worker={
    postMessage(m){queueMicrotask(()=>this.onmessage({data:m.type==='init'?{type:'ready',id:0,elapsedMs:1}:{id:m.id,type:'result',result:{settings:{plies:3},native:true}}}));},terminate(){},
  }});
  try{assert.ok((await client.analyze(state(),{preset:'auto'})).native);assert.equal(hits,1);
    assert.ok((await client.analyze(state(),{preset:'auto',useBook:false})).native);assert.equal(hits,1);
  }finally{client.destroy();}
});


test('warming the native worker during a pending book load does not strand the lookup', async () => {
  let resolve;
  const client=new EngineClient({openingBook:{lookup:()=>new Promise(r=>resolve=r)},workerFactory:()=>({
    postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'ready',id:0,elapsedMs:1}}));},terminate(){},
  })});
  try {
    const pending=client.analyze(state(),{preset:'auto'});
    await client.start();
    resolve({settings:{plies:3},book:{stage:'opening'}});
    assert.equal((await pending).settings.plies,3);
    assert.equal(client.active,null);
  } finally {client.destroy();}
});

test('full third-turn coverage includes every near-best opening/reply branch and preserves fourth-turn entries', () => {
  const readShard=file=>JSON.parse(readFileSync(new URL(file,base)));
  const third=nearThirdBranches(index,readShard);
  assert.equal(third.length,1298);
  assert.equal(third.reduce((n,b)=>n+b.paths,0),1357);
  assert.equal(nearThirdBranches(index,readShard,0).length,684);
  assert.equal(nearThirdBranches(index,readShard,.020).length,959);
  assert.throws(()=>nearThirdBranches(index,readShard,-1),/Invalid/);
  // The existing fourth-turn extension is retained, rather than silently
  // replaced by a new selection when third-turn coverage widens.
  const fourth=fourthBranches(thirdBranches(index,readShard,64),board=>readShard(index.continuations[board].file).rolls,32);
  assert.equal(fourth.length,32);
  assert.deepEqual(new Set(Object.keys(index.continuations)),new Set([...third,...fourth].map(b=>b.board)));
  assert.equal(readdirSync(base).filter(f=>f.startsWith('turn-')).length,1330);
  assert.deepEqual(index.continuationBuild.policy,CONTINUATION_POLICY);
  for(const [turn,branches] of [[3,third],[4,fourth]])for(const b of branches){
    const ref=index.continuations[b.board];assert.equal(ref.turn,turn);
    assert.deepEqual(ref.parent,b.parent);
    if(turn===3) {assert.equal(ref.paths,b.paths);assert.equal(ref.weight,undefined,'no invented probability for near-best choices');}
    else assert.equal(ref.weight,b.weight);
    assert.equal(boardKey(nextBoard(stateForBoard(b.parent.board,[...b.parent.roll].map(Number)),b.parent.steps)),b.board);
  }
  const board=third[0];
  assert.equal(rankBranches([{...board,weight:.2},{...board,weight:.3}],2)[0].weight,.5);
  assert.equal(rankBranches([{...board,weight:.2},{...board,weight:.3}],2).length,1);
});

test('every third/fourth-turn roll is legal, mirrored, consistently graded and loadable without WASM', async () => {
  const book=makeBook();let count=0;
  for(const [board,ref] of Object.entries(index.continuations)){
    const bytes=readFileSync(new URL(ref.file,base)),shard=JSON.parse(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256);
    assert.equal(shard.board,board);assert.equal(Object.keys(shard.rolls).length,21);
    for(let a=1;a<=6;a++)for(let b=1;b<=a;b++){
      const s=stateForBoard(board,[a,b]),entry=shard.rolls[`${a}${b}`];
      const result=await book.lookup(s,options),reverse=await book.lookup(mirror(s),options);
      assert.ok(result);assert.equal(result.book.stage,ref.turn===3?'third-turn':'fourth-turn');
      assert.equal(result.settings.plies,3);assert.equal(result.perspective,0);assert.equal(reverse.perspective,1);
      assert.equal(result.candidates[0].equity,reverse.candidates[0].equity);
      assert.equal(result.candidates[0].notation,reverse.candidates[0].notation);
      assert.equal(result.candidates.length,entry.rows.length);
      assert.ok(result.candidates.length>=Math.min(10,entry.total));
      for(const c of result.candidates){
        const [win,gammon,backgammon,loseGammon,loseBackgammon]=c.probabilities;
        assert.ok(backgammon<=gammon+1e-7 && gammon<=win+1e-7);
        assert.ok(loseBackgammon<=loseGammon+1e-7 && loseGammon<=1-win+1e-7);
      }
      const turns=legalTurns(s);assert.equal(turns.length,entry.total);
      const graded=bookResult(s,entry,index,'auto',result.candidates.at(-1).steps);
      assert.equal(graded.actual.key,result.candidates.at(-1).key);
      assert.equal(graded.error,result.candidates[0].equity-graded.actual.equity);
      const unlisted=turns.find(t=>!result.candidates.some(c=>c.key===t.key));
      if(unlisted)assert.equal(await book.lookup(s,{...options,submitted:unlisted.steps}),null);
      count++;
    }
  }
  assert.equal(count,27930);assert.ok(book.files.size<=9,'bounded memory even across all later boards');
});

test('membership skips unlisted later boards without shard downloads and retains native hint/grade reuse', async () => {
  const calls=[],book=new OpeningBook({fetcher:url=>{calls.push(url.pathname);return read(url);}});
  await book.prepare(state());
  const outside=initialState({matchLength:0,phase:'move',dice:[2,1],rules:{jacoby:true},points:Array.from({length:24},(_,i)=>i===5?15:i===18?-15:0)});
  assert.equal(bookContext(outside),true);assert.equal(book.mayHave(outside),false);
  assert.equal(await book.lookup(outside,options),null);assert.equal(calls.length,1);
  let requests=0;
  const candidates=legalTurns(outside).map((t,i)=>({key:t.key,steps:t.steps,equity:-i/100}));
  const client=new EngineClient({openingBook:book,workerFactory:()=>({
    postMessage(m){if(m.type!=='init')requests++;queueMicrotask(()=>this.onmessage({data:m.type==='init'?{type:'ready',id:0,elapsedMs:1}:{id:m.id,type:'result',result:{settings:{plies:2},candidates}}}));},terminate(){},
  })});
  try{
    await client.analyze(outside,{preset:'deep'});
    const grade=await client.analyze(outside,{preset:'deep',submitted:candidates[1].steps});
    assert.equal(grade.actual.key,candidates[1].key);assert.equal(requests,1);assert.equal(calls.length,1);
  }finally{client.destroy();}
  // A fresh client opening a direct Solver link must find a later-turn shard.
  const ref=Object.values(index.continuations).find(r=>r.turn===4),board=Object.keys(index.continuations).find(k=>index.continuations[k]===ref);
  calls.length=0;const fresh=new OpeningBook({fetcher:url=>{calls.push(url.pathname);return read(url);}});
  const hit=await fresh.lookup(stateForBoard(board),options);
  assert.equal(hit.book.stage,'fourth-turn');assert.equal(calls.length,2);
  const later=stateForBoard(board);
  for(const changed of [{matchLength:7},{cube:{value:2,owner:0}},{rules:{...later.rules,jacoby:false}},{rules:{...later.rules,immediateRedoubles:2}}])
    assert.equal(await fresh.lookup({...later,...changed},options),null);
  for(const changed of [{preset:'research'},{kind:'cube'},{rollout:{}},{useBook:false}])
    assert.equal(await fresh.lookup(later,{...options,...changed}),null);
  const stale=structuredClone(index);stale.id='jacoby-3ply-v1';
  assert.equal(await new OpeningBook({fetcher:async()=>new Response(JSON.stringify(stale))}).lookup(later,options),null);
  const wrongBoard=new OpeningBook({fetcher:async url=>{
    const value=JSON.parse(await (await read(url)).text());
    if(value.board)value.board=boardKey(state());
    return new Response(JSON.stringify(value));
  }});
  assert.equal(await wrongBoard.lookup(later,options),null,'a legal-looking shard for a different board is not reusable');
});
