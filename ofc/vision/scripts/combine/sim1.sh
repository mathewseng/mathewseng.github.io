#!/bin/bash
# sim1.sh ROOT TAG SESS [ARGS...] -> ROOT/sim-TAG-SESS.json (my worktree's runtime + profile), ROOT/done-TAG-SESS
W=/private/tmp/claude-501/ofc-wt9/ofc/vision
R=$1; T=$2; S=$3; shift 3
mkdir -p $R/work; cd $R/work
~/.local/bin/agent-job --timeout 3000 -- python3 $W/scripts/eye/sim2.py "$T" "$S" "$@" > ../log-sim-$T-$S.txt 2>&1
touch ../done-$T-$S
