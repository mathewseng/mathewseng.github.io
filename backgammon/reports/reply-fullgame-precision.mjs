// SPDX-License-Identifier: GPL-3.0-or-later
import {el} from '../ui/shell.mjs';
export async function renderReplyPrecision(target,{json,table,link,downloads,failed}){
 try{
  const report=await json('../data/reply-fullgame-precision-comparison.json');
  const method='All 20 retained moves in the six residual reply positions receive 32,768 fresh full-game trials each, with 2-ply checker and cube policies throughout. There is no five-turn cutoff, pooling with earlier trials or optional stopping. Shared dice support paired comparisons.';
  target.append(el('p',{},method));
  if(!report.complete){
   target.append(el('p',{class:'notice'},'Results have not been published yet. The fixed plan contains 655,360 trials in 20,480 saved 32-trial batches; alternatives share 1,024 independent blocks per position. Interim equities are not used to change sample size or select which positions to publish.'),
    downloads(link('Fixed positions, alternatives and seeds','../docs/reply-fullgame-precision-inputs.json'),link('Study method','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/REPLY-FULLGAME-PRECISION.md')));
   return;
  }
  if(report.records!==20480||report.totalTrials!==655360||report.rows.length!==6)throw Error('Incomplete fixed sample');
  const format=n=>(n>=0?'+':'')+n.toFixed(5),verdict={'persistent-policy-disagreement':'Persistent policy disagreement','XG-choice-supported':'XG choice supported',unresolved:'Unresolved'};
  const positionName=r=>{
   const m=new URL(r.source).pathname.match(/Replies_to_(\d{2})([A-Z$])\.html/);
   return m?`${m[1]} ${{D:'down','$':'slot',P:'point',S:'split'}[m[2]]||m[2]} → ${r.roll}`:r.id;
  };
  target.append(el('p',{},`${report.conclusions['persistent-policy-disagreement']} persistent policy disagreements, ${report.conclusions['XG-choice-supported']} XG choices supported, and ${report.conclusions.unresolved} unresolved positions. ${report.absoluteEV.withinTolerance}/20 candidate EVs are within 0.005 of the published XG values.`),
   el('p',{},'Conclusions compare XG’s move against every retained alternative using a simultaneous 95% family of 14 paired Student-t intervals. An interval crossing zero is unresolved; it does not establish equivalence or prove that the earlier difference was noise. The six historical fixed pairs form a separate confidence family.'),
   table(['Position','Sampled leader','XG move','Conclusion'],report.rows.map(r=>{
    const p=r.policies['full-strong'];return[link(positionName(r),r.source),p.bestMove,r.xgMove,verdict[r.conclusion]];
   }),'All six positions are reported, regardless of their winning moves'),
   table(['Position / alternative','XG minus alternative','Simultaneous 95% interval'],report.rows.flatMap(r=>r.policies['full-strong'].retainedReferenceGaps.map(g=>[`${positionName(r)} · ${g.move}`,format(g.difference),`${format(g.familywise95.lower)} to ${format(g.familywise95.upper)}`])),'Paired gaps to all retained alternatives; positive favors XG’s move'),
   table(['Position / move','GNUbg EV','Published XG EV','Difference','Within 0.005'],report.rows.flatMap(r=>r.policies['full-strong'].candidates.map(c=>[`${positionName(r)} · ${c.move}`,format(c.equity),el('span',{},format(c.referenceEquity),el('small',{style:'display:block;font-size:12px'},`XG · ${c.referenceCredit.author}`)),format(c.referenceDifference),c.withinTolerance?'Yes':'No'])),'Absolute EV distances are descriptive, not joint equivalence tests'),
   el('p',{},'Persistent differences identify a disagreement under this continuation policy. They do not isolate neural weights from checker decisions, cube decisions, move filtering, rule differences or reference uncertainty. XG enables beavers; this experiment disables them. These are historical published XG results, not fresh XG engine runs. The Openings page’s direct XG imports are separate from this experiment.'),
   el('p',{},link('Follow-up: matched XG cube rules and stronger checker policies for 4–4 after the 4–1 slot','#cube-policy-study')),
   downloads(link('All results and intervals','../docs/reply-fullgame-precision-comparison.json'),link('Fixed plan and seeds','../docs/reply-fullgame-precision-inputs.json'),link('Raw paired batches (gzip)','../docs/reply-fullgame-precision-batches.jsonl.gz'),link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/REPLY-FULLGAME-PRECISION.md')));
 }catch(error){failed(target,error);}
}
