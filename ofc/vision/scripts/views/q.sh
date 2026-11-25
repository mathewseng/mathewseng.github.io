#!/bin/bash
# q.sh QUEUE: lines "TAG SESS ['{json params}']" (JSON in single quotes: xargs strips double quotes), 3 at a time; then touch done-QUEUE
xargs -P 3 -L 1 "$(dirname "$0")/sim1.sh" < $1
touch done-$(basename $1 .txt)
