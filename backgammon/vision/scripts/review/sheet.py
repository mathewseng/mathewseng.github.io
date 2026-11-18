from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import sys
import cv2,numpy as np
work=ARTIFACT_DIR
entries=[]
for key in sys.argv[2:]:
 p=sorted((work/'samples').glob(key+'.jpg'))
 if p:
  im=cv2.imread(str(p[0]))
  entries.append((p[0].stem,im))
w,h=560,450
sheet=np.full((h*((len(entries)+2)//3),w*3,3),25,np.uint8)
for i,(key,im) in enumerate(entries):
 y,x=divmod(i,3); y*=h;x*=w
 sheet[y:y+420,x:x+w]=im
 cv2.putText(sheet,key,(x+10,y+442),0,.63,(255,255,255),1,cv2.LINE_AA)
cv2.imwrite(str(work/'review'/sys.argv[1]),sheet,[cv2.IMWRITE_JPEG_QUALITY,98])
