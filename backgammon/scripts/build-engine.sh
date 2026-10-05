#!/bin/sh
set -eu
# Requires emsdk 4.0.15 activated. No pthreads or cross-origin isolation.
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
curl -fL https://github.com/ascottix/gnubg-core/archive/955555c69adebb1d7de23abc1018074158621168.tar.gz | tar xz -C "$build" --strip-components=1
cp "$root/engine/source/bridge.c" "$build/src/bridge.c"
python3 "$root/scripts/patch-engine.py" "$build"
(cd "$build" && make -f Makefile.emcc -j4)
cp "$build"/dist/gnubg-core-module.* "$root/engine/vendor/"
(cd "$build" && tar -czf "$root/engine/source/gnubg-core-955555c-bg2.tar.gz" src data web LICENSE Makefile Makefile.emcc)
