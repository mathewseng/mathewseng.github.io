"""Read current roll and cube evidence at one game frame."""
import argparse,gzip,json
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

ROOT=ARTIFACT_DIR / 'v3'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('game',type=int,choices=range(1,6))
where=parser.add_mutually_exclusive_group(required=True)
where.add_argument('--frame',type=int)
where.add_argument('--seconds',type=float)
args=parser.parse_args()
frame=args.frame if args.frame is not None else round(args.seconds*25)
if frame<0:parser.error('Frame must be nonnegative')
with gzip.open(ROOT/f'game-{args.game:02}-current.jsonl.gz','rt') as stream:
    for i,line in enumerate(stream):
        if i==frame:
            row=json.loads(line)
            assert row['frame']==frame
            print(json.dumps({'game':args.game,'seconds':frame/25,**row},indent=2))
            break
    else:parser.error('Frame falls outside the camera footage for that game')
