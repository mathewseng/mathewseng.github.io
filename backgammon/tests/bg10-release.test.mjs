// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENGINE_VERSION,PRESETS,CAPABILITIES,SEARCH_OPTIONS} from '../engine/metadata.mjs';
const bytes=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
test('bg10 ships actual 6-ply bindings with unchanged native search and automatic defaults',()=>{
 const r=JSON.parse(bytes('docs/bg10-release.json')),old=JSON.parse(bytes('docs/bg9-release.json'));
 assert.equal(r.engine,ENGINE_VERSION);assert.equal(r.emscripten,'4.0.15');
 for(const [file,digest] of Object.entries(r.assets))assert.equal(hash(bytes('engine/'+file)),digest);
 for(const [file,digest] of Object.entries(r.buildInputs))assert.equal(hash(bytes(file)),digest);
 assert.equal(r.assets['vendor/gnubg-core-module.data'],old.assets['vendor/gnubg-core-module.data']);
 assert.equal(CAPABILITIES.maximumPlies,6);
 assert.equal(PRESETS.extended5.plies,5);assert.equal(PRESETS.extended6.plies,6);
 assert.ok(SEARCH_OPTIONS.every(([key])=>!PRESETS[key]?.reviewOnly),'deep reviews never silently change play settings');
 execFileSync('python3',['-c',`import tarfile,pathlib
root=pathlib.Path('backgammon/engine/source');versions=[]
for v in [9,10]:
 with tarfile.open(root/f'gnubg-core-955555c-bg{v}.tar.gz') as a:versions.append({m.name:a.extractfile(m).read() for m in a.getmembers() if m.isfile()})
a,b=versions
assert a.keys()==b.keys()
assert sorted(n for n in a if a[n]!=b[n])==['src/bridge.c']
assert a['src/bridge.c'].replace(b'depth>4',b'depth>6')==b['src/bridge.c']==(root/'bridge.c').read_bytes()
`]);
});
