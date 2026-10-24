"""Rebuild the pinned MIT PureTD model and scalar/SIMD WebAssembly assets.

Requires Emscripten 4.0.15 and Python with torch/numpy (export only).
Builds in a new temporary directory; never changes the supplied upstream source.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'engine/source/puretd'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--emcc',required=True);p.add_argument('--python',default=sys.executable)
p.add_argument('--out',required=True)
args=p.parse_args();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
release=json.loads((SOURCE/'release.json').read_text())
archive=SOURCE/release['sourceArchive']
assert sha(archive)==release['sourceSHA256'],'Source archive changed'
assert sha(SOURCE/'backend-wasm.c')==release['backendSHA256'],'SIMD source changed'
assert sha(SOURCE/'backend-scalar.c')==release['scalarBackendSHA256'],'Scalar source changed'
version=subprocess.check_output([args.emcc,'--version'],text=True)
assert '4.0.15' in version.splitlines()[0],version
with tempfile.TemporaryDirectory(prefix='puretd-build-') as temporary:
 root=Path(temporary)
 with tarfile.open(archive) as tar:
  for member in tar.getmembers():
   assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
   dest=root/member.name;dest.parent.mkdir(parents=True,exist_ok=True)
   dest.write_bytes(tar.extractfile(member).read())
 lock=json.loads((root/'source-lock.json').read_text())
 assert lock['commit']==release['sourceCommit']
 for entry in lock['files']:
  b=(root/entry['path']).read_bytes()
  assert len(b)==entry['size'] and hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==entry['sha'],entry['path']
 env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
 subprocess.run([args.python,'export_weights.py',release['checkpoint'],'money.bin'],cwd=root,env=env,check=True)
 assert sha(root/'money.bin')==release['modelSHA256'],'Exported weights differ'
 shutil.copyfile(root/'money.bin',out/'money.bin');shutil.copyfile(root/'LICENSE',out/'LICENSE.txt')
 wide=release['wideModel']
 subprocess.run([args.python,'export_weights.py',wide['checkpoint'],wide['file']],cwd=root,env=env,check=True)
 assert sha(root/wide['file'])==wide['sha256'],'Exported wide weights differ'
 shutil.copyfile(root/wide['file'],out/wide['file'])
 shutil.copyfile(SOURCE/'backend-wasm.c',root/'backend-wasm.c')
 shutil.copyfile(SOURCE/'backend-scalar.c',root/'backend-scalar.c')
 exports=['bgc_open','bgc_close','bgc_abi_version','bgc_struct_sizes','bgc_score_moves','bgc_value',
          'bgc_value_1ply','bgc_offer_double','bgc_respond_to_double','bgc_set_search','malloc','free']
 runtime=['FS','cwrap','UTF8ToString','HEAP32','HEAPU32','HEAPF32']
 for backend in ['simd','scalar']:
  target=out if backend=='simd' else out/'scalar';target.mkdir(exist_ok=True)
  flags=['-msimd128'] if backend=='simd' else []
  source='backend-wasm.c' if backend=='simd' else 'backend-scalar.c'
  command=[args.emcc,'-O3','-flto','-ffp-contract=off',*flags,'-Ic_api','-Ic_engine','-Ic_inference',
    'c_api/puretd.c','c_api/puretd_janowski.c',source,'c_engine/bg_engine.c','c_inference/nn_eval.c',
    '-o',str(target/'puretd-module.mjs'),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
    '-sALLOW_MEMORY_GROWTH=1','-sSTACK_SIZE=8388608','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=536870912',
    '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+name for name in exports]),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(runtime)]
  subprocess.run(command,cwd=root,env=env,check=True)
 actual={str(path.relative_to(out)):sha(path) for path in sorted(out.rglob('*')) if path.is_file()}
 assert actual==release['assets'],json.dumps({'actual':actual,'expected':release['assets']},indent=2)
 print(json.dumps({'passed':True,'sourceCommit':lock['commit'],'sourceSHA256':sha(archive),'assets':actual},indent=2))
