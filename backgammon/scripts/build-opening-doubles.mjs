// SPDX-License-Identifier: GPL-3.0-or-later
// Starting-board doubles are study positions, not legal opening rolls.
// Build the pinned native scorer first with build-deep-book-native.mjs.
// Completed scores are checkpointed; rerunning only computes missing scores.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {initialState,legalTurns,boardKey} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {bookResult,DOUBLES_BOOK_ID,DOUBLES_BOOK_ENGINE_VERSION} from '../engine/opening-book.mjs';
import {gzipSync} from 'node:zlib';

const family=fileURLToPath(new URL('../',import.meta.url));
const native=path.resolve(process.env.BG_DEEP_NATIVE||path.join(family,'test-results/deep-book-native'));
const out=path.resolve(process.env.BG_DOUBLES_OUT||path.join(family,'test-results/opening-doubles-5ply'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f));
const build=read(path.join(native,'build.json'));
if(build.binarySHA256!==hash(fs.readFileSync(path.join(native,'gnubg-core')))||
   build.archiveSHA256!==hash(fs.readFileSync(path.join(family,'engine/source/gnubg-core-955555c-bg6.tar.gz'))))
  throw Error('Native scorer does not match its pinned build.');
const assets=Object.fromEntries(['data/gnubg.wd','data/gnubg.weights','data/gnubg_os0.bd','data/gnubg_ts0.bd'].map(f=>[f,hash(fs.readFileSync(path.join(native,f)))]));
const verified=read(path.join(family,'docs/fullgame-runtime-validation.json'));
if(Object.entries(assets).some(([f,digest])=>digest!==verified.assets[f]))throw Error('Runtime data differ from the validated pinned engine.');
const remote=process.env.BG_DEEP_REMOTE,remotePath=process.env.BG_DEEP_REMOTE_PATH;
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
if(remote){
  if(!/^[a-zA-Z0-9._-]+$/.test(remote)||!remotePath?.startsWith('/'))throw Error('Use a configured SSH host and absolute BG_DEEP_REMOTE_PATH.');
  const files=['gnubg-core',...Object.keys(assets)];
  const output=execFileSync('ssh',['-o','BatchMode=yes',remote,`cd ${quote(remotePath)} && shasum -a 256 ${files.map(quote).join(' ')}`],{encoding:'utf8'});
  const actual=Object.fromEntries(output.trim().split('\n').map(line=>{const [digest,file]=line.trim().split(/\s+/);return [file,digest];}));
  if(actual['gnubg-core']!==build.binarySHA256||Object.entries(assets).some(([file,digest])=>actual[file]!==digest))
    throw Error('Remote scorer or runtime data differ from the local pinned build.');
}
fs.mkdirSync(out,{recursive:true});
const policy={openingDepth:5,openingCandidates:'every legal resulting move at 3, 4 and 5 ply',
  closeWindow:.040,beavers:false,replies:false,
  innerSearch:'GNUbg deterministic tree search with internal pruning; not a rollout'};
const inputs={build,assets,policy,generator:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
const signature=hash(JSON.stringify(inputs));
const meta=path.join(out,'inputs.json'),log=path.join(out,'scores.jsonl');
// Coverage/publication changes can reuse exact same-engine scores. A different
// scorer or runtime data must never inherit an older checkpoint's numbers.
if(fs.existsSync(meta)){
  const previous=read(meta);
  if(JSON.stringify(previous.build)!==JSON.stringify(build)||JSON.stringify(previous.assets)!==JSON.stringify(assets))
    throw Error('Checkpoint evaluator changed; use another BG_DOUBLES_OUT.');
}
fs.writeFileSync(meta,JSON.stringify({signature,...inputs}));
const lock=path.join(out,'lock');
if(fs.existsSync(lock)){
  const pid=Number(fs.readFileSync(lock,'utf8'));
  try{process.kill(pid,0);throw Error(`Build already running: ${pid}`);}catch(e){if(e.code!=='ESRCH')throw e;}
  fs.unlinkSync(lock);
}
fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const scores=new Map();
if(fs.existsSync(log)){
  const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;
  if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));
  for(const line of raw.slice(0,end).split('\n').filter(Boolean)){const r=JSON.parse(line);scores.set(r.key,r.value);}
}
class Worker{
  constructor(useRemote=false){
    this.child=useRemote
      ?spawn('ssh',['-o','BatchMode=yes',remote,`cd ${quote(remotePath)} && exec ./gnubg-core`],{stdio:['pipe','pipe','inherit']})
      :spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','inherit']});
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
// All positions are canonical player zero, centered cube one, Jacoby money.
// Dice/order do not affect evaluation of the same resulting position.
const key=(c,depth)=>hash(`${c.after}|${depth}|beavers=0`);
const value=(c,depth)=>scores.get(key(c,depth));
const workers=Number(process.env.BG_DEEP_WORKERS||6);
if(!Number.isInteger(workers)||workers<1||workers>12)throw Error('Use 1–12 workers.');
const pool=Array.from({length:workers},(_,i)=>new Worker(!!remote&&i%2===1));
let completed=0,total=0,phase='initializing',stopping=false;const started=Date.now();
const atomic=(file,data)=>{fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);};
const progress=()=>{
  const status={phase,completed,total,scores:scores.size,elapsedSeconds:Math.round((Date.now()-started)/1000)};
  atomic(path.join(out,'status.json'),JSON.stringify(status));console.log(JSON.stringify(status));
};
const timer=setInterval(progress,30000);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;for(const w of pool)w.child.kill('SIGTERM');});
async function run(cs,depth){
  const todo=[...new Map(cs.filter(c=>!value(c,depth)).map(c=>[key(c,depth),c])).values()];
  completed=0;total=todo.length;let cursor=0;progress();
  await Promise.all(pool.map(async w=>{while(!stopping&&cursor<todo.length){const c=todo[cursor++],t=Date.now(),v=await w.score(c,depth);
    const k=key(c,depth);fs.appendFileSync(log,JSON.stringify({key:k,original:c.original,after:c.after,depth,elapsedMs:Date.now()-t,value:v})+'\n');scores.set(k,v);completed++;
  }}));
  if(stopping)throw Error('Interrupted; completed candidates are checkpointed.');
  progress();
}
async function evaluate(ds,label){
  for(const d of ds)d.candidates=candidates(d);
  for(const depth of [3,4,5]){
    phase=`${label}: all candidates at ${depth} ply`;await run(ds.flatMap(d=>d.candidates),depth);
  }
  for(const d of ds){
    d.entry={total:d.candidates.length,rows:d.candidates.map(c=>{
      const v=value(c,5);return [c.steps.map(({from,to,die})=>[from,to,die]),v.equity,v.cubeless,...v.probabilities];
    }).sort((a,b)=>b[1]-a[1])};
    console.log(label,d.roll,d.entry.rows[0][1],d.entry.rows.filter(r=>d.entry.rows[0][1]-r[1]<=policy.closeWindow+1e-8).length,'close moves');
  }
}
try{
  await Promise.all(pool.map(w=>w.ready));
  // Compare the scorer with stored WASM results before publishing new estimates.
  const historical=read(path.join(family,'engine/opening-book-data/index.json'));
  const parityState=decision(seed,'31');
  const parity=candidates(parityState);
  phase='Native/WASM parity';
  await run(parity,3);
  let maxParityDifference=0;
  for(const c of parity){
    const stored=bookResult(parityState.state,historical.openings['31'],historical,'expert').candidates
      .find(m=>JSON.stringify(m.steps)===JSON.stringify(c.steps));
    if(!stored)throw Error('Missing native/WASM parity candidate.');
    maxParityDifference=Math.max(maxParityDifference,...['equity','cubeless'].map(k=>Math.abs(stored[k]-value(c,3)[k])),
      ...stored.probabilities.map((p,i)=>Math.abs(p-value(c,3).probabilities[i])));
  }
  if(maxParityDifference>1e-5)throw Error('Native/WASM parity check failed.');
  const openings=rolls.filter(r=>r[0]===r[1]).map(r=>decision(seed,r));
  await evaluate(openings,'Doubles');
  const coverage={openingRolls:6,openingCandidates:openings.reduce((n,d)=>n+d.candidates.length,0)};
  const audit={schema:1,signature,inputs,maxParityDifference,coverage,executionHosts:remote?['local',remote]:['local'],recordedAt:new Date().toISOString(),
    positions:openings.map(d=>({board:boardKey(d.state),roll:d.roll,
      candidates:d.candidates.map(c=>({steps:c.steps,after:c.after,threePly:value(c,3),fourPly:value(c,4),fivePly:value(c,5)}))}))};
  const auditBytes=JSON.stringify(audit)+'\n';
  const index={schema:1,id:DOUBLES_BOOK_ID,engine:DOUBLES_BOOK_ENGINE_VERSION,plies:5,threshold:policy.closeWindow,
    settings:{name:'Deep starting doubles',plies:5,cubeful:true,pruning:true,deterministic:true,noise:0},
    context:{matchLength:0,cube:true,jacoby:true,immediateRedoubles:0,cubeOwner:null},
    openings:Object.fromEntries(openings.map(d=>[d.roll,d.entry])),
    provenance:{builtAt:audit.recordedAt,generator:'backgammon/scripts/build-opening-doubles.mjs',signature,build,assets,policy,
      coverage,maxParityDifference,auditSHA256:hash(auditBytes),scoresSHA256:hash(fs.readFileSync(log))}};
  for(const d of openings)bookResult(d.state,d.entry,index,'expert');
  const destination=path.join(family,'engine/opening-book-data/doubles');fs.mkdirSync(destination,{recursive:true});
  atomic(path.join(family,'docs/opening-doubles-evaluations.json.gz'),gzipSync(auditBytes));
  atomic(path.join(family,'docs/opening-doubles-scores.jsonl.gz'),gzipSync(fs.readFileSync(log)));
  atomic(path.join(destination,'index.json'),JSON.stringify(index)+'\n');
  phase='complete';progress();
  console.log(`Published all ${coverage.openingCandidates} starting-double moves at 5 ply.`);
}finally{clearInterval(timer);for(const w of pool)w.child.kill();fs.unlinkSync(lock);}
