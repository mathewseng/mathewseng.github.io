// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
import {stateForBoard} from './book-branches.mjs';
import {boardKey,commitTurn} from '../core/rules.mjs';
export const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const PREFIX='filtered-rollout-v1',FOCUS='reply-7985255600f3563f-44',TRIALS=16384,BATCH=32,SHARDS=20;
export const hash=b=>createHash('sha256').update(b).digest('hex');
const read=n=>JSON.parse(fs.readFileSync(path.join(family,'docs',n)));
export const FIELDS=['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies','rulesMode','filter','vrPlies','cacheContext'];
export const seedAt=(d,batch)=>(d.seedBase+batch*65536)>>>0;
export function createPlan(runtime=null){
 const sources=['opening-fullgame-precision-inputs.json','reply-fullgame-precision-inputs.json'];
 const plan=sources.flatMap(n=>structuredClone(read(n).plan));
 if(plan.length!==7||plan.reduce((n,d)=>n+d.candidates.length,0)!==24)throw Error('Unexpected frozen candidate cohort');
 const used=new Set(),exclusions=[];
 for(const prefix of ['rollout-policy','rollout-diagnostic']){
  const file=`docs/${prefix}-batches.jsonl.gz`,bytes=fs.readFileSync(path.join(family,file));exclusions.push({file,sha256:hash(bytes)});
  for(const line of gunzipSync(bytes).toString().trim().split('\n')){const r=JSON.parse(line);for(let i=0;i<r.value.samples;i++)used.add((r.seed+256*i)>>>0);}
 }
 for(const prefix of ['fullgame-ablation','opening-fullgame-confirmation','fullgame-precision','opening-fullgame-precision','reply-fullgame-precision','cube-policy-study','cube-policy-study-v2']){
  const file=`docs/${prefix}-inputs.json`,bytes=fs.readFileSync(path.join(family,file)),p=JSON.parse(bytes);exclusions.push({file,sha256:hash(bytes)});
  for(const d of p.plan)for(let i=0;i<p.trials;i++)used.add((d.seedBase+Math.floor(i/p.batchSize)*65536+(i%p.batchSize)*256)>>>0);
 }
 // All known timing, platform, upstream and trace diagnostics, including the
 // newly discovered witness. Reserve 64 trial offsets for each diagnostic seed.
 const diagnosticSeeds=[123456789,987654321,31811004];
 for(const seed of diagnosticSeeds)for(let i=0;i<64;i++)used.add((seed+256*i)>>>0);
 for(const d of plan){
  let nonce=0,seeds;
  do{d.seedBase=parseInt(hash(`${PREFIX}:${d.id}:${nonce++}`).slice(0,8),16);seeds=Array.from({length:TRIALS},(_,i)=>(d.seedBase+Math.floor(i/BATCH)*65536+(i%BATCH)*256)>>>0);}while(seeds.some(s=>used.has(s)));
  d.seedNonce=nonce-1;seeds.forEach(s=>used.add(s));
  d.candidates.forEach((c,i)=>{c.candidateId=`c${i}`;if(!Number.isFinite(c.reference?.xgEquity))throw Error('Missing published reference');});
 }
 const referenceFile='engine/opening-book-data/xg/index.json',referenceBytes=fs.readFileSync(path.join(family,referenceFile)),referenceIndex=JSON.parse(referenceBytes),referenceAttributions={};
 for(const d of plan){
  const state=stateForBoard(d.board,[...d.roll].map(Number)),entry=referenceIndex.entries[d.board][d.roll];
  const moves=new Map(entry.moves.map(m=>[boardKey(commitTurn(state,m.steps.map(([from,to,die])=>({from,to,die})))),m]));
  referenceAttributions[d.id]={};
  for(const c of d.candidates){const m=moves.get(c.board);if(!m||m.equity!==c.reference.xgEquity||m.confidenceHalfWidth!==c.reference.confidenceHalfWidth)throw Error('Reference attribution mismatch');referenceAttributions[d.id][c.candidateId]={source:entry.source,method:m.method,trials:m.trials,policy:m.policy,...m.credit};}
 }
 const common={cubePlies:2,truncationPlies:0,lateAfterPlies:0,lateCubePlies:2,endpointPlies:2,rulesMode:3,vrPlies:1,cacheContext:1};
 const policies=[
  {id:'fixed-normal',label:'Corrected normal 2-ply checker',runtime:'fixed',caseIds:plan.map(d=>d.id),checkerPlies:2,lateCheckerPlies:2,filter:0},
  {id:'buggy-normal',label:'Mixed-depth sort control, normal 2-ply checker',runtime:'legacy',caseIds:[FOCUS],checkerPlies:2,lateCheckerPlies:2,filter:0},
  {id:'fixed-deep',label:'Corrected large-filter 3-ply checker',runtime:'fixed',caseIds:[FOCUS],checkerPlies:3,lateCheckerPlies:3,filter:2},
 ].map(p=>({...p,...common}));
 const unsigned={schema:1,id:PREFIX,runtime,collectionEnabled:!!runtime,
  referenceSource:{file:referenceFile,sha256:hash(referenceBytes)},referenceAttributions,
  sources:sources.map(file=>({file:`docs/${file}`,sha256:hash(fs.readFileSync(path.join(family,'docs',file)))})),
  patchSHA256:hash(fs.readFileSync(path.join(family,'engine/source/filtered-rollout-bg9.patch'))),
  runnerSHA256:hash(fs.readFileSync(path.join(family,'scripts/run-filtered-rollout-study.mjs'))),
  plannerSHA256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  analysisInputs:Object.fromEntries(['merge-filtered-rollout-shards.py','summarize-filtered-rollout-study.py','summarize-fullgame-ablation.py','summarize-rollout-diagnostic.py'].map(n=>['scripts/'+n,hash(fs.readFileSync(path.join(family,'scripts',n)))])),
  plan,policies,trials:TRIALS,batchSize:BATCH,shards:SHARDS,plannedRecords:14336,plannedGames:458752,
  seedExclusions:{sources:exclusions,diagnosticSeeds,diagnosticOffsets:64},
  rules:{matchLength:0,jacoby:true,immediateRedoubles:2,cubeLimit:1024,startingCube:1,cubeOwner:null},
  comparisons:{moveGaps:19,policyGapEffects:2,candidatePolicyEffects:4,absoluteEquities:28,confidence:.95,equityTolerance:.005,
   gapEffects:[['fixed-normal','buggy-normal'],['fixed-deep','fixed-normal']],
   absoluteMethod:'Report every mean-minus-published-XG value and abs(error)<=.005 flag. Also report own simultaneous 95% interval for each difference centered on the printed XG point estimate; full containment within [-.005, .005] is separate from mean agreement. Retain original XG printed margins without treating them as zero or claiming a joint simultaneous reference interval.',
   inference:'Paired 512 independent 32-trial block means. Two-sided Student-t intervals, Bonferroni family sizes separately: 19 move gaps, 2 policy-gap effects, 4 candidate-policy effects, 28 absolute EVs. No significant/unresolved distinction based only on point-estimate ranking.'},
  method:'Fixed 16,384 full-game trials per retained candidate/policy. Corrected normal 2-ply checker/2-ply cube on all 24 candidates from six remaining replies plus opening 21. Focused 41$-44 additionally uses the matched buggy-normal 2-ply control and corrected large-filter 3-ply checker, each for both retained candidates. Shared dice across candidates/policies within each position/batch, new seeds disjoint from every preceding planned run and diagnostic. No fixed-turn cutoff, late weakening, dice rotation, optional stopping, interim equity inspection, reference correction or pooling with old results. Same 1-ply variance-control depth; actual values depend on the resulting policy trajectory. Exact two-sided bearoff remains eligible. Legal Jacoby/beaver/raccoon offer branches and cube cap 1024 use prior validated research rules; future cube backups remain GNUbg approximations. Counterfactual branches share checker lookahead under the original cube context. Clear both caches before each 32-trial batch. The two executables differ only in the final mixed-depth sort correction. All 20 shards must use the same hash-bound validated Linux ARM64 binaries/assets. Fixed sample size may leave small ranking or ±.005 questions unresolved. This selected seven-position cohort does not establish all-opening/reply accuracy.'};
 return{signature:hash(JSON.stringify(unsigned)),...unsigned};
}
export function jobsFor(p,shard=null){const jobs=[];for(let batch=0;batch<p.trials/p.batchSize;batch++)if(shard===null||batch%p.shards===shard)for(const d of p.plan)for(const policy of p.policies)if(policy.caseIds.includes(d.id))for(const c of d.candidates)jobs.push({key:[d.id,policy.id,batch,c.candidateId].join('|'),id:d.id,policy:policy.id,runtime:policy.runtime,candidateId:c.candidateId,role:c.role,board:c.board,batch,seed:seedAt(d,batch),original:c.original,after:c.after});return jobs;}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const runtime=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2])):null;
 process.stdout.write(JSON.stringify(createPlan(runtime),null,2)+'\n');
}
