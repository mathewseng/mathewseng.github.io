from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import cv2, json, numpy as np
work=ARTIFACT_DIR
found=[]
for i in range(75):
 for f in sorted((work/'samples').glob(f'{i:03}_*.jpg'))[2:12:3]:
  im=cv2.imread(str(f))
  candidates=[]
  g=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
  for side,x0,x1 in [('L',7,51),('R',514,553)]:
   a=(g[:,x0:x1]>200).astype(np.uint8)
   n,_,stats,cent=cv2.connectedComponentsWithStats(a,8)
   for (x,y,w,h,size),(u,v) in zip(stats[1:],cent[1:]):
    if 14<=w<=31 and 14<=h<=29 and 145<=size<=720:
     center=(round(u)+x0,round(v)); c=im[max(0,center[1]-15):center[1]+15,center[0]-15:center[0]+15]
     if c.shape[:2]==(30,30):candidates.append((size,w,h,side,center,c))
  for size,w,h,side,(x,y),c in sorted(candidates, key=lambda a:abs(a[1]-23)+abs(a[2]-23))[:2]:
   if found and any(k[:3]==f.stem[:3] and abs(y-v)<8 and abs(x-u)<8 for k,u,v,_ in found[-8:]):continue
   found.append((f.stem,x,y,c))
   if len([1 for k,*_ in found if k[:3]==f.stem[:3]])>=2:break
for offset in range(0,len(found),48):
 a=found[offset:offset+48]
 sheet=np.full((((len(a)+11)//12)*100,12*84,3),25,np.uint8)
 for j,(key,x,y,pix) in enumerate(a):
  r,c=divmod(j,12);r*=100;c*=84
  sheet[r:r+81,c:c+81]=cv2.resize(cv2.rotate(pix,cv2.ROTATE_90_CLOCKWISE),(81,81),interpolation=cv2.INTER_NEAREST)
  cv2.putText(sheet,f'{offset+j:02} {key[:3]}',{ } if False else (c+2,r+96),0,.39,(255,255,255),1,cv2.LINE_AA)
 cv2.imwrite(str(work/'review'/f'cube-{offset//48}.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
(work/'review'/'cube-candidates.json').write_text(json.dumps([r[:3] for r in found]))
