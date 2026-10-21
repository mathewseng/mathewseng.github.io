// SPDX-License-Identifier: GPL-3.0-or-later
// Build a separate offline executable from the pinned corresponding source.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const scripts=path.dirname(fileURLToPath(import.meta.url)), family=path.dirname(scripts);
const out=path.resolve(process.argv[2]||path.join(family,'test-results/rollout-native'));
const ablation=process.argv.includes('--ablation');
const neon=process.arch==='arm64'&&!process.argv.includes('--scalar');
fs.mkdirSync(out,{recursive:true});
const archive=path.join(family,'engine/source/gnubg-core-955555c-bg6.tar.gz');
execFileSync('tar',['-xzf',archive,'-C',out]);
execFileSync('patch',['-p1','-i',path.join(family,'engine/source/rollout-order-bg7.patch')],{cwd:out,stdio:'inherit'});
fs.copyFileSync(path.join(family,'engine/source/bridge.c'),path.join(out,'src/bridge.c'));
fs.copyFileSync(path.join(scripts,'rollout-native.c'),path.join(out,'src/gnubg-core.c'));
if(ablation)execFileSync('patch',['-p1','-i',path.join(scripts,'rollout-ablation.patch')],{cwd:out,stdio:'inherit'});
if(neon){
  fs.copyFileSync(path.join(scripts,'deep-book-neon.h'),path.join(out,'src/lib/deep-book-neon.h'));
  for(const name of ['neuralnet.c','neuralnet.h']){
    const file=path.join(out,'src/lib',name);
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('__wasm_simd128__','BG_NATIVE_NEON').replace('<wasm_simd128.h>','"deep-book-neon.h"'));
  }
}
execFileSync('make',['clean'],{cwd:out,stdio:'ignore'});
const flags='-O3 -ffp-contract=off -Isrc -Isrc/lib -Wno-unused-parameter'+(neon?' -DBG_NATIVE_NEON':'')+(ablation?' -DBG_ABLATION':'');
const log=fs.openSync(path.join(out,'build.log'),'w');
try{execFileSync('make',['-j8','CC=clang',`CFLAGS=${flags}`],{cwd:out,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest={ablationPatchSHA256:ablation?hash(path.join(scripts,'rollout-ablation.patch')):null,archive:path.basename(archive),archiveSHA256:hash(archive),compiler:execFileSync('clang',['--version'],{encoding:'utf8'}).trim(),flags,architecture:process.arch,neon,binarySHA256:hash(path.join(out,'gnubg-core')),inputs:Object.fromEntries(['build-rollout-native.mjs','rollout-native.c','deep-book-neon.h'].map(n=>[n,hash(path.join(scripts,n))])),orderPatchSHA256:hash(path.join(family,'engine/source/rollout-order-bg7.patch')),bridgeSHA256:hash(path.join(family,'engine/source/bridge.c')),builtAt:new Date().toISOString()};
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(out);
