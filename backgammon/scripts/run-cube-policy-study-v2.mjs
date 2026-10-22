// SPDX-License-Identifier: GPL-3.0-or-later
// Fixed paired full-game cube/checker study of 41$-44; no outcome-based stopping.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {appendCheckpoint,retryCheckpoint} from './rollout-checkpoint.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prefix='cube-policy-study-v2';
const native=process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-cube-study-v2';
const out=path.resolve(process.env.BG_STUDY_OUT||path.join(family,'test-results/cube-policy-study-v2'));
const workers=Number(process.env.BG_ROLLOUT_WORKERS||4),trials=16384,batchSize=32,shards=20;
const shard=Number(process.env.BG_STUDY_SHARD||0);
if(!Number.isInteger(shard)||shard<0||shard>=shards)throw Error('Invalid shard');
if(!Number.isInteger(workers)||workers<1||workers>14)throw Error('Invalid worker count');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=b=>createHash('sha256').update(b).digest('hex');
const priorBytes=fs.readFileSync(path.join(family,'docs/reply-fullgame-precision-inputs.json')),prior=JSON.parse(priorBytes);
const d=structuredClone(prior.plan.find(d=>d.id==='reply-7985255600f3563f-44'));
if(d.candidates.length!==2)throw Error('Unexpected candidate set');
const build=read(path.join(native,'build.json'));
if(!build.cubeStudyInputs||hash(fs.readFileSync(path.join(native,'gnubg-core')))!==build.binarySHA256)throw Error('Unexpected native build');
const validationBytes=fs.readFileSync(path.join(family,'docs/cube-policy-v2-linux-validation.json')),validation=JSON.parse(validationBytes);
if(validation.binarySHA256!==build.binarySHA256||!validation.allWithinTolerance||validation.cases!==26)throw Error('Legacy replay validation missing');
const used=new Set();
for(const prefix of ['rollout-policy','rollout-diagnostic'])for(const line of gunzipSync(fs.readFileSync(path.join(family,`docs/${prefix}-batches.jsonl.gz`))).toString().trim().split('\n')){
 const r=JSON.parse(line);for(let i=0;i<r.value.samples;i++)used.add((r.seed+256*i)>>>0);
}
for(const prefix of ['fullgame-ablation','opening-fullgame-confirmation','fullgame-precision','opening-fullgame-precision','reply-fullgame-precision','cube-policy-study']){
 const p=read(path.join(family,`docs/${prefix}-inputs.json`));
 for(const d of p.plan)for(let i=0;i<p.trials;i++)used.add((d.seedBase+Math.floor(i/p.batchSize)*65536+(i%p.batchSize)*256)>>>0);
}
for(const seed of [123456789,987654321,31811004])for(let i=0;i<8;i++)used.add((seed+256*i)>>>0);
let nonce=0,seeds;
do{d.seedBase=parseInt(hash(`${prefix}:${d.id}:${nonce++}`).slice(0,8),16);seeds=Array.from({length:trials},(_,i)=>(d.seedBase+Math.floor(i/batchSize)*65536+(i%batchSize)*256)>>>0);}while(seeds.some(s=>used.has(s)));
d.seedNonce=nonce-1;
const common={cubePlies:2,truncationPlies:0,lateAfterPlies:0,lateCubePlies:2,endpointPlies:2,vrPlies:1};
const policies=[
 {id:'legacy',label:'Previous ordinary-cube policy and cache',checkerPlies:2,lateCheckerPlies:2,rulesMode:0,filter:0,cacheContext:0},
 {id:'cache',label:'Cache-context fix only; ordinary cube',checkerPlies:2,lateCheckerPlies:2,rulesMode:0,filter:0,cacheContext:1},
 {id:'matched',label:'XG cube rules · 2-ply normal checker',checkerPlies:2,lateCheckerPlies:2,rulesMode:3,filter:0,cacheContext:1},
 {id:'wide',label:'XG cube rules · 2-ply huge checker filter',checkerPlies:2,lateCheckerPlies:2,rulesMode:3,filter:1,cacheContext:1},
 {id:'deep',label:'XG cube rules · 3-ply large checker filter',checkerPlies:3,lateCheckerPlies:3,rulesMode:3,filter:2,cacheContext:1},
].map(p=>({...p,...common}));
const runtimeBytes=fs.readFileSync(path.join(family,'docs/cube-policy-v2-runtime.json'));
const runtime=JSON.parse(runtimeBytes);
if(build.binarySHA256!==runtime.binarySHA256)throw Error('Unvalidated worker executable');
for(const [file,digest] of Object.entries(runtime.assets))if(hash(fs.readFileSync(path.join(native,file)))!==digest)throw Error('Runtime asset changed: '+file);
const unsigned={schema:2,id:prefix,priorSignature:prior.signature,priorInputsSHA256:hash(priorBytes),build,validationSHA256:hash(validationBytes),runnerSHA256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),plan:[d],policies,trials,batchSize,shards,runtimeSHA256:hash(runtimeBytes),supersedes:read(path.join(family,'docs/cube-policy-study-inputs.json')).signature,cacheValidationSHA256:hash(fs.readFileSync(path.join(family,'docs/cube-cache-context-linux-validation.json'))),
 effects:[['cache','legacy'],['matched','cache'],['wide','matched'],['deep','matched']],gapComparisons:5,effectComparisons:4,candidateEffectComparisons:8,
 rules:{matchLength:0,jacoby:true,matchedImmediateRedoubles:2,cubeLimit:1024,startingCube:1,cubeOwner:null},
 method:'Fixed independent 16384 full-game trials per candidate and policy, 512 paired blocks of 32, 163840 games total. Both retained 41$-44 candidates under five policies. Shared dice across candidates and policies; every seed disjoint from preceding studies and timing/validation samples. Cube strength stays at GNUbg 2-ply; checker policies vary normal 2-ply, huge-filter 2-ply, large-filter 3-ply throughout every full game. Identical 1-ply control-variate evaluations across all policies; no dice rotation, fixed-turn cutoff, late policy reduction, pooling, optional stopping, or reference-value correction. Exact two-sided bearoff evaluation remains eligible. XG rules mean money/Jacoby/beaver/raccoon, original responder retains ownership, cube ceiling 1024. Actual legal cube branches are separately evaluated; future search-node beaver backups use scale-invariant continuation approximations. Both evaluator caches are cleared before each paired block for all arms, keeping block outcomes independent of worker scheduling. Legacy retains the old cache-key defect within its block. Cache-only changes only that key; matched adds corrected XG cube rules; wide/deep add checker strength. All 20 fixed shards use the same validated Linux ARM64 executable and weights. All seeds planned for the aborted v1 experiment are excluded. Five paired move gaps and four differences of gaps have separate simultaneous 95% Student-t families. Eight per-candidate policy effects form a third family. Absolute differences against published XG EVs are descriptive; original XG margins retained. Selection follows the previous completed experiment; this is one diagnostic position, not an all-openings accuracy claim.'};
const inputs={signature:hash(JSON.stringify(unsigned)),...unsigned};
if(process.argv.includes('--plan-only')){console.log(JSON.stringify(inputs,null,2));process.exit(0);}
const frozen=read(path.join(family,`docs/${prefix}-inputs.json`));
if(frozen.signature!==inputs.signature)throw Error('Committed plan differs from computed plan');
fs.mkdirSync(out,{recursive:true});
const save=(n,v)=>{const f=path.join(out,n);fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(f+'.tmp',f);};
const lock=path.join(out,'lock'),log=path.join(out,'batches.jsonl');
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));try{process.kill(pid,0);throw Error('Already running '+pid);}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
if(fs.existsSync(path.join(out,'inputs.json'))&&read(path.join(out,'inputs.json')).signature!==inputs.signature)throw Error('Checkpoint plan changed');
save('inputs.json',inputs);fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const records=new Map();
const fields=['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies','rulesMode','filter','vrPlies','cacheContext'];
const jobs=[];for(let batch=0;batch<trials/batchSize;batch++)if(batch%shards===shard)for(const policy of policies)for(const c of d.candidates){const seed=(d.seedBase+batch*65536)>>>0;jobs.push({key:[policy.id,batch,c.role].join('|'),id:d.id,policy:policy.id,role:c.role,board:c.board,batch,seed,original:c.original,after:c.after});}
const expected=new Map(jobs.map(j=>[j.key,j]));
function validate(r){const j=expected.get(r.key),p=policies.find(p=>p.id===r.policy);if(!j||['id','policy','role','board','batch','seed'].some(k=>r[k]!==j[k])||!p)throw Error('Unplanned record');const v=r.value;if(v.samples!==batchSize||!Number.isFinite(v.equity)||!Number.isFinite(v.standardError)||v.standardError<0||fields.filter(k=>k!=='endpointPlies').some(k=>v[k]!==p[k])||!Array.isArray(v.cubeActions)||v.cubeActions.length!==10||v.cubeActions.some(x=>!Number.isSafeInteger(x)||x<0))throw Error('Invalid native result');}
if(fs.existsSync(log)){const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));for(const line of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(line);validate(r);if(records.has(r.key))throw Error('Duplicate record');records.set(r.key,r);}}
let stopping=false,cursor=0,active=0;const children=[],started=Date.now();
const progress=()=>{const s=fs.statfsSync(out),v={completed:records.size,total:jobs.length,active,shard,shards,seconds:Math.round((Date.now()-started)/1000),freeMiB:Math.round(s.bavail*s.bsize/1024/1024)};save('status.json',v);console.log(JSON.stringify(v));};
class Worker{
 constructor(){this.child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','pipe']});this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});createInterface({input:this.child.stdout}).on('line',line=>{if(line==='READY')return this.resolveReady();if(!line.startsWith('{'))return;const p=this.pending;this.pending=null;try{const value=JSON.parse(line);validate({...p.job,value});p.resolve(value);}catch(e){p?.reject(e);}});this.child.stderr.on('data',d=>process.stderr.write(d));const fail=e=>{this.rejectReady(e);this.pending?.reject(e);};this.child.on('error',fail);this.child.stdin.on('error',fail);this.child.on('exit',(c,s)=>fail(Error('Native exit '+(s||c))));}
 async run(job){await this.ready;return new Promise((resolve,reject)=>{this.pending={job,resolve,reject};const p=policies.find(p=>p.id===job.policy);this.child.stdin.write([job.original,job.after,batchSize,job.seed,...fields.map(k=>p[k])].join('\t')+'\n');});}
 close(){this.child.kill('SIGTERM');}
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;console.log('Finishing active batches before stopping');});
async function work(){const w=new Worker();children.push(w);while(!stopping&&cursor<jobs.length){const j=jobs[cursor++];if(records.has(j.key))continue;while(!stopping){const s=fs.statfsSync(out);if(s.bavail*s.bsize>=512*1024*1024)break;await new Promise(r=>setTimeout(r,5000));}if(stopping)break;active++;const t=Date.now();let value;try{value=await w.run(j);}finally{active--;}const r={...j,value,elapsedMs:Date.now()-t};delete r.original;delete r.after;await appendCheckpoint(log,r);records.set(j.key,r);}}
const timer=setInterval(progress,30000);
try{progress();await Promise.all(Array.from({length:workers},()=>work()));progress();if(!stopping){if(records.size!==jobs.length)throw Error('Incomplete run');await retryCheckpoint(()=>save('complete.json',{signature:inputs.signature,records:records.size,shard,shards,completedAt:new Date().toISOString()}));}}
finally{clearInterval(timer);children.forEach(w=>w.close());fs.unlinkSync(lock);}
