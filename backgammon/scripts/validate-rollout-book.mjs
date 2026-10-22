// SPDX-License-Identifier: GPL-3.0-or-later
// Exercise the exact published lookup/fallback path on every matched XG decision.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {RolloutOpeningBook,ROLLOUT_BOOK_ID} from '../engine/rollout-book.mjs';
import {stateForBoard} from './book-branches.mjs';
import {legalTurns} from '../core/rules.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(family,f)));
const reference=read('docs/deep-book-comparison.json'),evaluations=read('docs/deep-book-evaluations.json');
const decisions=new Map([...evaluations.openings,...evaluations.replies].map(d=>[d.id,d]));
const book=new RolloutOpeningBook({fetcher:async url=>{try{return new Response(fs.readFileSync(url));}catch{return new Response('',{status:404});}}});
const rows=[];let mirrored=0,graded=0,omitted=0;
for(const r of reference.rows){
 const d=decisions.get(r.id),state=stateForBoard(d.board,[...d.roll].map(Number));
 const result=await book.lookup(state,{kind:'checker',preset:'auto'});if(!result)throw Error('Missing reference position '+r.id);
 const sampled=result.book.id===ROLLOUT_BOOK_ID,best=result.candidates[0],xg=result.candidates.find(c=>c.key===r.referenceBest.board),chosen=r.commonMoves.find(c=>c.board===best.key);
 rows.push({id:r.id,kind:r.kind,book:result.book.id,method:result.method||'tree',policyId:sampled?result.settings.policyId:null,samples:sampled?result.settings.trials:null,
  agrees:best.key===r.referenceBest.board,move:best.notation,referenceMove:r.referenceBest.move,referenceSource:r.source,
  referenceBestEquity:r.referenceBest.equity,referenceBestEstimate:xg?.equity??null,
  commonCandidateEV:result.candidates.flatMap(c=>{const ref=r.commonMoves.find(m=>m.board===c.key);return ref?[{board:c.key,move:c.notation,equity:c.equity,referenceEquity:ref.xgEquity,difference:c.equity-ref.xgEquity,withinTolerance:Math.abs(c.equity-ref.xgEquity)<=.005}]:[];}),
  referenceBestDifference:xg?xg.equity-r.referenceBest.equity:null,selectedMoveReferenceLoss:chosen?r.referenceBest.equity-chosen.xgEquity:null});
 if(sampled){
  if(result.method!=='rollout'||result.settings.trials<512||result.candidates.some(c=>!Number.isFinite(c.standardError)||c.samples!==result.settings.trials))throw Error('Lost uncertainty/source');
  const reverse={...state,turn:1,points:state.points.toReversed().map(n=>-n),bar:state.bar.toReversed(),off:state.off.toReversed()};
  const other=await book.lookup(reverse,{kind:'checker',preset:'auto'});
  if(JSON.stringify(other.candidates.map(c=>[c.notation,c.equity,c.standardError]))!==JSON.stringify(result.candidates.map(c=>[c.notation,c.equity,c.standardError])))throw Error('Mirror mismatch');mirrored++;
  const actual=result.candidates.at(-1),grade=await book.lookup(state,{kind:'checker',preset:'auto',submitted:actual.steps});
  if(grade.method!=='rollout'||grade.actual.key!==actual.key||Math.abs(grade.error-(best.equity-actual.equity))>1e-10)throw Error('Inconsistent stored rollout grade');graded++;
  const missing=legalTurns(state).find(t=>!result.candidates.some(c=>c.key===t.key));
  if(missing){const fallback=await book.lookup(state,{kind:'checker',preset:'auto',submitted:missing.steps});if(fallback?.method==='rollout')throw Error('Unlisted move got a mixed-method grade');omitted++;}
 }
}
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const summaries=Object.fromEntries(['opening','reply'].map(kind=>{const subset=rows.filter(r=>r.kind===kind);return [kind,{positions:subset.length,bestMoveAgreement:subset.filter(r=>r.agrees).length,
 referenceBestEV:{n:subset.filter(r=>r.referenceBestDifference!==null).length,tolerance:.005,withinTolerance:subset.filter(r=>r.referenceBestDifference!==null&&Math.abs(r.referenceBestDifference)<=.005).length,maximumAbsoluteDifference:Math.max(...subset.filter(r=>r.referenceBestDifference!==null).map(r=>Math.abs(r.referenceBestDifference))),meanAbsoluteDifference:mean(subset.filter(r=>r.referenceBestDifference!==null).map(r=>Math.abs(r.referenceBestDifference)))},
 commonCandidateEV:{n:subset.flatMap(r=>r.commonCandidateEV).length,tolerance:.005,withinTolerance:subset.flatMap(r=>r.commonCandidateEV).filter(c=>c.withinTolerance).length,meanAbsoluteDifference:mean(subset.flatMap(r=>r.commonCandidateEV).map(c=>Math.abs(c.difference)))},
 meanSelectedMoveReferenceLoss:mean(subset.filter(r=>r.selectedMoveReferenceLoss!==null).map(r=>r.selectedMoveReferenceLoss)),fivePlyBaseline:reference.summaries[kind].depths['5']}];}));
const indexFile=path.join(family,'engine/opening-book-data/rollout/index.json'),index=JSON.parse(fs.readFileSync(indexFile));
const storedPolicies={};
for(const r of rows.filter(r=>r.method==='rollout')){
 const p=storedPolicies[r.policyId]??={positions:0,minTrials:r.samples,maxTrials:r.samples};
 p.positions++;p.minTrials=Math.min(p.minTrials,r.samples);p.maxTrials=Math.max(p.maxTrials,r.samples);
}
const report={schema:1,storedPolicies,fullgame:index.provenance.fullgamePrecision??index.provenance.fullgame??null,recordedAt:new Date().toISOString(),id:ROLLOUT_BOOK_ID,indexSHA256:createHash('sha256').update(fs.readFileSync(indexFile)).digest('hex'),
 coverage:{positions:rows.length,sampled:rows.filter(r=>r.method==='rollout').length,fivePlyFallback:rows.filter(r=>r.method==='tree').length,mirrored,graded,omitted},promotedCohorts:index.provenance.promotedCohorts,summaries,rows};
if(report.coverage.sampled!==index.provenance.positions)throw Error('Published coverage mismatch');
fs.writeFileSync(path.join(family,'docs/rollout-book-validation.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(family,'data/rollout-book-validation.json'),JSON.stringify({...report,rows:undefined})+'\n');
console.log(JSON.stringify({coverage:report.coverage,summaries:report.summaries},null,2));
