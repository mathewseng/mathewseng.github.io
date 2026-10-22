#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Install the exact frozen executable and original weights on an ARM64 worker."""
import hashlib,json,sys,tarfile
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1]
runtime=json.loads((FAMILY/'docs/cube-policy-v2-runtime.json').read_bytes())
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
HASH=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bundle=FAMILY/runtime['bundle']
assert HASH(bundle)==runtime['bundleSHA256']
with tarfile.open(bundle) as archive:
 for name in ['gnubg-core','build.json','platform-validation.json','cache-validation.json','LICENSE']:
  (root/name).write_bytes(archive.extractfile(name).read())
(root/'gnubg-core').chmod(0o755)
assert HASH(root/'gnubg-core')==runtime['binarySHA256']
source=FAMILY/'engine/source'/runtime['sourceArchive']
assert HASH(source)==runtime['sourceArchiveSHA256']
with tarfile.open(source) as archive:
 for name,digest in runtime['assets'].items():
  target=root/name
  assert name.startswith('data/') and '..' not in Path(name).parts
  target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(archive.extractfile(name).read())
  assert HASH(target)==digest
print('Frozen executable and all neural, bearoff and match-equity assets verified')
