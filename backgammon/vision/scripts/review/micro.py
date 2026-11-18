from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import cv2, numpy as np
work=ARTIFACT_DIR
# Centers read from the unlabelled rectangular board frames.
groups={
 '000_00000':[(29,192,'cube'),(72,287,'white'),(95,268,'white')],
 '001_00151':[(27,192,'cube'),(378,221,'dark'),(494,253,'dark')],
 '004_01001':[(24,20,'cube'),(316,140,'dark'),(329,254,'dark')],
 '006_00500':[(20,23,'cube'),(365,298,'dark'),(380,304,'dark')],
 '009_00701':[(24,23,'cube'),(204,189,'white'),(132,387,'white')],
 '012_00501':[(28,192,'cube'),(339,156,'dark'),(372,271,'dark')],
 '018_00301':[(25,211,'cube'),(466,232,'dark'),(432,315,'dark')],
 '068_00750':[(23,217,'cube')],
 '070_00000':[(25,217,'cube'),(380,95,'dark'),(490,261,'dark')],
 '071_00000':[(25,217,'cube'),(103,259,'white'),(120,298,'white')],
}
rows=[]
for key,items in groups.items():
 img=cv2.imread(str(work/'samples'/f'{key}.jpg'))
 if img is None: continue
 for x,y,kind in items:
  r=16
  rows.append((key,x,y,kind,img[y-r:y+r,x-r:x+r]))
sheet=np.full(((len(rows)+6)//7*184,7*152,3),25,np.uint8)
for i,(key,x,y,kind,pix) in enumerate(rows):
 j,k=divmod(i,7);j*=184;k*=152
 sheet[j:j+142,k:k+142]=cv2.resize(pix,(142,142),interpolation=cv2.INTER_NEAREST)
 cv2.putText(sheet,key,(k+4,j+156),0,.43,(255,255,255),1,cv2.LINE_AA)
 cv2.putText(sheet,f'{kind} {x},{y}',(k+4,j+173),0,.40,(230,230,230),1,cv2.LINE_AA)
cv2.imwrite(str(work/'review'/'micro.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
