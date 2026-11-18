#!/usr/bin/env python3
"""Check decoded media, label inventory, model predictions, and state joins."""
from collections import Counter
from pathlib import Path
import gzip
import json
import subprocess

import cv2
import numpy as np

from game_state import GameVision, WORK
from train_vision import sample


def manual_review():
    vision=GameVision()
    summary=Counter()
    frames=[]
    for line in (WORK/'labels'/'checker-review.txt').read_text().splitlines():
        if not line or line.startswith('#'):
            continue
        key,white,dark,bar=[part.strip() for part in line.split('|')]
        board=np.zeros((24,2),np.uint8)
        for color,slots in enumerate((white,dark)):
            for slot in slots.split():
                p,n=map(int,slot.split(':'))
                board[p-1,color]=n
        bar=list(map(int,bar.split(',')))
        if any(board[:,c].sum()+bar[c]!=15 for c in range(2)):
            raise ValueError(f'Unbalanced manual review {key}')
        s=vision.observations(sample(key))
        match=np.all(board==s['points'],axis=1)
        err=np.sum(np.abs(board.astype(int)-np.array(s['points'])))+sum(abs(a-b) for a,b in zip(bar,s['bar']))
        exact=bool(match.all() and bar==s['bar'])
        summary.update(frames=1,exactBoards=int(exact),correctPoints=int(match.sum()),points=24,
                       checkerCountAbsoluteError=int(err),correctBars=int(bar==s['bar']))
        frames.append(dict(image=key,expectedPoints=board.tolist(),expectedBar=bar,
                           predictedPoints=s['points'],predictedBar=s['bar'],exact=exact,differences=int(err)))
    return dict(totals=dict(summary),frames=frames)


def outputs():
    summary=Counter()
    inventory=[]
    for path in sorted((WORK/'state').glob('*.jsonl.gz')):
        clip=Counter()
        previous=None
        with gzip.open(path,'rt') as handle:
            for index,line in enumerate(handle):
                row=json.loads(line)
                assert row['frame']==index, (path,row['frame'])
                clock=(row['timeBase'],row['pts'])
                if previous is not None:
                    assert clock[0]==previous[0] and clock[1]>previous[1], (previous,clock)
                previous=clock
                clip['frames']+=1
                state=row['state']
                if state is None:
                    clip['untracked']+=1
                    continue
                clip[state['checkerStatus']]+=1
                if state['currentRoll'] is not None:
                    clip['settledRoll']+=1
                if state['cube'] and state['cube']['face'] is not None:
                    clip['cubeFace']+=1
                if state['cube'] and state['cube']['stake'] is not None:
                    clip['cubeStake']+=1
        clip['clips']=1
        summary.update(clip)
        for lane,size in (('board',(560,420)),('unwarped',(2236,1000))):
            target=WORK/lane/(path.name.removesuffix('.jsonl.gz')+'.mp4')
            probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries',
                'stream=width,height,nb_frames','-of','json',str(target)]))
            stream=probe['streams'][0]
            assert (stream['width'],stream['height'])==size and int(stream['nb_frames'])==clip['frames'],target
        inventory.append(dict(source=path.name.removesuffix('.jsonl.gz')+'.mp4',**clip))
    return dict(totals=dict(summary),clips=inventory)


if __name__=='__main__':
    cv2.setNumThreads(1)
    results=dict(manualCheckerReview=manual_review(),export=outputs())
    (WORK/'validation.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps({k:v['totals'] for k,v in results.items()},indent=2))
