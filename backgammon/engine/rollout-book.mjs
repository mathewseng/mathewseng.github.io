// SPDX-License-Identifier: GPL-3.0-or-later
import {assertState,boardKey,commitTurn,legalPaths,notation,positionKey,initialState} from '../core/rules.mjs';
import {OpeningBook,bookBoardKey,bookContext,bookEligible} from './opening-book.mjs';
export const ROLLOUT_BOOK_ID='jacoby-short-deep-v1';
export const ROLLOUT_BOOK_ENGINE='gnubg-core/955555c69adebb1d7de23abc1018074158621168+bg7-native';
const URL_INDEX=new URL('./opening-book-data/rollout/index.json',import.meta.url);
const START=bookBoardKey(initialState({matchLength:0}));
const mirror=p=>typeof p==='number'?23-p:p;
export function rolloutBookResult(state,entry,index,preset,submitted=null){
 assertState(state);
 if(index?.schema!==1||index.id!==ROLLOUT_BOOK_ID||index.engine!==ROLLOUT_BOOK_ENGINE||
    !index.settings||index.settings.policyId!=='short-deep'||!['policy','name'].every(k=>typeof index.settings[k]==='string')||
    Object.entries({plies:2,checkerPlies:2,cubePlies:2,truncationPlies:5,lateAfterPlies:2,lateCheckerPlies:1,lateCubePlies:2}).some(([k,v])=>index.settings[k]!==v)||
    !bookContext(state)||state.phase!=='move'||!Array.isArray(entry?.rows)||entry.rows.length<1||entry.rows.length>2000||
    !Number.isInteger(entry.total)||entry.total<entry.rows.length||!Number.isInteger(entry.samples)||entry.samples<512||entry.samples>65536||entry.samples%32||
    !Array.isArray(entry.standardErrors)||entry.standardErrors.length!==entry.rows.length||
    !Number.isInteger(entry.seed)||entry.seed<0||entry.seed>0xffffffff)throw Error('Invalid rollout book entry.');
 const pathKey=steps=>JSON.stringify(steps.map(({from,to,die})=>[from,to,die]));
 const paths=new Map(legalPaths(state).map(p=>[pathKey(p.steps),p.state])),seen=new Set();
 const candidates=entry.rows.map((row,i)=>{
  if(!Array.isArray(row)||row.length!==8||!Array.isArray(row[0])||row[0].length>4||
     !row.slice(1).every(Number.isFinite)||row.slice(3).some(p=>p<0||p>1)||
     !Number.isFinite(entry.standardErrors[i])||entry.standardErrors[i]<0)throw Error('Invalid rollout book estimate.');
  const steps=row[0].map(([from,to,die])=>({from:state.turn?mirror(from):from,to:state.turn?mirror(to):to,die}));
  const after=paths.get(pathKey(steps));if(!after)throw Error('Illegal rollout book move.');
  const key=boardKey(after);if(seen.has(key))throw Error('Duplicate rollout book move.');seen.add(key);
  return {steps,key,notation:notation(steps,state.turn),equity:row[1],cubeless:row[2],probabilities:row.slice(3),
   mwc:null,standardError:entry.standardErrors[i],samples:entry.samples};
 }).sort((a,b)=>b.equity-a.equity);
 const actualKey=submitted?boardKey(commitTurn(state,submitted)):null,actual=actualKey?candidates.find(c=>c.key===actualKey):null;
 if(actualKey&&!actual)return null; // The fallback grades a complete comparison at its own method.
 return {engine:index.engine,settings:{...structuredClone(index.settings),requestedPreset:preset,cubeful:true,noise:0,trials:entry.samples,seed:entry.seed,varianceReduction:true,rotation:false},
  positionKey:positionKey(state),status:'complete',perspective:state.turn,units:'current-cube-points',type:'checker',method:'rollout',
  candidates,actual,error:actual?Math.max(0,candidates[0].equity-actual.equity):null,
  screening:entry.total>candidates.length?{plies:5,total:entry.total,finalists:candidates.length,policy:'Union of close three/four/five-ply candidates and the published XG leader.'}:null,
  uncertainty:'Approximate 95% sampling intervals; excludes endpoint/policy/model error and screening risk. Shared dice correlate alternatives; live gap display uses a conservative sum of standard errors.',
  elapsedMs:0,cached:true,book:{id:index.id,source:'precomputed-rollout',stage:bookBoardKey(state)===START?'opening':'reply',openingWindow:.040,builtAt:index.provenance.builtAt}};
}
export class RolloutOpeningBook{
 constructor({fetcher=(...args)=>fetch(...args),fallback=new OpeningBook({fetcher,preferDeep:true})}={}){
  this.fetcher=fetcher;this.fallback=fallback;this.index=null;this.pending=null;this.retryAt=0;
 }
 load(file){return this.fallback.load(file);}
 async rolloutIndex(){
  if(this.index)return this.index;if(this.pending)return this.pending;if(Date.now()<this.retryAt)return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);
  this.pending=Promise.resolve().then(async()=>{try{
   const response=await this.fetcher(URL_INDEX,{signal:controller.signal});if(!response.ok)throw Error('Missing rollout book');
   const text=await response.text();if(text.length>2_000_000)throw Error('Oversized rollout book');
   const index=JSON.parse(text);if(index.schema!==1||index.id!==ROLLOUT_BOOK_ID||index.engine!==ROLLOUT_BOOK_ENGINE||!index.entries||!index.provenance?.builtAt)throw Error('Incompatible rollout book');
   this.index=index;return index;
  }catch{this.retryAt=Date.now()+30000;return null;}finally{clearTimeout(timer);this.pending=null;}});
  return this.pending;
 }
 mayHave(state){return bookContext(state)&&(!this.index||!!this.index.entries[bookBoardKey(state)]||this.fallback.mayHave(state));}
 async lookupRollout(state,preset='expert',submitted=null){
  if(!bookContext(state)||state.phase!=='move')return null;
  const index=await this.rolloutIndex(),roll=[...state.dice].sort((a,b)=>b-a).join('');
  const entry=index?.entries[bookBoardKey(state)]?.[roll];if(!entry)return null;
  try{return rolloutBookResult(state,entry,index,preset,submitted);}catch{return null;}
 }
 async lookup(state,options){
  if(!bookEligible(state,options))return null;
  const started=performance.now();
  const result=await this.lookupRollout(state,options.preset,options.submitted)||await this.fallback.lookup(state,options);
  return result?{...result,elapsedMs:performance.now()-started}:null;
 }
 async prepare(state){if(bookContext(state))await Promise.all([this.rolloutIndex(),this.fallback.prepare(state)]);}
}
