// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
test('cache regression reproduces the defect and validates repaired policy contexts',()=>{
 const r=read('../docs/cube-cache-context-validation.json');
 assert.equal(hash(fs.readFileSync(new URL('../scripts/validate-cube-cache-context.py',import.meta.url))),r.validationScriptSHA256);
 assert.equal(r.keyValidation.distinctPolicyKeys,744);assert.equal(r.keyValidation.matchGuardsPass,true);
 assert.equal(r.cases.length,4);
 for(const c of r.cases){
  if(c.cacheContext){assert.equal(c.incorrectActualHits,0);assert.equal(c.incorrectReplayQueries,0);assert.ok(c.maxReplayError<=r.tolerance);}
  else{assert.ok(c.incorrectActualHits>0);assert.ok(c.maxActualError>.001);}
 }
});
test('aborted collection retains every raw byte but is not presented as completed inference',()=>{
 const r=read('../docs/cube-policy-study-v1-abort.json'),p=read('../docs/cube-policy-study-inputs.json');
 const raw=gunzipSync(fs.readFileSync(new URL('../docs/cube-policy-study-v1-aborted-batches.jsonl.gz',import.meta.url)));
 assert.equal(hash(raw),r.rawSHA256);assert.equal(raw.length,r.rawBytes);
 assert.equal(raw.toString().trim().split('\n').length,r.completedBatches);
 assert.equal(r.completedTrials,r.completedBatches*p.batchSize);
 assert.equal(r.signature,p.signature);assert.equal(r.status,'aborted-for-implementation-correctness');
 assert.equal(r.outcomesInspectedBeforeAbort,false);assert.equal(r.replacementExcludesEntirePlannedSeedSet,true);
});
test('historical source fallback still rejects incorrect hashes and missing archived inputs',()=>{
 execFileSync('python3',['-c',`import importlib.util,pathlib,json
s=importlib.util.spec_from_file_location('a',pathlib.Path('backgammon/scripts/summarize-fullgame-ablation.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=json.loads(pathlib.Path('backgammon/docs/fullgame-ablation-inputs.json').read_bytes())
for file,digest in p['build']['inputs'].items():m.verify_historical_source('scripts/'+file,digest)
for file in ['scripts/build-rollout-native.mjs','scripts/nonexistent-input.c']:
 try:m.verify_historical_source(file,'0'*64)
 except ValueError:pass
 else:raise AssertionError('invalid provenance accepted')
`],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
});
