from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import sys
import cv2,gzip,json,numpy as np
root=ARTIFACT_DIR
hold={(19,31),(20,40),(22,26),(23,25),(24,52),(48,17),(49,38),(51,41),(69,24),(70,28),(71,30),(72,15)}
pred=[]
for clip,t in sorted(hold):
 files=sorted((root/'samples').glob(f'{clip:03}_*.jpg'))
 source=sorted((root/'state').glob('*.jsonl.gz'))[clip]
 with gzip.open(source,'rt') as f:
  rows=[json.loads(line) for line in f]
 candidates=[]
 for p in files:
  r=rows[int(p.stem.split('_')[1])]
  s=r['state']
  if s and not s['handRegions'] and r['seconds']>=10 and min(s['visibleCheckerTotals'])>=10:
   candidates.append((abs(r['seconds']-t),p))
 if candidates:
  _,pick=min(candidates)
  pred.append(pick)
for offset in range(0,len(pred),6):
 items=pred[offset:offset+6]
 s=np.full((444*((len(items)+2)//3),1680,3),25,np.uint8)
 for i,p in enumerate(items):
  y,x=divmod(i,3);y*=444;x*=560
  s[y:y+420,x:x+560]=cv2.imread(str(p))
  cv2.putText(s,p.stem,(x+8,y+439),0,.6,(255,255,255),1,cv2.LINE_AA)
 cv2.imwrite(str(root/'v2'/f'blind-{offset//6}.jpg'),s,[cv2.IMWRITE_JPEG_QUALITY,95])
print([p.stem for p in pred])
