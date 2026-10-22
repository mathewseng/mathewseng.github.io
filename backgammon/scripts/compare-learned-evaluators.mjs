// SPDX-License-Identifier: GPL-3.0-or-later
// Recompute the complete published-reference comparison from saved raw searches.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {normalizeReference} from './deep-book-comparison.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root));
const manifest=JSON.parse(read('docs/learned-evaluator-inputs.json'));
const referenceBytes=read('docs/deep-book-xg-reference.json');
const reference=normalizeReference(JSON.parse(referenceBytes));
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(referenceBytes)!==manifest.referenceSHA256)throw Error('Reference source changed');
const datasets=[];
for(const spec of manifest.runs) {
 const raw=read(spec.file);if(hash(raw)!==spec.sha256)throw Error('Raw result changed: '+spec.file);
 const records=gunzipSync(raw).toString().trim().split('\n').map(JSON.parse),metadata=records.shift().metadata;
 if(records.length!==reference.length)throw Error('Incomplete comparison '+spec.id);
 const byId=new Map(records.map(r=>[r.id,r]));if(byId.size!==reference.length)throw Error('Duplicate positions');
 const rows=reference.map(ref=>{
  const run=byId.get(ref.title);if(!run)throw Error('Missing position '+ref.title);
  const moves=new Map(run.moves.map(m=>[m.key,m]));
  if(moves.size!==run.moves.length)throw Error('Duplicate move '+ref.title);
  const top=run.moves[0],winner=ref.candidates.find(c=>c.board===top.key);
  if(!winner)throw Error('Chosen move is not covered by XG: '+ref.title);
  if(run.moves.some(m=>!Number.isFinite(m.equity)))throw Error('Invalid equity');
  const candidates=ref.candidates.map(c=>{
   const move=moves.get(c.board);if(!move)throw Error('Missing source candidate');
   if(spec.sageLevel&&move.eval_level!==spec.sageLevel)throw Error('Source candidate was only screened: '+ref.title);
   return {move:c.move,key:c.board,referenceEquity:c.equity,referenceMargin:c.confidenceHalfWidth,
    equity:move.equity,difference:move.equity-c.equity,withinTolerance:Math.abs(move.equity-c.equity)<=manifest.tolerance};
  });
  return {id:ref.title,url:ref.url,move:winner.move,agrees:top.key===ref.candidates[0].board,
   referenceLoss:ref.candidates[0].equity-winner.equity,legalMoves:moves.size,candidates};
 });
 const candidates=rows.flatMap(r=>r.candidates),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
 datasets.push({...spec,metadata,summary:{positions:rows.length,legalMoves:rows.reduce((n,r)=>n+r.legalMoves,0),
  referenceCandidates:candidates.length,matches:rows.filter(r=>r.agrees).length,
  meanReferenceLoss:mean(rows.map(r=>r.referenceLoss)),meanAbsoluteDifference:mean(candidates.map(c=>Math.abs(c.difference))),
  meanSignedDifference:mean(candidates.map(c=>c.difference)),withinTolerance:candidates.filter(c=>c.withinTolerance).length,
  maximumAbsoluteDifference:Math.max(...candidates.map(c=>Math.abs(c.difference)))},rows});
}
const historicalBytes=read('docs/deep-book-comparison.json');
if(hash(historicalBytes)!==manifest.historicalBookSHA256)throw Error('Historical book comparison changed');
const historical=JSON.parse(historicalBytes),wide=new Map(datasets.find(d=>d.id==='puretd-wide1').rows.map(r=>[r.id,r]));
const common=historical.rows.map(row=>{
 const current=wide.get(row.sourcePosition);if(!current)throw Error('Missing historical position');
 const values=new Map(current.candidates.map(c=>[c.key,c]));
 for(const candidate of row.commonMoves)if(values.get(candidate.board)?.referenceEquity!==candidate.xgEquity)throw Error('Historical reference mismatch');
 return {old:row,current,values};
});
const matchedBook={positions:common.length,candidates:common.reduce((n,r)=>n+r.old.commonMoves.length,0),
 source:'docs/deep-book-comparison.json',sha256:hash(historicalBytes),
 method:'Same historical 666 positions and 1,494 common candidate values. Historical GNUbg 4/5-ply book finalists vs current independent full-root PureTD wide 1-ply. Root filtering differs. No historical values are rewritten.',
 rows:[4,5,'wide'].map(depth=>{
  const errors=common.flatMap(r=>r.old.commonMoves.map(c=>Math.abs((depth==='wide'?r.values.get(c.board).equity:c[depth===4?'fourPly':'fivePly'])-c.xgEquity)));
  return {label:depth==='wide'?'PureTD wide 1 ply':`Historical GNUbg ${depth}-ply book`,
   matches:common.filter(r=>depth==='wide'?r.current.agrees:r.old.byDepth[depth].agrees).length,
   meanAbsoluteDifference:errors.reduce((n,v)=>n+v,0)/errors.length,withinTolerance:errors.filter(v=>v<=manifest.tolerance).length};
 })};
const result={schema:1,id:'learned-evaluators-v1',recordedAt:manifest.recordedAt,tolerance:manifest.tolerance,
 referenceSHA256:manifest.referenceSHA256,description:manifest.description,matchedBook,datasets};
fs.writeFileSync(new URL('docs/learned-evaluator-comparison.json',root),JSON.stringify(result)+'\n');
const compact={...result,datasets:datasets.map(({rows,...r})=>({...r,focus:rows.find(r=>r.id==='41$-44')}))};
fs.writeFileSync(new URL('data/learned-evaluator-comparison.json',root),JSON.stringify(compact)+'\n');
console.log(JSON.stringify(datasets.map(r=>({id:r.id,...r.summary})),null,2));
