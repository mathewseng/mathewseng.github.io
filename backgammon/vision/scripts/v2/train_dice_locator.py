from collections import defaultdict
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import json,sys

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

ROOT=ARTIFACT_DIR
OUT=ROOT/'v2'
from train_vision import Assets, convolution, render_face, overlay, perturb, dense_loss

SIDE=64
GRID=SIDE//2
YY,XX=np.mgrid[:GRID,:GRID]

class DiceLocator(nn.Sequential):
    def __init__(self):
        super().__init__(convolution(3,16,2),convolution(16,22),convolution(22,22),
                         convolution(22,22),convolution(22,20),nn.Conv2d(20,1,1))

def heat(grid,x,y):
    if 0<=x<SIDE and 0<=y<SIDE:
        x=min(GRID-1,round(x/2)); y=min(GRID-1,round(y/2))
        target=np.exp(-((XX-x)**2+(YY-y)**2)/2)
        np.maximum(grid,target,out=grid)

def synthetic(assets,count,rng):
    result=[]
    for _ in range(count):
        x=int(rng.integers(6,560-SIDE-6)); y=int(rng.integers(6,420-SIDE-6))
        im=assets.background[y:y+SIDE,x:x+SIDE].copy()
        mask=np.zeros((GRID,GRID),dtype=np.float32)
        chips=[]
        for j in range(rng.integers(4)):
            cx,cy=map(int,rng.integers(-10,SIDE+10,2))
            chip,alpha=assets.checker(int(rng.integers(2)),rng)
            overlay(im,chip,alpha,cx,cy)
            chips.append((cx,cy))
        for j in range(rng.integers(4)):
            cx,cy=map(int,rng.integers(9,SIDE-9,2))
            if any((cx-a)**2+(cy-b)**2<18**2 for a,b in chips):
                continue
            kind=int(rng.integers(2,4))
            face,alpha=render_face(kind,int(rng.integers(1,7)),rng)
            overlay(im,face,alpha,cx,cy)
            heat(mask,cx,cy)
        if rng.random()<.25 and not mask.any():
            face,alpha=render_face(4,2,rng)
            overlay(im,face,alpha,*map(int,rng.integers(8,SIDE-8,2)))
        result.append((perturb(im,rng),mask))
    return result

def camera_data():
    labels=json.loads((ROOT/'labels/dice.json').read_text())
    grouped=defaultdict(list)
    for r in labels:
        grouped[r['image']].append(r)
    result=[]
    for key,rows in grouped.items():
        im=cv2.imread(str(ROOT/'samples'/f'{key}.jpg'))
        pad=40
        canvas=cv2.copyMakeBorder(im,pad,pad,pad,pad,cv2.BORDER_REFLECT)
        result.extend((canvas,r,rows) for r in rows)
    return result

def real_example(example,rng,training):
    im,row,near=example
    ox,oy=row['center']
    ox+=40; oy+=40
    angle=float(rng.uniform(-180,180)) if training else 0
    matrix=cv2.getRotationMatrix2D((ox,oy),angle,float(rng.uniform(.9,1.1)) if training else 1)
    matrix[:,2]+=(SIDE/2-ox,SIDE/2-oy)
    if training:matrix[:,2]+=rng.normal(0,6,2)
    cropped=cv2.warpAffine(im,matrix,(SIDE,SIDE),borderMode=cv2.BORDER_REFLECT)
    mask=np.zeros((GRID,GRID),np.float32)
    for label in near:
        if not label['value']:
            continue
        x,y=(np.array(label['center'])+40)@matrix[:,:2].T+matrix[:,2]
        heat(mask,x,y)
    return perturb(cropped,rng) if training else cropped,mask

def tensors(data,device):
    x,y=zip(*data)
    return (torch.from_numpy(np.stack(x).transpose(0,3,1,2).copy()).to(device),
            torch.from_numpy(np.round(np.stack(y)[:,None]*255).astype(np.uint8)).to(device))

def main():
    cv2.setNumThreads(1); torch.set_num_threads(2); torch.manual_seed(32)
    rng=np.random.default_rng(901)
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    data=camera_data()
    train=[d for d in data if d[1]['split']=='train']
    test=[d for d in data if d[1]['split']=='test']
    assets=Assets()
    x,y=tensors(synthetic(assets,5200,rng)+[real_example(d,rng,True) for d in train for _ in range(24)],device)
    gx,gy=tensors([real_example(d,rng,False) for d in test],device)
    net=DiceLocator().to(device)
    opt=torch.optim.AdamW(net.parameters(),lr=.0016)
    for epoch in range(13):
        net.train()
        for ids in torch.randperm(len(x),device=device).split(112):
            pred=net(x[ids].float()/255)
            loss=dense_loss(pred,y[ids].float()/255)
            opt.zero_grad(set_to_none=True);loss.backward();opt.step()
        net.eval()
        with torch.inference_mode():
            probs=net(gx.float()/255).sigmoid()
            nearby=probs[:,:,13:20,13:20].amax(dim=(1,2,3))
            affirmative=np.array([bool(d[1]['value']) for d in test])
            guessed=(nearby>.32).cpu().numpy()
            print(epoch+1,'holdout found',int((guessed & affirmative).sum()),'out of',int(affirmative.sum()),
                  'false leads',int((guessed & ~affirmative).sum()),'out of',int((~affirmative).sum()),flush=True)
    net=net.to('cpu').eval()
    torch.save(net.state_dict(),OUT/'dice-locator.pt')
    torch.onnx.export(net,torch.zeros(1,3,64,64),OUT/'dice-locator.onnx',opset_version=17,
       input_names=['pixels'],output_names=['scores'],dynamic_axes={'pixels':{0:'batch',2:'h',3:'w'},
       'scores':{0:'batch',2:'h2',3:'w2'}},dynamo=False)
if __name__=='__main__':main()
