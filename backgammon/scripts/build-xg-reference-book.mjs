// SPDX-License-Identifier: GPL-3.0-or-later
// Package published reference values verbatim; this does not evaluate positions.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeReference} from './deep-book-comparison.mjs';
import {stateForBoard} from './book-branches.mjs';
import {legalTurns} from '../core/rules.mjs';
const root=new URL('../',import.meta.url),bytes=fs.readFileSync(new URL('docs/deep-book-xg-reference.json',root));
const reference=JSON.parse(bytes),entries={};
const attributionBytes=fs.readFileSync(new URL('docs/xg-reference-attribution.json',root)),attribution=JSON.parse(attributionBytes);
if(attribution.sourceSHA256!==createHash('sha256').update(bytes).digest('hex'))throw Error('Attribution source mismatch');
let candidates=0;
for(const d of normalizeReference(reference)){
 const state=stateForBoard(d.board,[...d.roll].map(Number)),legal=legalTurns(state);
 if(!d.beavers)throw Error('Unexpected reference rules');
 const moves=d.candidates.map(c=>{
  const turn=legal.find(t=>t.key===c.board);if(!turn)throw Error('Illegal reference move');
  const credit=attribution.sources[d.url]?.positions[d.title]?.find(a=>a.rank===c.rank);
  if(!credit?.author||!credit.date||!credit.engine)throw Error('Missing original contributor');
  candidates++;
  return {steps:turn.steps.map(({from,to,die})=>[from,to,die]),equity:c.equity,
   probabilities:[...c.probabilities[0],...c.probabilities[1].slice(1)],
   confidenceHalfWidth:c.confidenceHalfWidth,method:c.method,trials:c.trials,policy:c.policy,rank:c.rank,credit};
 });
 (entries[d.board]??={})[d.roll]={source:d.url,title:d.title,sourceIssue:d.sourceIssue,total:legal.length,moves};
}
const index={schema:1,id:'xg-public-opening-3.70-v1',engine:'eXtreme Gammon · published opening book 3.70 (2013)',
 context:{...reference.context,immediateRedoubles:2},source:reference.sourceIndex,retrievedAt:reference.retrievedAt,
 sourceSHA256:createHash('sha256').update(bytes).digest('hex'),attributionSHA256:createHash('sha256').update(attributionBytes).digest('hex'),positions:729,candidates,entries};
if(Object.values(entries).reduce((n,r)=>n+Object.keys(r).length,0)!==729)throw Error('Incomplete reference');
fs.mkdirSync(new URL('engine/opening-book-data/xg/',root),{recursive:true});
fs.writeFileSync(new URL('engine/opening-book-data/xg/index.json',root),JSON.stringify(index)+'\n');
console.log(`${index.positions} published XG positions; ${candidates} candidates`);
