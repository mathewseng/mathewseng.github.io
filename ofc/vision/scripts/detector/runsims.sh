#!/bin/bash
# runsims.sh ROOT TAG SESS[,SESS] [PARAMS] -> ROOT/sim-TAG-SESS.json (shipped profile readers)
W=$(cd "$(dirname "$0")/../.." && pwd)
P="$4"; [ -z "$P" ] && P='{}'
mkdir -p $1/work; cd $1/work
~/.local/bin/agent-job --timeout 3000 -- python3 $W/scripts/eye/sim2.py "$2" "$3" "$P" > ../log-sim-$2-$3.txt 2>&1
touch ../done-sim-$2-$3
