"""Learn the printed cube faces from Office-3 crops and confirm them over a fixed pose."""
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import json,sys
import cv2,numpy as np
from sklearn.svm import SVC
import joblib

OUT=ARTIFACT_DIR / 'v3'
ROOT=OUT.parent
from game_state import center_crop


def feature(pixels):
    crop=cv2.cvtColor(pixels,cv2.COLOR_BGR2GRAY)[3:29,3:29]
    crop=cv2.resize(crop,(20,20),interpolation=cv2.INTER_AREA).astype(np.float32)
    crop=(crop-np.mean(crop))/max(np.std(crop),8)
    inner=crop[4:16,4:16]
    gx=cv2.Sobel(inner,-1,1,0,ksize=1)
    gy=cv2.Sobel(inner,-1,0,1,ksize=1)
    return np.r_[crop.ravel(),gx.ravel()*.25,gy.ravel()*.25]


def orientations(frame):
    return [np.rot90(frame,i).copy() for i in range(4)]


def evaluate(model,images):
    views=[i for p in images for i in orientations(p)]
    results=model.predict_proba(np.stack([feature(p) for p in views])).reshape(len(images),4,-1)
    return results.mean(axis=(0,1))


def main():
    cv2.setNumThreads(1)
    known=json.loads((ROOT/'labels/cube.json').read_text())
    source=[]
    for o in known:
        if o['value'] is None:continue
        im=cv2.imread(str(ROOT/'samples'/f'{o["image"]}.jpg'))
        source.append((o,center_crop(im,*o['center'])))
    # The printed four is visually distinct; its playing-surface pose was reviewed separately.
    for name in ('072_00000','072_00050','072_00101'):
        im=cv2.imread(str(ROOT/'samples'/f'{name}.jpg'))
        source.append(({'image':name,'value':4,'split':'train'},center_crop(im,179,172)))
    for o in known[::5]:
        im=cv2.imread(str(ROOT/'samples'/f'{o["image"]}.jpg'))
        source.extend([({'image':o['image'],'value':0,'split':o['split']},center_crop(im,535,214)),
                       ({'image':o['image'],'value':0,'split':o['split']},center_crop(im,28,109))])
    rng=np.random.default_rng(41)
    train=[]; y=[]
    for meta,im in source:
        if meta['split']!='train':continue
        for repeat in range(32):
            origin=orientations(im)[repeat%4]
            mat=cv2.getRotationMatrix2D((15.5,15.5),float(rng.normal(0,8)),float(rng.uniform(.88,1.14)))
            mat[:,2]+=rng.normal(0,1.4,2)
            expanded=cv2.warpAffine(origin,mat,(32,32),borderMode=cv2.BORDER_REFLECT)
            train.append(feature(expanded));y.append(meta['value'])
    model=SVC(C=6,probability=True,class_weight='balanced',random_state=42)
    model.fit(np.stack(train),y)
    joblib.dump(model,OUT/'cube-faces.joblib')
    rows=[]
    for meta,im in source:
        if meta['split']!='test':continue
        ev=evaluate(model,[im])
        i=int(ev.argmax())
        rows.append({'image':meta['image'],'expected':meta['value'],'predicted':int(model.classes_[i]),'score':float(ev[i])})
    (OUT/'cube-model-validation.json').write_text(json.dumps(rows,indent=2)+'\n')
    print('Cube value validation',sum(x['expected']==x['predicted'] for x in rows if x['expected']),
         sum(bool(x['expected']) for x in rows))
if __name__=='__main__':main()
