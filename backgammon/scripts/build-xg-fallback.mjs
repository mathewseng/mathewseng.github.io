// SPDX-License-Identifier: GPL-3.0-or-later
// Fill the one close XG opening branch absent from both published reply books.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {legalTurns,commitTurn,boardKey} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {stateForBoard,nextBoard} from './book-branches.mjs';
import {normalizeReference} from './deep-book-comparison.mjs';
const family=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,family))),hash=b=>createHash('sha256').update(b).digest('hex');
const reference=read('docs/deep-book-xg-reference.json'),refs=normalizeReference(reference),index=read('engine/opening-book-data/deep/index.json');
const native=process.env.BG_DEEP_NATIVE||'/tmp/bg-deep-book-neon',build=JSON.parse(fs.readFileSync(native+'/build.json'));
if(hash(fs.readFileSync(native+'/gnubg-core'))!==build.binarySHA256)throw Error('Native binary changed');
const boards=new Map();for(const d of refs.filter(d=>d.title.startsWith('Opening-'))){const state=stateForBoard(d.board,[...d.roll].map(Number));for(const c of d.candidates.filter(c=>d.candidates[0].equity-c.equity<=.040+1e-8)){
 const t=legalTurns(state).find(t=>t.key===c.board),s=nextBoard(state,t.steps),b=boardKey(s);
 if(!index.replies[b]&&!refs.some(r=>r.board===b))boards.set(b,s);
}}
if(boards.size!==1)throw Error('Expected one missing branch before publication');
const out=new URL('test-results/xg-fallback/',family);fs.mkdirSync(out,{recursive:true});
const policy={checkerPlies:5,screen:'all legal at 3 ply; top 10 plus .080 at 4 ply; union of 3/4-ply top 2 plus .040 at 5 ply',jacoby:true,beavers:false};
const inputs={build,boards:[...boards.keys()],policy,sourceSHA256:hash(fs.readFileSync(new URL('docs/deep-book-xg-reference.json',family)))};
const signature=hash(JSON.stringify(inputs)),inputFile=new URL('inputs.json',out),scoresFile=new URL('scores.jsonl',out);
if(fs.existsSync(inputFile)&&JSON.parse(fs.readFileSync(inputFile)).signature!==signature)throw Error('Changed inputs');
fs.writeFileSync(inputFile,JSON.stringify({signature,...inputs},null,2)+'\n');
const scores=new Map(fs.existsSync(scoresFile)?fs.readFileSync(scoresFile,'utf8').trim().split('\n').filter(Boolean).map(l=>{const r=JSON.parse(l);return[r.key,r];}):[]);
const jobs=[];for(const [board,s]of boards)for(let a=1;a<=6;a++)for(let b=1;b<=a;b++){
 const state={...s,dice:[a,b]},candidates=legalTurns(state).map(t=>({board:t.key,steps:t.steps,original:toXGID(state,{engine:true}),after:toXGID({...commitTurn(state,t.steps),dice:[],phase:'roll'},{engine:true})}));
 jobs.push({board,roll:`${a}${b}`,total:candidates.length,candidates});
}
const key=(c,depth)=>hash(c.after+'|'+depth+'|beavers=0'),value=(c,depth)=>scores.get(key(c,depth))?.value;
const children=[];
function worker(){const child=spawn(native+'/gnubg-core',[],{cwd:native,stdio:['pipe','pipe','inherit']});children.push(child);let ready,pending;const started=new Promise(r=>ready=r);
 createInterface({input:child.stdout}).on('line',l=>{if(l==='READY')return ready();if(l.startsWith('{')){const v=JSON.parse(l);if(!Number.isFinite(v.equity)||!Number.isFinite(v.cubeless)||v.probabilities?.length!==5)pending.reject(Error('Invalid evaluation'));else pending.resolve(v);pending=null;}});
 child.on('exit',code=>{if(pending)pending.reject(Error('Native exit '+code));});
 return async(c,depth)=>{await started;return new Promise((resolve,reject)=>{pending={resolve,reject};child.stdin.write(`${c.original}\t${c.after}\t${depth}\t0\n`);});};}
const workers=Number(process.env.BG_FALLBACK_WORKERS||2);
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('Use 1–8 fallback workers');
const pool=Array.from({length:workers},worker);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{for(const child of children)child.kill('SIGTERM');});
async function run(depth,candidates){let cursor=0;const todo=[...new Map(candidates.map(c=>[key(c,depth),c])).values()].filter(c=>!scores.has(key(c,depth)));console.log(depth+' ply: '+todo.length+' new candidate scores');
 await Promise.all(pool.map(async score=>{while(cursor<todo.length){const c=todo[cursor++],v=await score(c,depth),r={key:key(c,depth),after:c.after,original:c.original,depth,value:v};scores.set(r.key,r);fs.appendFileSync(scoresFile,JSON.stringify(r)+'\n');}}));}
const select=(cs,depth,min,window)=>{const sorted=[...cs].sort((a,b)=>value(b,depth).equity-value(a,depth).equity);return sorted.filter((c,i)=>i<min||value(sorted[0],depth).equity-value(c,depth).equity<=window+1e-8);};
try{
 await run(3,jobs.flatMap(j=>j.candidates));
 for(const j of jobs)j.screened=select(j.candidates,3,10,.080);
 await run(4,jobs.flatMap(j=>j.screened));
 for(const j of jobs)j.finalists=[...new Set([...select(j.screened,3,2,.040),...select(j.screened,4,2,.040)])];
 await run(5,jobs.flatMap(j=>j.finalists));
 const result={signature,inputs,recordedAt:new Date().toISOString(),positions:jobs.map(j=>({board:j.board,roll:j.roll,total:j.total,screened:j.screened.length,candidates:j.finalists.map(c=>({board:c.board,steps:c.steps,threePly:value(c,3),fourPly:value(c,4),fivePly:value(c,5)}))}))};
 fs.writeFileSync(new URL('result.json',out),JSON.stringify(result,null,2)+'\n');console.log('Complete: '+result.positions.length+' reply decisions');
}finally{for(const child of children)child.kill();}
