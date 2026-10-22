// SPDX-License-Identifier: GPL-3.0-or-later
// Keep the preceding study's build script, patch and executable reproducible.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
const scripts=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(process.argv[2]||'/tmp/bg-cube-study-v2');
// The historical macOS makefile links libSystem implicitly. Linux needs libm;
// keep that platform detail outside the preceding study's frozen build script.
if(process.platform==='linux'){
 const shim=fs.mkdtempSync(path.join(os.tmpdir(),'bg-clang-'));
 fs.writeFileSync(path.join(shim,'clang'),'#!/bin/sh\nfor arg in "$@"; do\n  if [ "$arg" = "-c" ]; then exec /usr/bin/clang -include stdint.h "$@"; fi\ndone\nexec /usr/bin/clang -include stdint.h "$@" -lm\n',{mode:0o755});
 process.env.PATH=shim+path.delimiter+process.env.PATH;
 process.on('exit',()=>fs.rmSync(shim,{recursive:true,force:true}));
}
execFileSync(process.execPath,[path.join(scripts,'build-rollout-native.mjs'),out,'--cube-study'],{stdio:'inherit'});
execFileSync('python3',[path.join(scripts,'patch-rollout-cache-context.py'),out],{stdio:'inherit'});
fs.copyFileSync(path.join(scripts,'cube-policy-native.c'),path.join(out,'src/gnubg-core.c'));
const manifest=JSON.parse(fs.readFileSync(path.join(out,'build.json')));
if(process.platform==='linux')manifest.flags+=' -include stdint.h';
execFileSync('make',['clean'],{cwd:out,stdio:'ignore'});
const log=fs.openSync(path.join(out,'build.log'),'a');
try{execFileSync('make',['-j8','CC=clang',`CFLAGS=${manifest.flags}`],{cwd:out,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
manifest.cacheContextInputs=Object.fromEntries(['build-cube-policy-native.mjs','patch-rollout-cache-context.py','cube-policy-native.c'].map(n=>[n,hash(path.join(scripts,n))]));
manifest.binarySHA256=hash(path.join(out,'gnubg-core'));manifest.builtAt=new Date().toISOString();
manifest.platform=process.platform;manifest.linkLibraries=process.platform==='linux'?['m']:[];
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify(manifest,null,2)+'\n');console.log(out);
