// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {legalTurns,commitTurn} from '../core/rules.mjs';
import {toXGID} from '../core/xgid.mjs';
import {stateForBoard} from '../scripts/book-branches.mjs';
const file=p=>new URL('../'+p,import.meta.url),read=p=>JSON.parse(fs.readFileSync(file(p))),hash=b=>createHash('sha256').update(b).digest('hex');
test('supplemental five-ply replies preserve complete legal screening and raw native results',()=>{
 const index=read('engine/opening-book-data/deep/index.json'),meta=index.provenance.xgCoverageSupplement;
 if(!meta){assert.equal(fs.existsSync(file('docs/xg-coverage-supplement.json')),false);return;}
 const bytes=fs.readFileSync(file('docs/xg-coverage-supplement.json')),result=JSON.parse(bytes),raw=gunzipSync(fs.readFileSync(file('docs/xg-coverage-supplement-scores.jsonl.gz')));
 assert.equal(hash(bytes),meta.sourceSHA256);assert.equal(hash(raw),meta.scoresSHA256);assert.equal(hash(JSON.stringify(result.inputs)),result.signature);
 assert.deepEqual(meta.runtimeAssets,read('docs/fullgame-runtime-validation.json').assets);
 const records=raw.toString().trim().split('\n').map(JSON.parse),scores=new Map(records.map(r=>[r.key,r]));assert.equal(scores.size,records.length);
 const key=(c,d)=>hash(`${c.after}|${d}|beavers=0`),value=(c,d)=>scores.get(key(c,d)).value;
 const select=(cs,d,min,w)=>{const sorted=[...cs].sort((a,b)=>value(b,d).equity-value(a,d).equity);return sorted.filter((c,i)=>i<min||value(sorted[0],d).equity-value(c,d).equity<=w+1e-8);};
 const used=new Set();assert.equal(result.positions.length,21);
 for(const p of result.positions){
  const s=stateForBoard(p.board,[...p.roll].map(Number)),all=legalTurns(s).map(t=>({board:t.key,steps:t.steps,after:toXGID({...commitTurn(s,t.steps),dice:[],phase:'roll'},{engine:true})}));
  assert.equal(all.length,p.total);const screen=select(all,3,10,.080),finalists=[...new Set([...select(screen,3,2,.040),...select(screen,4,2,.040)])];
  assert.equal(screen.length,p.screened);assert.deepEqual(finalists.map(c=>c.board),p.candidates.map(c=>c.board));
  for(const [depth,candidates]of [[3,all],[4,screen],[5,finalists]])for(const c of candidates){used.add(key(c,depth));const record=scores.get(key(c,depth));assert.equal(record.depth,depth);assert.equal(record.after,c.after);assert.ok(Number.isFinite(record.value.equity));}
  for(let i=0;i<finalists.length;i++)for(const[depth,label]of [[3,'threePly'],[4,'fourPly'],[5,'fivePly']])assert.deepEqual(p.candidates[i][label],value(finalists[i],depth));
  const shard=read('engine/opening-book-data/deep/'+index.replies[p.board].file),entry=shard.rolls[p.roll];assert.deepEqual(entry.rows.map(r=>r[1]),p.candidates.map(c=>c.fivePly.equity).sort((a,b)=>b-a));
 }
 assert.equal(used.size,records.length,'raw archive contains exactly the computed candidate/depth set');
});
