#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Freeze a successfully validated prepare artifact before collecting samples."""
import hashlib,json,os,shutil,subprocess,sys,tarfile
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1];PREFIX='filtered-rollout-v1';HASH=lambda b:hashlib.sha256(b).hexdigest()
source=Path(sys.argv[1]).resolve();data=source.read_bytes()
with tarfile.open(source) as a:
 get=lambda n:a.extractfile(n).read()
 build_bytes=get('runtime-build.json');build=json.loads(build_bytes)
 validation_bytes=get('platform-validation.json');validation=json.loads(validation_bytes)
 legacy_bytes=get('legacy-validation.json');legacy=json.loads(legacy_bytes)
 assert build['id']==PREFIX and build['platform']=='linux' and build['architecture']=='arm64'
 assert build['files']=={'legacy':'gnubg-core-legacy','fixed':'gnubg-core'}
 for name,digest in build['binaries'].items():assert HASH(get(build['files'][name]))==digest
 assert validation['binaries']==build['binaries'] and validation['allWithinTolerance'] and validation['cases']==12
 assert legacy['binarySHA256']==build['binaries']['legacy'] and legacy['allWithinTolerance'] and legacy['cases']==26
 frozen=json.loads((FAMILY/'docs/cube-policy-v2-runtime.json').read_bytes())
 assert build['binaries']['legacy']==frozen['binarySHA256'],'Control must be byte-identical to prior Linux runtime'
 assert build['assets']==frozen['assets']
 assert build['patchSHA256']==HASH((FAMILY/'engine/source/filtered-rollout-bg9.patch').read_bytes())
 assert build['builderSHA256']==HASH((FAMILY/'scripts/build-filtered-rollout-native.mjs').read_bytes())
 assert validation['fixtureSHA256']==HASH((FAMILY/f'docs/{PREFIX}-smoke-fixture.json').read_bytes())
 assert validation['scriptSHA256']==HASH((FAMILY/'scripts/validate-filtered-rollout-platform.py').read_bytes())
 bundle=FAMILY/'engine/source/filtered-rollout-linux-arm64.tar.gz'
 if source!=bundle:shutil.copyfile(source,bundle)
 runtime={'schema':1,'id':PREFIX,'platform':'linux','architecture':'arm64','bundle':'engine/source/'+bundle.name,'bundleSHA256':HASH(data),
  'binaries':build['binaries'],'files':build['files'],'assets':build['assets'],
  'sourceArchive':frozen['sourceArchive'],'sourceArchiveSHA256':frozen['sourceArchiveSHA256'],
  'fixtureSHA256':validation['fixtureSHA256'],'validationSHA256':HASH(validation_bytes),'legacyValidationSHA256':HASH(legacy_bytes),
  'runtimeBuildSHA256':HASH(build_bytes),'runtimeBuild':build}
 dest=FAMILY/f'docs/{PREFIX}-runtime.json';dest.write_text(json.dumps(runtime,indent=2)+'\n')
 encoded=subprocess.check_output([os.environ.get('NODE','node'),str(FAMILY/'scripts/filtered-rollout-plan.mjs'),str(dest)])
 (FAMILY/f'docs/{PREFIX}-inputs.json').write_bytes(encoded)
 print('Frozen Linux runtime and final collection-enabled plan:',json.loads(encoded)['signature'])
