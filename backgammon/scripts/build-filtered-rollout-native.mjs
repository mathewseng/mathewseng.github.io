// SPDX-License-Identifier: GPL-3.0-or-later
// Fresh research runtime; never edits the frozen v2 build or source files.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const scripts=path.dirname(fileURLToPath(import.meta.url)),family=path.dirname(scripts),out=path.resolve(process.argv[2]||'/tmp/bg-filtered-rollout-v1');
if(fs.existsSync(out))throw Error('New research output directory required');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
execFileSync(process.execPath,[path.join(scripts,'build-cube-policy-native.mjs'),out],{stdio:'inherit'});
const legacy=JSON.parse(fs.readFileSync(path.join(out,'build.json')));
fs.copyFileSync(path.join(out,'gnubg-core'),path.join(out,'gnubg-core-legacy'));
fs.copyFileSync(path.join(out,'build.json'),path.join(out,'legacy-build.json'));
const original=JSON.parse(fs.readFileSync(path.join(family,'docs/cube-policy-v2-runtime.json')));
const previousValidation=path.join(family,'docs',process.platform==='linux'?'cube-policy-v2-linux-validation.json':'cube-policy-v2-platform-validation.json');
const prior=JSON.parse(fs.readFileSync(previousValidation));
if(prior.binarySHA256===legacy.binarySHA256&&prior.allWithinTolerance&&
   Object.entries(original.assets).every(([n,h])=>hash(path.join(out,n))===h)){
 fs.writeFileSync(path.join(out,'legacy-validation.json'),JSON.stringify({...prior,
   reusedForByteIdenticalBinaryAndAssets:true,originalValidationSHA256:hash(previousValidation)},null,2)+'\n');
}else execFileSync('python3',[path.join(scripts,'validate-cube-policy-platform.py'),out,'--output',path.join(out,'legacy-validation.json')],{stdio:'inherit'});
const patch=path.join(family,'engine/source/filtered-rollout-bg9.patch');
execFileSync('patch',['-p1','-i',patch],{cwd:out,stdio:'inherit'});
if(process.platform==='linux'){
 const f=path.join(out,'Makefile'),s=fs.readFileSync(f,'utf8');
 if(!s.includes('$(CC) $(OBJ) -o $@'))throw Error('Unexpected makefile');
 fs.writeFileSync(f,s.replace('$(CC) $(OBJ) -o $@','$(CC) $(OBJ) -o $@ -lm'));
}
const log=fs.openSync(path.join(out,'filtered-build.log'),'w');
try{execFileSync('make',['-j8','CC=clang',`CFLAGS=${legacy.flags}`],{cwd:out,stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
const manifest={schema:1,id:'filtered-rollout-v1',platform:process.platform,architecture:process.arch,legacyBuild:legacy,
 binaries:{legacy:hash(path.join(out,'gnubg-core-legacy')),fixed:hash(path.join(out,'gnubg-core'))},
 files:{legacy:'gnubg-core-legacy',fixed:'gnubg-core'},patchSHA256:hash(patch),builderSHA256:hash(fileURLToPath(import.meta.url)),
 assets:Object.fromEntries(Object.keys(original.assets).map(n=>[n,hash(path.join(out,n))])),builtAt:new Date().toISOString(),
 method:'Identical pinned v2 research engine, cube/cache fixes and assets. Fixed binary changes only the mixed-depth final sort. Legacy binary retains that known defect as a focused control. No v2 input/result is rewritten.'};
fs.writeFileSync(path.join(out,'runtime-build.json'),JSON.stringify(manifest,null,2)+'\n');
// Keep build.json describing the original executable for historical replay;
// new consumers verify runtime-build.json and both hashes instead.
console.log(out);
