from collections import Counter
import gzip, json, sys
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

import cv2
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

ROOT=ARTIFACT_DIR
OUT=ROOT/'v2'
from game_state import COLUMNS
from train_vision import Assets,overlay,convolution

HOLD={19,20,21,22,23,24,48,49,50,51,52,69,70,71,72}
# Individual stack counts read from the contact sheets. Keys are candidate IDs.
REVIEW={0:4,1:3,2:4,3:4,4:3,5:3,6:4,7:5,8:5,9:5,10:5,11:3,12:5,13:3,
        14:4,15:4,16:4,17:3,18:4,19:3,20:3,21:4,22:3,23:4,24:6,25:3,26:6,27:3,
        28:6,29:3,30:6,31:3,32:6,33:3,34:3,35:5,36:3,37:5,38:5,39:3,40:5,41:3,
        42:3,43:5,44:3,45:3,46:5,47:3,48:5,49:3,50:5,51:3,52:5,53:3,54:5,55:3,
        56:3,58:5,60:4,61:3,62:3,63:3,64:4,65:3,66:3,67:5,68:4,69:4,70:5,71:4,
        72:4,73:5,74:4,75:4,76:5,77:3,78:5,79:5,80:3,81:5,82:5,83:3,
        84:5,85:5,86:3,87:5,88:4,89:5,90:4,91:5,92:4,93:3,94:5,95:4,96:3,97:5}
# Stacked silhouettes occasionally have one more visible disk than the locator.
N=10
SHAPE=(28,112)

def encoded(color,count):
    return 0 if count==0 else (color*N)+min(count,N)

def decoded(label):
    return (None,0) if label==0 else ((label-1)//N,(label-1)%N+1)

def strips(pixels):
    for p in range(1,25):
        x=int(COLUMNS[12-p if p<=12 else p-13])
        image=pixels[:224,x-21:x+22] if p<=12 else pixels[196:,x-21:x+22][::-1]
        yield image

def patch(image):
    return cv2.resize(image,SHAPE,interpolation=cv2.INTER_AREA)

class SlotNet(nn.Sequential):
    def __init__(self):
        super().__init__(convolution(3,18,2),convolution(18,30,2),convolution(30,40,2),
         convolution(40,48,(2,1)),nn.AvgPool2d((2,1)),nn.Flatten(),
         nn.Linear(48*3*4,128),nn.ReLU(),nn.Dropout(.12),nn.Linear(128,2*N+1))

def jitter(im,rng):
    if rng.random()<.45:im=im[:,::-1]
    h,w=im.shape[:2]
    matrix=cv2.getRotationMatrix2D((w/2,h/2),float(rng.normal(0,1.25)),float(rng.uniform(.96,1.04)))
    matrix[:,2]+=rng.normal(0,(1.35,1.15))
    im=cv2.warpAffine(im,matrix,(w,h),borderMode=cv2.BORDER_REFLECT)
    return np.clip(im.astype(np.float32)*rng.uniform(.91,1.09)+rng.uniform(-4,4),0,255).astype(np.uint8)

def synth(assets, n, rng):
    board=assets.background
    examples=[]
    for _ in range(n):
        p=int(rng.integers(1,25))
        x=int(COLUMNS[12-p if p<=12 else p-13])
        top=p<=12
        crop=board[:224,x-45:x+46].copy() if top else board[196:,x-45:x+46][::-1].copy()
        total=int(rng.choice(np.arange(10),p=[.18,.13,.135,.125,.11,.105,.095,.06,.04,.02]))
        color=int(rng.integers(2))
        for delta in (-36,36,0):
            number=total if delta==0 else int(rng.integers(0,7))
            pale=color if delta==0 else int(rng.integers(2))
            y=float(rng.uniform(26,37))
            top_layer=[]
            if number>=5 and rng.random()<.7:
                known=int(rng.integers(4,7))
                if number>known:
                    top_layer=[rng.uniform(8,24) for _ in range(number-known)]
                    number=known
            centers=[]
            for i in range(number):
                centers.append((round(45+delta+rng.normal(0,2)),round(y)))
                y+=rng.uniform(31,36.8)
            for step in top_layer:
                # A chip on a second layer covers part, and leaves an arc
                # of the lower disk visible.
                place=int(rng.integers(len(centers)))
                bx,by=centers[place]
                centers.append((round(bx+rng.normal(-1,3)),min(205,round(by+step))))
            for a,b in centers:
                stamp,mask=assets.checker(pale,rng)
                overlay(crop,stamp,mask,a,b)
        im=patch(crop[:,24:67])
        if rng.random()<.5:im=cv2.GaussianBlur(im,(3,3),.45)
        examples.append((jitter(im,rng),encoded(color,total)))
    return examples

def real_data(rng):
    data=[]
    sample_files=sorted((ROOT/'samples').glob('*.jpg'))[::2]
    prior={}
    for f in sorted((ROOT/'state').glob('*.jsonl.gz')):
        with gzip.open(f,'rt') as handle:
            for i,line in enumerate(handle):
                if i%2:continue
                row=json.loads(line)
                key=f'{row["clip"]:03}_{row["frame"]:05}'
                s=row['state']
                if s and s['checkerStatus']=='all-30-visible' and row['clip'] not in HOLD:
                    prior[key]=s['points']
    # The source samples are irregular; retry odd PTS frame indices on demand.
    missing={f.stem for f in sample_files if f.stem not in prior}
    for f in sorted((ROOT/'state').glob('*.jsonl.gz')):
        with gzip.open(f,'rt') as handle:
            for i,line in enumerate(handle):
                if not i%2:continue
                row=json.loads(line)
                key=f'{row["clip"]:03}_{row["frame"]:05}'
                if key not in missing:continue
                s=row['state']
                if s and s['checkerStatus']=='all-30-visible' and row['clip'] not in HOLD:
                    prior[key]=s['points']
    for f in sample_files:
        points=prior.get(f.stem)
        if points is None:continue
        for im,(white,dark) in zip(strips(cv2.imread(str(f))),points):
            if not (white or dark) and rng.random()<.64:continue
            im=patch(im)
            data.append((im,encoded(int(dark>white),max(white,dark))))
    candidates=json.loads((OUT/'stack-candidates.json').read_text())
    for i,count in REVIEW.items():
        c=candidates[i]
        full=cv2.imread(str(ROOT/'samples'/f'{c["image"]}.jpg'))
        im=patch(list(strips(full))[c['point']-1])
        for _ in range(14):
            data.append((jitter(im,rng),encoded(c['color'],count)))
    print('Real weak and reviewed strips',len(data),'reviewed stacks',len(REVIEW),flush=True)
    return data

def gold_data():
    frames=[]
    for line in (ROOT/'labels/checker-review.txt').read_text().splitlines():
        if not line or line.startswith('#'):continue
        k,w,d,bar=[s.strip() for s in line.split('|')]
        a=[0]*24
        for color,items in enumerate((w,d)):
            for s in items.split():
                p,c=map(int,s.split(':'))
                a[p-1]=encoded(color,c)
        im=cv2.imread(str(ROOT/'samples'/f'{k}.jpg'))
        frames.append((k,[patch(i) for i in strips(im)],a))
    return frames

def as_tensors(rows,device):
    x,y=zip(*rows)
    return torch.from_numpy(np.stack(x).transpose(0,3,1,2).copy()).to(device),torch.tensor(y,device=device)

def main():
    cv2.setNumThreads(1); torch.set_num_threads(2); torch.manual_seed(702)
    rng=np.random.default_rng(890)
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    gold=gold_data()
    test=as_tensors([(im,y) for _,ims,ys in gold for im,y in zip(ims,ys)],device)
    clean=Assets()
    trained=real_data(rng)+synth(clean,10500,rng)
    x,y=as_tensors(trained,device)
    print('Training label counts',dict(Counter(y.tolist())),flush=True)
    net=SlotNet().to(device)
    opt=torch.optim.AdamW(net.parameters(),lr=.0017)
    best=(-1,-1)
    for epoch in range(12):
        if epoch==8:
            for group in opt.param_groups: group['lr']=.0003
        net.train()
        for idx in torch.randperm(len(x),device=device).split(128):
            loss=F.cross_entropy(net(x[idx].float()/255),y[idx])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
        net.eval()
        with torch.inference_mode():
            evaluation=torch.cat([net(xx.float()/255) for xx in test[0].split(90)])
            equal=(evaluation.argmax(1)==test[1]).cpu().numpy().reshape(-1,24)
        score=(int(equal.all(axis=1).sum()),int(equal.sum()))
        print(epoch+1,'points',score[1],'exact',score[0],flush=True)
        if score>best:
            best=score
            torch.save({k:v.detach().cpu() for k,v in net.state_dict().items()},OUT/'slots.pt')
    net=net.to('cpu').eval()
    net.load_state_dict(torch.load(OUT/'slots.pt',map_location='cpu',weights_only=True))
    torch.onnx.export(net,torch.zeros(1,3,112,28),OUT/'slots.onnx',input_names=['pixels'],
        output_names=['scores'],opset_version=17,dynamic_axes={'pixels':{0:'batch'},'scores':{0:'batch'}},dynamo=False)
    (OUT/'slot-training-sources.json').write_text(json.dumps({'labelHistogram':dict(Counter(y.tolist())),
       'reviewedStacks':REVIEW,'heldoutClips':sorted(HOLD)},indent=2)+'\n')
if __name__=='__main__':main()
