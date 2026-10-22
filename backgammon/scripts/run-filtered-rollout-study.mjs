// SPDX-License-Identifier: GPL-3.0-or-later
// Fixed corrected-filter study: counts only until every planned batch completes.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {appendCheckpoint,retryCheckpoint} from './rollout-checkpoint.mjs';
import {family,PREFIX,createPlan,jobsFor,hash,FIELDS} from './filtered-rollout-plan.mjs';
const native=process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-filtered-rollout-v1';
const out=path.resolve(process.env.BG_STUDY_OUT||path.join(family,'test-results',PREFIX));
const workers=Number(process.env.BG_ROLLOUT_WORKERS||4),shard=Number(process.env.BG_STUDY_SHARD||0);
const read=f=>JSON.parse(fs.readFileSync(f));
const inputs=read(path.join(family,`docs/${PREFIX}-inputs.json`));
if(!inputs.collectionEnabled||!inputs.runtime||inputs.runtime.platform!=='linux'||inputs.runtime.architecture!=='arm64')throw Error('Validated Linux runtime has not been frozen');
if(createPlan(inputs.runtime).signature!==inputs.signature)throw Error('Frozen source/input plan changed');
if(!Number.isInteger(shard)||shard<0||shard>=inputs.shards||!Number.isInteger(workers)||workers<1||workers>4)throw Error('Invalid shard/worker count');
for(const [id,digest] of Object.entries(inputs.runtime.binaries))if(hash(fs.readFileSync(path.join(native,inputs.runtime.files[id])))!==digest)throw Error('Native binary changed');
for(const [file,digest] of Object.entries(inputs.runtime.assets))if(hash(fs.readFileSync(path.join(native,file)))!==digest)throw Error('Runtime asset changed');
const platform=read(path.join(out,'platform-validation.json'));
const platformFields={schema:1,platform:'linux',architecture:'arm64',cases:12,trialsPerCase:2,tolerance:1e-5,allWithinTolerance:true,scriptSHA256:hash(fs.readFileSync(path.join(family,'scripts/validate-filtered-rollout-platform.py')))};
if(Object.entries(platformFields).some(([k,v])=>platform[k]!==v)||!Number.isFinite(platform.maxNumericDifference)||platform.maxNumericDifference<0||platform.maxNumericDifference>platformFields.tolerance)throw Error('Worker platform metadata changed');
if(!platform.allWithinTolerance||JSON.stringify(platform.binaries)!==JSON.stringify(inputs.runtime.binaries)||platform.fixtureSHA256!==inputs.runtime.fixtureSHA256)throw Error('Worker platform validation missing');
const jobs=jobsFor(inputs,shard),expected=new Map(jobs.map(j=>[j.key,j])),policies=new Map(inputs.policies.map(p=>[p.id,p]));
function validate(r){const j=expected.get(r.key),p=policies.get(r.policy),v=r.value;if(!j||!p||['id','policy','runtime','candidateId','role','board','batch','seed'].some(k=>r[k]!==j[k]))throw Error('Unplanned batch identity');
 if(v.samples!==inputs.batchSize||!Number.isFinite(v.equity)||!Number.isFinite(v.cubeless)||!Number.isFinite(v.standardError)||v.standardError<0||FIELDS.filter(k=>k!=='endpointPlies').some(k=>v[k]!==p[k])||!Array.isArray(v.probabilities)||v.probabilities.length!==5||v.probabilities.some(x=>!Number.isFinite(x))||!Array.isArray(v.cubeActions)||v.cubeActions.length!==10||v.cubeActions.some(x=>!Number.isSafeInteger(x)||x<0)||!Number.isInteger(v.maxCube)||v.maxCube<1||v.maxCube>1024||(v.maxCube&(v.maxCube-1)))throw Error('Invalid native result');}
fs.mkdirSync(out,{recursive:true});
const save=(n,v)=>{const f=path.join(out,n);fs.writeFileSync(f+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(f+'.tmp',f);};
const lock=path.join(out,'lock'),log=path.join(out,'batches.jsonl');
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));try{process.kill(pid,0);throw Error('Already running '+pid);}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
if(fs.existsSync(path.join(out,'inputs.json'))&&read(path.join(out,'inputs.json')).signature!==inputs.signature)throw Error('Checkpoint plan changed');
save('inputs.json',inputs);fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const records=new Map();
if(fs.existsSync(log)){const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));for(const line of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(line);validate(r);if(records.has(r.key))throw Error('Duplicate record');records.set(r.key,r);}}
let stopping=false,cursor=0,active=0;const children=[],started=Date.now();
const progress=()=>{const s=fs.statfsSync(out),v={completed:records.size,total:jobs.length,active,shard,shards:inputs.shards,seconds:Math.round((Date.now()-started)/1000),freeMiB:Math.round(s.bavail*s.bsize/1024/1024)};save('status.json',v);console.log(JSON.stringify(v));};
class Worker{
 constructor(runtime){this.child=spawn(path.join(native,inputs.runtime.files[runtime]),[],{cwd:native,stdio:['pipe','pipe','pipe']});this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});createInterface({input:this.child.stdout}).on('line',line=>{if(line==='READY')return this.resolveReady();if(!line.startsWith('{'))return;const p=this.pending;this.pending=null;try{const value=JSON.parse(line);validate({...p.job,value});p.resolve(value);}catch(e){p?.reject(e);}});this.child.stderr.on('data',d=>process.stderr.write(d));const fail=e=>{this.rejectReady(e);this.pending?.reject(e);};this.child.on('error',fail);this.child.stdin.on('error',fail);this.child.on('exit',(c,s)=>fail(Error('Native exit '+(s||c))));}
 async run(job){await this.ready;return new Promise((resolve,reject)=>{this.pending={job,resolve,reject};const p=policies.get(job.policy);this.child.stdin.write([job.original,job.after,inputs.batchSize,job.seed,...FIELDS.map(k=>p[k])].join('\t')+'\n');});}
 close(){this.child.kill('SIGTERM');}
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;console.log('Finishing active batches before stopping');});
async function work(){const runtimes=new Map();while(!stopping&&cursor<jobs.length){const j=jobs[cursor++];if(records.has(j.key))continue;while(!stopping){const s=fs.statfsSync(out);if(s.bavail*s.bsize>=512*1024*1024)break;await new Promise(r=>setTimeout(r,5000));}if(stopping)break;
 let w=runtimes.get(j.runtime);if(!w){w=new Worker(j.runtime);runtimes.set(j.runtime,w);children.push(w);}active++;const t=Date.now();let value;try{value=await w.run(j);}finally{active--;}
 const r={...j,value,elapsedMs:Date.now()-t};delete r.original;delete r.after;await appendCheckpoint(log,r);records.set(j.key,r);}}
const timer=setInterval(progress,30000);
try{progress();await Promise.all(Array.from({length:workers},()=>work()));progress();if(!stopping){if(records.size!==jobs.length)throw Error('Incomplete run');await retryCheckpoint(()=>save('complete.json',{signature:inputs.signature,records:records.size,shard,shards:inputs.shards,completedAt:new Date().toISOString()}));}}
finally{clearInterval(timer);children.forEach(w=>w.close());fs.unlinkSync(lock);}
