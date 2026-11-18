from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import cv2, json, numpy as np
import sys
work=ARTIFACT_DIR
model=cv2.dnn.readNetFromONNX(str(work/'models/locator.onnx'))
cv2.setNumThreads(1)
for key in sys.argv[1:]:
 im=cv2.imread(str(work/f'samples/{key}.jpg'))
 if im is None: continue
 model.setInput(cv2.dnn.blobFromImage(im,1/255))
 probs=1/(1+np.exp(-model.forward()[0]))
 det=[]
 colors=[(15,160,0),(0,120,255),(230,0,200),(225,225,0),(25,25,240)]
 for k,g in enumerate(probs):
  ys,xs=np.where((g==cv2.dilate(g,np.ones((3,3),np.uint8))) & (g>.20))
  for x,y in zip(xs,ys):
   p=round(float(g[y,x]),2)
   if k<2 and p<.22: continue
   det.append((k,int(x)*4,int(y)*4,p))
   cv2.circle(im,(x*4,y*4),13 if k<2 else 7,colors[k],1,cv2.LINE_AA)
   cv2.putText(im,str(int(p*100)),(x*4-5,y*4+4),0,.28,colors[k],1,cv2.LINE_AA)
 print(key,[sum(x[0]==i for x in det) for i in range(5)],[x for x in det if x[0]>=2])
 cv2.imwrite(str(work/f'review/p-{key}.jpg'),im)
