#!/usr/bin/env python3
"""Find the reviewed printed-4 cube face and refresh its frame evidence."""
from collections import defaultdict
import gzip
import json
import os
from pathlib import Path

import av
import cv2
from game_state import WORK, offered_cube_model, within_hand


def main():
    cv2.setNumThreads(1)
    template=cv2.imread(str(WORK/'models/cube-four-template.png'),cv2.IMREAD_GRAYSCALE)
    found=defaultdict(int)
    for path in sorted((WORK/'samples').glob('*.jpg')):
        if offered_cube_model(cv2.imread(str(path)),template):
            found[int(path.name.split('_')[0])]+=1
    windows={}
    videos=sorted((WORK/'board').glob('*.mp4'))
    for index in sorted(k for k,n in found.items() if n>=2):
        video=videos[index]
        src=WORK/'state'/f'{video.stem}.jsonl.gz'
        next_file=src.with_suffix('.part.gz')
        matches=[]
        with av.open(str(video)) as media,gzip.open(src,'rt') as inputs,gzip.open(next_file,'wt',compresslevel=2) as out:
            for frame,line in zip(media.decode(video=0),inputs,strict=True):
                row=json.loads(line)
                s=row['state']
                if s is not None:
                    offer=offered_cube_model(frame.to_ndarray(format='bgr24'),template)
                    if offer is not None and not within_hand(*offer['center'],s['handRegions'],2):
                        s['cube']=offer
                        matches.append([row['frame'],row['seconds']])
                out.write(json.dumps(row,separators=(',',':'))+'\n')
        if matches:
            windows[index]={'source':video.name,'readFrames':len(matches),'first':matches[0],'last':matches[-1]}
            os.replace(next_file,src)
        else:
            next_file.unlink()
    (WORK/'review/cube-four-windows.json').write_text(json.dumps(windows,indent=2)+'\n')
    print(json.dumps(windows,indent=2))


if __name__=='__main__':
    main()
