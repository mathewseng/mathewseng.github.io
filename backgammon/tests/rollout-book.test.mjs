import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,legalTurns,boardKey,commitTurn} from '../core/rules.mjs';
import {bookBoardKey} from '../engine/opening-book.mjs';
import {RolloutOpeningBook,rolloutBookResult,ROLLOUT_BOOK_ID,ROLLOUT_BOOK_ENGINE} from '../engine/rollout-book.mjs';
const state=initialState({matchLength:0,phase:'move',dice:[2,1],rules:{cube:true,jacoby:true,immediateRedoubles:0}});
function data(){
 const turns=legalTurns(state),rows=turns.slice(0,2).map((t,i)=>[t.steps.map(({from,to,die})=>[from,to,die]),.1-i*.01,.07,.53,.1,.01,.05,.005]);
 const entry={rows,standardErrors:[.002,.003],samples:512,total:turns.length,seed:1};
 const index={schema:1,id:ROLLOUT_BOOK_ID,engine:ROLLOUT_BOOK_ENGINE,settings:{name:'Short/deep opening rollout',policyId:'short-deep',plies:2,checkerPlies:2,cubePlies:2,truncationPlies:5,lateAfterPlies:2,lateCheckerPlies:1,lateCubePlies:2,policy:'Recorded short policy'},entries:{[bookBoardKey(state)]:{'21':entry}},provenance:{builtAt:'2026-10-20T00:00:00Z'}};
 return {index,entry,turns};
}
test('stored rollout estimates retain samples, uncertainty, source and mirrored legal moves',()=>{
 const {index,entry,turns}=data(),a=rolloutBookResult(state,entry,index,'auto',turns[1].steps);
 assert.equal(a.method,'rollout');assert.equal(a.engine,ROLLOUT_BOOK_ENGINE);assert.equal(a.settings.trials,512);assert.equal(a.settings.truncationPlies,5);
 assert.equal(a.candidates[0].standardError,.002);assert.ok(Math.abs(a.error-.01)<1e-12);assert.equal(a.actual.key,boardKey(commitTurn(state,turns[1].steps)));
 assert.equal(rolloutBookResult(state,entry,index,'auto',turns[2].steps),null,'unlisted moves need a complete fallback comparison');
 const mirrored={...state,turn:1,points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()};
 const b=rolloutBookResult(mirrored,entry,index,'auto');assert.equal(b.perspective,1);assert.deepEqual(b.candidates.map(c=>c.equity),a.candidates.map(c=>c.equity));
 assert.throws(()=>rolloutBookResult(state,{...entry,standardErrors:[.01,-1]},index,'auto'),/estimate/);
 assert.throws(()=>rolloutBookResult(state,entry,{...index,settings:{...index.settings,truncationPlies:7}},'auto'),/entry/);
});
test('missing, corrupt and uncovered rollout entries fall back without mixing methods',async()=>{
 const {index,entry,turns}=data();let falls=0;
 const fallback={lookup:async()=>{falls++;return {method:'tree',settings:{plies:5}};},mayHave:()=>true,prepare:async()=>{}};
 const book=new RolloutOpeningBook({fetcher:async()=>Response.json(index),fallback});
 const options={kind:'checker',preset:'auto'};
 assert.equal((await book.lookup(state,options)).method,'rollout');assert.equal(falls,0);
 assert.equal((await book.lookup(state,{...options,submitted:turns[2].steps})).method,'tree');assert.equal(falls,1);
 book.index.entries[bookBoardKey(state)]['21']={...entry,rows:[entry.rows[0],entry.rows[0]]};
 assert.equal((await book.lookup(state,options)).method,'tree');assert.equal(falls,2);
 assert.equal(await book.lookup({...state,matchLength:5},options),null);
 let requests=0;const offline=new RolloutOpeningBook({fallback,fetcher:()=>{requests++;throw Error('offline');}});
 assert.equal((await offline.lookup(state,options)).method,'tree');assert.equal(requests,1);
 offline.retryAt=0;await offline.lookup(state,options);assert.equal(requests,2,'synchronous fetch failures must be retryable');
});

import {readFileSync} from 'node:fs';
import {OpeningGuideData} from '../ui/opening-guide-data.mjs';
test('the opening guide distinguishes sampled positions from its five-ply fallback',async()=>{
 const {index,entry}=data();
 const overlay={lookupRollout:async s=>bookBoardKey(s)===bookBoardKey(state)&&[...s.dice].sort().join('')==='12'?rolloutBookResult(s,entry,index,'expert'):null};
 const guideData=new OpeningGuideData(url=>Promise.resolve(new Response(readFileSync(url))),{rolloutBook:overlay});
 const openings=await guideData.openings(),sampled=openings.get('21'),tree=openings.get('31');
 assert.equal(sampled.method,'rollout');assert.equal(sampled.trials,512);assert.equal(sampled.moves[0].standardError,.002);
 assert.equal(tree.method,'tree');assert.equal(tree.plies,5);assert.equal(tree.trials,null);
 const reply=await guideData.reply(tree,0,'31');assert.equal(reply.method,'tree');assert.equal(reply.plies,5);
});

import {ROLLOUT_POLICIES,rolloutPolicyLabel} from '../engine/rollout-policy.mjs';
test('full-game entries carry their own complete policy without changing neighboring short entries',()=>{
 const {index,entry}=data();
 const settings={...ROLLOUT_POLICIES.strong,policyId:'strong',plies:2,name:'Full-game opening rollout',policy:rolloutPolicyLabel('strong')};
 const full={...entry,samples:1024,settings};
 const result=rolloutBookResult(state,full,index,'auto');
 assert.equal(result.settings.policyId,'strong');assert.equal(result.settings.truncationPlies,0);
 assert.equal(result.settings.lateCheckerPlies,2);assert.equal(result.settings.trials,1024);
 assert.equal(result.settings.name,'Full-game opening rollout');
 assert.equal(rolloutBookResult(state,entry,index,'auto').settings.truncationPlies,5);
 for(const change of [{truncationPlies:5},{lateCheckerPlies:1},{cubePlies:3},{policyId:'basic'},{id:'short-deep'}])
  assert.throws(()=>rolloutBookResult(state,{...full,settings:{...settings,...change}},index,'auto'),/entry/);
});
