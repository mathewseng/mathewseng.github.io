from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import gzip, json, sys
import cv2
import numpy as np
work=ARTIFACT_DIR
initial=np.zeros((24,2),int)
for point,count in ((24,2),(13,5),(8,3),(6,5)):
 initial[point-1,0]=count
 initial[24-point,1]=count
archive=[]
for f in sorted((work/'state').glob('*.jsonl.gz')):
 with gzip.open(f,'rt') as r:
  for i,line in enumerate(r):
   if i%25:continue
   a=json.loads(line); s=a['state']
   if not s:continue
   counts=np.array(s['points'])
   distance=np.abs(counts-initial).sum()+sum(s['bar'])
   cube=s['cube']
   archive.append(dict(clip=a['clip'],frame=i,time=a['seconds'],distance=int(distance),count=s['visibleCheckerTotals'],
          off=s['borneOff'],cube=cube and cube['stake'],hands=bool(s['handRegions'])))
(work/'v2/boundary-samples.json').write_text(json.dumps(archive))
intervals=[]
for a in archive:
 if a['distance']>9 or a['hands']: continue
 t=a['clip']*60+a['time']
 if intervals and t-intervals[-1][-1]['clip']*60-intervals[-1][-1]['time']<20:
  intervals[-1].append(a)
 else:intervals.append([a])
for r in intervals:
 print('OPEN',len(r),[(a['clip'],round(a['time'],1),a['distance'],a['count']) for a in [r[0],min(r,key=lambda a:a['distance']),r[-1]]])
for i in range(77):
 r=[a for a in archive if a['clip']==i]
 k=[a for a in r if min(a['count'])<9 and not a['hands']]
 if k:
  print('END?',i,len(k),[(a['frame'],a['time'],a['count'],a['off']) for a in [k[0],k[-1]]])
