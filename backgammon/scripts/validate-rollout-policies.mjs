// SPDX-License-Identifier: GPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {createEvaluator} from '../engine/evaluate.mjs';
import {ENGINE_VERSION} from '../engine/metadata.mjs';
import {legalTurns} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=process.env.BG_ROLLOUT_NATIVE||'/tmp/bg-strong-rollout-native-v3';
const data=fs.readFileSync(path.join(family,'engine/vendor/gnubg-core-module.data'));
async function load(dir){const create=(await import(pathToFileURL(path.join(dir,'gnubg-core-module.js')).href)).default;return create({wasmBinary:fs.readFileSync(path.join(dir,'gnubg-core-module.wasm')),getPreloadedPackage:()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),print:()=>{},printErr:()=>{}});}
const scalarModule=await load(path.join(family,'engine/vendor')),simdModule=await load(path.join(family,'engine/vendor/simd'));
const scalar=createEvaluator(scalarModule),simd=createEvaluator(simdModule);
const child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,env:{...process.env,BG_ROLLOUT_SMALL_CACHE:'1'},stdio:['pipe','pipe','inherit']});
let pending;let readyResolve;const ready=new Promise(r=>readyResolve=r);
createInterface({input:child.stdout}).on('line',line=>{if(line==='READY')readyResolve();else if(line.startsWith('{')){const p=pending;pending=null;const value=JSON.parse(line);value.error?p.reject(Error(value.error)):p.resolve(value);}});
child.on('exit',code=>pending?.reject(Error('Native exited '+code)));
const query=async(s,turn,depth,shortRollout)=>{await ready;return new Promise((resolve,reject)=>{pending={resolve,reject};child.stdin.write([toXGID(s,{engine:true}),turn?toXGID({...turn.state,dice:[],phase:'roll'},{engine:true}):'',8,19034,depth,depth,Number(shortRollout)].join('\t')+'\n');});};
const fixtures=JSON.parse(fs.readFileSync(path.join(family,'data/exercises.json'))).items;
const race=fixtures.find(f=>f.topic==='race').state,cube=fixtures.find(f=>f.topic==='cube').state;
const mirror=s=>({...s,points:[...s.points].reverse().map(x=>-x),bar:[...s.bar].reverse(),off:[...s.off].reverse(),turn:1-s.turn,scores:[...s.scores].reverse(),cube:{...s.cube,owner:s.cube.owner===null?null:1-s.cube.owner}});
const cases=[['opening-money',fixtures.find(f=>f.topic==='opening').state],['checker-money',race],['checker-match',{...race,matchLength:5,scores:[2,3]}],['checker-mirror',mirror(race)],['cube-money',cube],['cube-match',{...cube,matchLength:5,scores:[2,3]}]];
const rows=[];const tolerance=1e-5;
function diff(a,b){let max=0;for(const k of ['equity','cubeless','mwc','standardError','mwcStandardError','probabilities','outcomes','outcomesMWC','outcomeSE']){if(a[k]==null||b[k]==null){if(a[k]!==b[k])throw Error('Unit mismatch '+k);continue;}const aa=Array.isArray(a[k])?a[k]:[a[k]],bb=Array.isArray(b[k])?b[k]:[b[k]];if(aa.length!==bb.length)throw Error('Shape mismatch');aa.forEach((v,i)=>{if(!Number.isFinite(v)||!Number.isFinite(bb[i]))throw Error('Invalid number');max=Math.max(max,Math.abs(v-bb[i]));});}return max;}
try{
 for(const [name,s] of cases.filter(c=>!process.env.BG_POLICY_CASE||c[0]===process.env.BG_POLICY_CASE))for(const [policy,depth] of [['basic',0],['balanced',1],['strong',2],['short-deep',2]]){
  const turn=s.phase==='move'?legalTurns(s)[0]:null;
  const n=await query(s,turn,depth,policy==='short-deep'),a=scalar.rolloutBatch(s,turn,8,19034,policy),b=simd.rolloutBatch(s,turn,8,19034,policy);
  const maximumDifference=Math.max(diff(n,a),diff(n,b));
  if(maximumDifference>tolerance) {console.log(JSON.stringify({name,policy,native:n,scalar:a,simd:b}));throw Error(`${name}/${policy} parity ${maximumDifference}`);}
  rows.push({name,policy,checkerPlies:depth,cubePlies:depth,truncationPlies:policy==='short-deep'?5:0,xgid:toXGID(s,{engine:true}),after:turn?toXGID({...turn.state,dice:[],phase:'roll'},{engine:true}):'',samples:8,seed:19034,native:n,scalar:a,simd:b,maximumDifference});console.log(name,policy,maximumDifference);
 }
 // Centered automatic opening stakes must preserve current-cube units.
 const baseOpening=cases[0][1],scaledOpening={...baseOpening,cube:{value:4,owner:null}};
 const baseTurn=legalTurns(baseOpening)[0],scaledTurn=legalTurns(scaledOpening)[0];
 const baseValue=await query(baseOpening,baseTurn,2,true),scaledValue=await query(scaledOpening,scaledTurn,2,true);
 const scaleDifference=diff(baseValue,scaledValue);
 if(scaleDifference>tolerance)throw Error('Centered money-cube scale mismatch');
 const centeredMoneyCubeScaleCheck={original:toXGID(baseOpening,{engine:true}),after:toXGID({...baseTurn.state,dice:[],phase:'roll'},{engine:true}),stakes:[1,4],samples:8,seed:19034,policy:'short-deep',values:[baseValue,scaledValue],maximumDifference:scaleDifference};
 // The old ABI remains exactly Basic, even following a Strong call.
 const s=race,t=legalTurns(s)[0],old=scalarModule.cwrap('bg_rollout','number',['string','string','number','number']);
 const ptr=old(toXGID(s,{engine:true}),toXGID({...t.state,dice:[],phase:'roll'},{engine:true}),8,19034);
 const legacy=JSON.parse(scalarModule.UTF8ToString(ptr));scalarModule._free(ptr);
 if(diff(legacy,scalar.rolloutBatch(s,t,8,19034,'basic'))>tolerance)throw Error('Basic ABI policy isolation failed');
 // Reject invalid policies at the C boundary, before performing any simulation.
 const raw=scalarModule.cwrap('bg_rollout_config','number',['string','string','number','number','number','number','number']);
 const invalidConfigurations=[[-1,1,0],[3,1,0],[1,-1,0],[1,3,0],[2,2,-1],[2,2,2],[0,2,1],[2,1,1]];
 for(const depths of invalidConfigurations){const p=raw(toXGID(s,{engine:true}),'',8,1,...depths);const v=JSON.parse(scalarModule.UTF8ToString(p));scalarModule._free(p);if(!v.error)throw Error('Invalid native depth accepted');}
 const report={schema:1,centeredMoneyCubeScaleCheck,invalidConfigurationsRejected:invalidConfigurations,engine:ENGINE_VERSION,recordedAt:new Date().toISOString(),tolerance,maximumDifference:Math.max(...rows.map(r=>r.maximumDifference)),description:'Seeded implementation parity, not a strength benchmark. Native ARM64 and scalar/SIMD WebAssembly, four policies, checker/cube money and match contexts, mirrored checker position, legacy ABI isolation and invalid-depth rejection.',nativeCacheMode:'default, matching WASM',build:JSON.parse(fs.readFileSync(path.join(native,'build.json'))),bridgeSHA256:createHash('sha256').update(fs.readFileSync(path.join(family,'engine/source/bridge.c'))).digest('hex'),rows};
 const output=path.join(family,'docs/rollout-policy-validation.json');fs.writeFileSync(output+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(output+'.tmp',output);
}finally{child.kill();scalar.shutdown();simd.shutdown();}
