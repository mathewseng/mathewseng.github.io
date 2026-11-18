from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import json
import sys
import cv2
import numpy as np
root=ARTIFACT_DIR
from game_state import GameVision, COLUMNS
v=GameVision()
cv2.setNumThreads(1)
selected=[]
hold={19,20,21,22,23,24,48,49,50,51,52,69,70,71,72}
for path in sorted((root/'samples').glob('*.jpg'))[::3]:
 key=path.stem; clip,frame=map(int,key.split('_'))
 if clip in hold:continue
 pixels=cv2.imread(str(path)); s=v.observations(pixels)
 if s['handRegions'] or s['checkerStatus']=='ambiguous':continue
 for point,(w,d) in enumerate(s['points'],1):
  color=0 if w>d else 1
  n=max(w,d)
  if not (3<=n<=6 and s['visibleCheckerTotals'][color]<15): continue
  col=int(COLUMNS[12-point if point<=12 else point-13])
  patch=pixels[:224,col-21:col+22] if point<=12 else pixels[196:,col-21:col+22][::-1]
  if any(r['clip']==clip and r['point']==point for r,p in selected):continue
  selected.append((dict(image=key,clip=clip,point=point,color=color,estimate=n,total=s['visibleCheckerTotals'][color]),patch))
select=selected[::max(1,len(selected)//106)][:112]
(root/'v2/stack-candidates.json').write_text(json.dumps([r for r,_ in select]))
for i in range(0,len(select),56):
 values=select[i:i+56]
 sheet=np.full((((len(values)+13)//14)*213,14*62,3),25,np.uint8)
 for j,(record,p) in enumerate(values):
  y,x=divmod(j,14); y*=213;x*=62
  sheet[y:y+175,x+7:x+51]=cv2.resize(p,(44,175))
  cv2.putText(sheet,f'{j+i:02} c{record["estimate"]}',(x+4,y+191),0,.40,(255,255,255),1,cv2.LINE_AA)
  cv2.putText(sheet,f'{record["clip"]:02} p{record["point"]}',(x+4,y+208),0,.37,(190,190,190),1,cv2.LINE_AA)
 cv2.imwrite(str(root/'v2'/f'stack-labels-{i//56}.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
print(len(selected),len(select))
