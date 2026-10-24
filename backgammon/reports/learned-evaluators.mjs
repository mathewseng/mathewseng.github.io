// SPDX-License-Identifier: GPL-3.0-or-later
import {el} from '../ui/shell.mjs';
export async function renderLearnedEvaluators(target,{json,table,link,downloads,failed}) {
 try {
  const r=await json('../data/learned-evaluator-comparison.json');
  if(r.schema!==1||r.id!=='learned-evaluators-v1'||r.datasets.some(d=>d.summary.positions!==729||d.summary.referenceCandidates!==2584))throw Error('Incomplete learned-evaluator comparison');
  const pure=r.datasets.find(d=>d.id==='puretd-wide1'),s=pure.summary;
  target.append(el('p',{},`Independent PureTD wide one-ply search chooses the published XG move in ${s.matches} of 729 opening/reply positions. Its mean absolute difference across all 2,584 published candidate values is ${s.meanAbsoluteDifference.toFixed(5)} equity. Every legal root move is generated and scored; XG values are used only for comparison afterward.`),
   el('p',{class:'notice'},`${s.withinTolerance} of 2,584 values are within ±0.005; ${2584-s.withinTolerance} are outside. An average below 0.005 does not meet the target for every opening and reply. These selected opening positions do not establish general playing strength.`),
   table(['Independent engine / search','XG choices / 729','Mean XG loss of chosen move','Mean absolute EV difference','Values within ±0.005 / 2,584'],r.datasets.map(d=>[
    d.label,String(d.summary.matches),d.summary.meanReferenceLoss.toFixed(5),d.summary.meanAbsoluteDifference.toFixed(5),String(d.summary.withinTolerance)]),
    'Complete published opening corpus; smaller errors and more choices in agreement are preferable'),
   el('h3',{},'Compared with the existing deeper book'),
   table(['Same 666 positions / 1,494 candidate EVs','XG choices / 666','Mean absolute EV difference','Values within ±0.005 / 1,494'],r.matchedBook.rows.map(d=>[
    d.label,String(d.matches),d.meanAbsoluteDifference.toFixed(5),String(d.withinTolerance)]),
    'Matched coverage of the historical book; GNUbg uses its recorded finalist filter, PureTD scores all legal roots'),
   el('p',{},'Rules matter: XG’s published references use Jacoby and immediate redoubles. PureTD supports Jacoby with beavers/raccoons off. GNUbg rows state whether beavers are enabled; Sage uses beavers, without raccoons. These are deterministic model/tree estimates against finite XG rollouts or XGRoller++ estimates, with no claim that printed XG values are exact. Sage counts the initial move as a ply; GNUbg and PureTD count subsequent lookahead turns.'),
   el('h3',{},'The 4–4 reply after the 4–1 slot still needs work'),
   table(['Move','Published XG','PureTD wide 1 ply','Difference'],pure.focus.candidates.map(c=>[
    c.move,c.referenceEquity.toFixed(4),c.equity.toFixed(4),(c.difference>=0?'+':'')+c.difference.toFixed(4)]),
    'PureTD wide chooses the XG move here, but the leading move’s EV still exceeds the requested tolerance'),
   el('p',{},'Use Solver → Analysis settings → PureTD money for the smaller model or PureTD wide for the larger model with closer opening EVs. Both report cubeful equity only and reject unsupported rule contexts. GNUbg remains the default and provides rollouts, cube decisions and match analysis. No reference book or fitted equity adjustment is used by either PureTD model.'),
   downloads(link('Open Solver','../solver/'),link('Method, source pins and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/LEARNED-EVALUATORS.md'),
    link('Historical book comparison','../docs/deep-book-comparison.json'),
    link('All position/candidate comparisons','../docs/learned-evaluator-comparison.json'),link('Input and raw-result manifest','../docs/learned-evaluator-inputs.json'),
    link('Published XG source',pure.focus.url),link('PureTD source','https://github.com/alexstrehl/backgammon-ai-engine'),link('Sage source','https://github.com/markbgsage/bgsage')));
 }catch(error){failed(target,error);}
}
