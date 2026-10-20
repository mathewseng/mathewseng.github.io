// SPDX-License-Identifier: GPL-3.0-or-later
// Promote complete cohorts only after their measured quality meets the prior book.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {legalTurns,boardKey} from '../core/rules.mjs';
import {stateForBoard,nextBoard} from './book-branches.mjs';
import {ROLLOUT_BOOK_ID,ROLLOUT_BOOK_ENGINE,rolloutBookResult} from '../engine/rollout-book.mjs';
import {rolloutPolicyLabel} from '../engine/rollout-policy.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(family,'docs/rollout-policy-comparison.json'));
const report=JSON.parse(source),inputs=JSON.parse(fs.readFileSync(path.join(family,'docs/rollout-policy-inputs.json')));
if(!report.complete||report.engine!==ROLLOUT_BOOK_ENGINE||inputs.signature!==report.signature)throw Error('Incompatible or unfinished comparison');
const cohorts=(process.env.BG_ROLLOUT_BOOK_COHORTS||'opening,reply-disagreement,reply-control').split(',');
for(const cohort of cohorts){
 const summary=report.summaries[cohort],next=summary?.policies['short-deep'],previous=summary?.fivePly;
 if(!['opening','reply-disagreement','reply-control'].includes(cohort)||!next||!previous||next.positions<1||
    next.bestMoveAgreement<previous.bestMoveAgreement||
    next.referenceBestEV.meanAbsoluteDifference>=previous.referenceBestEV.meanAbsoluteDifference)
  throw Error(`Cohort ${cohort} does not meet the promotion criteria; retain its five-ply book or gather further evidence.`);
}
const deepBook=JSON.parse(fs.readFileSync(path.join(family,'engine/opening-book-data/deep/index.json')));
const policy=inputs.policies.find(p=>p.id==='short-deep');
const index={schema:1,id:ROLLOUT_BOOK_ID,engine:ROLLOUT_BOOK_ENGINE,threshold:.040,
 settings:{...policy,name:'Short/deep opening rollout',policyId:policy.id,plies:2,policy:rolloutPolicyLabel(policy.id)},entries:{},
 provenance:{builtAt:new Date().toISOString(),comparisonSignature:report.signature,comparisonSHA256:createHash('sha256').update(source).digest('hex'),
  nativeBuild:report.build,promotedCohorts:cohorts,criteria:'Each complete cohort must have no fewer XG best-move matches and a smaller mean absolute EV gap for XG-preferred moves than its five-ply baseline. This is targeted validation on a selected cohort, not an independent general-strength test.',positions:0,candidates:0}};
for(const d of inputs.plan.filter(d=>cohorts.includes(d.cohort))){
 const row=report.rows.find(r=>r.id===d.id),r=row?.policies['short-deep'];
 if(!r||r.samples!==inputs.trials)throw Error('Missing completed estimates');
 const state=stateForBoard(d.board,[...d.roll].map(Number));
 const rows=r.candidates.map(c=>{const original=d.candidates.find(o=>o.board===c.board);if(!original)throw Error('Unknown candidate');return [original.steps.map(({from,to,die})=>[from,to,die]),c.equity,c.cubeless,...c.probabilities];});
 const entry={rows,standardErrors:r.candidates.map(c=>c.standardError),samples:r.samples,total:legalTurns(state).length,
  seed:parseInt(createHash('sha256').update(d.id).digest('hex').slice(0,8),16),comparisonId:d.id};
 const result=rolloutBookResult(state,entry,index,'auto');
 if(result.candidates[0].key!==r.bestBoard)throw Error('Published board perspective mismatch');
 if(d.kind==='opening')for(const c of result.candidates.filter(c=>result.candidates[0].equity-c.equity<=.040+1e-8))
  if(!deepBook.replies[boardKey(nextBoard(state,c.steps))])throw Error('A newly close opening needs full reply coverage before promotion');
 (index.entries[d.board]??={})[d.roll]=entry;index.provenance.positions++;index.provenance.candidates+=rows.length;
}
const dir=path.join(family,'engine/opening-book-data/rollout');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'index.json.tmp'),JSON.stringify(index)+'\n');fs.renameSync(path.join(dir,'index.json.tmp'),path.join(dir,'index.json'));
console.log(JSON.stringify(index.provenance,null,2));
