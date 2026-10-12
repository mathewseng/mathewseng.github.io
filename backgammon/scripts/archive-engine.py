# SPDX-License-Identifier: GPL-3.0-or-later
"""Deterministic corresponding source, without macOS extended-attribute files."""
from pathlib import Path
import gzip
import io
import sys
import tarfile

root, output = map(Path, sys.argv[1:])
files = [root / name for name in ["LICENSE", "Makefile", "Makefile.emcc"]]
for name in ["src", "data", "web"]:
    files.extend(p for p in (root / name).rglob("*") if p.is_file() and not p.name.startswith("._"))
output.parent.mkdir(parents=True, exist_ok=True)
with output.open("wb") as stream, gzip.GzipFile(fileobj=stream, mode="wb", filename="", mtime=0) as zipped:
    with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for file in sorted(files):
            if file.is_symlink():
                raise ValueError("Unexpected source symlink: " + str(file))
            data = file.read_bytes()
            info = tarfile.TarInfo(file.relative_to(root).as_posix())
            info.size = len(data)
            info.mode = 0o755 if file.stat().st_mode & 0o111 else 0o644
            archive.addfile(info, io.BytesIO(data))
