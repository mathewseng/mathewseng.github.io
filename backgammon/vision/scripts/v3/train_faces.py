"""Fit value readers on real tracked dice and render diverse synthetic pips."""
from __future__ import annotations
from collections import Counter
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import argparse,json,sys

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

OUT=ARTIFACT_DIR / 'v3'
ROOT=OUT.parent
from train_vision import Assets,FaceReader,face_data
from game_state import center_crop


def normalize(image):
    im=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY)
    core=im[9:23,9:23]
    level=(np.percentile(core,26)+np.percentile(core,79))/2
    contrast=np.clip((im.astype(float)-level)*1.6+128,0,255).astype(np.uint8)
    return np.stack((im,contrast,cv2.subtract(im,cv2.GaussianBlur(im,(0,0),2.0))+np.uint8(64)),axis=-1)


def rotate(im,rng):
    matrix=cv2.getRotationMatrix2D((15.5,15.5),float(rng.uniform(-180,180)),float(rng.uniform(.83,1.18)))
    matrix[:,2]+=rng.normal(0,1.4,2)
    out=cv2.warpAffine(im,matrix,(32,32),borderMode=cv2.BORDER_REFLECT)
    if rng.random()<.27:out=cv2.GaussianBlur(out,(3,3),.49)
    return out


def to_dataset(training,count,rng,texture):
    data=[]; label=[]
    for record,pictures in training:
        for _ in range(count):
            im=pictures[int(rng.integers(len(pictures)))]
            im=rotate(im,rng)
            data.append(normalize(im) if texture else im);label.append(record['value'])
    return torch.from_numpy(np.stack(data).transpose(0,3,1,2).copy()),torch.tensor(label)


def evaluate(net,examples,device,texture):
    scores=[]
    for r,imgs in examples:
        anchors=[imgs[i] for i in range(min(len(imgs),8))]
        views=[v for p in anchors for v in (p,np.rot90(p,1),np.rot90(p,2),np.rot90(p,3))]
        arr=np.stack([normalize(img.copy()) if texture else img for img in views])
        x=torch.from_numpy(arr.transpose(0,3,1,2).copy()).float().to(device)/255
        with torch.inference_mode():values=net(x).softmax(1).mean(0).cpu().numpy()
        scores.append(values)
    return scores


def fit(examples,seed,texture,device,epochs):
    rng=np.random.default_rng(seed)
    torch.manual_seed(seed)
    actual=[d for d in examples if d[0]['split']=='train']
    tuning=[d for d in examples if d[0]['split']=='validation']
    train_x,train_y=to_dataset(actual,34,rng,texture)
    syn_x,syn_y=face_data(Assets(),5700,seed,False)
    if texture:syn_x=torch.from_numpy(np.stack([normalize(np.array(im.permute(1,2,0)).copy()) for im in syn_x]).transpose(0,3,1,2).copy())
    train_x, train_y, syn_x,syn_y=[t.to(device) for t in (train_x,train_y,syn_x,syn_y)]
    net=FaceReader().to(device)
    opt=torch.optim.AdamW(net.parameters(),lr=.0011)
    histogram=Counter(train_y.tolist()); weights=torch.tensor([1/(max(histogram[k],1)**.42) for k in range(7)],device=device)
    weights=weights/weights.mean()
    best=(-1,-np.inf)
    path=OUT/f'dice-reader-{seed}.pt'
    for epoch in range(epochs):
        net.train()
        for ids in torch.randperm(len(train_x),device=device).split(64):
            s=torch.randint(len(syn_x),(25,),device=device)
            logits=net(torch.cat((train_x[ids],syn_x[s])).float()/255)
            left=F.cross_entropy(logits[:len(ids)],train_y[ids],weight=weights)
            right=F.cross_entropy(logits[len(ids):],syn_y[s])
            loss=left+.40*right
            opt.zero_grad(set_to_none=True);loss.backward();opt.step()
        if epoch==6:
            for p in opt.param_groups:p['lr']=.00049
        net.eval()
        e=evaluate(net,tuning,device,texture)
        hits=sum(int(p.argmax())==r['value'] for p,(r,_) in zip(e,tuning))
        log=sum(float(np.log(max(1e-5,p[r['value']]))) for p,(r,_) in zip(e,tuning))
        print(seed,epoch+1,hits,len(e),round(log,2),flush=True)
        if (hits,log)>best:
            torch.save({k:v.detach().cpu() for k,v in net.state_dict().items()},path)
            best=(hits,log)
    net=net.to('cpu').eval()
    net.load_state_dict(torch.load(path,map_location='cpu',weights_only=True))
    torch.onnx.export(net,torch.zeros(1,3,32,32),OUT/f'dice-reader-{seed}.onnx',
      input_names=['patches'],output_names=['logits'],opset_version=17,
      dynamic_axes={'patches':{0:'batch'},'logits':{0:'batch'}},dynamo=False)
    return net


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--epochs',type=int,default=12)
    args=p.parse_args()
    cv2.setNumThreads(1);torch.set_num_threads(2)
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    data=json.loads((OUT/'temporal-dice-labels.json').read_text())
    legacy=json.loads((ROOT/'labels/dice.json').read_text())
    examples=[]
    for r in data:
        source=np.load(OUT/'tracks'/f'{r["id"]}.npz')
        crops=source['crops'];indices=np.unique(np.linspace(0,len(crops)-1,9).astype(int))
        examples.append((r,[source['median'],source['best'],*[crops[i] for i in indices]]))
    held={r['clip'] for r in data if r['split']!='train'}
    for r in legacy:
        if r['value']!=0 or int(r['image'].split('_')[0]) in held:
            continue
        im=cv2.imread(str(ROOT/'samples'/f'{r["image"]}.jpg'))
        examples.append(({**r,'split':'train'},[center_crop(im,*r['center'])]))
    test=[(r,im) for r,im in examples if r['split']=='test']
    models=[(71,False),(116,True)]
    evaluated=[]
    for seed,texture in models:
        net=fit(examples,seed,texture,device,args.epochs)
        evaluated.append(evaluate(net,test,'cpu',texture))
    blend=.58*np.stack(evaluated[0])+.42*np.stack(evaluated[1])
    tests=[]
    for score,(r,_) in zip(blend,test):
        pred=int(score.argmax()); order=np.partition(score,-2)
        tests.append(dict(id=r['id'],clip=r['clip'],expected=r['value'],prior=r['prior'],
          predicted=pred,namedProbability=float(score[pred]),margin=float(order[-1]-order[-2])))
    (OUT/'dice-model-validation.json').write_text(json.dumps({'modelSeeds':[71,116],'tests':tests},indent=2)+'\n')
    print('Raw/value comparison',sum(r['prior']==r['expected'] for r in tests),
          sum(r['predicted']==r['expected'] for r in tests),len(tests),flush=True)
if __name__=='__main__':main()
