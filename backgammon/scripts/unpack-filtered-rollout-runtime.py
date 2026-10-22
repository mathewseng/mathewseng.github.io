#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import hashlib,json,sys,tarfile
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1];HASH=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=json.loads((FAMILY/'docs/filtered-rollout-v1-inputs.json').read_bytes());r=p['runtime']
assert p['collectionEnabled'] and r['platform']=='linux' and r['architecture']=='arm64'
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True);bundle=FAMILY/r['bundle'];assert HASH(bundle)==r['bundleSHA256']
with tarfile.open(bundle) as a:
 for name in [*r['files'].values(),'runtime-build.json','legacy-build.json','legacy-validation.json','platform-validation.json','LICENSE']:
  (root/name).write_bytes(a.extractfile(name).read())
for name,digest in r['binaries'].items():f=root/r['files'][name];f.chmod(0o755);assert HASH(f)==digest
assert HASH(root/'runtime-build.json')==r['runtimeBuildSHA256']
assert HASH(root/'platform-validation.json')==r['validationSHA256']
source=FAMILY/'engine/source'/r['sourceArchive'];assert HASH(source)==r['sourceArchiveSHA256']
with tarfile.open(source) as a:
 for name,digest in r['assets'].items():
  assert name.startswith('data/') and '..' not in Path(name).parts
  target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(a.extractfile(name).read());assert HASH(target)==digest
print('Frozen corrected/control binaries and original assets verified')
