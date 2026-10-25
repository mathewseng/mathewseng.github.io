// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import {validateItem} from '../core/storage.mjs';
import {OpeningBook} from '../engine/opening-book.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {referenceResult,XGReferenceBook,PreferredOpeningBook,referenceEligible} from '../engine/xg-reference-book.mjs';
import {normalizeReference} from '../scripts/deep-book-comparison.mjs';
import {stateForBoard,nextBoard} from '../scripts/book-branches.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
import {legalTurns, initialState, MAX_CUBE} from '../core/rules.mjs';
import {EngineClient} from '../engine/client.mjs';
import {OpeningGuideData} from '../ui/opening-guide-data.mjs';
const bytes=fs.readFileSync(new URL('../docs/deep-book-xg-reference.json',import.meta.url)),source=JSON.parse(bytes),refs=normalizeReference(source);
const index=JSON.parse(fs.readFileSync(new URL('../engine/opening-book-data/xg/index.json',import.meta.url)));
const attributionBytes=fs.readFileSync(new URL('../docs/xg-reference-attribution.json',import.meta.url)),attribution=JSON.parse(attributionBytes);
const fetcher=async url=>({ok:true,text:async()=>fs.readFileSync(url,'utf8')});
const stateFor=d=>{const state=stateForBoard(d.board,[...d.roll].map(Number));state.rules.immediateRedoubles=2;return state;};
test('every XG source value, legal board and rule context survives import in both orientations',()=>{
 assert.equal(index.sourceSHA256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(index.attributionSHA256,createHash('sha256').update(attributionBytes).digest('hex'));
 assert.equal(attribution.sourceSHA256,index.sourceSHA256);
 for(const page of source.sources)assert.equal(attribution.sources[page.url].sha256,page.sha256);
 assert.equal(refs.length,729);let count=0;
 for(const d of refs){const state=stateFor(d),entry=index.entries[d.board][d.roll];
  for(const turn of [0,1]){
   const s=turn?{...state,turn:1,points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()}:state;
   const result=referenceResult(s,entry,index);assert.equal(result.method,'reference');assert.equal(result.candidates.length,d.candidates.length);
   for(const c of result.candidates){
    const after=legalTurns(s).find(t=>t.key===c.key).state;
    const normalized=bookBoardKey({...after,turn:s.turn});
    const ref=d.candidates.find(r=>r.board===normalized);assert.ok(ref,`${d.title}: board survives import`);
    assert.deepEqual(c.referenceCredit,attribution.sources[d.url].positions[d.title].find(a=>a.rank===ref.rank));
    assert.ok(c.referenceCredit.author);assert.match(c.referenceCredit.engine,/^eXtreme Gammon \d+\.\d+$/);
    assert.equal(c.equity,ref.equity);assert.equal(c.referenceHalfWidth,ref.confidenceHalfWidth);assert.deepEqual(c.probabilities,[...ref.probabilities[0],...ref.probabilities[1].slice(1)]);assert.equal(c.referenceMethod,ref.method);assert.equal(c.referenceTrials,ref.trials);
   }
   const last=result.candidates.at(-1),grade=referenceResult(s,entry,index,'auto',last.steps);
   assert.equal(grade.error,result.candidates[0].equity-last.equity);
  }
  count+=entry.moves.length;
 }
 assert.equal(count,2584);
});
test('reference lookup rejects incompatible rules and never grades an unlisted move using mixed EVs',async()=>{
 const d=refs[0],state=stateFor(d),entry=index.entries[d.board][d.roll],book=new PreferredOpeningBook({fetcher});
 const options={preset:'auto',kind:'checker',rollout:null,useBook:true};
 assert.ok(referenceEligible(state,options));
 const result=await book.lookup(state,options);assert.equal(result.method,'reference');
 const missing=legalTurns(state).find(t=>!result.candidates.some(c=>c.key===t.key));assert.ok(missing);
 assert.equal(await book.lookup(state,{...options,submitted:missing.steps}),null);
 for(const immediateRedoubles of [0,1])assert.equal(referenceEligible({...state,rules:{...state.rules,immediateRedoubles}},options),false);
 assert.equal(referenceEligible({...state,matchLength:7},options),false);
 assert.equal(referenceEligible({...state,cube:{value:2,owner:0}},options),false);
 assert.equal(referenceEligible({...state,cube:{value:MAX_CUBE/4,owner:null}},options),false,'numeric ceiling changes available immediate redoubles');
 assert.equal(referenceEligible({...state,rules:{...state.rules,jacoby:false}},options),false);
 assert.equal(referenceEligible(state,{...options,rollout:{}}),false);
 const ordinary={...state,rules:{...state.rules,immediateRedoubles:0}};
 const fallback=await book.lookup(ordinary,options);
 assert.equal(fallback.book.source,'precomputed');assert.equal(fallback.settings.plies,5);
 assert.notEqual(fallback.method,'rollout','retired filtered rollout book must not re-enter through reference fallback');
 assert.throws(()=>referenceResult(ordinary,entry,index));
});
test('all close XG openings have 21 replies and failed reference loading falls back visibly',async()=>{
 const data=new OpeningGuideData(fetcher,{referenceBook:new XGReferenceBook({fetcher})});
 const openings=await data.openings();let branches=0;
 for(const opening of openings.values()){
  if(opening.state.dice[0]===opening.state.dice[1]){
   assert.equal(opening.method,'tree');assert.equal(opening.plies,5);
   assert.equal(opening.state.rules.immediateRedoubles,0,'starting doubles retain their own GNUbg rule context');
   continue;
  }
  assert.equal(opening.method,'reference');assert.equal(opening.state.rules.immediateRedoubles,2);
  for(let choice=0;choice<opening.moves.length;choice++){
   const replies=await data.replies(opening,choice);assert.equal(replies.size,21);
   for(const r of replies.values()){const fallback=opening.state.dice.join('')==='51'&&opening.moves[choice].notation==='24/18';assert.equal(r.method,fallback?'tree':'reference');assert.equal(r.state.rules.immediateRedoubles,fallback?0:2);}
   branches++;
  }
 }
 assert.equal(branches,32);
 const failed=new OpeningGuideData(fetcher,{referenceBook:new XGReferenceBook({fetcher:async()=>({ok:false})})});
 const fallback=await failed.openings();assert.ok([...fallback.values()].every(p=>p.method==='tree'&&p.state.rules.immediateRedoubles===0));
});

test('reference results cannot mutate the source and synchronous download failures can retry',async()=>{
 let failed=true;
 const book=new XGReferenceBook({fetcher:url=>{if(failed){failed=false;throw Error('offline');}return fetcher(url);}}),state=stateFor(refs[0]);
 assert.equal(await book.lookup(state),null);
 const first=await book.lookup(state);assert.equal(first.method,'reference');
 const author=first.candidates[0].referenceCredit.author;first.candidates[0].referenceCredit.author='Changed';
 assert.equal((await book.lookup(state)).candidates[0].referenceCredit.author,author);
 const probability=first.candidates[0].probabilities[0];first.candidates[0].probabilities[0]=-1;
 assert.equal((await book.lookup(state)).candidates[0].probabilities[0],probability);
});

test('reference provenance and five-ply books survive saved-position validation',async()=>{
 const state=stateFor(refs[0]),reference=await new XGReferenceBook({fetcher}).lookup(state);
 const record=analysis=>({version:1,id:'reference-save',kind:'position',title:'Opening',notes:'',collection:'',tags:[],createdAt:0,updatedAt:0,state,analysis});
 assert.equal(validateItem(record(reference)).analysis,reference);
 for(const mutate of [a=>a.reference.url='javascript:alert(1)',a=>a.candidates[0].referenceCredit.author='',a=>a.settings.plies=2,a=>a.method='tree']){
  const invalid=structuredClone(reference);mutate(invalid);assert.throws(()=>validateItem(record(invalid)));
 }
 const ordinary={...state,rules:{...state.rules,immediateRedoubles:0}},deep=await new OpeningBook({preferDeep:true,fetcher}).lookup(ordinary,{kind:'checker',preset:'auto'});
 assert.equal(deep.settings.plies,5);assert.equal(validateItem({...record(deep),state:ordinary}).analysis,deep);
});

test('bot opening and reply choices match the guide after automatic opening doubles',async()=>{
 const book=new PreferredOpeningBook({fetcher});
 const client=new EngineClient({openingBook:book,workerFactory:()=>{throw Error('Covered opening/reply started a worker');}});
 const guide=new OpeningGuideData(fetcher,{referenceBook:new XGReferenceBook({fetcher})});
 try {
  const openings=await guide.openings();
  const sixFour=openings.get('64');
  assert.equal(sixFour.moves[0].notation,'24/18 13/9');
  assert.equal(sixFour.moves[1].notation,'8/2 6/2');
  assert.ok(Math.abs(sixFour.moves[1].loss-.0017)<1e-10);
  let replies=0;
  for(const opening of openings.values()){
   if(opening.state.dice[0]===opening.state.dice[1])continue;
   for(const cube of [1,2,4,64]){
    const state={...opening.state,cube:{value:cube,owner:null}};
    const result=await client.analyze(state,{preset:'auto',readyOnly:true});
    assert.equal(result.candidates[0].key,opening.moves[0].key);
    assert.equal(result.candidates[0].equity,opening.moves[0].equity);
    assert.equal(result.method,opening.method);
   }
   for(let choice=0;choice<opening.moves.length;choice++){
    for(const reply of (await guide.replies(opening,choice)).values()){
     const state={...reply.state,cube:{value:2,owner:null}};
     const result=await client.analyze(state,{preset:'auto',readyOnly:true});
     assert.equal(result.candidates[0].key,reply.moves[0].key);
     assert.equal(result.candidates[0].equity,reply.moves[0].equity);
     assert.equal(result.method||'tree',reply.method);
     replies++;
    }
   }
  }
  assert.equal(replies,32*21);
 } finally {client.destroy();}
});

test('a loaded reference replaces a cached live choice, including ready-only bot decisions',async()=>{
 const book=new PreferredOpeningBook({fetcher});
 const client=new EngineClient({openingBook:book,workerFactory:()=>{throw Error('Reference should answer without WASM');}});
 const state=initialState({phase:'move',dice:[6,4],matchLength:0,rules:{cube:true,jacoby:true,immediateRedoubles:2}});
 const reference=await book.lookup(state,{preset:'auto',kind:'checker'});
 const key='cached-live-choice';
 const fallback={...reference,method:'tree',book:undefined,settings:{plies:3},candidates:[reference.candidates[1],reference.candidates[0]]};
 client.rememberDecision({state,key,preset:'auto',kind:'checker'},fallback);
 try {
  assert.equal(client.readyResult(state).candidates[0].notation,'8/2 6/2');
  const result=await client.analyze(state,{preset:'auto',readyOnly:true});
  assert.equal(result.method,'reference');
  assert.equal(result.candidates[0].notation,'24/18 13/9');
  // Even a cache entry from a failed reference download must be superseded.
  const cacheKey=[...client.cache.keys()][0];
  client.cache.set(cacheKey,fallback);client.decisions.clear();
  assert.equal((await client.analyze(state,{preset:'auto'})).method,'reference');
 } finally {client.destroy();}
});
