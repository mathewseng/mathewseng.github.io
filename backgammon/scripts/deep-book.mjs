// SPDX-License-Identifier: GPL-3.0-or-later
// Offline five-ply opening/reply research. Never overwrites the live book.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {initialState,legalTurns,commitTurn,boardKey,notation} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {nextBoard,stateForBoard,rowSteps} from './book-branches.mjs';

const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=path.resolve(process.env.BG_DEEP_NATIVE||path.join(family,'test-results/deep-book-native'));
const out=path.resolve(process.env.BG_DEEP_OUT||path.join(family,'test-results/deep-book'));
const workers=Number(process.env.BG_DEEP_WORKERS||8);
if(!Number.isInteger(workers)||workers<1||workers>16)throw Error('Use 1–16 workers');
const base=path.join(family,'engine/opening-book-data');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const index=read(path.join(base,'index.json')),build=read(path.join(native,'build.json'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const policy={openingDepth:5,replyScreenDepth:4,replyDepth:5,replyMinimum:2,replyWindow:.040,previousDepthWindow:.040,
  openingBranches:'union of historical and 5-ply openings within .040',
  replyScreen:'every historical retained candidate (at least 10 or all); new boards: all legal moves at 3 ply, retain at least 10 plus .080',
  replyFinalists:'union of 3- and 4-ply top two and every candidate within .040 at either depth',
  innerSearch:'GNUbg pruning enabled; deterministic, zero noise',beavers:false};
const provenance={build,policy,bookId:index.id,bookIndexSHA256:hash(fs.readFileSync(path.join(base,'index.json'))),
  generatorSHA256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
const signature=hash(JSON.stringify(provenance));
fs.mkdirSync(out,{recursive:true});
const metaFile=path.join(out,'inputs.json'),logFile=path.join(out,'scores.jsonl');
if(fs.existsSync(metaFile)&&read(metaFile).signature!==signature)throw Error('Checkpoint inputs changed; choose a new BG_DEEP_OUT');
if(!fs.existsSync(metaFile))fs.writeFileSync(metaFile,JSON.stringify({signature,...provenance},null,2)+'\n');
const lockFile=path.join(out,'lock');
if(fs.existsSync(lockFile)){
  const pid=Number(fs.readFileSync(lockFile,'utf8'));
  try{process.kill(pid,0);throw Error(`Build already running: ${pid}`);}catch(e){if(e.code!=='ESRCH')throw e;}
  fs.unlinkSync(lockFile);
}
fs.writeFileSync(lockFile,String(process.pid),{flag:'wx'});
const scores=new Map();
if(fs.existsSync(logFile)){
  const raw=fs.readFileSync(logFile,'utf8'),end=raw.lastIndexOf('\n')+1;
  if(end!==raw.length)fs.truncateSync(logFile,Buffer.byteLength(raw.slice(0,end)));
  for(const line of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(line);scores.set(r.key,r);}
}
const pool=[];let stopping=false,phase='starting',finished=0,total=0;const started=Date.now();
const save=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
function progress(){const status={phase,finished,total,cachedScores:scores.size,elapsedSeconds:Math.round((Date.now()-started)/1000)};save(path.join(out,'status.json'),status);console.log(JSON.stringify(status));}
class NativeWorker {
  constructor(){
    this.child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','pipe']});
    this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
    createInterface({input:this.child.stdout}).on('line',line=>{
      if(line==='READY')return this.readyResolve();
      if(!line.startsWith('{'))return;
      try{const value=JSON.parse(line);if(value.error||!Number.isFinite(value.equity)||!Number.isFinite(value.cubeless)||value.probabilities?.length!==5||value.probabilities.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Invalid native score: '+line);
        const pending=this.pending;this.pending=null;pending?.resolve(value);
      }catch(e){this.pending?.reject(e);this.pending=null;}
    });
    this.child.stderr.on('data',data=>process.stderr.write(data));
    this.child.on('error',e=>{this.readyReject(e);this.pending?.reject(e);});
    this.child.on('exit',code=>{const e=Error('Native worker exited: '+code);this.readyReject(e);this.pending?.reject(e);});
  }
  async score(job){await this.ready;return new Promise((resolve,reject)=>{
    this.pending={resolve,reject};this.child.stdin.write(`${job.original}\t${job.after}\t${job.depth}\t0\n`);
  });}
  close(){this.child.kill('SIGTERM');}
}
function candidate(state,steps,historical=null){
  const after=commitTurn(state,steps);
  return {steps,notation:notation(steps,state.turn),board:boardKey(after),historical,
    original:toXGID(state,{engine:true}),after:toXGID({...after,dice:[],phase:'roll'},{engine:true})};
}
// ScoreMove only uses original cube/match context and the after-board. All
// decisions here are canonical player 0, centered cube 1, Jacoby money.
// Identical after-XGIDs therefore share scores even across different rolls.
function job(c,depth){return {key:hash(`${c.after}|${depth}|beavers=0`),original:c.original,after:c.after,depth};}
const value=(c,depth)=>scores.get(job(c,depth).key)?.value;
async function run(name,jobs){
  phase=name;const unique=[...new Map(jobs.map(j=>[j.key,j])).values()];
  const todo=unique.filter(j=>!scores.has(j.key));total=unique.length;finished=total-todo.length;progress();
  let cursor=0;
  await Promise.all(pool.map(async worker=>{while(!stopping){const task=todo[cursor++];if(!task)return;const t=Date.now(),v=await worker.score(task);
    const record={...task,value:v,elapsedMs:Date.now()-t};fs.appendFileSync(logFile,JSON.stringify(record)+'\n');scores.set(task.key,record);finished++;
  }}));
  if(stopping)throw Error('Interrupted; completed candidates are checkpointed');
  progress();
}
function select(candidates,depth,minimum,window){
  const equity=c=>depth===3?c.historical?.equity??value(c,3)?.equity:value(c,depth)?.equity;
  const sorted=[...candidates].sort((a,b)=>equity(b)-equity(a));
  if(sorted.some(c=>!Number.isFinite(equity(c))))throw Error('Missing screening score');
  return sorted.filter((c,i)=>i<minimum||equity(sorted[0])-equity(c)<=window+1e-8);
}
const openings=Object.entries(index.openings).map(([roll,entry])=>{
  const state=initialState({matchLength:0,phase:'move',dice:[...roll].map(Number),rules:{cube:true,jacoby:true}});
  return {id:'opening-'+roll,roll,state,total:entry.total,candidates:entry.rows.map(r=>candidate(state,rowSteps(r),{equity:r[1],cubeless:r[2],probabilities:r.slice(3)}))};
});
if(process.argv.includes('--plan')){
  console.log(JSON.stringify({openings:openings.length,openingCandidates:openings.reduce((n,d)=>n+d.candidates.length,0),historicalReplyBoards:Object.keys(index.replies).length,policy},null,2));fs.unlinkSync(lockFile);process.exit(0);
}
const timer=setInterval(progress,30000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;for(const w of pool)w.close();});
try{
  for(let i=0;i<workers;i++)pool.push(new NativeWorker());
  await Promise.all(pool.map(w=>w.ready));
  // Verify the offline executable against the actual historical WASM book
  // before spending hours on deeper searches. Every opening candidate checked.
  await run('native-parity',openings.flatMap(d=>d.candidates.map(c=>job(c,3))));
  let maxParityDifference=0;
  for(const d of openings)for(const c of d.candidates){const v=value(c,3);for(const k of ['equity','cubeless'])maxParityDifference=Math.max(maxParityDifference,Math.abs(v[k]-c.historical[k]));for(let i=0;i<5;i++)maxParityDifference=Math.max(maxParityDifference,Math.abs(v.probabilities[i]-c.historical.probabilities[i]));}
  if(maxParityDifference>1e-5)throw Error('Native parity failed: '+maxParityDifference);
  await run('openings-4ply',openings.flatMap(d=>d.candidates.map(c=>job(c,4))));
  await run('openings-5ply',openings.flatMap(d=>d.candidates.map(c=>job(c,5))));
  const boards=new Map(Object.keys(index.replies).map(board=>[board,stateForBoard(board)]));
  for(const d of openings)for(const c of select(d.candidates,5,1,.040)){const s=nextBoard(d.state,c.steps);boards.set(boardKey(s),s);}
  const replies=[];
  for(const [board,baseState] of boards){
    const shard=index.replies[board]?read(path.join(base,index.replies[board].file)):null;
    for(let a=1;a<=6;a++)for(let b=1;b<=a;b++){
      const roll=`${a}${b}`,state={...baseState,dice:[a,b]},entry=shard?.rolls[roll];
      const candidates=entry?entry.rows.map(r=>candidate(state,rowSteps(r),{equity:r[1],cubeless:r[2],probabilities:r.slice(3)})):legalTurns(state).map(t=>candidate(state,t.steps));
      replies.push({id:`reply-${hash(board).slice(0,16)}-${roll}`,board,roll,state,total:entry?.total??candidates.length,candidates,newBoard:!entry});
    }
  }
  await run('new-replies-3ply',replies.filter(d=>d.newBoard).flatMap(d=>d.candidates.map(c=>job(c,3))));
  for(const d of replies)if(d.newBoard)d.candidates=select(d.candidates,3,10,.080);
  await run('replies-4ply',replies.flatMap(d=>d.candidates.map(c=>job(c,4))));
  for(const d of replies)d.finalists=[...new Set([...select(d.candidates,3,2,.040),...select(d.candidates,4,2,.040)])];
  await run('replies-5ply',replies.flatMap(d=>d.finalists.map(c=>job(c,5))));
  const pack=(d,candidates)=>({id:d.id,roll:d.roll,board:d.board??boardKey(d.state),total:d.total,screened:d.candidates.length,
    candidates:candidates.map(c=>({steps:c.steps,notation:c.notation,board:c.board,historical:c.historical??value(c,3),fourPly:value(c,4),fivePly:value(c,5)})).sort((a,b)=>b.fivePly.equity-a.fivePly.equity)});
  const result={schema:1,id:'jacoby-native-5ply-research-v1',signature,provenance,recordedAt:new Date().toISOString(),maxParityDifference,
    coverage:{openingRolls:15,openingCandidates:openings.reduce((n,d)=>n+d.candidates.length,0),replyBoards:boards.size,replyRolls:replies.length,replyFinalists:replies.reduce((n,d)=>n+d.finalists.length,0)},
    openings:openings.map(d=>pack(d,d.candidates)),replies:replies.map(d=>pack(d,d.finalists))};
  save(path.join(out,'result.json'),result);phase='complete';progress();
}finally{clearInterval(timer);for(const w of pool)w.close();fs.unlinkSync(lockFile);}
