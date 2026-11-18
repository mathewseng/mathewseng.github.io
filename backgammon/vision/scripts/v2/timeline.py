from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from datetime import datetime
import gzip, json

ROOT=ARTIFACT_DIR
OUT=ROOT/'v2'
recordings=sorted((ROOT/'tracking').glob('*.jsonl.gz'))
index=[]
for f in recordings:
 with gzip.open(f,'rt') as handle:
  rows=[(i,json.loads(line)['seconds']) for i,line in enumerate(handle)]
 index.append(dict(source=f.name.removesuffix('.jsonl.gz')+'.mp4',pts=[r[1] for r in rows]))
timeline=json.loads((OUT/'games.json').read_text())
for game in timeline['games']:
 start,offset=game['first']
 end,last=game['lastExclusive'] or [len(index),0]
 segments=[]
 game_frames=0
 for i in range(start,min(end+1,len(index))):
  file=index[i]
  a=offset if i==start else 0
  b=last if i==end else len(file['pts'])
  if b<=a:continue
  seconds=file['pts'][a]
  prior=segments[-1] if segments else None
  gap=None
  discontinuity=False
  if prior:
   get=lambda n:datetime.strptime(n[-10:-4],'%H%M%S')
   expected=(get(file['source'])-get(prior['source'])).total_seconds()
   previous_pts=index[i-1]['pts']
   gap=round(expected-(previous_pts[-1]-previous_pts[0]+.04),3)
   discontinuity=abs(gap)>2
  segments.append({'clip':i,'source':file['source'],'firstFrame':a,'lastExclusive':b,
    'firstGameFrame':game_frames,'sourceStartSeconds':seconds,'estimatedGapSeconds':gap,
    'discontinuity':discontinuity})
  game_frames+=b-a
 game.update(segments=segments,frames=game_frames)
(OUT/'timeline.json').write_text(json.dumps(timeline,indent=2)+'\n')
print([(g['number'],g['frames'],len(g['segments'])) for g in timeline['games']])
