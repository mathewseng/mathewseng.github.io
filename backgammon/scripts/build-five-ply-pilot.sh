#!/bin/sh
# Research-only build. Leaves the deployed bg5 binaries and defaults unchanged.
set -eu
case "$(emcc --version)" in
  *" 4.0.15 "*) ;;
  *) echo "Activate Emscripten 4.0.15." >&2; exit 1 ;;
esac
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
build=$(mktemp -d "${TMPDIR:-/tmp}/bg-five-ply.XXXXXX")
tar -xzf "$root/engine/source/gnubg-core-955555c-bg5.tar.gz" -C "$build"
python3 - "$build/src/bridge.c" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = 'if(depth<0||depth>4||parseXgid(&ms,original)'
assert s.count(old) == 1, 'Pinned checker binding changed'
# Only extend the checker binding. GNUbg's evalcontext and cache reserve four
# bits for depth; ScoreMove recursively evaluates the requested depth. No
# changes to weights, internal pruning, cube bindings, or application presets.
p.write_text(s.replace(old, 'if(depth<0||depth>5||parseXgid(&ms,original)'))
PY
(cd "$build" && make -f Makefile.emcc VARIANT=simd -j4)
cmp "$build/dist_simd/gnubg-core-module.data" "$root/engine/vendor/gnubg-core-module.data"
echo "PILOT_BUILD=$build"
