#!/bin/zsh
# Rebuild the Nov 21 evening's dice, cube and analysis from the decoded checker play.
#
#   rebuild_evening.sh scan      detector scan of every recording (dice, cube)
#   rebuild_evening.sh faces     face reader trained on every recording
#   rebuild_evening.sh analyze   dice evidence, per-recording analysis, reviewed rolls,
#                                combined numbering, dances and unseen final bear-offs
#   rebuild_evening.sh render    analysis videos (1080p) and 720p web copies
#   rebuild_evening.sh export    page data: state, history, reports, Vision overlay
set -e
cd "${0:A:h}"
D=~/Downloads
S1=$D/office-3-backgammon-20261121
OBJ=$S1/objects/models/obj.pt
FACES=$S1/models/faces-v5.pt
ALL=$D/office-3-backgammon-20261121-all/analysis
JOB=(~/.local/bin/agent-job --timeout 10800 --)

# recording, work dir, decode file, games, reviewed rolls, combined numbers
# (decode2-v5: decode2.mjs with the taken-back move rule on the slots-v3 readings obs-v3; the
# overlay shows the slots-v5 readings obs-v5)
typeset -A REC WORK DEC GAMES REV NUM
REC[s1]=$D/office-3-wide-20261121-190110-3o988aae; WORK[s1]=$S1;       DEC[s1]=decode2-v5.json; GAMES[s1]="1 2 3 4"; REV[s1]=reviewed-rolls.json;      NUM[s1]="1 2 3 4"
REC[s2]=$D/office-3-wide-20261121-213301-biuuhuy6; WORK[s2]=$S1-2133;  DEC[s2]=decode2-v5.json; GAMES[s2]="2 3";     REV[s2]=reviewed-rolls-2133.json; NUM[s2]="5 6"
REC[s3]=$D/office-3-wide-20261121-221919-jeufscvy; WORK[s3]=$S1-2219;  DEC[s3]=decode2-v5.json; GAMES[s3]="1 2 3";   REV[s3]=reviewed-rolls-2219.json; NUM[s3]="7 8 9"

use() { export BG_RECORDING_DIR=${REC[$1]} BG_WORK_DIR=${WORK[$1]}; }

case $1 in
scan)
  for s in s1 s2 s3; do use $s; $JOB python3 objects_scan.py $OBJ; done ;;
faces)
  use s1
  X=(${WORK[s2]}/${DEC[s2]}@${WORK[s2]} ${WORK[s3]}/${DEC[s3]}@${WORK[s3]})
  $JOB python3 dice_faces.py ${WORK[s1]}/${DEC[s1]} ${FACES:r}-test.pt --holdout-games 4 --steps 4000 --extra $X | grep -E "examples|unique|miss"
  $JOB python3 dice_faces.py ${WORK[s1]}/${DEC[s1]} $FACES --steps 4000 --extra $X | grep -E "examples|unique" ;;
analyze)
  for s in s1 s2 s3; do
    use $s; W=${WORK[$s]}; mkdir -p $W/analysis-v7
    $JOB python3 dice_evidence.py $W/${DEC[$s]} $FACES $W/dice-evidence-v7.json
    for g in ${=GAMES[$s]}; do
      $JOB bun analyze.mjs $W/${DEC[$s]} $W/dice-evidence-v7.json $W/cube-scan.json $W/analysis-v7 $g > $W/analysis-v7/log-$g.txt 2>&1 &
    done
  done
  wait
  for s in s1 s2 s3; do
    use $s; W=${WORK[$s]}
    $JOB bun patch_rolls.mjs $W/analysis-v7 ${REV[$s]}
    python3 fix_final.py $W/analysis-v7 $W/obs-v3 ${=GAMES[$s]} || true
    src=(${=GAMES[$s]}); dst=(${=NUM[$s]})
    for i in {1..${#src}}; do
      python3 - $W/analysis-v7 ${src[$i]} ${dst[$i]} $ALL ${REC[$s]:t} ${W:t} $s <<'EOF'
import json, sys
src_dir, src, dst, all_dir, rec, work, s = sys.argv[1:]
d = json.load(open(f'{src_dir}/game-{int(src):02d}.json')); d['game'] = int(dst)
if s != 's1': d['session'] = {'recording': rec, 'work': work, 'sourceGame': int(src)}
json.dump(d, open(f'{all_dir}/game-{int(dst):02d}.json', 'w'), indent=1)
EOF
      bun resolve_dances.mjs $ALL/game-$(printf %02d ${dst[$i]}).json $W/dice-evidence-v7.json ${src[$i]} | tail -1
    done
  done ;;
render)
  R=${ALL:h}/render; WEB=${ALL:h}/web; mkdir -p $R $WEB
  for s in s1 s2 s3; do
    for g in ${=NUM[$s]}; do
      ( use $s
        $JOB python3 render.py $ALL $R $g > $R/log-$g.txt 2>&1 &&
        ffmpeg -nostdin -v error -y -i $R/game-0$g-analysis.mp4 -vf scale=1280:720:flags=lanczos -c:v libx264 -crf 28 -preset slow \
          -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart $WEB/game-0$g-analysis.mp4 ) &
    done
  done
  wait ;;
export)
  R=${ALL:h}/render; P=../../2026-11-21
  bun export.mjs $ALL $R $P 1 2 3 4 5 6 7 8 9 | cut -c1-100
  for s in s1 s2 s3; do use $s; python3 export_audit.py ${WORK[$s]}/obs-v5 $ALL $R $P $FACES ${=NUM[$s]}; done ;;
*) echo "usage: $0 scan|faces|analyze|render|export"; exit 2 ;;
esac
