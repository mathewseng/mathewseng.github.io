// Evaluate stopping choices using measured, cache-reusing stage traces.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chooseSearchDecision, forecastNext, SEARCH_POLICY_VERSION } from '../engine/search-policy.mjs';
if (SEARCH_POLICY_VERSION !== 'gap-time-v1') throw new Error('Historical one-second replay: run this script from revision f344694. Current Auto uses minimum-three-v2.');
const traces = JSON.parse(fs.readFileSync(new URL('../docs/search-policy-traces.json',import.meta.url)));
const analysis = JSON.parse(fs.readFileSync(new URL('../docs/search-policy-analysis.json',import.meta.url)));
const corpus = JSON.parse(fs.readFileSync(new URL('../data/accuracy-reference.json',import.meta.url)));
const cases = new Map(traces.cases.map(c=>[c.id,c]));
const rows=[];
function replay(sample,state,policy) {
  const evaluations=[];let elapsed=0;
  for(const level of sample.levels){
    if(evaluations.length && elapsed+level.wallMs>1000) return {result:evaluations.at(-1),elapsedMs:1000,reason:'time-budget'};
    elapsed+=level.wallMs;
    const result={...level,type:'checker',stageMs:level.wallMs};evaluations.push(result);
    if(elapsed>=1000)return {result,elapsedMs:elapsed,reason:'time-budget'};
    if(level.plies===4)return {result,elapsedMs:elapsed,reason:'maximum-depth'};
    if(policy){const decision=chooseSearchDecision(state,evaluations,elapsed,1000);if(decision.reason!=='searching')return {result,elapsedMs:elapsed,...decision};}
  }
  assert(sample.censored,'Incomplete trace without a bound');
  return {result:evaluations.at(-1),elapsedMs:1000,reason:'time-budget'};
}
for(const sample of traces.samples){
  const state=cases.get(sample.id).state,old=replay(sample,state,false),now=replay(sample,state,true);
  const selected=now.result.candidates[0],baseline=old.result.candidates[0];
  const chosenAtBaseline=old.result.candidates.find(c=>c.key===selected.key);
  assert(chosenAtBaseline,'Retained earlier winner missing from baseline comparison');
  const split=parseInt(createHash('sha256').update('bg-search-policy-v1:'+sample.index).digest('hex').slice(0,8),16)%5===0?'test':'train';
  const ref=sample.context==='cubeless'?corpus.items[sample.index].reference:null;
  const oldRef=ref?.find(c=>c.key===baseline.key),newRef=ref?.find(c=>c.key===selected.key);
  rows.push({id:sample.id,index:sample.index,context:sample.context,topic:sample.topic,split,
    baselinePlies:old.result.plies,plies:now.result.plies,baselineMs:old.elapsedMs,elapsedMs:now.elapsedMs,
    reason:now.reason,lead:now.lead,forecast:now.forecast,
    changed:selected.key!==baseline.key,foregoneGain:baseline.equity-chosenAtBaseline.equity,
    referenceLossDifference:oldRef&&newRef?newRef.loss-oldRef.loss:null,
    best:selected.key,baselineBest:baseline.key});
}
const summarize=rs=>({n:rs.length,meanBaselineMs:rs.reduce((s,r)=>s+r.baselineMs,0)/rs.length,
  meanMs:rs.reduce((s,r)=>s+r.elapsedMs,0)/rs.length,
  reasons:Object.fromEntries([...new Set(rs.map(r=>r.reason))].map(k=>[k,rs.filter(r=>r.reason===k).length])),
  shallower:rs.filter(r=>r.plies<r.baselinePlies).length,changed:rs.filter(r=>r.changed).length,
  missedAbove005:rs.filter(r=>r.foregoneGain>.005).length,missedAbove020:rs.filter(r=>r.foregoneGain>.020).length,
  worstForegoneGain:Math.max(0,...rs.map(r=>r.foregoneGain)),
  meanForegoneGain:rs.reduce((s,r)=>s+Math.max(0,r.foregoneGain),0)/rs.length,
  meanReferenceDifference:rs.filter(r=>r.referenceLossDifference!=null).reduce((s,r)=>s+r.referenceLossDifference,0)/rs.filter(r=>r.referenceLossDifference!=null).length});
const report={method:'Replay of measured progressive search at a 1000 ms deadline. Evaluation wall times include worker round trips; scheduling noise means a boundary case may complete differently live. Foregone gain compares both chosen boards at the baseline deepest completed depth, not perfect play. Reference differences only use covered cubeless rows. Test rows were held out from timing-model fitting/selection; the stopping heuristic also has prior exploratory evidence from the original 300-position dataset.',
  all:summarize(rows),test:summarize(rows.filter(r=>r.split==='test')),
  contexts:Object.fromEntries(['cubeless','money','match'].map(c=>[c,summarize(rows.filter(r=>r.context===c))])),rows};
// Independent JS parity check against the Python model's reviewed inputs.
for(const row of analysis.timingRows){
  const sample=traces.samples.find(s=>s.id===row.id),state=cases.get(row.id).state;
  const evals=sample.levels.filter(l=>l.plies<=row.depth).map(l=>({...l,stageMs:l.wallMs}));
  const prediction=forecastNext(state,evals);
  assert.equal(prediction.candidates,row.nextCount);
  assert(Math.abs(prediction.estimateMs-row.predictedMs)<1e-7*Math.max(1,row.predictedMs),'Python/JS forecast disagreement');
}
fs.writeFileSync(new URL('../docs/search-policy-replay.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({all:report.all,test:report.test,contexts:report.contexts},null,2));
