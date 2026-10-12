#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Research builds only; never replaces the deployed binaries or their source.
set -eu
case "$(emcc --version)" in
  *" 4.0.15 "*) ;;
  *) echo "Activate the pinned Emscripten 4.0.15." >&2; exit 1 ;;
esac
variant=${1:-}
case "$variant" in cache|activation|move-index|output|profile) ;; *) echo "Usage: $0 cache|activation|move-index|output|profile" >&2; exit 1 ;; esac
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
build=$(mktemp -d "${TMPDIR:-/tmp}/bg-native-$variant.XXXXXX")
tar -xzf "$root/engine/source/gnubg-core-955555c-bg5.tar.gz" -C "$build"
case "$variant" in
  activation|move-index|output) python3 "$root/scripts/patch-$variant-pilot.py" "$build" ;;
  cache) python3 - "$build" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
f = p / 'src/bridge.c'
f.write_text(f.read_text() + '''
/* Research-only sizing control, before the first search. */
#include <emscripten/heap.h>
int bg_cache_config(int evaluationBits, int pruningBits) {
    if(evaluationBits<17||evaluationBits>22||pruningBits<14||pruningBits>21)return -1;
    if(EvalCacheResize(1u<<evaluationBits)<0)return -1;
    return CacheResize(&cpEval,1u<<pruningBits);
}
unsigned int bg_memory_size(void) { return emscripten_get_heap_size(); }
''')
f = p / 'Makefile.emcc'
f.write_text(f.read_text().replace('"_bg_rollout",', '"_bg_rollout", "_bg_cache_config", "_bg_memory_size",'))
PY
  ;;
  profile) python3 - "$build" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]) / 'Makefile.emcc'
p.write_text(p.read_text().replace('-O3 -flto -msimd128 -ffp-contract=off', '-O3 -flto -msimd128 -ffp-contract=off -g2'))
PY
  ;;
esac
if ! make -C "$build" -f Makefile.emcc VARIANT=simd -j4 > "$build/build.log" 2>&1; then
  tail -n 20 "$build/build.log" >&2
  exit 1
fi
cmp "$build/dist_simd/gnubg-core-module.data" "$root/engine/vendor/gnubg-core-module.data"
echo "PILOT_BUILD=$build"
