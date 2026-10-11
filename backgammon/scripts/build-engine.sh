#!/bin/sh
set -eu
# Requires emsdk 4.0.15 activated. No pthreads or cross-origin isolation.
case "$(emcc --version)" in
  *" 4.0.15 "*) ;;
  *) echo "Activate the pinned Emscripten 4.0.15 before building." >&2; exit 1 ;;
esac
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
curl -fL https://github.com/ascottix/gnubg-core/archive/955555c69adebb1d7de23abc1018074158621168.tar.gz | tar xz -C "$build" --strip-components=1
cp "$root/engine/source/bridge.c" "$build/src/bridge.c"
python3 "$root/scripts/patch-engine.py" "$build"
(cd "$build" && make -f Makefile.emcc -j4)
(cd "$build" && make -f Makefile.emcc VARIANT=simd -j4)
# Both variants must use exactly the same weights/bearoff/MET package.
cmp "$build/dist/gnubg-core-module.data" "$build/dist_simd/gnubg-core-module.data"
cp "$build"/dist/gnubg-core-module.* "$root/engine/vendor/"
mkdir -p "$root/engine/vendor/simd"
cp "$build/dist_simd/gnubg-core-module.js" "$build/dist_simd/gnubg-core-module.wasm" "$root/engine/vendor/simd/"
(cd "$build" && tar -czf "$root/engine/source/gnubg-core-955555c-bg5.tar.gz" src data web LICENSE Makefile Makefile.emcc)
