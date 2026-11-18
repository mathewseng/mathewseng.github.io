"""Get the camera state and current review analysis at a game frame."""
import argparse
import gzip
import json
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

ROOT=ARTIFACT_DIR / 'v2'

def query(game,frame):
    g=json.loads((ROOT/f'game-{game}-analysis.json').read_text())
    if frame not in range(g['frames']):
        raise ValueError(f'Frame must be between 0 and {g["frames"]-1}')
    seg=next(s for s in g['segments'] if
             s['firstGameFrame']<=frame<s['firstGameFrame']+s['lastExclusive']-s['firstFrame'])
    original_frame=seg['firstFrame']+frame-seg['firstGameFrame']
    with gzip.open(ROOT/'state'/f'{Path(seg["source"]).stem}.jsonl.gz','rt') as f:
        source=next(json.loads(line) for i,line in enumerate(f) if i==original_frame)
    elapsed=frame/25
    result=dict(game=game, gameFrame=frame, gameSeconds=elapsed, source=source)
    for name in ('analyses','conditional','reviewedCubeOffers'):
        result[name]=[a for a in g[name] if a['startSeconds']<=elapsed<=a['endSeconds']]
    latest=next((a for a in reversed(g['positions']) if a['startSeconds']<=elapsed),None)
    if result['reviewedCubeOffers']:
        from render_games import reviewed_cube_position
        offer=result['reviewedCubeOffers'][0]
        latest={**reviewed_cube_position(offer),'startSeconds':offer['startSeconds'],'endSeconds':offer['endSeconds']}
    result['latestPositionEstimate']=latest
    result['isPositionEstimateStale']=latest is None or latest['endSeconds']+.35<elapsed
    result['runningLoss']={}
    for side in ('white','dark'):
        losses=[x['loss'] for x in g['lossEvents'] if x['player']==side and x['seconds']<=elapsed]
        result['runningLoss'][side]={'total':sum(losses),'graded':len(losses)}
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game',type=int,choices=range(1,6))
    index=parser.add_mutually_exclusive_group(required=True)
    index.add_argument('--frame',type=int)
    index.add_argument('--seconds',type=float)
    args=parser.parse_args()
    print(json.dumps(query(args.game,args.frame if args.frame is not None else round(args.seconds*25)),indent=2))
