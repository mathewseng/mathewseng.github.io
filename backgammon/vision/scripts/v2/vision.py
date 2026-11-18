"""Refine every saved frame using camera-trained die geometry and a learned stack counter."""
from __future__ import annotations
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
import gzip, json, os, sys
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR

import av
import cv2
import numpy as np

ROOT=ARTIFACT_DIR
OUT=ROOT/'v2'
from game_state import (GameVision,RollState, center_crop,evaluate_patches,softmax,
                        skip_nearby,within_hand,offered_cube_model,KERNEL,COLUMNS)
POINT_WIDTH=28
POINT_HEIGHT=112
SLOT_CLASSES=10

def strips(pixels):
    for point in range(1,25):
        x=int(COLUMNS[12-point if point<=12 else point-13])
        p=pixels[:224,x-21:x+22] if point<=12 else pixels[196:,x-21:x+22][::-1]
        yield cv2.resize(p,(POINT_WIDTH,POINT_HEIGHT),interpolation=cv2.INTER_AREA)

def load(name):
    return cv2.dnn.readNetFromONNX(str(OUT/f'{name}.onnx'))

def slot_decode(candidate):
    return ((candidate-1)//SLOT_CLASSES,(candidate-1)%SLOT_CLASSES+1) if candidate else (None,0)

class CameraReader:
    def __init__(self):
        self.slot=load('slots')
        self.dice=load('dice-locator')
        self.face=cv2.dnn.readNetFromONNX(str(ROOT/'models/dice_real.onnx'))
        self.template=cv2.imread(str(ROOT/'models/cube-four-template.png'),cv2.IMREAD_GRAYSCALE)

    def correct_stacks(self,pixels,state):
        if state['handRegions'] or state['checkerStatus']=='ambiguous' or state['visibleCheckerTotals']==[15,15]:
            return
        odds=evaluate_patches(self.slot,list(strips(pixels)))
        original=state['points']
        totals=state['visibleCheckerTotals'].copy()
        revisions=[]
        possible=[]
        for i,(pair,probs) in enumerate(zip(original,odds)):
            guess=int(probs.argmax())
            color,count=slot_decode(guess)
            if color is None or pair[1-color] or count<=pair[color]:
                continue
            added=count-pair[color]
            score=float(probs[guess])
            gap=score-float(np.partition(probs,-2)[-2])
            if score>=.80 and gap>=.48 and (pair[color]>=2 or (score>=.974 and added<=1)):
                possible.append((score,i,color,added))
        for confidence,i,color,added in sorted(possible,reverse=True):
            if totals[color]+added>15:
                continue
            if state['trayEvidence'][color] and original[i][color]<3:
                continue
            original[i][color]+=added
            totals[color]+=added
            revisions.append({'point':i+1,'color':['white','dark'][color],'added':added,
                           'confidence':round(confidence,4),'method':'learned-stack-appearance'})
        loose=any(c['zone']=='loose' for c in state['checkers'])
        if not loose:
            for color,total in enumerate(totals):
                missing=15-total
                if not 1<=missing<=3 or state['trayEvidence'][color]:
                    continue
                candidates=[]
                for i,(pair,probability) in enumerate(zip(original,odds)):
                    count=pair[color]+missing
                    if pair[1-color] or pair[color]<3 or not 5<=count<=8:
                        continue
                    mass=float(probability[SLOT_CLASSES*color+count])
                    if mass>=.055:
                        candidates.append((mass,i,count))
                candidates.sort(reverse=True)
                if not candidates or (len(candidates)>1 and candidates[1][0]>=.34*candidates[0][0]):
                    continue
                confidence,i,count=candidates[0]
                original[i][color]=count
                totals[color]+=missing
                revisions.append({'point':i+1,'color':['white','dark'][color],'added':missing,
                    'confidence':round(confidence,4),'method':'stack-appearance-with-15-checker-inventory'})
        if not revisions:
            return
        state['stackReadings']=revisions
        state['visibleCheckerTotals']=totals
        if not loose:
            off=[(15-t if t==15 or state['trayEvidence'][k] else None) for k,t in enumerate(totals)]
            state['borneOff']=off
            if all(o is not None for o in off):
                state['checkerStatus']='inferred-tray' if any(off) else 'complete-with-stack-reader'
                state['position']={'points':original,'bar':state['bar'],'borneOff':off}

    def locate_dice(self,pixels,state):
        candidates=[]
        candidates+= [(d['center'][0],d['center'][1],d['locationScore']) for d in state['dice']]
        for x0,x1 in ((58,265),(294,508)):
            y0,y1=14,406
            roi=pixels[y0:y1,x0:x1]
            self.dice.setInput(cv2.dnn.blobFromImage(roi,1/255))
            scores=1/(1+np.exp(-np.clip(self.dice.forward()[0,0],-30,30)))
            ys,xs=np.where((scores>.39)&(scores==cv2.dilate(scores,KERNEL)))
            for r,c in zip(ys,xs):
                x,y=int(c)*2+x0,int(r)*2+y0
                if within_hand(x,y,state['handRegions'],4):continue
                if any((x-a)**2+(y-b)**2<17**2 for a,b in (c['center'] for c in state['checkers'])):
                    continue
                score=float(scores[r,c])
                candidates.append((x,y,.14+.41*score))
        return skip_nearby(candidates,12)[:9]

    def dice_faces(self,pixels,state):
        candidates=self.locate_dice(pixels,state)
        patches=[center_crop(pixels,x,y) for x,y,_ in candidates]
        if not patches:
            return []
        augmented=[im for p in patches for im in (p,np.rot90(p,2).copy(),np.roll(p,2,axis=1),np.roll(p,-2,axis=0))]
        probs=evaluate_patches(self.face,augmented).reshape(len(patches),4,-1)
        blend=probs[:,0]*.58+probs[:,1]*.14+probs[:,2]*.14+probs[:,3]*.14
        result=[]
        for (x,y,track),odds,p in zip(candidates,blend,patches):
            face=int(odds.argmax())
            if not face:
                continue
            peak=float(odds[face])
            gap=peak-float(np.partition(odds,-2)[-2])
            if peak<(.54 if track>.30 else .68):
                continue
            gray=cv2.cvtColor(p[11:21,11:21],cv2.COLOR_BGR2GRAY)
            color='dark' if np.mean(gray<122)>.22 else 'white'
            value=face if peak>=.80 and gap>=.32 else None
            result.append({'center':[x,y],'value':value,'candidateValue':face,'score':round(peak,3),
                           'locationScore':round(track,3),'color':color})
        return result

    def refine(self,pixels,state):
        self.correct_stacks(pixels,state)
        prior=state['dice']
        upgraded=self.dice_faces(pixels,state)
        if len(prior)==2 and all(d['value'] is not None for d in prior):
            if len(upgraded)!=2 or any(d['value'] is None for d in upgraded):
                upgraded=prior
        state['dice']=upgraded
        return state

def replay(job):
    video,force=job
    cv2.setNumThreads(1)
    name=f'{video.stem}.jsonl.gz'
    source=ROOT/'state'/name
    final=OUT/'state'/name
    staged=final.with_suffix('.part.gz')
    if final.exists() and not force:
        return {'source':video.name,'status':'existing'}
    reader=CameraReader()
    roll=RollState()
    counts=Counter()
    with av.open(str(video)) as media,gzip.open(source,'rt') as rows,gzip.open(staged,'wt',compresslevel=2) as result:
        stream=media.streams.video[0]
        stream.codec_context.thread_count=1
        for frame,line in zip(media.decode(stream),rows,strict=True):
            row=json.loads(line)
            if abs(float(frame.pts*frame.time_base)-row['outputPts90k']/90000)>.0002:
                raise ValueError(f'Decode timestamp mismatch: {video} {row["frame"]}')
            counts['frames']+=1
            prev=row['state']
            if prev:
                s=reader.refine(frame.to_ndarray(format='bgr24'),prev)
                s=roll.update(s,row['seconds'])
                counts[s['checkerStatus']]+=1
                counts['settledRoll']+=s['currentRoll'] is not None
                counts['cubeFace']+=bool(s['cube'] and s['cube']['face'])
                counts['stackCorrections']+=bool(s.get('stackReadings'))
            else:
                roll.previous=None
                counts['untracked']+=1
            result.write(json.dumps(row,separators=(',',':'))+'\n')
    os.replace(staged,final)
    return {'source':video.name,**counts}

def test():
    base=GameVision()
    reader=CameraReader()
    reviewed=ROOT/'labels/checker-review.txt'
    before=Counter(); after=Counter()
    for line in reviewed.read_text().splitlines():
        if not line or line.startswith('#'):continue
        key,w,d,bar=[a.strip() for a in line.split('|')]
        expected=[[0,0] for _ in range(24)]
        for color,items in enumerate((w,d)):
            for item in items.split():
                p,n=map(int,item.split(':'))
                expected[p-1][color]=n
        pixels=cv2.imread(str(ROOT/'samples'/f'{key}.jpg'))
        s=base.observations(pixels)
        before.update(points=sum(a==b for a,b in zip(s['points'],expected)),exact=s['points']==expected)
        reader.correct_stacks(pixels,s)
        after.update(points=sum(a==b for a,b in zip(s['points'],expected)),exact=s['points']==expected)
        print(key,s['stackReadings'] if 'stackReadings' in s else '',s['visibleCheckerTotals'])
    print('Before and after',dict(before),dict(after))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--start',type=int,default=0)
    p.add_argument('--stop',type=int)
    p.add_argument('--jobs',type=int,default=6)
    p.add_argument('--force',action='store_true')
    p.add_argument('--test',action='store_true')
    args=p.parse_args()
    cv2.setNumThreads(1)
    if args.test:
        test();return
    (OUT/'state').mkdir(exist_ok=True)
    items=[(p,args.force) for p in sorted((ROOT/'board').glob('*.mp4'))[args.start:args.stop]]
    if args.jobs==1:
        for item in items:print(json.dumps(replay(item)),flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.jobs) as workers:
            for result in workers.map(replay,items):
                print(json.dumps(result),flush=True)
if __name__=='__main__':main()
