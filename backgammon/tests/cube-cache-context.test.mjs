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
test('the production engine patch repairs the independently reproduced ordinary-cube cache defect',()=>{
 const r=read('../docs/live-cache-context-validation.json');
 for(const [file,key] of [['../engine/source/checker-context-bg8.patch','patchSHA256'],['../scripts/validate-live-cache-context.py','scriptSHA256'],['../engine/source/gnubg-core-955555c-bg7.tar.gz','sourceArchiveSHA256']])assert.equal(hash(fs.readFileSync(new URL(file,import.meta.url))),r[key]);
 assert.equal(r.cases.length,4);
 for(const c of r.cases){
  if(c.cacheContext){assert.equal(c.incorrectActualHits,0);assert.equal(c.incorrectReplayQueries,0);}
  else{assert.ok(c.incorrectActualHits>0);assert.ok(c.maxActualError>.001);}
 }
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
test('bg8 ships exactly the cache patch with unchanged weights and separately versioned live results',()=>{
 const r=read('../docs/bg8-release.json');
 assert.equal(r.emscripten,'4.0.15');assert.equal(r.dataUnchanged,true);assert.ok(r.engine.endsWith('+bg8'));
 for(const [file,digest] of Object.entries(r.assets))assert.equal(hash(fs.readFileSync(new URL('../engine/'+file,import.meta.url))),digest);
 assert.ok(fs.readFileSync(new URL('../engine/metadata.mjs',import.meta.url),'utf8').includes(r.engine));
 execFileSync('python3',['-c',`import tarfile,pathlib,tempfile,subprocess
f=pathlib.Path('backgammon/engine/source');versions=[]
for v in [7,8]:
 with tarfile.open(f/f'gnubg-core-955555c-bg{v}.tar.gz') as a:versions.append({m.name:a.extractfile(m).read() for m in a.getmembers() if m.isfile()})
assert [n for n in sorted(versions[0].keys()|versions[1].keys()) if versions[0].get(n)!=versions[1].get(n)]==['src/eval.c']
with tempfile.TemporaryDirectory() as d:
 root=pathlib.Path(d);(root/'src').mkdir();(root/'src/eval.c').write_bytes(versions[0]['src/eval.c'])
 subprocess.run(['patch','-p1','-i',str((f/'checker-context-bg8.patch').resolve())],cwd=root,check=True,capture_output=True)
 assert (root/'src/eval.c').read_bytes()==versions[1]['src/eval.c']
`],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
});
