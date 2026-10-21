// SPDX-License-Identifier: GPL-3.0-or-later
import {el,field,select} from '../ui/shell.mjs';
export async function renderFullgamePrecision(target,{json,table,link,measured,downloads,failed}){
 try{
  const [report,confirmation,book]=await Promise.all([json('../data/fullgame-precision-comparison.json'),json('../data/opening-fullgame-precision-comparison.json'),json('../data/rollout-book-validation.json')]);
  if(!report.complete||report.records!==13440||report.trialsPerMovePolicy!==4096||report.rows.length!==15||!confirmation.complete||confirmation.records!==8192||confirmation.trialsPerMovePolicy!==32768)throw Error('The fixed precision studies are incomplete.');
  const number=v=>`${v>=0?'+':''}${v.toFixed(5)}`,interval=g=>`[${number(g.familywise95.lower)}, ${number(g.familywise95.upper)}]`;
  const names={short:'Five-turn baseline','full-matched':'Full game · same players','full-strong':'Full game · stronger checker'};
  const effects={cutoff:'Remove the five-turn cutoff',checker:'Strengthen late checker play'},directions={'toward-XG':'Shift toward XG','away-from-XG':'Shift away from XG',unresolved:'Unresolved shift'};
  const opening=confirmation.rows[0],strong=opening.policies['full-strong'],retained=strong.retainedReferenceGaps;
  if(retained?.length!==3||strong.candidates.length!==4)throw Error('Opening alternatives are incomplete.');
  const openingResolved=retained.every(g=>g.familywise95.lower>0);
  const openingCauses=Object.entries(opening.effects).filter(([,e])=>e.familywise95.upper<0).map(([id])=>id==='cutoff'?'removing the five-turn cutoff':'maintaining 2-ply checker play');
  const base=report.summaries.short,next=report.summaries['full-strong'];
  const replies=report.rows.filter(r=>r.kind==='reply'),replyMatches=replies.filter(r=>r.policies['full-strong'].agrees).length;
  const cohortAccepted=next.meanAbsoluteGapError<base.meanAbsoluteGapError&&next.pairMeanFavorsXG>=base.pairMeanFavorsXG&&Object.values(report.cohortEffects).some(e=>e.familywise95.upper<0);
  const openingAccepted=retained.every(g=>g.familywise95.lower>0)&&Math.abs(strong.gap.difference-opening.referenceGap)<Math.abs(opening.policies.short.gap.difference-opening.referenceGap)&&Object.values(opening.effects).some(e=>e.familywise95.upper<0);
  const adopted=book.fullgame?.experimentSignature===report.signature;
  const outcome=adopted?`The published book adopted Full/strong for ${book.fullgame.positions} positions and ${book.fullgame.candidates} retained moves. Opening 2–1 uses all four 32,768-trial estimates; ${book.fullgame.positions-1} reply entries were updated with 4,096 trials. This cohort update does not imply every individual preference is resolved.`:
   cohortAccepted||openingAccepted?'The study meets a recorded publication rule, but the published-book validation in this snapshot does not yet show its adoption.':'Neither recorded publication rule qualifies. The book retains its earlier estimates; these data do not justify claiming an accuracy fix.';
  let selected='cutoff';const detail=el('div',{});
  const draw=()=>detail.replaceChildren(table(['Position','Previous choice / XG choice','Gap before','Gap after','Change in gap','Simultaneous 95% interval','Effect','Full/strong sampled leader'],report.rows.map(r=>{
   const e=r.effects[selected],name=r.kind==='opening'?`Opening ${r.roll}`:`${new URL(r.source).pathname.split('/').at(-1).replace('Replies_to_','After ').replace('.html','')} · ${r.roll}`;
   return [link(name,r.source),`${r.previousMove} / ${r.xgMove}`,number(r.policies[e.before].gap.difference),number(r.policies[e.after].gap.difference),number(e.difference),interval(e),directions[e.direction],r.policies['full-strong'].bestMove];
  }),'Precision cohort effects · negative changes shift the fixed-pair preference toward XG'));
  target.append(
   measured('Pinned GNUbg · independent precision studies',report.recordedAt),
   el('p',{},`${report.totalTrials.toLocaleString()} fresh trials across the original 15 positions, plus ${confirmation.totalTrials.toLocaleString()} independent opening-21 trials. The previous experiment failed its acceptance criteria and remains unchanged. These studies use new fixed samples and exclude every earlier seed; their results are not pooled with earlier estimates.`),
   el('p',{'data-publication-result':true},outcome),
   el('p',{},`Full/strong lowers the sampled mean absolute fixed-pair gap difference from XG by ${(100*(1-next.meanAbsoluteGapError/base.meanAbsoluteGapError)).toFixed(1)}%. ${replyMatches} of the ${replies.length} reply choices now match XG; ${replies.length-replyMatches} retain different sampled leaders. Individual reply preferences remain uncertain. The final column below shows every retained-set leader, including third-move alternatives that are not tested by the fixed-pair intervals.`),
   el('p',{},openingResolved?`Opening 2–1 resolves in favor of ${opening.xgMove} under Full/strong: it leads all three other retained moves under the planned simultaneous intervals. ${openingCauses.length?`The controlled opening effects support ${openingCauses.join(' and ')} as contributors to the change.`:'The separate cutoff and checker effects remain unresolved.'}`:'The independent opening comparison does not resolve the XG move against every retained alternative.'),
   table(['Policy','XG leads the fixed pair','Clear preference against XG','Clear preference for XG','Unresolved pairs','Mean absolute gap difference from XG'],Object.entries(names).map(([id,label])=>{
    const s=report.summaries[id];return [label,`${s.pairMeanFavorsXG} / 15`,s.classifications.persistent,s.classifications.reversed,s.classifications.unresolved,s.meanAbsoluteGapError.toFixed(5)];
   }),'Same 15 selected disagreements · 4,096 trials per move/policy · gap intervals form a 45-comparison family'),
   el('p',{},`Average effects on the fixed cohort: ${Object.entries(report.cohortEffects).map(([id,e])=>`${effects[id]}: ${number(e.difference)} ${interval(e)}`).join('; ')}. These two simultaneous intervals use 128 aggregate block means and equal position weights. They do not establish the effect at every position.`),
   table(['Opening 2–1 policy','Split equity','Slot equity','Split minus slot','Simultaneous 95% interval'],Object.entries(opening.policies).map(([id,p])=>[names[id],number(p.candidates.find(c=>c.role==='previous-choice').equity),number(p.candidates.find(c=>c.role==='xg-choice').equity),number(p.gap.difference),interval(p.gap)]),'Independent opening precision · 32,768 trials per move/policy · three policy-gap comparisons'),
   el('p',{},`Opening effects: cutoff ${number(opening.effects.cutoff.difference)} ${interval(opening.effects.cutoff)}; checker ${number(opening.effects.checker.difference)} ${interval(opening.effects.checker)}. These form a separate two-comparison family. Published XG split-minus-slot gap: ${number(opening.referenceGap)}. The Full/strong sampled leader is ${strong.bestMove}.`),
   table(['Opening move','Full/strong equity','Sampling SE','Published XG equity','XG choice minus this move','Simultaneous 95% interval'],[...strong.candidates].sort((a,b)=>b.equity-a.equity).map(c=>{
    const gap=retained.find(g=>g.board===c.board);return [c.move,number(c.equity),c.standardError.toFixed(5),number(c.referenceEquity),gap?number(gap.difference):'Reference move',gap?interval(gap):'—'];
   }),'All four retained opening alternatives · Full/strong · three paired reference-move contrasts'),
   field('Precision cohort effect',select(Object.entries(effects),selected,v=>{selected=v;draw();})),detail,
   el('p',{},'The cohort has separate simultaneous 95% families for 30 per-position effects, 45 policy gaps and two cohort-average effects. The opening study separately corrects its two effects, three policy gaps and three retained-move contrasts. These families do not jointly provide a single 95% guarantee. An interval crossing zero is unresolved, not proof of equality.'),
   el('p',{},'Full/matched removes only the five-turn cutoff; Full/strong additionally keeps 2-ply checker play throughout. Cube decisions remain 2-ply. The earlier Cube3 experiment did not establish a benefit, so this follow-up spends its trials on precision. Full games end at a pass, completion or an eligible bearoff database endpoint. Neural estimates still guide simulated play.'),
   el('p',{},'These are selected disagreements against historical published XG estimates, not an independent strength benchmark or fresh XG engine runs. XG enables beavers and our simulations disable them. Retained-candidate screening and reference uncertainty remain limitations.'),
   downloads(link('Precision cohort results','../docs/fullgame-precision-comparison.json'),link('Precision cohort plan','../docs/fullgame-precision-inputs.json'),link('Precision cohort batches (gzip)','../docs/fullgame-precision-batches.jsonl.gz'),link('Opening precision results','../docs/opening-fullgame-precision-comparison.json'),link('Opening precision plan','../docs/opening-fullgame-precision-inputs.json'),link('Opening precision batches (gzip)','../docs/opening-fullgame-precision-batches.jsonl.gz'),link('Recorded publication rules','../docs/fullgame-precision-promotion-plan.json'),link('Published-book validation','../docs/rollout-book-validation.json'),link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/FULLGAME-PRECISION.md')),
  );draw();
 }catch(error){failed(target,error);}
}
