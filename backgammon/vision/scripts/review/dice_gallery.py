from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import cv2, sys, json
import numpy as np
work=ARTIFACT_DIR
cv2.setNumThreads(1)
locator=cv2.dnn.readNetFromONNX(str(work/'models/locator.onnx'))
dice=cv2.dnn.readNetFromONNX(str(work/'models/dice.onnx'))
all_candidates=[]
rng=np.random.default_rng(83)
for f in sorted((work/'samples').glob('*.jpg'))[::2]:
 im=cv2.imread(str(f))
 locator.setInput(cv2.dnn.blobFromImage(im,1/255))
 probs=1/(1+np.exp(-locator.forward()[0]))
 for k in (2,3):
  g=probs[k]
  ys,xs=np.where((g==cv2.dilate(g,np.ones((3,3),np.uint8))) & (g>.13))
  for c,r in zip(xs,ys):
   x,y=int(c)*4,int(r)*4
   if not (58 < x < 509 and 20<y<404 and not 260<x<297): continue
   checker=probs[:2,max(0,r-4):r+5,max(0,c-4):c+5].max()
   if checker>.58: continue
   patch=im[y-16:y+16,x-16:x+16]
   dice.setInput(cv2.dnn.blobFromImage(patch,1/255))
   score=dice.forward()[0]
   odds=np.exp(score-max(score)); odds/=odds.sum()
   all_candidates.append((f.stem,x,y,k-2,round(float(g[r,c]),3),int(odds.argmax()),round(float(max(odds)),3)))
for group,color in [('light',0),('dark',1)]:
 seen=[]
 order=sorted([c for c in all_candidates if c[3]==color],key=lambda c:c[4]+rng.uniform(0,.09),reverse=True)
 for key,x,y,col,s,v,p in order:
  clip=int(key.split('_')[0]); frame=int(key.split('_')[1])
  if any(clip == i and (abs(frame-j)<120 or ((x-a)**2+(y-b)**2<9**2)) for i,j,a,b in seen):
   continue
  seen.append((clip,frame,x,y))
  if len(seen)>=90:break
 selected=[next(c for c in order if (int(c[0].split('_')[0]),int(c[0].split('_')[1]),c[1],c[2])==e) for e in seen]
 (work/'review'/f'dice-{group}.json').write_text(json.dumps(selected))
 for offset in range(0,len(selected),45):
  current=selected[offset:offset+45]
  sheet=np.full(((len(current)+8)//9*139,9*120,3),25,np.uint8)
  for j,(key,x,y,kind,s,v,p) in enumerate(current):
   im=cv2.imread(str(work/'samples'/f'{key}.jpg'))
   patch=im[y-12:y+12,x-12:x+12]
   row,col=divmod(j,9);i=col*120;r=row*139
   sheet[r:r+118,i:i+118]=cv2.resize(patch,(118,118),interpolation=cv2.INTER_NEAREST)
   cv2.putText(sheet,f'{offset+j:02}  {key[:3]}  {v}:{p:.2f}',(i+2,r+133),0,.43,(255,255,255),1,cv2.LINE_AA)
  cv2.imwrite(str(work/'review'/f'dice-{group}-{offset//45}.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
