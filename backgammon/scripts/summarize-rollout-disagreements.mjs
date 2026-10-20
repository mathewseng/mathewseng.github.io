// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {pool} from '../engine/rollout.mjs';
// Two-sided Student t critical values. Conservative df buckets for larger runs.
export function critical95(df){if(df<1)return null;const t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.160,2.145,2.131,2.120,2.110,2.101,2.093,2.086,2.080,2.074,2.069,2.064,2.060,2.056,2.052,2.048,2.045,2.042];return df<=30?t[df]:df<60?2.042:df<120?2.000:1.980;}
export function batchContrast(a,b){
 if(a.length!==b.length||a.length<2)throw Error('Need at least two paired batches');
 const deltas=a.map((r,i)=>{if(r.batch!==b[i].batch||r.seed!==b[i].seed||r.value.samples!==b[i].value.samples)throw Error('Unpaired batches');return r.value.equity-b[i].value.equity;});
 const n=deltas.length,mean=deltas.reduce((x,y)=>x+y,0)/n,se=Math.sqrt(deltas.reduce((s,v)=>s+(v-mean)**2,0)/(n*(n-1))),halfWidth=critical95(n-1)*se;
 return {difference:mean,standardError:se,confidenceHalfWidth:halfWidth,lower:mean-halfWidth,upper:mean+halfWidth,batches:n,method:'Paired independent batch means, two-sided Student t, unadjusted 95%; excludes policy/model error and multiple-comparison selection.'};
}
const stats=xs=>xs.length?{n:xs.length,meanAbsoluteDifference:xs.reduce((s,x)=>s+Math.abs(x),0)/xs.length,meanSignedDifference:xs.reduce((s,x)=>s+x,0)/xs.length,maximumAbsoluteDifference:Math.max(...xs.map(Math.abs))}:null;
export function summarize(inputs,records,{partial=false}={}){
 const allowed=new Map(inputs.plan.map(d=>[d.id,new Set(d.candidates.map(c=>c.board))]));
 const lookup=new Map();for(const r of records){
  const p=inputs.policies.find(p=>p.id===r.policy);
  const seed=(parseInt(createHash('sha256').update(r.id).digest('hex').slice(0,8),16)+r.batch*65536)>>>0;
  if(!allowed.get(r.id)?.has(r.board)||!p||!Number.isInteger(r.batch)||r.batch<0||r.batch>=inputs.trials/32||
     r.key!==[r.id,r.policy,r.batch,r.board].join('|')||r.seed!==seed||r.value.samples!==32||
     !Number.isFinite(r.value.equity)||!Number.isFinite(r.value.standardError)||r.value.standardError<0||
     ['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies'].some(k=>r.value[k]!==p[k]))throw Error('Invalid checkpoint record');
  if(lookup.has(r.key))throw Error('Duplicate record');lookup.set(r.key,r);
 }
 const rows=[];let missing=0;
 for(const d of inputs.plan){
  const policies={};
  for(const p of inputs.policies){
   const batches=d.candidates.map(c=>{const list=[];for(let batch=0;batch<inputs.trials/32;batch++){const key=[d.id,p.id,batch,c.board].join('|'),r=lookup.get(key);if(!r)break;if(r.value.samples!==32||r.value.checkerPlies!==p.checkerPlies||r.value.cubePlies!==p.cubePlies || r.value.truncationPlies!==(p.truncationPlies||0))throw Error('Wrong policy/sample count');list.push(r);}return list;});
   const count=Math.min(...batches.map(b=>b.length));
   if(count<inputs.trials/32){missing++;if(!partial)continue;}if(count<2)continue;
   const candidates=d.candidates.map((c,i)=>{const value=batches[i].slice(0,count).reduce((a,b)=>pool(a,b.value),null);return {board:c.board,move:c.notation,reference:c.reference,fivePly:c.fivePly,...value,batches:batches[i].slice(0,count)};});
   candidates.sort((a,b)=>b.equity-a.equity);
   const best=candidates[0],runner=candidates[1];
   const pair=runner?batchContrast(best.batches,runner.batches):null;
   const chosenXG=d.candidates.find(c=>c.board===best.board)?.reference;
   const referenceBest=candidates.find(c=>c.board===d.referenceBest.board);
   policies[p.id]={samples:count*32,agrees:best.board===d.referenceBest.board,bestMove:best.move,bestBoard:best.board,bestEquity:best.equity,
    selectedMoveReferenceLoss:chosenXG?d.referenceBest.equity-chosenXG.xgEquity:null,
    referenceBestDifference:referenceBest?referenceBest.equity-d.referenceBest.equity:null,
    leaderGap:pair,clearLeaderUnadjusted:candidates.length<2||candidates.slice(1).every(c=>batchContrast(best.batches,c.batches).lower>0),
    candidates:candidates.map(({batches,...c})=>c)};
  }
  rows.push({id:d.id,roll:d.roll,kind:d.kind,cohort:d.cohort,source:d.source,referenceBest:d.referenceBest,policies});
 }
 if(missing&&!partial)throw Error(`${missing} decision/policy groups incomplete`);
 const summaries={};
 for(const cohort of ['opening','reply-disagreement','reply-control','all']){
  const selected=rows.filter(r=>(cohort==='all'||r.cohort===cohort)&&inputs.policies.every(p=>r.policies[p.id]));
  const baseline=selected.map(r=>{
   const d=inputs.plan.find(d=>d.id===r.id),candidates=[...d.candidates].sort((a,b)=>b.fivePly.equity-a.fivePly.equity);
   const best=candidates[0],ref=candidates.find(c=>c.board===d.referenceBest.board);
   return {agrees:best.board===d.referenceBest.board,referenceBestDifference:ref?ref.fivePly.equity-d.referenceBest.equity:null,
    loss:best.reference?d.referenceBest.equity-best.reference.xgEquity:null,candidates};
  });
  const baselineLoss=baseline.map(r=>r.loss).filter(v=>v!==null);
  summaries[cohort]={positions:selected.length,fivePly:{bestMoveAgreement:baseline.filter(r=>r.agrees).length,
   referenceBestEV:stats(baseline.map(r=>r.referenceBestDifference).filter(v=>v!==null)),
   commonCandidateEV:stats(baseline.flatMap(r=>r.candidates.filter(c=>c.reference).map(c=>c.fivePly.equity-c.reference.xgEquity))),
   selectedMoveLossCovered:baselineLoss.length,meanSelectedMoveReferenceLoss:baselineLoss.length?baselineLoss.reduce((a,b)=>a+b,0)/baselineLoss.length:null},
   policies:Object.fromEntries(inputs.policies.map(p=>{
   const group=selected.map(r=>r.policies[p.id]),loss=group.map(p=>p.selectedMoveReferenceLoss).filter(v=>v!==null);
   return [p.id,{positions:group.length,bestMoveAgreement:group.filter(p=>p.agrees).length,referenceBestEV:stats(group.map(p=>p.referenceBestDifference).filter(v=>v!==null)),commonCandidateEV:stats(group.flatMap(p=>p.candidates.filter(c=>c.reference).map(c=>c.equity-c.reference.xgEquity))),selectedMoveLossCovered:loss.length,meanSelectedMoveReferenceLoss:loss.length?loss.reduce((a,b)=>a+b,0)/loss.length:null,clearLeadersUnadjusted:group.filter(p=>p.clearLeaderUnadjusted).length,maximumSamplingHalfWidth:group.length?Math.max(...group.flatMap(p=>p.candidates.map(c=>1.96*c.standardError))):null}];
  }))};
 }
 return {schema:1,recordedAt:new Date().toISOString(),signature:inputs.signature,complete:!missing,expectedTrials:inputs.trials,method:inputs.method,policies:inputs.policies,coverage:{positions:inputs.plan.length,candidates:inputs.plan.reduce((s,d)=>s+d.candidates.length,0),completedRecords:records.length,missingDecisionPolicyGroups:missing},summaries,rows,
  limitations:['The cohort deliberately includes five-ply disagreements; it is not a random sample of all backgammon positions.','XG historical rollouts and XGRoller++ are approximate references; some gaps are below their reported uncertainty.','The XG source enables beavers, while these GNUbg rollouts do not. Earlier three-ply context checks found negligible effects, but rollout equivalence is untested.','Sampling intervals exclude policy/model bias and candidate-screening risk. Leader-gap intervals are unadjusted exploratory comparisons, not simultaneous guarantees.','Basic and Balanced simulate complete games; Short/deep truncates after five turns using GNUbg two-ply endpoint evaluation. This reduces sampling noise but retains endpoint-model bias. All policies use normal move filters and may accept a clear shallow winner.']};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(process.env.BG_ROLLOUT_OUT||path.join(family,'test-results/strong-rollouts-v3'));
 const inputs=JSON.parse(fs.readFileSync(path.join(out,'inputs.json'))),raw=fs.readFileSync(path.join(out,'batches.jsonl'),'utf8');
 const records=raw.slice(0,raw.lastIndexOf('\n')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const report=summarize(inputs,records,{partial:process.argv.includes('--partial')});
 report.rawSHA256=createHash('sha256').update(raw).digest('hex');
 fs.writeFileSync(path.join(out,report.complete?'comparison.json':'partial-comparison.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({coverage:report.coverage,summaries:report.summaries},null,2));
}
