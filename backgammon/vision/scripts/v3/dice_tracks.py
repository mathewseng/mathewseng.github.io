from __future__ import annotations

import argparse,gzip,json,sys
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
from collections import Counter,defaultdict
from concurrent.futures import ProcessPoolExecutor
from itertools import combinations
import av,cv2,numpy as np

ROOT=ARTIFACT_DIR
BASE=ROOT/'v2'; OUT=ROOT/'v3'
from game_state import center_crop


def state_rows(index, directory=None):
    if directory is None:
        source = sorted((BASE / 'state').glob('*.jsonl.gz'))[index]
    else:
        video = sorted((ROOT / 'board').glob('*.mp4'))[index]
        source = directory / video.with_suffix('.jsonl.gz').name
    with gzip.open(source, 'rt') as stream:
        return [json.loads(line) for line in stream]


def pistes(rows, locations=False):
    tracks=[];live=[]
    for i,row in enumerate(rows):
        s=row['state']
        expired=[x for x in live if i-x['last']>16]
        tracks.extend(expired)
        live=[x for x in live if i-x['last']<=16]
        if not s:continue
        claimed=set()
        if locations:
            dice = [{'center': [x, y], 'locationScore': confidence, 'candidateValue': 0, 'score': 1,
                     'color': None} for x, y, confidence in s.get('diceLocations', []) if confidence >= .30]
        else:
            dice = sorted(s['dice'], key=lambda d: d['locationScore'] * d['score'], reverse=True)
        for d in dice:
            if d['locationScore']<.185 or d['score']<.52:continue
            x,y=d['center']
            a=[(np.hypot(x-v['x'],y-v['y']),j,v) for j,v in enumerate(live) if j not in claimed]
            best=min(a,default=None,key=lambda x:x[0])
            if best and best[0]<9:
                _,j,t=best
            else:
                t={'x':x,'y':y,'start':i,'end':i,'last':i,'items':[]}
                live.append(t);j=len(live)-1
            t['end']=i;t['last']=i;t['items'].append([i,x,y,d['candidateValue'],d['score'],d['locationScore'],d['color']])
            if len(t['items'])%4==0:
                t['x'],t['y']=map(float,np.mean(np.array([z[1:3] for z in t['items'][-16:]]),axis=0))
            claimed.add(j)
    tracks.extend(live)
    result=[]
    for t in tracks:
        span=t['end']-t['start']+1
        if len(t['items'])<6 or span<11:
            continue
        if locations and (len(t['items']) < 12 or len(t['items']) / span < .28):
            continue
        if span>780:
            continue
        score=np.mean([z[5] for z in t['items']])
        color=Counter(z[-1] for z in t['items']).most_common(1)[0][0]
        t.update(color=color,location=float(score),samples=len(t['items']),span=span)
        result.append(t)
    return result


def average_warp(patches):
    if len(patches)==1:return patches[0]
    estimates=[p.astype(np.float32) for p in patches]
    reference=estimates[len(estimates)//2]
    gray=cv2.cvtColor(reference,cv2.COLOR_BGR2GRAY)
    window=cv2.createHanningWindow(gray.shape[::-1],cv2.CV_32F)
    normalized=[]
    for p in estimates:
        shift,response=cv2.phaseCorrelate(gray,cv2.cvtColor(p,cv2.COLOR_BGR2GRAY),window)
        if response>=.50 and abs(shift[0])<=3 and abs(shift[1])<=3:
            p=cv2.warpAffine(p,np.float32([[1,0,-shift[0]],[0,1,-shift[1]]]),
                            gray.shape[::-1],borderMode=cv2.BORDER_REPLICATE)
            normalized.append(p)
    if not normalized:return reference.astype(np.uint8)
    return np.median(normalized,axis=0).astype(np.uint8)


def read_patches(index,tracks):
    source=sorted((ROOT/'board').glob('*.mp4'))[index]
    requests=defaultdict(list)
    patches=[[] for _ in tracks]
    for number,t in enumerate(tracks):
        readable=[r for r in t['items'] if r[5]>=max(.18,t['location']-.12)]
        items=list(map(lambda i:readable[i],np.unique(np.linspace(0,len(readable)-1,min(19,len(readable))).astype(int))))
        center=np.median([s[1:3] for s in items],axis=0)
        for row in items:
            requests[row[0]].append((number,*(round(v) for v in center)))
    if not requests:return patches
    with av.open(str(source)) as video:
        v=video.streams.video[0];v.codec_context.thread_count=1
        last_frame=max(requests)
        for i,f in enumerate(video.decode(v)):
            if i>last_frame:break
            if i not in requests:continue
            im=f.to_ndarray(format='bgr24')
            for n,x,y in requests[i]:
                patches[n].append(center_crop(im,x,y,16))
    return [np.stack(p) for p in patches]


def read_clip(index):
    cv2.setNumThreads(1)
    rows=state_rows(index)
    data=pistes(rows)
    for a,t in enumerate(data):
        t['id']=f'{index:02}_{a:03}'
        t['clip']=index
    for t in data:
        t['partners']=0
        for a in data:
            length=min(t['end'],a['end'])-max(t['start'],a['start'])
            if a is not t and length>8 and np.hypot(t['x']-a['x'],t['y']-a['y'])>=13:
                t['partners']+=1
    return data


def save_clip(job):
    clip,items=job
    cv2.setNumThreads(1)
    crops=read_patches(clip,items)
    for a,p in zip(items,crops):
        median=average_warp(p)
        estimate=sorted(a['items'],key=lambda r:-r[5]*r[4])
        sharp=np.array([cv2.Laplacian(im[8:24,8:24],cv2.CV_64F).var() for im in p])
        frame=p[int(sharp.argmax())]
        np.savez_compressed(OUT/'tracks'/f'{a["id"]}.npz',median=median,crops=p,best=frame)
    return len(items)


def samples():
    (OUT/'tracks').mkdir(exist_ok=True)
    with ProcessPoolExecutor(max_workers=8) as pool:
        data=list(pool.map(read_clip,range(77)))
    pairs=[]
    for clip,tracks in enumerate(data):
        if not tracks:continue
        ranked=sorted(tracks,key=lambda a:(a['partners']>0,a['location']+.06*min(a['samples']/30,1)),reverse=True)
        seen={};used=[]
        for t in ranked:
            category=t['color']
            limit=2 if clip%2 else 3
            if seen.get(category,0)>=limit:continue
            # Nearby late detections of the same physical face do not count as a new sample.
            if any(abs(t['start']-p['start'])<=30 and np.hypot(p['x']-t['x'],p['y']-t['y'])<13 for p in used):continue
            seen[category]=seen.get(category,0)+1;used.append(t)
        pairs.extend(used)
    pairs=sorted(pairs,key=lambda a:(a['color'],a['clip'],a['start']))
    print('Candidate tracks',sum(map(len,data)),'review samples',len(pairs),flush=True)
    groups=defaultdict(list)
    for a in pairs:groups[a['clip']].append(a)
    with ProcessPoolExecutor(max_workers=8) as pool:list(pool.map(save_clip,groups.items()))
    audit=[]
    for i,d in enumerate(pairs):
        votes=Counter(z[3] for z in d['items'])
        submit={k:v for k,v in d.items() if k!='items'}
        submit.update(index=i,prior=votes.most_common(1)[0][0])
        audit.append(submit)
    (OUT/'track-index.json').write_text(json.dumps(audit,indent=2)+'\n')
    # A close-up is displayed next to the board-darkness contrast-adjusted view.
    for start in range(0,len(audit),60):
        sheet=np.full((5*126,12*113,3),23,np.uint8)
        for j,d in enumerate(audit[start:start+60]):
            r,c=divmod(j,12)
            x,y=c*113,r*126
            p=np.load(OUT/'tracks'/f'{d["id"]}.npz')['median'][4:28,4:28]
            g=cv2.cvtColor(p,cv2.COLOR_BGR2GRAY)
            core=g[5:19,5:19]
            mid=(np.percentile(core,32)+np.percentile(core,73))/2
            z=np.clip((g.astype(float)-mid)*1.77+128,0,255).astype(np.uint8)
            im=cv2.resize(z,(110,108),interpolation=cv2.INTER_NEAREST)
            sheet[y:y+108,x:x+110]=cv2.cvtColor(im,cv2.COLOR_GRAY2BGR)
            cv2.putText(sheet,f'{d["index"]:03} {d["clip"]:02}  {d["prior"]}',
                        (x+2,y+123),0,.42,(242,242,242),1,cv2.LINE_AA)
        cv2.imwrite(str(OUT/f'dice-track-grid-{start//60}.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
    print('Finished review sheets',flush=True)

if __name__=='__main__':samples()
