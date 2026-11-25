#!/bin/bash
# scanall.sh MODEL ROOT [NMS]: rescan 4 sessions in 3 jobs, then sims (fin profile) -> ROOT/sim-fin-SESS.json, touch ROOT/done-all
M=$1; R=$2; N=${3:-}
mkdir -p $R
run() { for s in "$@"; do ~/.local/bin/agent-job --timeout 3000 -- python3 "$(dirname "$0")/scan3.py" $M $s $R $N >> $R/log-scan.txt 2>&1; "$(dirname "$0")/runsims.sh" $R fin $s; done; }
run n1532 & run n1501 s0023 & run s1836 & wait
touch $R/done-all
