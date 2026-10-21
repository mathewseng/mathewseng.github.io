// SPDX-License-Identifier: GPL-3.0-or-later
// Promote the complete predeclared cohort, never just new matching winners.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {legalTurns,boardKey} from '../core/rules.mjs';
import {stateForBoard,nextBoard} from './book-branches.mjs';
import {ROLLOUT_BOOK_ID,ROLLOUT_BOOK_ENGINE,rolloutBookResult} from '../engine/rollout-book.mjs';
import {ROLLOUT_POLICIES,rolloutPolicyLabel} from '../engine/rollout-policy.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(family,f)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(path.join(family,'docs/fullgame-ablation-comparison.json'));
const report=JSON.parse(source),inputBytes=fs.readFileSync(path.join(family,'docs/fullgame-ablation-inputs.json')),inputs=JSON.parse(inputBytes);
const plan=read('docs/fullgame-promotion-plan.json');
const confirmation=read('docs/opening-fullgame-confirmation-comparison.json'),confirmationBytes=fs.readFileSync(path.join(family,'docs/opening-fullgame-confirmation-inputs.json')),confirmationInputs=JSON.parse(confirmationBytes);
if(!confirmation.complete||confirmation.records!==1024||confirmation.trialsPerMovePolicy!==4096||confirmation.signature!==confirmationInputs.signature||confirmation.inputSHA256!==hash(confirmationBytes)||confirmationInputs.parentSignature!==inputs.signature||confirmationInputs.plan.length!==1||confirmationInputs.plan[0].id!=='opening-21')throw Error('Opening confirmation is incomplete or mismatched');
if(!report.complete||report.records!==4320||report.signature!==inputs.signature||report.inputSHA256!==hash(inputBytes)||plan.experimentSignature!==inputs.signature||
   JSON.stringify([...plan.cohort].sort())!==JSON.stringify(inputs.plan.map(p=>p.id).sort()))throw Error('Unfinished or mismatched experiment');
const base=report.summaries.short,next=report.summaries['full-strong'];
const accepted=next.meanAbsoluteGapError<base.meanAbsoluteGapError&&next.pairMeanFavorsXG>=base.pairMeanFavorsXG&&
 report.effectSummary.cutoff['toward-XG']+report.effectSummary.checker['toward-XG']>0;
if(!accepted)throw Error('The predeclared full-game promotion criteria were not met. Do not publish a claimed fix.');
if(ROLLOUT_BOOK_ID!=='jacoby-rollout-v2')throw Error('Version the book reader before promoting the mixed-policy book.');
const file=path.join(family,'engine/opening-book-data/rollout/index.json'),index=read('engine/opening-book-data/rollout/index.json');
if(!['jacoby-short-deep-v1',ROLLOUT_BOOK_ID].includes(index.id)||index.engine!==ROLLOUT_BOOK_ENGINE)throw Error('Unexpected existing book');
const deep=read('engine/opening-book-data/deep/index.json');
index.id=ROLLOUT_BOOK_ID;
const settings={...ROLLOUT_POLICIES.strong,policyId:'strong',plies:2,name:'Full-game opening rollout',policy:rolloutPolicyLabel('strong')};
let candidates=0;
for(const original of inputs.plan){
 const refined=original.id==='opening-21',d=refined?confirmationInputs.plan[0]:original,sourceReport=refined?confirmation:report,samples=refined?4096:1024;
 const row=sourceReport.rows.find(r=>r.id===d.id),values=row?.policies['full-strong']?.candidates;
 if(!values||values.length!==d.candidates.length||values.some(c=>c.samples!==samples))throw Error('Incomplete candidate set');
 const state=stateForBoard(d.board,[...d.roll].map(Number));
 const entry={settings,rows:values.map(c=>{const original=d.candidates.find(o=>o.board===c.board);if(!original)throw Error('Unknown candidate');return [original.steps.map(({from,to,die})=>[from,to,die]),c.equity,c.cubeless,...c.probabilities];}),
  standardErrors:values.map(c=>c.standardError),samples,total:legalTurns(state).length,seed:d.seedBase,comparisonId:d.id,comparisonSignature:sourceReport.signature};
 const result=rolloutBookResult(state,entry,index,'auto');
 if(result.candidates[0].key!==row.policies['full-strong'].bestBoard)throw Error('Published board perspective mismatch');
 if(d.kind==='opening')for(const c of result.candidates.filter(c=>result.candidates[0].equity-c.equity<=.040+1e-8))
  if(!deep.replies[boardKey(nextBoard(state,c.steps))])throw Error('A newly close opening needs reply coverage before promotion');
 if(!index.entries[d.board]?.[d.roll])throw Error('Missing prior cohort entry');
 index.entries[d.board][d.roll]=entry;candidates+=values.length;
}
if(candidates!==45)throw Error('Retained candidate count changed');
index.provenance.builtAt=new Date().toISOString();
index.provenance.fullgame={experimentSignature:report.signature,comparisonSHA256:hash(source),planSHA256:hash(fs.readFileSync(path.join(family,'docs/fullgame-promotion-plan.json'))),nativeBuild:inputs.build,
 positions:15,candidates,trialsPerMove:{replies:1024,opening21:4096},policyId:'strong',accepted,criteria:plan.criteria,baseline:base,primaryFullStrong:next,effects:report.effectSummary,
 openingConfirmation:{signature:confirmation.signature,trials:4096,candidates:4,comparisonSHA256:hash(fs.readFileSync(path.join(family,'docs/opening-fullgame-confirmation-comparison.json')))}};
fs.writeFileSync(file+'.tmp',JSON.stringify(index)+'\n');fs.renameSync(file+'.tmp',file);
console.log(JSON.stringify(index.provenance.fullgame,null,2));
