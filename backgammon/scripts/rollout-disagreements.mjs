// SPDX-License-Identifier: GPL-3.0-or-later
// Fixed-cohort policy experiment. Checkpoints contain independent, common-seed
// batches; all contenders in a decision use the same policy and sample count.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {stateForBoard} from './book-branches.mjs';
import {toXGID} from '../core/xgid.mjs';
import {rolloutPolicy} from '../engine/rollout-policy.mjs';
import {commitTurn} from '../core/rules.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=x=>createHash('sha256').update(x).digest('hex');
const native=path.resolve(process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-strong-rollout-native-v3');
const out=path.resolve(process.env.BG_ROLLOUT_OUT||path.join(family,'test-results/rollout-policy-v1'));
const trials=Number(process.env.BG_ROLLOUT_TRIALS||512),workers=Number(process.env.BG_ROLLOUT_WORKERS||6);
if(!Number.isInteger(trials)||trials<64||trials>65536||trials%32||!Number.isInteger(workers)||workers<1||workers>16)throw Error('Invalid trials/workers');
const comparison=read(path.join(family,'docs/deep-book-comparison.json'));
const evaluations=read(path.join(family,'docs/deep-book-evaluations.json'));
const decisions=new Map([...evaluations.openings,...evaluations.replies].map(d=>[d.id,d]));
const controls=comparison.rows.filter(r=>r.kind==='reply'&&r.byDepth[5].agrees);
const controlIds=new Set(Array.from({length:12},(_,i)=>controls[Math.floor(i*controls.length/12)].id));
let rows=comparison.rows.filter(r=>r.kind==='opening'||!r.byDepth[5].agrees||controlIds.has(r.id));
if(process.env.BG_ROLLOUT_ONLY)rows=rows.filter(r=>process.env.BG_ROLLOUT_ONLY.split(',').includes(r.id));
const plan=rows.map(r=>{
 const d=decisions.get(r.id),s=stateForBoard(d.board,[...d.roll].map(Number));
 const leaders=Object.fromEntries(['historical','fourPly','fivePly'].map(k=>[k,Math.max(...d.candidates.map(c=>c[k]?.equity??-Infinity))]));
 const selected=d.candidates.filter((c,i)=>r.kind!=='opening'||i<2||c.board===r.referenceBest.board||Object.entries(leaders).some(([k,v])=>v-(c[k]?.equity??-Infinity)<=.040));
 const candidates=selected.map(c=>({...c,original:toXGID(s,{engine:true}),after:toXGID({...commitTurn(s,c.steps),phase:'roll',dice:[]},{engine:true}),reference:r.commonMoves.find(m=>m.board===c.board)||null}));
 return {id:r.id,kind:r.kind,cohort:r.kind==='opening'?'opening':r.byDepth[5].agrees?'reply-control':'reply-disagreement',source:r.source,referenceBest:r.referenceBest,board:d.board,roll:d.roll,candidates};
});
const policies=['basic','short-deep'].map(rolloutPolicy);
const inputs={schema:1,build:read(path.join(native,'build.json')),plan,policies,trials,batchSize:32,
 method:'All 15 openings, all 39 five-ply reply disagreements and 12 evenly spaced agreeing reply controls. Opening contenders are the top two five-ply moves plus every move within .040 at any of three/four/five plies and the XG leader. Every retained five-ply reply contender is included. Fixed trials per candidate/policy; no significance-driven early stopping. Independent 32-trial batches, common seeds across candidates and policies. Money Jacoby, no beavers. Fixed accuracy comparison: Basic versus Short/deep; full-game Balanced and Strong have implementation checks only.',
 sourceSHA256:hash(fs.readFileSync(path.join(family,'docs/deep-book-evaluations.json'))),referenceSHA256:hash(fs.readFileSync(path.join(family,'docs/deep-book-comparison.json')))};
const signature=hash(JSON.stringify(inputs));fs.mkdirSync(out,{recursive:true});
const inputFile=path.join(out,'inputs.json'),log=path.join(out,'batches.jsonl'),lock=path.join(out,'lock');
if(fs.existsSync(inputFile)&&read(inputFile).signature!==signature)throw Error('Inputs changed; use another output directory');
if(!fs.existsSync(inputFile))fs.writeFileSync(inputFile,JSON.stringify({signature,...inputs},null,2)+'\n');
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));try{process.kill(pid,0);throw Error('Already running '+pid);}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(lock);}
fs.writeFileSync(lock,String(process.pid),{flag:'wx'});
const records=new Map();
if(fs.existsSync(log)){const raw=fs.readFileSync(log,'utf8'),end=raw.lastIndexOf('\n')+1;if(end!==raw.length)fs.truncateSync(log,Buffer.byteLength(raw.slice(0,end)));for(const line of raw.slice(0,end).trim().split('\n').filter(Boolean)){const r=JSON.parse(line);if(records.has(r.key))throw Error('Duplicate checkpoint key');records.set(r.key,r);}}
const jobs=[];
// Round-robin batches provide early coverage without changing the fixed plan.
for(const p of [policies[1],policies[0]])for(let batch=0;batch<trials/32;batch++)for(const d of plan)for(const c of d.candidates){
 const key=[d.id,p.id,batch,c.board].join('|');
 const seed=(parseInt(hash(d.id).slice(0,8),16)+batch*65536)>>>0;
 jobs.push({key,id:d.id,board:c.board,policy:p.id,checkerPlies:p.checkerPlies,cubePlies:p.cubePlies,shortRollout:Number(p.truncationPlies>0),batch,seed,original:c.original,after:c.after});
}
let stopping=false,cursor=0,active=0;const pool=[],started=Date.now();
const save=(name,value)=>{const file=path.join(out,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
function progress(){const status={completed:records.size,total:jobs.length,active,seconds:Math.round((Date.now()-started)/1000),policies:Object.fromEntries(policies.map(p=>[p.id,[...records.values()].filter(r=>r.policy===p.id).length]))};save('status.json',status);console.log(JSON.stringify(status));}
class Worker{
 constructor(){this.child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','pipe']});this.ready=new Promise((resolve,reject)=>{this.readyResolve=resolve;this.readyReject=reject;});
 createInterface({input:this.child.stdout}).on('line',line=>{if(line==='READY')return this.readyResolve();if(!line.startsWith('{'))return;try{const v=JSON.parse(line);if(v.error||!Number.isFinite(v.equity)||!Number.isFinite(v.standardError)||v.standardError<0||v.samples!==32)throw Error('Invalid rollout '+line);const p=this.pending;this.pending=null;p?.resolve(v);}catch(e){this.pending?.reject(e);}});
 this.child.stderr.on('data',d=>process.stderr.write(d));this.child.on('error',e=>{this.readyReject(e);this.pending?.reject(e);});this.child.on('exit',code=>{const e=Error('Native exit '+code);this.readyReject(e);this.pending?.reject(e);});}
 async run(j){await this.ready;return new Promise((resolve,reject)=>{this.pending={resolve,reject};this.child.stdin.write([j.original,j.after,32,j.seed,j.checkerPlies,j.cubePlies,j.shortRollout].join('\t')+'\n');});}
 close(){this.child.kill('SIGTERM');}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;console.log('Finishing active batches before stopping');});
const timer=setInterval(progress,30000);
try{
 progress();
 await Promise.all(Array.from({length:workers},async()=>{const w=new Worker();pool.push(w);while(!stopping&&cursor<jobs.length){const j=jobs[cursor++];if(records.has(j.key))continue;active++;const t=Date.now(),value=await w.run(j);active--;if(value.checkerPlies!==j.checkerPlies||value.cubePlies!==j.cubePlies)throw Error('Policy mismatch');if(value.truncationPlies!==(j.shortRollout?5:0))throw Error('Truncation mismatch');const record={key:j.key,id:j.id,board:j.board,policy:j.policy,batch:j.batch,seed:j.seed,elapsedMs:Date.now()-t,value};fs.appendFileSync(log,JSON.stringify(record)+'\n');records.set(j.key,record);}}));
 progress();if(!stopping)save('complete.json',{signature,records:records.size,completedAt:new Date().toISOString()});
}finally{clearInterval(timer);for(const w of pool)w.close();fs.unlinkSync(lock);}
