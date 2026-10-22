import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import createModule from '../engine/vendor/puretd/puretd-module.mjs';
import {PURETD,PURETD_WIDE} from '../engine/puretd-metadata.mjs';
import {createPuretdEvaluator,puretdIssue} from '../engine/puretd.mjs';
import {initialState,legalTurns,boardKey,commitTurn,MAX_CUBE} from '../core/rules.mjs';
import {validateItem,itemRecord,parseBackup} from '../core/storage.mjs';
const bytes=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
const state=initialState({phase:'move',dice:[2,1],matchLength:0,
 rules:{cube:true,jacoby:true,automaticDoubles:0,immediateRedoubles:0}});
test('PureTD pins its model, MIT source, reproducible build and both browser backends',()=>{
 const release=JSON.parse(bytes('engine/source/puretd/release.json'));
 assert.equal(release.sourceCommit,PURETD.sourceCommit);
 assert.equal(release.modelSHA256,PURETD.modelSHA256);
 assert.equal(release.wideModel.sha256,PURETD_WIDE.modelSHA256);
 assert.deepEqual(release.assets,PURETD.assets);
 for(const [file,digest] of Object.entries(PURETD.assets))assert.equal(hash(bytes('engine/vendor/puretd/'+file)),digest);
 assert.equal(hash(bytes('engine/source/puretd/'+release.sourceArchive)),release.sourceSHA256);
 assert.equal(hash(bytes('engine/source/puretd/backend-wasm.c')),release.backendSHA256);
 assert.equal(hash(bytes('engine/source/puretd/backend-scalar.c')),release.scalarBackendSHA256);
 const rebuilt=JSON.parse(bytes('docs/puretd-rebuild-validation.json'));
 assert.equal(rebuilt.passed,true);assert.equal(rebuilt.sourceSHA256,release.sourceSHA256);assert.deepEqual(rebuilt.assets,release.assets);
 assert.match(bytes('engine/vendor/puretd/LICENSE.txt').toString(),/MIT License[\s\S]*Copyright \(c\) 2026 Alex Strehl/);
});
test('PureTD rejects rules and decision types outside its learned money model',()=>{
 assert.equal(puretdIssue(state),null);
 for(const patch of [{matchLength:7},{rules:{...state.rules,cube:false}},{rules:{...state.rules,jacoby:false}},
  {rules:{...state.rules,immediateRedoubles:1}},{rules:{...state.rules,immediateRedoubles:2}},
  {phase:'roll',dice:[]},{cube:{owner:0,value:MAX_CUBE/2}},{cube:{owner:1,value:MAX_CUBE}}])assert.ok(puretdIssue({...state,...patch}));
});
test('real learned results grade every legal move and preserve explicit missing probabilities in backups',async()=>{
 const module=await createModule({wasmBinary:bytes('engine/vendor/puretd/puretd-module.wasm'),print:()=>{},printErr:()=>{}});
 for(const model of [PURETD,PURETD_WIDE]) {
 module.FS.writeFile('/'+model.file,bytes('engine/vendor/puretd/'+model.file));
 const engine=createPuretdEvaluator(module,model);
 try {
  const moves=legalTurns(state),submitted=moves.at(-1).steps;
  const result=engine.analyze(state,{plies:0,submitted});
  assert.equal(result.method,'neural');assert.equal(result.engine,model.id);
  assert.equal(result.candidates.length,moves.length);
  assert.deepEqual(new Set(result.candidates.map(m=>m.key)),new Set(moves.map(m=>m.key)));
  assert.equal(result.actual.key,boardKey(commitTurn(state,submitted)));
  assert.equal(result.error,result.candidates[0].equity-result.actual.equity);
  assert.ok(result.candidates.every(m=>Number.isFinite(m.equity)&&m.cubeless===null&&m.probabilities===null&&m.mwc===null));
  const item=itemRecord('position',{state,analysis:result});validateItem(item);
  assert.deepEqual(parseBackup(JSON.stringify({format:'backgammon-library',version:1,items:[item],progress:[]})).items[0].analysis,result);
  for(const change of [a=>a.model.sha256='wrong',a=>a.settings.plies=3,a=>a.settings.cubeful=false,
   a=>a.candidates[0].probabilities=[.5,0,0,0,0],a=>a.candidates[0].cubeless=0,a=>a.method='tree',a=>a.type='cube']) {
   const invalid=structuredClone(item);change(invalid.analysis);assert.throws(()=>validateItem(invalid));
  }
  assert.throws(()=>engine.analyze({...state,rules:{...state.rules,jacoby:false}}),/Jacoby/);
  assert.throws(()=>engine.analyze(state,{plies:2}),/zero or one/);
  // Independent exact terminal payoffs, including Jacoby's centered-cube rule.
  for(const [opponentPoint,opponentOff,multiplier] of [[23,1,1],[23,0,2],[5,0,3]])
   for(const owner of [null,0,1]) for(const turn of [0,1]) {
    const points=Array(24).fill(0);points[0]=1;points[opponentPoint]=opponentOff?-14:-15;
    const white=initialState({points,bar:[0,0],off:[14,opponentOff],turn:0,phase:'move',dice:[2,1],
     matchLength:0,rules:state.rules,cube:{owner,value:owner===null?1:4}});
    const terminal=turn?{...white,points:[...points].reverse().map(n=>-n),off:[...white.off].reverse(),turn,
     cube:{...white.cube,owner:owner===null?null:1-owner}}:white;
    for(const plies of [0,1]) {
     const answer=engine.analyze(terminal,{plies});
     assert.ok(answer.candidates.every(c=>c.equity===(owner===null?1:multiplier)),`exact terminal payoff ${model.name}/${owner}/${turn}/${plies}`);
    }
   }
 } finally {engine.destroy();}
 }
});
