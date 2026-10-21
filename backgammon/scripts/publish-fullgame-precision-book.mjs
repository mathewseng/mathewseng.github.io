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
const source=fs.readFileSync(path.join(family,'docs/fullgame-precision-comparison.json'));
const report=JSON.parse(source),inputBytes=fs.readFileSync(path.join(family,'docs/fullgame-precision-inputs.json')),inputs=JSON.parse(inputBytes);
const plan=read('docs/fullgame-precision-promotion-plan.json');
const confirmation=read('docs/opening-fullgame-precision-comparison.json'),confirmationBytes=fs.readFileSync(path.join(family,'docs/opening-fullgame-precision-inputs.json')),confirmationInputs=JSON.parse(confirmationBytes);
if(!confirmation.complete||confirmation.records!==8192||confirmation.trialsPerMovePolicy!==32768||confirmation.signature!==confirmationInputs.signature||confirmation.inputSHA256!==hash(confirmationBytes)||confirmationInputs.cohortPrecisionSignature!==inputs.signature||confirmationInputs.plan.length!==1||confirmationInputs.plan[0].id!=='opening-21'||plan.openingSignature!==confirmation.signature)throw Error('Opening precision study is incomplete or mismatched');
if(!report.complete||report.records!==13440||report.trialsPerMovePolicy!==4096||report.signature!==inputs.signature||report.inputSHA256!==hash(inputBytes)||plan.cohortSignature!==inputs.signature||inputs.plan.length!==15)throw Error('Unfinished or mismatched precision cohort');
const base=report.summaries.short,next=report.summaries['full-strong'];
const cohortAccepted=next.meanAbsoluteGapError<base.meanAbsoluteGapError&&next.pairMeanFavorsXG>=base.pairMeanFavorsXG&&
 ['cutoff','checker'].some(k=>report.cohortEffects[k].familywise95.upper<0);
const opening=confirmation.rows[0],strong=opening.policies['full-strong'],retained=strong.retainedReferenceGaps;
const openingAccepted=retained?.length===3&&retained.every(g=>g.familywise95.lower>0)&&
 Math.abs(strong.gap.difference-opening.referenceGap)<Math.abs(opening.policies.short.gap.difference-opening.referenceGap)&&
 ['cutoff','checker'].some(k=>opening.effects[k].familywise95.upper<0);
if(!cohortAccepted&&!openingAccepted)throw Error('Neither precision study meets its predeclared publication criteria. Do not publish an unsupported fix.');
const promoted=cohortAccepted?inputs.plan:inputs.plan.filter(d=>d.id==='opening-21');
if(ROLLOUT_BOOK_ID!=='jacoby-rollout-v2')throw Error('Version the book reader before promoting the mixed-policy book.');
const file=path.join(family,'engine/opening-book-data/rollout/index.json'),index=read('engine/opening-book-data/rollout/index.json');
if(!['jacoby-short-deep-v1',ROLLOUT_BOOK_ID].includes(index.id)||index.engine!==ROLLOUT_BOOK_ENGINE)throw Error('Unexpected existing book');
const deep=read('engine/opening-book-data/deep/index.json');
index.id=ROLLOUT_BOOK_ID;
const settings={...ROLLOUT_POLICIES.strong,policyId:'strong',plies:2,name:'Full-game opening rollout',policy:rolloutPolicyLabel('strong')};
let candidates=0;
for(const original of promoted){
 const refined=original.id==='opening-21',d=refined?confirmationInputs.plan[0]:original,sourceReport=refined?confirmation:report,samples=refined?32768:4096;
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
if(candidates!==(cohortAccepted?45:4))throw Error('Retained candidate count changed');
index.provenance.builtAt=new Date().toISOString();
index.provenance.fullgamePrecision={experimentSignature:report.signature,comparisonSHA256:hash(source),planSHA256:hash(fs.readFileSync(path.join(family,'docs/fullgame-precision-promotion-plan.json'))),nativeBuild:inputs.build,
 positions:promoted.length,candidates,promotedIds:promoted.map(d=>d.id),trialsPerMove:{replies:cohortAccepted?4096:null,opening21:32768},policyId:'strong',cohortAccepted,openingSeparatelyQualified:openingAccepted,
 criteria:{cohort:plan.cohortCriteria,opening:plan.openingOnlyCriteria},baseline:base,fullStrong:next,effects:report.cohortEffects,
 openingPrecision:{signature:confirmation.signature,trials:32768,candidates:4,comparisonSHA256:hash(fs.readFileSync(path.join(family,'docs/opening-fullgame-precision-comparison.json')))}};
fs.writeFileSync(file+'.tmp',JSON.stringify(index)+'\n');fs.renameSync(file+'.tmp',file);
console.log(JSON.stringify(index.provenance.fullgamePrecision,null,2));
