// SPDX-License-Identifier: GPL-3.0-or-later
// Compare the shipped bridge to an independently built, unmodified GNUbg CLI.
// GNUBG_BIN=/path/to/gnubg GNUBG_DATA=/path/to/data node this-file.mjs [output]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import createModule from '../engine/vendor/gnubg-core-module.js';
import {fromXGID,toXGID} from '../core/xgid.mjs';
import {applyStep,boardKey,legalTurns} from '../core/rules.mjs';

const family=fileURLToPath(new URL('../',import.meta.url));
const binary=process.env.GNUBG_BIN, dataDir=process.env.GNUBG_DATA;
if(!binary||!dataDir)throw Error('GNUBG_BIN and GNUBG_DATA are required.');
const destination=process.argv[2]||path.join(family,'docs/upstream-focus-validation.json');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'bg-upstream-focus-'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const plan=JSON.parse(fs.readFileSync(path.join(family,'docs/cube-policy-study-v2-inputs.json')));
const vendor=path.join(family,'engine/vendor');
const data=fs.readFileSync(path.join(vendor,'gnubg-core-module.data'));
const module=await createModule({wasmBinary:fs.readFileSync(path.join(vendor,'gnubg-core-module.wasm')),getPreloadedPackage:()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),print:()=>{},printErr:()=>{}});
if(module.cwrap('init','number',[])())throw Error('Engine initialization failed');
const score=module.cwrap('bg_score','number',['string','string','number','number']);
const cases=[];
const original=fromXGID(plan.plan[0].candidates[0].original);
for(const plies of [0,2,3])cases.push({id:`reply-44-${plies}ply`,state:original,plies});
for(const [i,c] of plan.plan[0].candidates.entries())for(let high=1;high<=6;high++)for(let low=1;low<=high;low++){
 const s=fromXGID(c.after);
 cases.push({id:`continuation-${i}-${high}${low}`,state:{...s,turn:1-s.turn,dice:[high,low],phase:'move'},plies:2});
}
// GNU notation uses the moving player's point numbers. Validate the resulting
// board against our complete legal set before asking the bridge to score it.
function afterNotation(state,notation){
 let after=state;
 for(const token of notation.trim().split(/\s+/)){
  const m=token.match(/^((?:bar|off|\d+)\*?(?:\/(?:bar|off|\d+)\*?)+)(?:\((\d+)\))?$/);
  if(!m)throw Error('Unparsed move token: '+token);
  const points=m[1].replaceAll('*','').split('/').map(p=>p==='bar'||p==='off'?p:state.turn===0?Number(p)-1:24-Number(p));
  for(let repeat=0;repeat<Number(m[2]||1);repeat++)for(let j=1;j<points.length;j++)after=applyStep(after,{from:points[j-1],to:points[j]},state.turn);
 }
 return after;
}
const results=[];
try{
 for(const row of cases){
  const xgid=toXGID(row.state,{engine:true}), turns=legalTurns(row.state);
  const commands=['set sound enable off','set display off','set output digits 6','set output mwc off',`set evaluation chequerplay evaluation plies ${row.plies}`,'set evaluation chequerplay evaluation noise 0','set evaluation chequerplay evaluation prune on',
   // Disable root filtering so no finalist inherits a deeper cube-efficiency
   // context while being printed as a shallower evaluation. This is an ABI
   // parity audit, not a test of the study's root-selection filters.
   'set evaluation movefilter 2 0 -1 0 0','set evaluation movefilter 2 1 -1 0 0',
   'set evaluation movefilter 3 0 -1 0 0','set evaluation movefilter 3 1 -1 0 0','set evaluation movefilter 3 2 -1 0 0',
   `set xgid ${xgid}`,'hint 5','quit'];
  const commandFile=path.join(work,'commands');fs.writeFileSync(commandFile,commands.join('\n')+'\n');
  const output=execFileSync(binary,['-t','-q','-r','-P',dataDir,'-s',work,'-c',commandFile],{encoding:'utf8',timeout:180000});
  fs.writeFileSync(path.join(work,row.id+'.txt'),output);
  const rows=[...output.matchAll(/\b(\d+)\.\s+Cube(?:ful|less)\s+(\d+)-ply\s+(.+?)\s+Eq\.:\s+([+\-\d.]+)\s*(?:\([^\n]*\))?\s*\n\s*([\d.]+) ([\d.]+) ([\d.]+) - ([\d.]+) ([\d.]+) ([\d.]+)/g)];
  const selected=rows;
  if(rows.some(r=>Number(r[2])!==row.plies))throw Error('Unexpected shallower CLI result: '+row.id);
  if(!selected.length){
   if(!turns.length||turns.every(t=>!t.steps.length)){
    if(!/no legal moves|cannot move|no moves/i.test(output))throw Error('Missing pass output: '+row.id);
    results.push({id:row.id,xgid,plies:row.plies,pass:true,moves:[]});continue;
   }
   throw Error('No requested-depth output for '+row.id+'; inspect '+work);
  }
  const values=[];
  for(const r of selected){
   const after=afterNotation(row.state,r[3]);
   if(!turns.some(t=>boardKey(t.state)===boardKey(after)))throw Error('Illegal parsed move '+r[3]+' in '+row.id);
   const evaluatedPlies=Number(r[2]);
   const ptr=score(xgid,toXGID({...after,dice:[],phase:'roll'},{engine:true}),evaluatedPlies,0);
   let value;try{value=JSON.parse(module.UTF8ToString(ptr));}finally{module._free(ptr);}
   if(value.error)throw Error(value.error);
   const probabilities=[r[5],r[6],r[7],r[9],r[10]].map(Number);
   const equity=Number(r[4]);
   values.push({rank:Number(r[1]),evaluatedPlies,move:r[3].trim(),board:boardKey(after),upstreamEquity:equity,bridgeEquity:value.equity,equityDifference:Math.abs(value.equity-equity),upstreamProbabilities:probabilities,bridgeProbabilities:value.probabilities,maxProbabilityDifference:Math.max(...probabilities.map((v,i)=>Math.abs(v-value.probabilities[i])))});
  }
  results.push({id:row.id,xgid,plies:row.plies,legalMoves:turns.length,moves:values});
  console.log(`${row.id}: ${values.length} moves; max EV delta ${Math.max(...values.map(v=>v.equityDifference))}`);
 }
 const maximum=Math.max(...results.flatMap(r=>r.moves.map(v=>v.equityDifference)));
 const probabilityMaximum=Math.max(...results.flatMap(r=>r.moves.map(v=>v.maxProbabilityDifference)));
 const report={schema:1,recordedAt:new Date().toISOString(),method:'Deterministic integration audit, not a new equity trial or accuracy estimate. Independently built unmodified GNUbg 1.08.003, same neural/bearoff/MET data; Jacoby money, ordinary cube, pruning on, zero noise. All 21 immediate next rolls after each double-hit continuation, plus the original 44 decision at 0/2/3 ply. Compare up to five CLI finalists at the requested depth, including outcome probabilities; root filters are disabled so every reported move uses that depth and cube-efficiency context; validate parsed move boards against the full legal set. CLI starts fresh per position. The shipped scalar WASM uses its ordinary cache. This does not validate all later game decisions or XG agreement.',source:'https://deb.debian.org/debian/pool/main/g/gnubg/gnubg_1.08.003.orig.tar.gz',sourceArchiveSHA256:'6f7d969b13cfff786fba90ff8cc5e5d564b97f4f0aa69afe4f3838f18c445979',binarySHA256:hash(binary),binaryVersion:execFileSync(binary,['-v'],{encoding:'utf8'}).split('\n')[0],scriptSHA256:hash(fileURLToPath(import.meta.url)),inputsSHA256:hash(path.join(family,'docs/cube-policy-study-v2-inputs.json')),wasmSHA256:hash(path.join(vendor,'gnubg-core-module.wasm')),dataSHA256:hash(path.join(vendor,'gnubg-core-module.data')),dataFiles:Object.fromEntries(['gnubg.wd','gnubg.weights','gnubg_os0.bd','gnubg_ts0.bd','met/Kazaross-XG2.xml'].map(n=>[n,hash(path.join(dataDir,n))])),tolerance:0.0001,cases:results.length,comparisons:results.reduce((n,r)=>n+r.moves.length,0),maxEquityDifference:maximum,maxProbabilityDifference:probabilityMaximum,passed:maximum<=0.0001&&probabilityMaximum<=0.0001,results};
 fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({cases:report.cases,comparisons:report.comparisons,maximum,probabilityMaximum,passed:report.passed,logs:work}));
 if(!report.passed)process.exitCode=1;
}finally{module.cwrap('shutdown',null,[])();}
