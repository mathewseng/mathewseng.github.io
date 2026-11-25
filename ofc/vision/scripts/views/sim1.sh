#!/bin/bash
# sim1.sh TAG SESS [ARGS...] -> $ROOT/r/sim-TAG-SESS.json (this checkout's runtime + profile) and $ROOT/r/done-TAG-SESS.
# ROOT (default .) holds scan/ (merged scans, combine/merge.py) and r/ (r/scan -> ../scan).
W=$(cd "$(dirname "$0")/../.." && pwd); R=$(cd "${ROOT:-.}" && pwd)/r
T=$1; S=$2; shift 2
mkdir -p $R/work; cd $R/work
~/.local/bin/agent-job --timeout 3000 -- python3 $W/scripts/eye/sim2.py "$T" "$S" "$@" > ../log-sim-$T-$S.txt 2>&1
touch ../done-$T-$S
