// SPDX-License-Identifier: GPL-3.0-or-later
// Starting-board doubles are study positions, not legal opening rolls.
// Build the pinned native scorer first with build-deep-book-native.mjs.
// Completed scores are checkpointed; rerunning only computes missing scores.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {initialState,legalTurns,boardKey} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {nextBoard,rowSteps} from './book-branches.mjs';
import {bookResult,DOUBLES_BOOK_ID,DOUBLES_BOOK_ENGINE_VERSION} from '../engine/opening-book.mjs';

const family=fileURLToPath(new URL('../',import.meta.url));
const native=path.resolve(process.env.BG_DEEP_NATIVE||path.join(family,'test-results/deep-book-native'));
const out=path.join(family,'test-results/opening-doubles');
const hash=v=>createHash('sha256').update(v).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f));
const build=read(path.join(native,'build.json'));
if(build.binarySHA256!==hash(fs.readFileSync(path.join(native,'gnubg-core')))||
   build.archiveSHA256!==hash(fs.readFileSync(path.join(family,'engine/source/gnubg-core-955555c-bg6.tar.gz'))))
  throw Error('Native scorer does not match its pinned build.');
const assets=Object.fromEntries(['data/gnubg.weights','data/gnubg_os0.bd','data/gnubg_ts0.bd'].map(f=>[f,hash(fs.readFileSync(path.join(native,f)))]));
const policy={plies:3,screenPlies:2,minimum:10,screenWindow:.080,closeWindow:.040,beavers:false};
const signature=hash(JSON.stringify({build,assets,policy,generator:hash(fs.readFileSync(fileURLToPath(import.meta.url)))}));
fs.mkdirSync(out,{recursive:true});
const meta=path.join(out,'inputs.json'),log=path.join(out,'scores.jsonl');
if(fs.existsSync(meta)&&read(meta).signature!==signature)throw Error('Checkpoint inputs changed; move the old opening-doubles checkpoint first.');
fs.writeFileSync(meta,JSON.stringify({signature,build,assets,policy}));
const scores=new Map();
if(fs.existsSync(log)){
  const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;
  if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));
  for(const line of raw.slice(0,end).split('\n').filter(Boolean)){const r=JSON.parse(line);scores.set(r.key,r.value);}
}
class Worker{
  constructor(){
    this.child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','inherit']});
    this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
    createInterface({input:this.child.stdout}).on('line',line=>{
      if(line==='READY')return this.resolveReady();
      if(!line.startsWith('{'))return;
      const task=this.task;this.task=null;
      try{const v=JSON.parse(line);
        if(v.error||!Number.isFinite(v.equity)||!Number.isFinite(v.cubeless)||v.probabilities?.length!==5||v.probabilities.some(p=>!Number.isFinite(p)||p<0||p>1))throw Error('Invalid native evaluation');
        task?.resolve(v);
      }catch(e){task?.reject(e);}
    });
    const fail=e=>{this.rejectReady(e);this.task?.reject(e);};
    this.child.on('error',fail);this.child.on('exit',code=>fail(Error(`Native scorer exited: ${code}`)));
  }
  score(c,depth){return new Promise((resolve,reject)=>{
    this.task={resolve,reject};this.child.stdin.write(`${c.original}\t${c.after}\t${depth}\t0\n`);
  });}
}
const seed=initialState({matchLength:0,phase:'move',dice:[3,1],rules:{cube:true,jacoby:true,immediateRedoubles:0}});
const rolls=Array.from({length:6},(_,i)=>i+1).flatMap(a=>Array.from({length:a},(_,i)=>`${a}${i+1}`));
const decision=(state,roll)=>({state:{...state,dice:[...roll].map(Number)},roll});
function candidates(d){return legalTurns(d.state).map(t=>({steps:t.steps,
  original:toXGID(d.state,{engine:true}),after:toXGID({...t.state,phase:'roll',dice:[]},{engine:true})}));}
const key=(c,depth)=>hash(`${c.original}|${c.after}|${depth}`);
const value=(c,depth)=>scores.get(key(c,depth));
const workers=Number(process.env.BG_DEEP_WORKERS||4);
if(!Number.isInteger(workers)||workers<1||workers>8)throw Error('Use 1–8 workers.');
const pool=Array.from({length:workers},()=>new Worker());
let completed=0,total=0,phase='initializing';
const progress=setInterval(()=>console.log(`${phase}: ${completed}/${total}`),30000);
async function run(cs,depth){
  const todo=[...new Map(cs.filter(c=>!value(c,depth)).map(c=>[key(c,depth),c])).values()];
  completed=0;total=todo.length;let cursor=0;
  await Promise.all(pool.map(async w=>{while(cursor<todo.length){const c=todo[cursor++],v=await w.score(c,depth);
    const k=key(c,depth);fs.appendFileSync(log,JSON.stringify({key:k,value:v})+'\n');scores.set(k,v);completed++;
  }}));
}
async function evaluate(ds,label){
  for(const d of ds)d.candidates=candidates(d);
  phase=`${label} 2-ply screening`;await run(ds.flatMap(d=>d.candidates),2);
  for(const d of ds){
    d.candidates.sort((a,b)=>value(b,2).equity-value(a,2).equity);
    d.finalists=d.candidates.filter((c,i)=>i<policy.minimum||value(d.candidates[0],2).equity-value(c,2).equity<=policy.screenWindow);
  }
  phase=`${label} 3-ply analysis`;await run(ds.flatMap(d=>d.finalists),3);
  for(const d of ds){
    d.entry={total:d.candidates.length,rows:d.finalists.map(c=>{
      const v=value(c,3);return [c.steps.map(({from,to,die})=>[from,to,die]),v.equity,v.cubeless,...v.probabilities];
    }).sort((a,b)=>b[1]-a[1])};
    console.log(label,d.roll,d.entry.rows[0][1],d.entry.rows.filter(r=>d.entry.rows[0][1]-r[1]<=policy.closeWindow+1e-8).length,'close moves');
  }
}
try{
  await Promise.all(pool.map(w=>w.ready));
  // Compare the scorer with stored WASM results before publishing new estimates.
  const historical=read(path.join(family,'engine/opening-book-data/index.json'));
  const parityState=decision(seed,'31');
  const parity=candidates(parityState).slice(0,3);
  await run(parity,3);
  for(const c of parity){
    const stored=bookResult(parityState.state,historical.openings['31'],historical,'expert').candidates
      .find(m=>JSON.stringify(m.steps)===JSON.stringify(c.steps));
    if(!stored||Math.abs(stored.equity-value(c,3).equity)>1e-5)throw Error('Native/WASM parity check failed.');
  }
  const openings=rolls.filter(r=>r[0]===r[1]).map(r=>decision(seed,r));
  await evaluate(openings,'Doubles');
  const boards=new Map();
  for(const d of openings)for(const r of d.entry.rows.filter(r=>d.entry.rows[0][1]-r[1]<=policy.closeWindow+1e-8)){
    const s=nextBoard(d.state,rowSteps(r));boards.set(boardKey(s),s);
  }
  console.log(`${boards.size} close opening boards × 21 reply rolls`);
  const replies=[...boards.values()].flatMap(s=>rolls.map(r=>decision(s,r)));
  await evaluate(replies,'Replies');
  const index={schema:1,id:DOUBLES_BOOK_ID,engine:DOUBLES_BOOK_ENGINE_VERSION,plies:3,threshold:policy.closeWindow,
    settings:{name:'Starting doubles',plies:3,cubeful:true,pruning:true,deterministic:true,noise:0,replyFilter:{plies:2,minimum:10,threshold:.080}},
    context:{matchLength:0,cube:true,jacoby:true,immediateRedoubles:0,cubeOwner:null},
    openings:Object.fromEntries(openings.map(d=>[d.roll,d.entry])),replies:{},
    provenance:{builtAt:new Date().toISOString(),generator:'backgammon/scripts/build-opening-doubles.mjs',signature,build,assets,policy}};
  for(const d of replies){const k=boardKey(d.state);index.replies[k]??={rolls:{}};index.replies[k].rolls[d.roll]=d.entry;}
  for(const d of [...openings,...replies])bookResult(d.state,d.entry,index,'expert');
  const destination=path.join(family,'engine/opening-book-data/doubles');fs.mkdirSync(destination,{recursive:true});
  fs.writeFileSync(path.join(destination,'index.json'),JSON.stringify(index)+'\n');
  console.log(`Published 6 starting doubles and ${replies.length} replies.`);
}finally{clearInterval(progress);for(const w of pool)w.child.kill();}
