# SPDX-License-Identifier: GPL-3.0-or-later
"""Check both hosts' actual weights/databases against the pinned source archive."""
import hashlib
import json
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path

family = Path(__file__).resolve().parents[1]
native = Path('/tmp/bg-fullgame-ablation-v1')
build = json.loads((native / 'build.json').read_bytes())
archive = family / 'engine/source' / build['archive']
digest = lambda b: hashlib.sha256(b).hexdigest()
assert digest(archive.read_bytes()) == build['archiveSHA256']
remote = subprocess.check_output(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
    'mattgpt', 'cd /tmp/codex-backgammon-fullgame-01a15639 && shasum -a 256 data/*'], text=True)
remote_hashes = {name: sha for sha, name in (line.split() for line in remote.splitlines())}
assets = {}
with tarfile.open(archive) as source:
    for member in source.getmembers():
        if not member.name.startswith('data/') or not member.isfile():
            continue
        expected = digest(source.extractfile(member).read())
        assert digest((native / member.name).read_bytes()) == expected
        assert remote_hashes[member.name] == expected
        assets[member.name] = expected
assert len(assets) == 4 and set(assets) == set(remote_hashes)
record = {'schema': 1, 'recordedAt': datetime.now(timezone.utc).isoformat(),
    'archiveSHA256': build['archiveSHA256'], 'binarySHA256': build['binarySHA256'],
    'hosts': ['local', 'mattgpt'], 'allAssetsMatchArchive': True, 'assets': assets}
(family / 'docs/fullgame-runtime-validation.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
