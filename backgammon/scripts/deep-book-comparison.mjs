// SPDX-License-Identifier: GPL-3.0-or-later
// Compare exact resulting boards, not notation strings or different best moves.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fromXGID} from '../core/xgid.mjs';
import {boardKey,legalTurns} from '../core/rules.mjs';

export function canonicalState(xgid){
  const s=fromXGID(xgid);
  return s.turn===0?s:{...s,turn:0,points:[...s.points].reverse().map(n=>-n),bar:[...s.bar].reverse(),off:[...s.off].reverse()};
}
export function notationBoard(state,move){
  if(state.turn!==0)throw Error('Canonical player 0 required');
  const s=structuredClone(state);
  for(const token of move.trim().split(/\s+/)){
    const match=/^((?:bar|[1-9]|1\d|2[0-4])(?:\/(?:off|[1-9]|1\d|2[0-4])\*?)+)(?:\(([1-4])\))?$/.exec(token);
    if(!match)throw Error('Unsupported move token: '+token);
    const points=match[1].split('/'),count=Number(match[2]||1);
    for(let copy=0;copy<count;copy++)for(let i=1;i<points.length;i++){
      const from=points[i-1].replace('*',''),to=points[i].replace('*','');
      if(from==='bar'){if(!s.bar[0])throw Error('Empty bar');s.bar[0]--;}
      else {const p=Number(from)-1;if(!(s.points[p]>0))throw Error('Empty source: '+token);s.points[p]--;}
      if(to==='off')s.off[0]++;
      else {const p=Number(to)-1;if(s.points[p]<-1)throw Error('Blocked destination: '+token);
        if(s.points[p]===-1){s.points[p]=0;s.bar[1]++;}s.points[p]++;}
    }
  }
  return boardKey(s);
}
export function normalizeReference(reference){
  const decisions=[];
  for(const source of reference.sources)for(const position of source.positions){
    const state=canonicalState(position.normalizedXgid||position.xgid),legal=new Set(legalTurns(state).map(t=>t.key));
    if([...state.dice].sort((a,b)=>b-a).join('')!==position.title.slice(-2))throw Error('Source dice mismatch: '+position.title);
    const candidates=position.candidates.map(c=>({...c,board:notationBoard(state,c.move)}));
    for(const c of candidates)if(!legal.has(c.board))throw Error(`Illegal source move: ${position.title} ${c.move}`);
    if(new Set(candidates.map(c=>c.board)).size!==candidates.length)throw Error('Duplicate source move: '+position.title);
    decisions.push({title:position.title,url:source.url,sourceIssue:position.sourceIssue||null,board:boardKey(state),roll:[...state.dice].sort((a,b)=>b-a).join(''),
      beavers:!!state.rules.immediateRedoubles,candidates});
  }
  return decisions;
}
const stats=rows=>rows.length?{n:rows.length,meanAbsoluteDifference:rows.reduce((s,x)=>s+Math.abs(x),0)/rows.length,
  rootMeanSquareDifference:Math.sqrt(rows.reduce((s,x)=>s+x*x,0)/rows.length),meanSignedDifference:rows.reduce((s,x)=>s+x,0)/rows.length,
  maximumAbsoluteDifference:Math.max(...rows.map(Math.abs))}:null;
export function compareBook(result,reference){
  const refs=normalizeReference(reference),lookup=new Map(refs.map(r=>[`${r.board}|${r.roll}`,r]));
  const rows=[],missing=[];
  for(const [kind,decisions] of [['opening',result.openings],['reply',result.replies]])for(const d of decisions){
    const ref=lookup.get(`${d.board}|${d.roll}`);if(!ref){missing.push(d.id);continue;}
    const sameMoves=d.candidates.map(c=>({ours:c,xg:ref.candidates.find(x=>x.board===c.board)})).filter(p=>p.xg);
    const topReference=d.candidates.find(c=>c.board===ref.candidates[0].board);
    const common=sameMoves.filter(p=>p.ours.historical&&p.ours.fourPly&&p.ours.fivePly);
    const byDepth={};
    for(const [key,field] of [['3','historical'],['4','fourPly'],['5','fivePly']]){
      // Comparing selected move quality requires the full original 3/4-ply
      // ranking, supplied separately in packed screen rows when available.
      const candidates=(key==='5'?d.candidates:d.screenCandidates||d.candidates).filter(c=>c[field]);
      const best=[...candidates].sort((a,b)=>b[field].equity-a[field].equity)[0];
      const bestReference=ref.candidates.find(c=>c.board===best?.board);
      byDepth[key]={bestMove:best?.notation??null,agrees:best?.board===ref.candidates[0].board,
        selectedMoveReferenceLoss:bestReference?ref.candidates[0].equity-bestReference.equity:null,
        referenceBestDifference:topReference?.[field]?topReference[field].equity-ref.candidates[0].equity:null};
    }
    rows.push({id:d.id,kind,source:ref.url,sourcePosition:ref.title,sourceIssue:ref.sourceIssue,referenceBest:ref.candidates[0],byDepth,
      commonMoves:common.map(({ours,xg})=>({move:ours.notation,board:ours.board,xgEquity:xg.equity,referenceMethod:xg.method,
        confidenceHalfWidth:xg.confidenceHalfWidth,threePly:ours.historical.equity,fourPly:ours.fourPly.equity,fivePly:ours.fivePly.equity}))});
  }
  const summaries={};
  for(const kind of ['opening','reply','all']){
    const subset=rows.filter(r=>kind==='all'||r.kind===kind),common=subset.flatMap(r=>r.commonMoves);
    summaries[kind]={positions:subset.length,depths:Object.fromEntries([['3','threePly'],['4','fourPly'],['5','fivePly']].map(([depth,field])=>{
      const choice=subset.map(r=>r.byDepth[depth]),loss=choice.map(c=>c.selectedMoveReferenceLoss).filter(x=>x!==null);
      return [depth,{commonCandidateEV:stats(common.map(c=>c[field]-c.xgEquity)),referenceBestEV:stats(subset.map(r=>r.byDepth[depth].referenceBestDifference).filter(x=>x!==null)),
        bestMoveAgreement:choice.filter(c=>c.agrees).length,choiceLossCovered:loss.length,meanSelectedMoveReferenceLoss:loss.length?loss.reduce((a,b)=>a+b,0)/loss.length:null}];
    }))};
  }
  const covered=new Set([...result.openings,...result.replies].map(d=>`${d.board}|${d.roll}`));
  return {schema:1,book:result.id,recordedAt:new Date().toISOString(),referencePositions:refs.length,
    uncoveredReferencePositions:refs.filter(r=>!covered.has(`${r.board}|${r.roll}`)).map(r=>({title:r.title,url:r.url})),method:'Same final boards, same player perspective, current-cube units. EV differences use the same candidate cohort at every depth. Means are unweighted benchmark averages, not expected loss under natural dice frequencies. Selected-move loss is measured only where XG lists that move.',
    limitations:['XG reference enables beavers; GNU book disables them. These are discrepancies, not pure model errors.','Finite historical XG rollouts and XGRoller++ evaluations are approximate references.','Reply 5-ply candidates are screened; neither the tree search nor this sample proves optimal play.'],
    summaries,missingReferenceDecisions:missing,rows};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const result=JSON.parse(fs.readFileSync(process.argv[2]||path.join(family,'test-results/deep-book/result.json'),'utf8'));
  const reference=JSON.parse(fs.readFileSync(path.join(family,'docs/deep-book-xg-reference.json'),'utf8'));
  const report=compareBook(result,reference),destination=process.argv[3]||path.join(family,'docs/deep-book-comparison.json');
  report.contextAudit=JSON.parse(fs.readFileSync(path.join(family,'docs/deep-book-context-audit.json'),'utf8')).summary;
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summaries,null,2));
  if(!process.argv[3]){
    const {rows,...summary}=report;
    fs.writeFileSync(path.join(family,'data/deep-book-comparison.json'),JSON.stringify({...summary,coverage:result.coverage,sourceIssueCount:rows.filter(r=>r.sourceIssue).length},null,2)+'\n');
  }
}
