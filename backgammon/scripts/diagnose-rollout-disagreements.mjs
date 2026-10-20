// SPDX-License-Identifier: GPL-3.0-or-later
// Independent, fixed-pair confirmation of the 24 published disagreements.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-strong-rollout-native-v3';
const out=path.resolve(process.env.BG_DIAGNOSTIC_OUT||path.join(family,'test-results/rollout-diagnostic-v1'));
const workers=Number(process.env.BG_ROLLOUT_WORKERS||8),trials=4096,batchSize=32;
if(!Number.isInteger(workers)||workers<1||workers>16)throw Error('Invalid worker count');
const read=f=>JSON.parse(fs.readFileSync(f)),hash=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=fs.readFileSync(path.join(family,'docs/rollout-policy-comparison.json')),source=JSON.parse(sourceBytes);
const previous=read(path.join(family,'docs/rollout-policy-inputs.json')),build=read(path.join(native,'build.json'));
if(build.binarySHA256!==previous.build.binarySHA256||hash(fs.readFileSync(path.join(native,'gnubg-core')))!==build.binarySHA256)throw Error('Native engine changed');
const oldRecords=gunzipSync(fs.readFileSync(path.join(family,'docs/rollout-policy-batches.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse);
const used=new Set(oldRecords.flatMap(r=>Array.from({length:r.value.samples},(_,i)=>(r.seed+i*256)>>>0)));
const plan=source.rows.filter(r=>!r.policies['short-deep'].agrees).map(r=>{
 const old=r.policies['short-deep'],input=previous.plan.find(p=>p.id===r.id);
 const candidates=[old.bestBoard,r.referenceBest.board].map((board,i)=>({...input.candidates.find(c=>c.board===board),role:i?'xg-choice':'previous-choice'}));
 let nonce=0,seedBase,seeds;
 do{seedBase=parseInt(hash(`rollout-diagnostic-v1:${r.id}:${nonce++}`).slice(0,8),16);seeds=Array.from({length:trials},(_,i)=>(seedBase+Math.floor(i/batchSize)*65536+(i%batchSize)*256)>>>0);}while(seeds.some(s=>used.has(s)));
 seeds.forEach(s=>used.add(s));
 return {...input,candidates,seedBase,seedNonce:nonce-1,previousChoice:old.bestBoard,previousGap:old.bestEquity-old.candidates.find(c=>c.board===r.referenceBest.board).equity};
});
if(plan.length!==24||plan.filter(p=>p.kind==='opening').map(p=>p.roll).join()!=='21'||plan.some(p=>p.candidates.length!==2||p.candidates.some(c=>!c.original||!c.after)))throw Error('Unexpected diagnostic cohort');
const policy=previous.policies.find(p=>p.id==='short-deep');
const unsigned={schema:1,build,sourceSHA256:hash(sourceBytes),sourceSignature:source.signature,plan,policy,trials,batchSize,
 method:'Fixed independent confirmation: opening 21 and all 23 remaining replies. Exactly the previous GNUbg leader and the published XG leader, selected before the new run. 4096 new trials per move in 128 independent 32-trial batches. Shared dice within each pair; no seed overlaps with the earlier experiment or other diagnostic positions. Same Short/deep policy, engine, rules and endpoints; no optional stopping. Primary contrast is previous GNUbg choice minus XG choice. New trials are analyzed separately from the selection sample. Two-sided paired Student-t intervals at 95%, plus Bonferroni simultaneous 95% coverage for 24 fixed contrasts. This tests sampling noise in this pipeline, not the correctness of XG or the neural evaluator alone.'};
const inputs={signature:hash(JSON.stringify(unsigned)),...unsigned};fs.mkdirSync(out,{recursive:true});
const save=(name,obj)=>{const f=path.join(out,name);fs.writeFileSync(f+'.tmp',JSON.stringify(obj,null,2)+'\n');fs.renameSync(f+'.tmp',f);};
const inputFile=path.join(out,'inputs.json'),log=path.join(out,'batches.jsonl'),lock=path.join(out,'lock');
if(fs.existsSync(inputFile)&&read(inputFile).signature!==inputs.signature)throw Error('Inputs changed');
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock));try{process.kill(pid,0);throw Error('Already running '+pid);}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
save('inputs.json',inputs);fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const records=new Map();if(fs.existsSync(log)){const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));for(const l of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(l);if(records.has(r.key))throw Error('Duplicate record');records.set(r.key,r);}}
const jobs=[];for(let batch=0;batch<trials/batchSize;batch++)for(const d of plan)for(const c of d.candidates){const seed=(d.seedBase+batch*65536)>>>0;jobs.push({key:[d.id,batch,c.board].join('|'),id:d.id,board:c.board,role:c.role,batch,seed,original:c.original,after:c.after});}
let stopping=false,cursor=0,active=0;const children=[],started=Date.now();
const progress=()=>{const v={completed:records.size,total:jobs.length,active,seconds:Math.round((Date.now()-started)/1000)};save('status.json',v);console.log(JSON.stringify(v));};
class Worker{
 constructor(){this.child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','pipe']});this.ready=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});
 createInterface({input:this.child.stdout}).on('line',line=>{if(line==='READY')return this.resolveReady();if(!line.startsWith('{'))return;const p=this.pending;this.pending=null;try{const v=JSON.parse(line);if(v.error||v.samples!==batchSize||!Number.isFinite(v.equity)||!Number.isFinite(v.standardError)||v.standardError<0||['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies'].some(k=>v[k]!==policy[k]))throw Error('Invalid native batch '+line);p?.resolve(v);}catch(e){p?.reject(e);}});
 this.child.stderr.on('data',d=>process.stderr.write(d));this.child.on('error',e=>{this.rejectReady(e);this.pending?.reject(e);});this.child.on('exit',code=>{const e=Error('Native exit '+code);this.rejectReady(e);this.pending?.reject(e);});}
 async run(j){await this.ready;return new Promise((resolve,reject)=>{this.pending={resolve,reject};this.child.stdin.write([j.original,j.after,batchSize,j.seed,2,2,1].join('\t')+'\n');});}
 close(){this.child.kill('SIGTERM');}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;console.log('Finishing active batches before stopping');});
const timer=setInterval(progress,30000);
try{progress();await Promise.all(Array.from({length:workers},async()=>{const w=new Worker();children.push(w);while(!stopping&&cursor<jobs.length){const j=jobs[cursor++];if(records.has(j.key))continue;active++;const t=Date.now(),value=await w.run(j);active--;const record={...j,value,elapsedMs:Date.now()-t};delete record.original;delete record.after;fs.appendFileSync(log,JSON.stringify(record)+'\n');records.set(j.key,record);}}));progress();if(!stopping)save('complete.json',{signature:inputs.signature,records:records.size,completedAt:new Date().toISOString()});}
finally{clearInterval(timer);children.forEach(w=>w.close());fs.unlinkSync(lock);}
