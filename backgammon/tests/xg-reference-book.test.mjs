// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {referenceResult,XGReferenceBook,PreferredOpeningBook,referenceEligible} from '../engine/xg-reference-book.mjs';
import {normalizeReference} from '../scripts/deep-book-comparison.mjs';
import {stateForBoard,nextBoard} from '../scripts/book-branches.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
import {legalTurns} from '../core/rules.mjs';
import {OpeningGuideData} from '../ui/opening-guide-data.mjs';
const bytes=fs.readFileSync(new URL('../docs/deep-book-xg-reference.json',import.meta.url)),source=JSON.parse(bytes),refs=normalizeReference(source);
const index=JSON.parse(fs.readFileSync(new URL('../engine/opening-book-data/xg/index.json',import.meta.url)));
const fetcher=async url=>({ok:true,text:async()=>fs.readFileSync(url,'utf8')});
const stateFor=d=>{const state=stateForBoard(d.board,[...d.roll].map(Number));state.rules.immediateRedoubles=1;return state;};
test('every XG source value, legal board and rule context survives import in both orientations',()=>{
 assert.equal(index.sourceSHA256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(refs.length,729);let count=0;
 for(const d of refs){const state=stateFor(d),entry=index.entries[d.board][d.roll];
  for(const turn of [0,1]){
   const s=turn?{...state,turn:1,points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()}:state;
   const result=referenceResult(s,entry,index);assert.equal(result.method,'reference');assert.equal(result.candidates.length,d.candidates.length);
   for(const c of result.candidates){
    const after=legalTurns(s).find(t=>t.key===c.key).state;
    const normalized=bookBoardKey({...after,turn:s.turn});
    const ref=d.candidates.find(r=>r.board===normalized);assert.ok(ref,`${d.title}: board survives import`);
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
 for(const immediateRedoubles of [0,2])assert.equal(referenceEligible({...state,rules:{...state.rules,immediateRedoubles}},options),false);
 assert.equal(referenceEligible({...state,matchLength:7},options),false);
 assert.equal(referenceEligible(state,{...options,rollout:{}}),false);
 const ordinary={...state,rules:{...state.rules,immediateRedoubles:0}};
 assert.equal((await book.lookup(ordinary,options)).method,'rollout');
 assert.throws(()=>referenceResult(ordinary,entry,index));
});
test('all close XG openings have 21 replies and failed reference loading falls back visibly',async()=>{
 const data=new OpeningGuideData(fetcher,{referenceBook:new XGReferenceBook({fetcher})});
 const openings=await data.openings();let branches=0;
 for(const opening of openings.values()){
  assert.equal(opening.method,'reference');assert.equal(opening.state.rules.immediateRedoubles,1);
  for(let choice=0;choice<opening.moves.length;choice++){
   const replies=await data.replies(opening,choice);assert.equal(replies.size,21);
   for(const r of replies.values()){const fallback=opening.state.dice.join('')==='51'&&opening.moves[choice].notation==='24/18';assert.equal(r.method,fallback?'tree':'reference');assert.equal(r.state.rules.immediateRedoubles,fallback?0:1);}
   branches++;
  }
 }
 assert.ok(branches>=31);
 const failed=new OpeningGuideData(fetcher,{referenceBook:new XGReferenceBook({fetcher:async()=>({ok:false})})});
 const fallback=await failed.openings();assert.ok([...fallback.values()].every(p=>p.method==='tree'&&p.state.rules.immediateRedoubles===0));
});
