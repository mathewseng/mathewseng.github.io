// SPDX-License-Identifier: GPL-3.0-or-later
// Controlled horizon, checker and cube ablations on the 15 persistent disagreements.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {appendCheckpoint,retryCheckpoint} from './rollout-checkpoint.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const openingOnly=process.argv.includes('--opening-confirmation');
const native=process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-fullgame-ablation-v1';
const out=path.resolve(process.env.BG_ABLATION_OUT||path.join(family,openingOnly?'test-results/opening-fullgame-confirmation-v1':'test-results/fullgame-ablation-v1'));
const workers=Number(process.env.BG_ROLLOUT_WORKERS||(openingOnly?2:8)),trials=openingOnly?4096:1024,batchSize=32;
const remoteWorkers=Number(process.env.BG_ROLLOUT_REMOTE_WORKERS||0),remoteHost='mattgpt',remoteDir='/tmp/codex-backgammon-fullgame-01a15639';
if(!Number.isInteger(remoteWorkers)||remoteWorkers<0||remoteWorkers>8)throw Error('Invalid remote worker count');
if(!Number.isInteger(workers)||workers<1||workers>16)throw Error('Invalid worker count');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=fs.readFileSync(path.join(family,'docs/rollout-diagnostic-comparison.json')),source=JSON.parse(sourceBytes);
const previous=read(path.join(family,'docs/rollout-policy-inputs.json')),build=read(path.join(native,'build.json'));
if(!build.ablationPatchSHA256||hash(fs.readFileSync(path.join(native,'gnubg-core')))!==build.binarySHA256)throw Error('Unexpected native engine');
if(remoteWorkers){
 const remoteHash=execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=5',remoteHost,`shasum -a 256 ${remoteDir}/gnubg-core`],{encoding:'utf8'}).trim().split(/\s+/)[0];
 if(remoteHash!==build.binarySHA256)throw Error('Remote native binary differs');
 const validation=read(path.join(family,'docs/fullgame-remote-validation.json'));
 if(validation.binarySHA256!==remoteHash||!validation.exactJSONParity||validation.cases!==16)throw Error('Remote implementation parity is missing');
}
const diagnostic=read(path.join(family,'docs/rollout-diagnostic-inputs.json'));
const oldRecords=['rollout-policy','rollout-diagnostic'].flatMap(n=>gunzipSync(fs.readFileSync(path.join(family,`docs/${n}-batches.jsonl.gz`))).toString().trim().split('\n').map(JSON.parse));
const used=new Set(oldRecords.flatMap(r=>Array.from({length:r.value.samples},(_,i)=>(r.seed+i*256)>>>0)));
// Exclude timing and baseline-parity samples as well.
for(const seed of [123456789,987654321])for(let i=0;i<2;i++)used.add((seed+256*i)>>>0);
const parent=openingOnly?read(path.join(family,'docs/fullgame-ablation-inputs.json')):null;
if(parent)for(const d of parent.plan)for(let i=0;i<parent.trials;i++)used.add((d.seedBase+Math.floor(i/parent.batchSize)*65536+(i%parent.batchSize)*256)>>>0);
const plan=source.rows.filter(r=>r.gap.classification==='persistent'&&(!openingOnly||r.kind==='opening')).map(r=>{
 const input=diagnostic.plan.find(p=>p.id===r.id),complete=previous.plan.find(p=>p.id===r.id);
 const candidates=[...input.candidates,...complete.candidates.filter(c=>!input.candidates.some(a=>a.board===c.board)).map(c=>({...c,role:'other-retained'}))];
 let nonce=0,seedBase,seeds;
 do{seedBase=parseInt(hash(`${openingOnly?'opening-fullgame-confirmation-v1':'fullgame-ablation-v1'}:${r.id}:${nonce++}`).slice(0,8),16);seeds=Array.from({length:trials},(_,i)=>(seedBase+Math.floor(i/batchSize)*65536+(i%batchSize)*256)>>>0);}while(seeds.some(s=>used.has(s)));
 seeds.forEach(s=>used.add(s));
 return {...input,candidates,seedBase,seedNonce:nonce-1};
});
if(plan.length!==(openingOnly?1:15)||plan.filter(p=>p.kind==='opening').map(p=>p.roll).join()!=='21')throw Error('Unexpected ablation cohort');
const policies=[
 {id:'short',checkerPlies:2,cubePlies:2,truncationPlies:5,lateAfterPlies:2,lateCheckerPlies:1,lateCubePlies:2,endpointPlies:2},
 {id:'full-matched',checkerPlies:2,cubePlies:2,truncationPlies:0,lateAfterPlies:2,lateCheckerPlies:1,lateCubePlies:2,endpointPlies:2},
 {id:'full-strong',checkerPlies:2,cubePlies:2,truncationPlies:0,lateAfterPlies:0,lateCheckerPlies:2,lateCubePlies:2,endpointPlies:2},
 {id:'full-cube3',checkerPlies:2,cubePlies:3,truncationPlies:0,lateAfterPlies:0,lateCheckerPlies:2,lateCubePlies:3,endpointPlies:2},
].filter(p=>!openingOnly||p.id!=='full-cube3');
const unsigned={schema:1,...(openingOnly?{parentSignature:parent.signature,effectComparisons:2,gapComparisons:3}:{}),build,sourceSHA256:hash(sourceBytes),sourceSignature:source.signature,plan,policies,trials,batchSize,
 method:openingOnly?'Independent fixed 4096-trial opening 21 confirmation, specified before inspecting the 1024-trial ablation equities. All four retained moves under Full/strong; the previous choice and XG choice under Short and Full/matched. 128 batches of 32; common dice across candidates and policies; seed-disjoint from all prior experiments, timing/parity samples and every planned trial of the 15-position ablation. No optional stopping or pooling with the ablation. Two paired differences of move gaps (cutoff and checker) form a Bonferroni simultaneous 95% family; three policy gaps form a separate family. Same GNUbg build, normal filters, Jacoby on, beavers off, variance reduction, no dice rotation. A complete Full/strong retained-candidate set can replace opening 21 as a precision refinement only after the whole primary cohort qualifies.':'Fixed controlled ablation on opening 21 and the 14 replies classified persistent by the prior independent confirmation. 1024 fresh trials per move/policy in 32 independent batches of 32. Four policies isolate removing the five-turn cutoff, strengthening late checker play, and strengthening cube decisions. Candidate pairs and all policies share dice; seed-disjoint from previous experiments and timing/parity checks. No optional stopping. Full-strong additionally evaluates every previously retained candidate for coherent potential book updates. Three primary paired differences of move gaps per position (45 contrasts) use Bonferroni simultaneous 95% Student-t intervals. Four policy gaps per position form a separate 60-contrast family. Cubeful, Jacoby on, beavers off, normal filters, variance reduction, no rotation, bearoff database termination enabled. This measures continuation-policy and cutoff effects; it does not isolate neural weights from policy or establish XG as exact truth.' };
const inputs={signature:hash(JSON.stringify(unsigned)),...unsigned};
if(process.argv.includes('--plan-only')){console.log(JSON.stringify(inputs,null,2));process.exit(0);}
fs.mkdirSync(out,{recursive:true});
const save=(name,obj)=>{const f=path.join(out,name);fs.writeFileSync(f+'.tmp',JSON.stringify(obj,null,2)+'\n');fs.renameSync(f+'.tmp',f);};
const inputFile=path.join(out,'inputs.json'),log=path.join(out,'batches.jsonl'),lock=path.join(out,'lock');
if(fs.existsSync(inputFile)&&read(inputFile).signature!==inputs.signature)throw Error('Inputs changed');
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));try{process.kill(pid,0);throw Error('Already running '+pid);}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
if(!fs.existsSync(inputFile))save('inputs.json',inputs);fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const records=new Map();if(fs.existsSync(log)){const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));for(const l of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(l);if(records.has(r.key))throw Error('Duplicate record');records.set(r.key,r);}}
const jobs=[];for(let batch=0;batch<trials/batchSize;batch++)for(const d of plan)for(const policy of policies)for(const c of d.candidates.filter(c=>policy.id==='full-strong'||c.role!=='other-retained')){const seed=(d.seedBase+batch*65536)>>>0;jobs.push({key:[d.id,policy.id,batch,c.board].join('|'),id:d.id,policy:policy.id,board:c.board,role:c.role,batch,seed,original:c.original,after:c.after});}
const totalJobs=jobs.length;
let stopping=false,cursor=0,active=0;const children=[],started=Date.now();
let diskWarningAt=0;
const diskWarning=error=>{if(Date.now()-diskWarningAt>60000){diskWarningAt=Date.now();console.error('Checkpoint storage unavailable; completed batches stay in memory until space returns. '+error.message);}};
const freeBytes=()=>{const s=fs.statfsSync(out);return s.bavail*s.bsize;};
const spaceGate=async()=>{while(!stopping&&freeBytes()<512*1024*1024){diskWarning(Error('Less than 512 MiB free; waiting before dispatching more trials.'));await new Promise(r=>setTimeout(r,5000));}return !stopping;};
const progress=()=>{const v={completed:records.size,total:totalJobs,active,seconds:Math.round((Date.now()-started)/1000),freeMiB:Math.round(freeBytes()/1024/1024)};try{save('status.json',v);}catch(error){diskWarning(error);}console.log(JSON.stringify(v));};
class Worker{
 constructor(remote=false){this.remote=remote;this.child=spawn(remote?'ssh':path.join(native,'gnubg-core'),remote?['-o','BatchMode=yes','-o','ConnectTimeout=5','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',remoteHost,`cd ${remoteDir} && exec caffeinate -i ./gnubg-core`]:[],{cwd:native,stdio:['pipe','pipe','pipe']});this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
 createInterface({input:this.child.stdout}).on('line',line=>{if(line==='READY')return this.resolveReady();if(!line.startsWith('{'))return;const p=this.pending;this.pending=null;try{const v=JSON.parse(line);if(v.error||v.samples!==batchSize||!Number.isFinite(v.equity)||!Number.isFinite(v.standardError)||v.standardError<0||['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies'].some(k=>v[k]!==p.policy[k]))throw Error('Invalid native batch '+line);p?.resolve(v);}catch(e){p?.reject(e);}});
 this.child.stderr.on('data',d=>process.stderr.write(d));this.child.stdin.on('error',e=>{this.rejectReady(e);this.pending?.reject(e);});this.child.on('error',e=>{this.rejectReady(e);this.pending?.reject(e);});this.child.on('exit',(code,signal)=>{const e=Error('Native exit '+(signal||code));this.rejectReady(e);this.pending?.reject(e);});}
 async run(j){await this.ready;return new Promise((resolve,reject)=>{const policy=policies.find(p=>p.id===j.policy);this.pending={resolve,reject,policy};this.child.stdin.write([j.original,j.after,batchSize,j.seed,...['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies'].map(k=>policy[k])].join('\t')+'\n');});}
 close(){this.child.kill('SIGTERM');}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;console.log('Finishing active batches before stopping');});
const timer=setInterval(progress,30000);
async function work(remote=false){
 const w=new Worker(remote);children.push(w);
 while(!stopping&&cursor<jobs.length){
  const j=jobs[cursor++];if(records.has(j.key))continue;if(!await spaceGate())break;
  active++;const t=Date.now();let value;
  try{value=await w.run(j);}
  catch(error){
   if(!remote)throw error;
   // A disconnected helper never changes the sample: retry its exact unfinished
   // job on the remaining pool, including a final local drain if needed.
   jobs.push(j);w.close();console.error('Remote helper retired; requeued unfinished batch '+j.key+': '+error.message);return;
  }finally{active--;}
  const record={...j,value,elapsedMs:Date.now()-t,executionHost:remote?remoteHost:'local'};delete record.original;delete record.after;
  await appendCheckpoint(log,record,{onRetry:diskWarning});records.set(j.key,record);
 }
}
try{
 progress();await Promise.all([...Array.from({length:workers},()=>work()),...Array.from({length:remoteWorkers},()=>work(true))]);
 if(!stopping&&records.size<totalJobs)await work();
 progress();
 if(!stopping){
  if(records.size!==totalJobs)throw Error('Incomplete planned jobs after worker drain');
  await retryCheckpoint(()=>save('complete.json',{signature:inputs.signature,records:records.size,completedAt:new Date().toISOString()}),{onRetry:diskWarning});
 }
}
finally{clearInterval(timer);children.forEach(w=>w.close());fs.unlinkSync(lock);}
