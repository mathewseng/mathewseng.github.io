// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENGINE_VERSION} from '../engine/metadata.mjs';
const bytes=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('bg9 ships its verified configurable ABI with corrected filtered selection and unchanged data',()=>{
 const r=JSON.parse(bytes('docs/bg9-release.json'));
 const old=JSON.parse(bytes('docs/bg8-release.json'));
 assert.equal(r.engine,ENGINE_VERSION);assert.equal(r.emscripten,'4.0.15');assert.equal(r.dataUnchanged,true);
 for(const [file,digest] of Object.entries(r.assets))assert.equal(hash(bytes('engine/'+file)),digest);
 for(const [file,digest] of Object.entries(r.buildInputs))assert.equal(hash(bytes(file)),digest);
 assert.equal(r.assets['vendor/gnubg-core-module.data'],old.assets['vendor/gnubg-core-module.data']);
 assert.equal(r.previousSourceSHA256,old.assets['source/gnubg-core-955555c-bg8.tar.gz']);
 const rebuilt=JSON.parse(bytes('docs/bg9-rebuild-validation.json'));
 assert.equal(rebuilt.passed,true);assert.equal(rebuilt.sourceSHA256,r.assets['source/gnubg-core-955555c-bg9.tar.gz']);
 for(const [file,digest] of Object.entries(rebuilt.assets))assert.equal(digest,r.assets[file]);
 assert.deepEqual(r.sourceDelta,{changed:['Makefile.emcc','src/eval.c'],added:['src/verify-checker.c']});
 execFileSync('python3',['-c',`import tarfile,pathlib,tempfile,subprocess
root=pathlib.Path('backgammon/engine/source');versions=[]
for v in [8,9]:
 with tarfile.open(root/f'gnubg-core-955555c-bg{v}.tar.gz') as a:versions.append({m.name:a.extractfile(m).read() for m in a.getmembers() if m.isfile()})
a,b=versions
assert sorted(n for n in a if a[n]!=b.get(n))==['Makefile.emcc','src/eval.c']
assert sorted(n for n in b if n not in a)==['src/verify-checker.c']
with tempfile.TemporaryDirectory() as tmp:
 d=pathlib.Path(tmp); (d/'src').mkdir(); (d/'src/eval.c').write_bytes(a['src/eval.c'])
 subprocess.run(['patch','-p1','-i',str((root/'filtered-rollout-bg9.patch').resolve())],cwd=d,check=True,stdout=subprocess.PIPE)
 assert (d/'src/eval.c').read_bytes()==b['src/eval.c']
assert b['src/verify-checker.c']==(root/'verify-checker.c').read_bytes()
assert b['src/bridge.c']==(root/'bridge.c').read_bytes()
assert b'"_bg_score_config"' in b['Makefile.emcc']
`],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
});
