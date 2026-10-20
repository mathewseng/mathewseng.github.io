// SPDX-License-Identifier: GPL-3.0-or-later
// Isolate the effect of the XG reference's beaver rule at three plies.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {normalizeReference,canonicalState} from './deep-book-comparison.mjs';
import {legalTurns,commitTurn} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
const family=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const native=path.resolve(process.env.BG_DEEP_NATIVE||path.join(family,'test-results/deep-book-native'));
const reference=JSON.parse(fs.readFileSync(path.join(family,'docs/deep-book-xg-reference.json')));
const refs=normalizeReference(reference),rows=new Array(refs.length),children=[];
const build=JSON.parse(fs.readFileSync(path.join(native,'build.json')));
if(createHash('sha256').update(fs.readFileSync(path.join(native,'gnubg-core'))).digest('hex')!==build.binarySHA256)throw Error('Native binary differs from build manifest');
const sourcePositions=reference.sources.flatMap(s=>s.positions);
let cursor=0,finished=0;
const timer=setInterval(()=>console.log(JSON.stringify({finished,total:refs.length})),30000);
try{
  await Promise.all(Array.from({length:2},async()=>{
    const child=spawn(path.join(native,'gnubg-core'),[],{cwd:native,stdio:['pipe','pipe','inherit']});children.push(child);
    const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
    if((await lines.next()).value!=='READY')throw Error('Native worker did not initialize');
    const score=async(original,after,beavers)=>{
      child.stdin.write(`${original}\t${after}\t3\t${beavers}\n`);
      const next=await lines.next();if(next.done)throw Error('Native worker exited');
      const value=JSON.parse(next.value);if(!Number.isFinite(value.equity)||value.error)throw Error('Invalid native result');return value;
    };
    while(cursor<refs.length){
      const i=cursor++,ref=refs[i],source=sourcePositions[i],state=canonicalState(source.normalizedXgid||source.xgid);
      const move=legalTurns(state).find(t=>t.key===ref.candidates[0].board);if(!move)throw Error('Illegal source leader');
      const original=toXGID(state,{engine:true}),after=toXGID({...commitTurn(state,move.steps),dice:[],phase:'roll'},{engine:true});
      const without=await score(original,after,0),withBeavers=await score(original,after,1);
      rows[i]={title:ref.title,source:ref.url,move:ref.candidates[0].move,referenceEquity:ref.candidates[0].equity,withoutBeavers:without.equity,withBeavers:withBeavers.equity,difference:withBeavers.equity-without.equity};finished++;
    }
  }));
  const differences=rows.map(r=>Math.abs(r.difference));
  const report={schema:1,recordedAt:new Date().toISOString(),method:'Same published XG leading move in each of 729 positions, same native GNUbg binary, same 3-ply pruning settings; only the beaver flag changes. This does not establish equivalence at greater depths or in other positions.',build,
    summary:{positions:rows.length,tolerance:1e-6,changedBeyondTolerance:differences.filter(d=>d>1e-6).length,meanAbsoluteDifference:differences.reduce((a,b)=>a+b,0)/rows.length,maximumAbsoluteDifference:Math.max(...differences)},rows};
  fs.writeFileSync(path.join(family,'docs/deep-book-context-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}finally{clearInterval(timer);for(const child of children)child.kill('SIGTERM');}
