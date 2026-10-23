// SPDX-License-Identifier: GPL-3.0-or-later
import {assertState,boardKey,commitTurn,notation,positionKey,initialState} from '../core/rules.mjs';
import {bookBoardKey,bookContext,bookEligible} from './opening-book.mjs';
import {RolloutOpeningBook} from './rollout-book.mjs';
export const XG_BOOK_ID='xg-public-opening-3.70-v1';
export const XG_BOOK_ENGINE='eXtreme Gammon · published opening book 3.70 (2013)';
const validHeader=index=>index?.schema===1&&index.id===XG_BOOK_ID&&index.engine===XG_BOOK_ENGINE&&index.context?.matchLength===0&&index.context.jacoby===true&&index.context.beavers===true&&index.context.immediateRedoubles===2&&index.context.cube===1&&index.context.cubeOwner===null;
const START=bookBoardKey(initialState({matchLength:0}));
const URL_INDEX=new URL('./opening-book-data/xg/index.json',import.meta.url);
export const referenceContext=state=>state?.rules?.immediateRedoubles===2&&state.cube?.value===1&&bookContext({...state,rules:{...state.rules,immediateRedoubles:0}});
export const referenceEligible=(state,options)=>referenceContext(state)&&bookEligible({...state,rules:{...state.rules,immediateRedoubles:0}},options);
export function referenceResult(state,entry,index,preset='auto',submitted=null){
 assertState(state);
 if(!referenceContext(state)||state.phase!=='move'||!validHeader(index)||!Array.isArray(entry?.moves)||!entry.moves.length||entry.moves.length>2000||!Number.isInteger(entry.total)||entry.total<entry.moves.length||!/^https:\/\/www\.extremegammon\.com\/OB\/[A-Za-z0-9_$.-]+\.html$/.test(entry.source))throw Error('Invalid XG reference entry');
 const seen=new Set();
 const candidates=entry.moves.map(m=>{
  if(!m.credit||typeof m.credit.author!=='string'||!m.credit.author.trim()||m.credit.author.length>120||typeof m.credit.date!=='string'||typeof m.credit.engine!=='string')throw Error('Missing reference contributor');
  if(!['rollout','XGRoller++'].includes(m.method)||!Number.isInteger(m.rank)||m.rank<1||!(m.trials===null||Number.isInteger(m.trials)&&m.trials>0)||!Number.isFinite(m.equity)||!Array.isArray(m.probabilities)||m.probabilities.length!==5||m.probabilities.some(p=>!Number.isFinite(p)||p<0||p>1)||!(m.confidenceHalfWidth===null||Number.isFinite(m.confidenceHalfWidth)&&m.confidenceHalfWidth>=0))throw Error('Invalid reference values');
  const mirror=p=>typeof p==='number'&&state.turn?23-p:p;
  const steps=m.steps.map(([from,to,die])=>({from:mirror(from),to:mirror(to),die}));
  let after;try{after=commitTurn(state,steps);}catch{throw Error('Illegal reference move');}
  const key=boardKey(after);if(seen.has(key))throw Error('Duplicate reference move');seen.add(key);
  const [w,g,b,lg,lb]=m.probabilities;
  return {steps,key,notation:notation(steps,state.turn),equity:m.equity,probabilities:[...m.probabilities],cubeless:2*w-1+g+b-lg-lb,cubelessSource:'derived-from-rounded-reference-probabilities',mwc:null,
   referenceHalfWidth:m.confidenceHalfWidth,referenceMethod:m.method,referenceTrials:m.trials,referencePolicy:m.policy,referenceRank:m.rank,referenceCredit:{...m.credit}};
 }).sort((a,b)=>b.equity-a.equity||a.referenceRank-b.referenceRank);
 const actualKey=submitted?boardKey(commitTurn(state,submitted)):null,actual=actualKey?candidates.find(c=>c.key===actualKey):null;
 if(actualKey&&!actual)return null;
 return {engine:index.engine,settings:{name:'XG published reference',plies:null,requestedPreset:preset,cubeful:true,noise:0},positionKey:positionKey(state),status:'complete',perspective:state.turn,units:'current-cube-points',type:'checker',method:'reference',
 candidates,actual,error:actual?Math.max(0,candidates[0].equity-actual.equity):null,elapsedMs:0,cached:true,
 reference:{url:entry.source,title:entry.title,sourceIssue:entry.sourceIssue,total:entry.total,listed:candidates.length,rules:'Money play · Jacoby on · beavers on · raccoons on'},
 book:{id:index.id,source:'published-xg-reference',stage:bookBoardKey(state)===START?'opening':'reply',openingWindow:.040,builtAt:index.retrievedAt}};
}
export class XGReferenceBook{
 constructor({fetcher=(...args)=>fetch(...args)}={}){this.fetcher=fetcher;this.index=null;this.pending=null;}
 async load(){
  if(this.index)return this.index;if(this.pending)return this.pending;
  this.pending=Promise.resolve().then(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
   try{const r=await this.fetcher(URL_INDEX,{signal:controller.signal});if(!r.ok)throw Error('Reference unavailable');const text=await r.text();if(text.length>2000000)throw Error('Oversized reference');const index=JSON.parse(text);if(!validHeader(index)||index.positions!==729||!index.entries)throw Error('Incompatible reference');return this.index=index;
   }catch{return null;}finally{clearTimeout(timer);this.pending=null;}});return this.pending;
 }
 async lookup(state,{preset='auto',submitted=null}={}){if(!referenceContext(state))return null;const index=await this.load(),roll=[...state.dice].sort((a,b)=>b-a).join(''),entry=index?.entries[bookBoardKey(state)]?.[roll];if(!entry)return null;try{return referenceResult(state,entry,index,preset,submitted);}catch{return null;}}
}
// Live analysis uses references only under their actual rule context. An
// unlisted submitted move falls back as a whole comparison, never mixed EVs.
export class PreferredOpeningBook{
 constructor({fetcher=(...args)=>fetch(...args)}={}){this.reference=new XGReferenceBook({fetcher});this.fallback=new RolloutOpeningBook({fetcher});}
 eligible(state,options){return referenceEligible(state,options)||bookEligible(state,options);}
 mayHave(state){return referenceContext(state)||this.fallback.mayHave(state);}
 async lookup(state,options){if(referenceEligible(state,options)){const result=await this.reference.lookup(state,options);if(result)return result;return null;}return this.fallback.lookup(state,options);}
 prepare(state){return referenceContext(state)?this.reference.load():this.fallback.prepare(state);}
}
