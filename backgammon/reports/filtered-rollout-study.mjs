// SPDX-License-Identifier: GPL-3.0-or-later
import {el} from '../ui/shell.mjs';

export async function renderFilteredRolloutStudy(target,{json,table,link,downloads,failed}){
 try{
  const r=await json('../data/filtered-rollout-v1-comparison.json');
  if(r.schema!==1||r.id!=='filtered-rollout-v1')throw Error('Incompatible corrected-checker study');
  const plan=()=>link('Fixed positions, policies and seeds','../docs/filtered-rollout-v1-inputs.json');
  if(!r.complete){
   target.append(el('p',{class:'notice'},`${r.status||'Preflight validation'}. The fixed study plans 458,752 full-game trials across seven positions and 28 candidate/policy combinations. Results will appear after all 14,336 batches complete and validate; no interim equities are published.`),
    downloads(plan(),...(r.executionUrl?[link('Experiment progress',r.executionUrl)]:[])));
   return;
  }
  const cells=r.rows?.flatMap(row=>row.policies)||[];
  if(r.records!==14336||r.totalTrials!==458752||r.trialsPerMovePolicy!==16384||r.rows.length!==7||
   cells.flatMap(p=>p.candidates).length!==28||cells.flatMap(p=>p.gaps).length!==19||
   r.effects?.length!==2||r.candidateEffects?.length!==4||r.equityTolerance!==.005)
   throw Error('Incomplete corrected-checker fixed sample');
  const number=n=>(n>=0?'+':'')+n.toFixed(5);
  const interval=value=>`${number(value.familywise95.lower)} to ${number(value.familywise95.upper)}`;
  const yes=value=>value?'Yes':'No';
  const name=row=>{
   if(row.kind==='opening')return `Opening ${row.roll}`;
   const match=new URL(row.source).pathname.match(/Replies_to_(\d{2})([A-Z$])\.html/);
   return match?`${match[1]} ${{D:'down','$':'slot',P:'point',S:'split'}[match[2]]||match[2]} → ${row.roll}`:row.id;
  };
  const policyLabels=Object.fromEntries(cells.map(policy=>[policy.id,policy.label]));
  const policyName=id=>policyLabels[id]||id;
  const move=(policy,id)=>policy.candidates.find(candidate=>candidate.candidateId===id)?.move||id;
  const comparisonName=(row,policy,detail)=>el('span',{},name(row),el('small',{style:'display:block;font-size:12px'},policy.label),detail?el('small',{style:'display:block;font-size:12px'},detail):null);
  const gapVerdict={unresolved:'Unresolved','XG-choice-ahead':'XG move supported','alternative-ahead':'Alternative supported'};
  const conclusion=policy=>policy.gaps.some(gap=>gap.direction==='alternative-ahead')?'Alternative supported':
   policy.gaps.every(gap=>gap.direction==='XG-choice-ahead')?'XG move supported':'Unresolved';
  const effectVerdict=value=>value.familywise95.lower>0?'Positive shift supported':value.familywise95.upper<0?'Negative shift supported':'Unresolved';
  const credit=c=>el('span',{},`${number(c.referenceEquity)}${Number.isFinite(c.referenceConfidenceHalfWidth)?` ± ${c.referenceConfidenceHalfWidth.toFixed(4)}`:' · margin not published'}`,
   el('small',{style:'display:block;font-size:12px'},link(`XG · ${c.referenceCredit.author}`,c.referenceCredit.source)),
   el('small',{style:'display:block;font-size:12px'},`${c.referenceCredit.date} · ${c.referenceCredit.engine}`),
   el('small',{style:'display:block;font-size:12px'},`${c.referenceCredit.method}${c.referenceCredit.trials?` · ${c.referenceCredit.trials.toLocaleString('en-US')} trials`:''}`));
  target.append(el('p',{},'The complete fixed sample contains 458,752 games: 16,384 per candidate/policy. Corrected 2-ply checker play covers opening 21 and six remaining replies; the 4–4 reply after the 4–1 slot also has a matched old-selector control and corrected 3-ply checker arm. Cube search stays at 2 ply with the matched Jacoby, beaver and raccoon rules. No historical trials are pooled.'),
   el('p',{class:'notice'},'A sampled leader is a point estimate. Statistical support requires the paired interval to exclude zero; an unresolved interval does not prove agreement or sampling noise. This selected seven-position study does not establish accuracy for all openings and replies.'),
   table(['Position / policy','Sampled leader','Leader matches XG','Paired-interval conclusion'],r.rows.flatMap(row=>row.policies.map(policy=>[
    comparisonName(row,policy),move(policy,policy.sampledLeader),yes(policy.sampledLeaderAgrees),conclusion(policy)])),
    'Sampled move agreement and statistical support are separate'),
   table(['Position / policy / alternative','XG minus alternative','Published XG gap','Simultaneous 95% interval','Conclusion'],r.rows.flatMap(row=>row.policies.flatMap(policy=>policy.gaps.map(gap=>[
    comparisonName(row,policy,move(policy,gap.alternativeCandidateId)),number(gap.difference),number(gap.referenceGap),interval(gap),gapVerdict[gap.direction]]))),
    '19 paired move-gap comparisons; positive values favor the published XG choice'),
   el('p',{},'The mean-within-tolerance column compares only point estimates. The interval column asks whether the entire simultaneous interval lies within ±0.005 of the printed XG estimate. Published XG margins remain visible; these are not joint intervals for uncertainty in both engines.'),
   table(['Position / policy / move','GNUbg EV','Published XG EV','Difference','Simultaneous 95% difference interval','Mean within ±0.005','Interval within ±0.005'],r.rows.flatMap(row=>row.policies.flatMap(policy=>policy.candidates.map(candidate=>[
    comparisonName(row,policy,candidate.move),el('span',{},number(candidate.equity),el('small',{style:'display:block;font-size:12px'},`Block SE ${candidate.standardError.toFixed(5)}`)),credit(candidate),number(candidate.referenceDifference),interval(candidate.absoluteComparison),yes(candidate.withinTolerance),yes(candidate.intervalWithinTolerance)]))),
    '28 absolute EV comparisons; means and interval containment use distinct criteria'),
   table(['Change at 41 slot → 44','Change in paired move gap','Simultaneous 95% interval','Conclusion'],r.effects.map(effect=>[
    `${policyName(effect.before)} → ${policyName(effect.after)}`,number(effect.difference),interval(effect),effectVerdict(effect)]),
    'Two paired policy effects on the XG-minus-alternative move gap'),
   table(['Move / policy change','Change in EV','Simultaneous 95% interval','Conclusion'],r.candidateEffects.map(effect=>[
    el('span',{},effect.move,el('small',{style:'display:block;font-size:12px'},`${policyName(effect.before)} → ${policyName(effect.after)}`)),number(effect.difference),interval(effect),effectVerdict(effect)]),
    'Four paired candidate-policy effects; an EV shift alone is not proof of better play'),
   el('p',{},'Intervals use paired independent 32-game block means and separate simultaneous 95% families: 19 move gaps, two policy-gap effects, four candidate effects and 28 absolute EVs. They describe sampling under the executed policies, not model error. Small ranking or ±0.005 questions can remain unresolved.'),
   downloads(plan(),link('Complete estimates and intervals','../docs/filtered-rollout-v1-comparison.json'),link('Raw paired batches (gzip)','../docs/filtered-rollout-v1-batches.jsonl.gz'),link('Validated execution records','../docs/filtered-rollout-v1-execution.json'),...(r.executionUrl?[link('Completed experiment',r.executionUrl)]:[])));
 }catch(error){failed(target,error);}
}
