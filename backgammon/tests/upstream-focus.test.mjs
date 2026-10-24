// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fromXGID} from '../core/xgid.mjs';
import {boardKey,legalTurns} from '../core/rules.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../docs/'+n,import.meta.url)));
test('independent GNUbg focus audit retains every next roll and verifies like-for-like values',()=>{
 const r=read('upstream-focus-validation.json'), build=read('upstream-focus-build.json');
 assert.equal(r.passed,true);assert.equal(r.cases,45);assert.equal(r.results.length,45);
 assert.equal(build.coreSourcesUnmodified,true);assert.equal(r.binarySHA256,build.binarySHA256);
 assert.equal(r.sourceArchiveSHA256,build.sourceArchiveSHA256);
 const ids=new Set(r.results.map(c=>c.id));assert.equal(ids.size,45);
 for(const p of [0,2,3])assert.ok(ids.has(`reply-44-${p}ply`));
 for(let c=0;c<2;c++)for(let h=1;h<=6;h++)for(let l=1;l<=h;l++)assert.ok(ids.has(`continuation-${c}-${h}${l}`));
 let count=0,eqMax=0,probMax=0;
 for(const c of r.results){
  const turns=legalTurns(fromXGID(c.xgid));
  if(c.pass){assert.ok(turns.every(t=>!t.steps.length));assert.equal(c.moves.length,0);continue;}
  assert.equal(turns.length,c.legalMoves);assert.ok(c.moves.length>0);
  for(const m of c.moves){
   assert.equal(m.evaluatedPlies,c.plies,'no hidden shallower cube-efficiency context');
   assert.ok(turns.some(t=>boardKey(t.state)===m.board));
   const e=Math.abs(m.upstreamEquity-m.bridgeEquity);
   const p=Math.max(...m.upstreamProbabilities.map((v,i)=>Math.abs(v-m.bridgeProbabilities[i])));
   assert.equal(e,m.equityDifference);assert.equal(p,m.maxProbabilityDifference);
   assert.ok(e<=r.tolerance&&p<=r.tolerance);eqMax=Math.max(eqMax,e);probMax=Math.max(probMax,p);count++;
  }
 }
 assert.equal(count,r.comparisons);assert.equal(eqMax,r.maxEquityDifference);assert.equal(probMax,r.maxProbabilityDifference);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../docs/cube-policy-study-v2-inputs.json',import.meta.url))).digest('hex'),r.inputsSHA256);
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../scripts/audit-upstream-focus.mjs',import.meta.url))).digest('hex'),r.scriptSHA256);
});
