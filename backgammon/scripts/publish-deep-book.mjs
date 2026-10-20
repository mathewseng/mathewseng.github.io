// SPDX-License-Identifier: GPL-3.0-or-later
// Publish only a complete validated run, with each decision consistently 5 ply.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {initialState,boardKey,commitTurn,legalTurns} from '../core/rules.mjs';
import {nextBoard,stateForBoard} from './book-branches.mjs';
import {DEEP_BOOK_ID,DEEP_BOOK_ENGINE_VERSION,bookResult} from '../engine/opening-book.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]||path.join(family,'test-results/deep-book/result.json'));
const result=JSON.parse(fs.readFileSync(source,'utf8'));
if(result.schema!==1||result.id!=='jacoby-native-5ply-research-v1'||result.coverage.openingRolls!==15||result.openings.length!==15||result.replies.length!==result.coverage.replyBoards*21||!Number.isFinite(result.maxParityDifference)||result.maxParityDifference>1e-5||result.provenance?.policy?.openingDepth!==5||result.provenance?.policy?.replyDepth!==5)throw Error('Incomplete/unverified deep book');
const hash=x=>createHash('sha256').update(x).digest('hex');
if(hash(JSON.stringify(result.provenance))!==result.signature)throw Error('Computation provenance signature mismatch');
const out=path.join(family,'engine/opening-book-data/deep');
const stage=fs.mkdtempSync(path.join(family,'test-results/deep-book-publish-'));
const header={schema:1,id:DEEP_BOOK_ID,engine:DEEP_BOOK_ENGINE_VERSION};
const index={...header,plies:5,threshold:.040,context:{matchLength:0,cube:true,jacoby:true,immediateRedoubles:0,cubeOwner:null},
  settings:{name:'Deep opening book',plies:5,cubeful:true,pruning:true,deterministic:true,noise:0,
    replyFilter:{plies:4,minimum:2,threshold:.040},screeningPolicy:'union-3-4ply-top2-window040'},
  openings:{},replies:{},provenance:{builtAt:result.recordedAt,generator:'backgammon/scripts/deep-book.mjs',
    sourceSHA256:hash(fs.readFileSync(source)),signature:result.signature,build:result.provenance.build,policy:result.provenance.policy,
    coverage:result.coverage,maxParityDifference:result.maxParityDifference}};
const pack=d=>({total:d.total,screened:d.screened,rows:d.candidates.map(c=>{
  const v=c.fivePly;if(!v||![v.equity,v.cubeless,...v.probabilities].every(Number.isFinite))throw Error('Missing 5-ply score');
  return [c.steps.map(s=>[s.from,s.to,s.die]),v.equity,v.cubeless,...v.probabilities];
}).sort((a,b)=>b[1]-a[1])});
const shards=new Map();
for(const d of result.replies){
  if(!shards.has(d.board))shards.set(d.board,{...header,board:d.board,rolls:{}});
  const shard=shards.get(d.board);if(shard.rolls[d.roll])throw Error('Duplicate reply');
  shard.rolls[d.roll]=pack(d);
}
for(const [board,shard] of shards){
  if(Object.keys(shard.rolls).length!==21)throw Error('Incomplete reply board');
  const name=`reply-${hash(board).slice(0,16)}.json`,bytes=JSON.stringify(shard);
  fs.writeFileSync(path.join(stage,name),bytes);index.replies[board]={file:name,sha256:hash(bytes)};
}
for(const d of result.openings){
  const state=initialState({matchLength:0,phase:'move',dice:[...d.roll].map(Number),rules:{cube:true,jacoby:true}}),entry=pack(d);
  if(entry.rows.length!==legalTurns(state).length)throw Error('Opening search must be exhaustive');
  entry.near=entry.rows.filter(r=>entry.rows[0][1]-r[1]<=.040+1e-8).map(r=>{
    const steps=r[0].map(([from,to,die])=>({from,to,die})),board=boardKey(nextBoard(state,steps)),ref=index.replies[board];
    if(!ref)throw Error('Missing replies after a close 5-ply opening');
    return {steps,loss:entry.rows[0][1]-r[1],reply:ref.file.slice(6,-5)};
  });index.openings[d.roll]=entry;
}
for(const [roll,entry] of Object.entries(index.openings))bookResult(initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true}}),entry,index,'auto');
for(const [board,shard] of shards)for(const [roll,entry] of Object.entries(shard.rolls))bookResult(stateForBoard(board,[...roll].map(Number)),entry,index,'auto');
fs.writeFileSync(path.join(stage,'index.json'),JSON.stringify(index));
if(fs.existsSync(out))throw Error('Deep book already exists; validate and move it aside before republishing');
fs.renameSync(stage,out);
console.log(JSON.stringify({output:out,coverage:result.coverage}));
