// SPDX-License-Identifier: GPL-3.0-or-later
// Shared native scoring worker for reproducible book generation.
module.exports=`
import create from '/backgammon/engine/vendor/simd/gnubg-core-module.js';
import {createEvaluator} from '/backgammon/engine/evaluate.mjs';
import {legalTurns,boardKey} from '/backgammon/core/rules.mjs';
import {toXGID} from '/backgammon/core/xgid.mjs';
const module=await create({locateFile:p=>p.endsWith('.data')?'/backgammon/engine/vendor/'+p:'/backgammon/engine/vendor/simd/'+p});
const engine=createEvaluator(module),score=module.cwrap('bg_score','number',['string','string','number','number']);
postMessage({ready:true});
onmessage=({data:{state,opening}})=>{try{
 const start=performance.now(),two=engine.analyze(state,'deep'),turns=legalTurns(state);
 // Every opening is scored at 3 ply. Replies keep >=10, plus every 2-ply
 // candidate within .080 (no count cap); every retained candidate gets 3 ply.
 const selected=two.candidates.filter((c,i)=>opening||i<10||two.candidates[0].equity-c.equity<=.080);
 const rows=selected.map(c=>{const t=turns.find(t=>t.key===c.key),p=score(toXGID(state,{engine:true}),toXGID({...t.state,dice:[],phase:'roll'},{engine:true}),3,0);
  if(!p)throw Error('Empty GNUbg evaluation');let v;try{v=JSON.parse(module.UTF8ToString(p));}finally{module._free(p);}
  if(v.error||!Number.isFinite(v.equity)||v.probabilities.some(x=>!Number.isFinite(x)))throw Error('Invalid GNUbg evaluation');
  return {steps:c.steps,equity:v.equity,cubeless:v.cubeless,probabilities:v.probabilities};
 }).sort((a,b)=>b.equity-a.equity);
 postMessage({rows,total:turns.length,elapsedMs:performance.now()-start});
}catch(e){postMessage({error:e.message});}};`;
