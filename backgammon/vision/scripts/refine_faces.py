#!/usr/bin/env python3
"""Adapt synthetic face readers to manually reviewed camera crops."""
from __future__ import annotations

import argparse
import json
from collections import Counter
import cv2
import numpy as np
import torch
from torch.nn import functional as F

from train_vision import WORK, Assets, FACES, FaceReader, face_data, sample

PLANES = {'dice': (0, 1, 2, 3, 4, 5, 6), 'cube': (0, *FACES)}


def load_real(name):
    data = json.loads((WORK/'labels'/f'{name}.json').read_text())
    result = []
    cache = {}
    for row in data:
        if row['value'] is None:
            continue
        if row['image'] not in cache:
            cache[row['image']] = cv2.copyMakeBorder(sample(row['image']),24,24,24,24,cv2.BORDER_REFLECT_101)
        x,y = row['center']
        result.append((cache[row['image']][y:y+48,x:x+48],PLANES[name].index(row['value']),row))
    return result


def batch(patches, device):
    array = np.transpose(np.stack(patches),(0,3,1,2)).copy()
    return torch.from_numpy(array).to(device).float()/255


def augmented(pixels, rng, cube):
    angle = float(rng.uniform(-180,180))
    if cube:
        angle = float(rng.choice([-180,-90,0,90,180]) + rng.normal(0,9))
    transform = cv2.getRotationMatrix2D((24,24),angle,float(rng.uniform(.89,1.13)))
    transform[:,2] += rng.normal(0,1.6,2) - 8
    patch = cv2.warpAffine(pixels,transform,(32,32),borderMode=cv2.BORDER_REFLECT)
    patch = np.clip(patch.astype(np.float32)*rng.uniform(.88,1.09)+rng.uniform(-5,7),0,255).astype(np.uint8)
    if rng.random()<.24:
        patch = cv2.GaussianBlur(patch,(3,3),.55)
    return patch


def train(name, device, assets, epochs):
    data = load_real(name)
    train = [(im,v,r) for im,v,r in data if r['split']=='train']
    test = [(im,v,r) for im,v,r in data if r['split']=='test']
    synth_x,synth_y = [v.to(device) for v in face_data(assets,6500,82,name=='cube')]
    rng = np.random.default_rng(84)
    x_test = batch([im[8:40,8:40] for im,_,_ in test],device)
    net = FaceReader().to(device)
    net.load_state_dict(torch.load(WORK/'models'/f'{name}.pt',map_location='cpu',weights_only=True))
    optimizer = torch.optim.AdamW(net.parameters(),lr=.00055)
    weight = np.array([1/np.sqrt(Counter(v for _,v,_ in train)[v]) for _,v,_ in train])
    weight /= weight.sum()
    measurements = []
    for epoch in range(epochs):
        net.train()
        for _ in range(40):
            chosen = rng.choice(len(train),size=48,p=weight)
            real_x = batch([augmented(train[i][0],rng,name=='cube') for i in chosen],device)
            real_y = torch.tensor([train[i][1] for i in chosen],device=device)
            i = torch.randint(len(synth_x),(16,),device=device)
            pred = net(torch.cat((real_x,synth_x[i].float()/255)))
            loss = F.cross_entropy(pred,torch.cat((real_y,synth_y[i])))
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
        net.eval()
        with torch.inference_mode():
            prob = net(x_test).softmax(1).cpu().numpy()
        truth = np.array([v for _,v,_ in test])
        correct = prob.argmax(1)==truth
        measurements.append(float(np.mean(correct)))
        print(name,epoch+1,round(measurements[-1],3),flush=True)
    net = net.to('cpu').eval()
    torch.save(net.state_dict(),WORK/'models'/f'{name}_real.pt')
    torch.onnx.export(net,torch.zeros(1,3,32,32),WORK/'models'/f'{name}_real.onnx',
                      input_names=['pixels'],output_names=['logits'],opset_version=17,
                      dynamic_axes={'pixels':{0:'batch'},'logits':{0:'batch'}},dynamo=False)
    outputs = []
    for (_,label,row),prediction in zip(test,prob):
        i=int(prediction.argmax())
        outputs.append({**row,'expected':PLANES[name][label],'predicted':PLANES[name][i],
                        'probability':round(float(prediction[i]),4),'margin':round(float(prediction[i]-np.partition(prediction,-2)[-2]),4)})
    return {'trainLabels':len(train),'testLabels':len(test),'testAccuracy':measurements[-1],
            'perEpochTestAccuracy':measurements,'testPredictions':outputs}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--epochs',type=int,default=11)
    args=parser.parse_args()
    cv2.setNumThreads(1)
    torch.set_num_threads(2)
    torch.manual_seed(23)
    device='mps' if torch.backends.mps.is_available() else 'cpu'
    assets=Assets()
    results={}
    for name in ('dice','cube'):
        results[name]=train(name,device,assets,args.epochs)
        (WORK/'models'/'real-validation.json').write_text(json.dumps(results,indent=2)+'\n')


if __name__=='__main__':
    main()
