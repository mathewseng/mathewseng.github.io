"""Reread physical dice and cube tracks using multiple images of each face."""
from __future__ import annotations
from collections import Counter,defaultdict
from concurrent.futures import ProcessPoolExecutor
import json,sys
from pathlib import Path
import cv2,joblib,numpy as np

from dice_tracks import OUT,ROOT,state_rows,pistes,read_patches,average_warp
from cube_reader import evaluate as cube_eval
from train_faces import normalize
from game_state import evaluate_patches

DICE_NETS=None
CUBE_NET=None


def load_models():
    global DICE_NETS,CUBE_NET
    cv2.setNumThreads(1)
    DICE_NETS=[cv2.dnn.readNetFromONNX(str(OUT/f'dice-reader-{s}.onnx')) for s in (71,116)]
    CUBE_NET=joblib.load(OUT/'cube-faces.joblib')


def current_cubes(rows):
    tracks=[];current=None
    for i,row in enumerate(rows):
        s=row['state']
        cube=s and s['cube']
        if not cube:
            if current and i-current['end']>=36:
                tracks.append(current);current=None
            continue
        face=cube['face']
        x,y=cube['center']; side=cube['side']
        if current and (np.hypot(x-current['x'],y-current['y'])>18 or side!=current['side']):
            tracks.append(current);current=None
        if not current:
            current={'x':x,'y':y,'start':i,'end':i,'side':side,'items':[]}
        current['end']=i
        current['items'].append([i,x,y,face,cube['score'],1,'white'])
    if current:tracks.append(current)
    return [dict(t,location=1) for t in tracks if len(t['items'])>=6]


def dice_values(t,crops):
    median=average_warp(crops)
    ids=np.unique(np.linspace(0,len(crops)-1,min(7,len(crops))).astype(int))
    images=[median,*[crops[k] for k in ids]]
    turns=[np.rot90(p,k).copy() for p in images for k in range(4)]
    rgb=evaluate_patches(DICE_NETS[0],turns).mean(axis=0)
    contrast=evaluate_patches(DICE_NETS[1],[normalize(p) for p in turns]).mean(axis=0)
    blended=.58*rgb+.42*contrast
    p=int(blended.argmax()); peak=float(blended[p]); margin=peak-float(np.partition(blended,-2)[-2])
    weights=defaultdict(float)
    for _,_,_,value,conf,location,_ in t['items']:
        value=int(value)
        weights[value]+=float(location)*float(conf)**2
    a=max(weights,key=weights.get)
    prior_power=weights[a]/sum(weights.values())
    override=p in range(1,7) and p!=a and peak>=.90 and margin>=.65
    method='new-face-witness' if override else 'consensus-across-track' if p==a else 'v2-temporal-vote'
    value=p if override else a
    quality=min(.98,(.63*prior_power+.37*float(blended[a])) if not override else peak*.93)
    accepted=override or (p==a and (prior_power>=.67 or peak>=.84 or (prior_power>=.60 and peak>=.74 and margin>=.48))) or (prior_power>=.82 and peak<.83)
    core=median[10:22,10:22]
    dark_fraction=float(np.mean(np.mean(core,axis=-1)<147))
    pale_fraction=float(np.mean(np.mean(core,axis=-1)>193))
    color='dark' if dark_fraction>=.30 else 'white' if pale_fraction>=.27 else t['color']
    return {'value':value if accepted else None,'selectedValue':value,'prior':a,'priorShare':round(prior_power,4),
            'read':p,'readConfidence':round(peak,4),'margin':round(margin,4),
            'quality':round(quality,4),'method':method,'color':color}


def cube_values(t,crops):
    votes=Counter(x[3] for x in t['items'] if x[3])
    face,count=votes.most_common(1)[0] if votes else (None,0)
    side=t['side']
    learned=cube_eval(CUBE_NET,[average_warp(crops),*crops[::max(1,len(crops)//7)]])
    i=int(learned.argmax()); label=int(CUBE_NET.classes_[i]);prob=float(learned[i])
    support=sum(votes.values())
    chosen=None
    # A cube on the playing field is evaluated separately as an offer. Only the
    # reviewed printed four earns a face in that state.
    if side=='playing-surface':
        if face==4 and count>=7:
            chosen=4
    elif face in (2,4,8,16,32,64) and count>=6 and count/max(1,support)>=.72 and (
         face in (2,64) or (label==face and prob>=.90)):
        chosen=face
    elif label in (2,64) and prob>=.90 and (face in (None,label) or count<8):
        chosen=label
    if chosen==64 and side!='centered':chosen=None
    stake=1 if chosen==64 else chosen if side!='playing-surface' else None
    return {'face':chosen,'stake':stake,'v2Vote':face,'visibleSamples':count,
            'multiviewValue':label,'multiviewConfidence':round(prob,4),
            'evidence':'repeated-visual-read' if count>=6 and chosen==face else 'trained-cube-face-poses'}


def evaluate_clip(index):
    rows=state_rows(index)
    ds=pistes(rows)
    cs=current_cubes(rows)
    crops=read_patches(index,[*ds,*cs])
    out={'clip':index,'dice':[],'cube':[]}
    for i,(record,images) in enumerate(zip(ds,crops[:len(ds)])):
        d=dice_values(record,images)
        out['dice'].append({**{k:v for k,v in record.items() if k!='items'},'id':f'{index:02}_{i:03}',
             **d})
    for record,images in zip(cs,crops[len(ds):]):
        out['cube'].append({**{k:v for k,v in record.items() if k!='items'},
            **cube_values(record,images),'samples':len(record['items'])})
    return out


def main():
    with ProcessPoolExecutor(max_workers=8,initializer=load_models) as pool:
        values=list(pool.map(evaluate_clip,range(77)))
    (OUT/'value-tracks.json').write_text(json.dumps(values,indent=2)+'\n')
    print('Tracked values',sum(len(x['dice']) for x in values),sum(len(x['cube']) for x in values))
    print('Accepted die faces',sum(sum(d['value'] is not None for d in x['dice']) for x in values))
if __name__=='__main__':main()
