import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initialState,boardKey,legalTurns,commitTurn} from '../core/rules.mjs';
import {stateForBoard,nextBoard,rowSteps} from '../scripts/book-branches.mjs';
import {OpeningBook,bookResult,DEEP_BOOK_ID,DEEP_BOOK_ENGINE_VERSION,BOOK_ENGINE_VERSION} from '../engine/opening-book.mjs';
import {EngineClient} from '../engine/client.mjs';
const base=new URL('../engine/opening-book-data/deep/',import.meta.url);
const index=JSON.parse(readFileSync(new URL('index.json',base)));
const start=roll=>initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true,immediateRedoubles:0}});
const fetcher=url=>Promise.resolve(new Response(readFileSync(url)));

test('five-ply book has exhaustive openings and all replies after every close opening',()=>{
  assert.equal(index.id,DEEP_BOOK_ID);assert.equal(index.engine,DEEP_BOOK_ENGINE_VERSION);assert.equal(index.plies,5);
  assert.equal(Object.keys(index.openings).length,15);
  assert.ok(index.provenance.maxParityDifference<=1e-5);
  for(const [roll,entry] of Object.entries(index.openings)){
    const state=start(roll),result=bookResult(state,entry,index,'auto');
    assert.equal(result.settings.plies,5);assert.equal(result.engine,DEEP_BOOK_ENGINE_VERSION);
    assert.equal(result.candidates.length,legalTurns(state).length);
    const near=result.candidates.filter(c=>result.candidates[0].equity-c.equity<=.040+1e-8);
    assert.equal(near.length,entry.near.length);
    for(const c of near)assert.ok(index.replies[boardKey(nextBoard(state,c.steps))]);
  }
  let count=0;
  for(const [board,ref] of Object.entries(index.replies)){
    const bytes=readFileSync(new URL(ref.file,base));assert.equal(createHash('sha256').update(bytes).digest('hex'),ref.sha256);
    const shard=JSON.parse(bytes);assert.equal(shard.board,board);assert.equal(shard.id,index.id);
    assert.equal(Object.keys(shard.rolls).length,21);
    for(const [roll,entry] of Object.entries(shard.rolls)){
      const state=stateForBoard(board,[...roll].map(Number)),r=bookResult(state,entry,index,'auto');
      assert.equal(r.settings.plies,5);assert.ok(r.candidates.length>=Math.min(2,entry.total));
      assert.ok(r.candidates.every(c=>Number.isFinite(c.equity)));
      if(r.screening)assert.equal(r.screening.plies,4);
      const mirror={...state,turn:1,points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()};
      const reverse=bookResult(mirror,entry,index,'auto');
      assert.deepEqual(reverse.candidates.map(c=>c.equity),r.candidates.map(c=>c.equity));
      assert.equal(reverse.perspective,1);count++;
    }
  }
  assert.equal(count,index.provenance.coverage.replyRolls);
});
test('runtime prefers deep book without WASM, grades listed moves consistently, and preserves historical fallbacks',async()=>{
  const book=new OpeningBook({fetcher,preferDeep:true});
  const client=new EngineClient({openingBook:book,workerFactory:()=>{throw Error('Covered decision must not start WASM');}});
  try{
    const state=start('21'),hint=await client.analyze(state,{preset:'auto'});
    assert.equal(hint.book.id,DEEP_BOOK_ID);assert.equal(hint.settings.plies,5);
    const candidate=hint.candidates[1],grade=await client.analyze(state,{preset:'auto',submitted:candidate.steps});
    assert.equal(grade.settings.plies,5);assert.equal(grade.actual.key,candidate.key);
    assert.ok(Math.abs(grade.error-(hint.candidates[0].equity-candidate.equity))<1e-9);
    const reply={...commitTurn(state,hint.candidates[0].steps),turn:1,phase:'move',dice:[3,1]};
    assert.equal((await client.analyze(reply,{preset:'auto'})).settings.plies,5);
    const old=JSON.parse(readFileSync(new URL('../engine/opening-book-data/index.json',import.meta.url)));
    const later=stateForBoard(Object.keys(old.continuations)[0],[3,1]);
    const fallback=await book.lookup(later,{kind:'checker',preset:'auto'});
    assert.equal(fallback.settings.plies,3);assert.equal(fallback.engine,BOOK_ENGINE_VERSION);
  }finally{client.destroy();}
  const offline=new OpeningBook({preferDeep:true,fetcher:url=>url.pathname.includes('/deep/')?Promise.reject(Error('missing deep assets')):fetcher(url)});
  const historical=await offline.lookup(start('31'),{kind:'checker',preset:'auto'});
  assert.equal(historical.settings.plies,3);assert.equal(historical.engine,BOOK_ENGINE_VERSION);
});
test('unlisted deep reply moves do not receive a fabricated five-ply grade',async()=>{
  const [board,ref]=Object.entries(index.replies).find(([,ref])=>{
    const shard=JSON.parse(readFileSync(new URL(ref.file,base)));return Object.values(shard.rolls).some(e=>e.rows.length<e.total);
  });
  const shard=JSON.parse(readFileSync(new URL(ref.file,base)));
  const [roll,entry]=Object.entries(shard.rolls).find(([,e])=>e.rows.length<e.total),state=stateForBoard(board,[...roll].map(Number));
  const keys=new Set(entry.rows.map(r=>boardKey(commitTurn(state,rowSteps(r)))));
  const omitted=legalTurns(state).find(t=>!keys.has(t.key));assert.ok(omitted);
  assert.equal(bookResult(state,entry,index,'auto',omitted.steps),null);
  assert.throws(()=>bookResult(state,entry,{...index,plies:3},'auto'),/Invalid/);
});
