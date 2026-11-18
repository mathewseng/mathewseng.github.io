"""Replace the old visibility-only footer with time-aligned roll and cube state."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import argparse,gzip,json,os,subprocess

import av,cv2,numpy as np
from PIL import Image,ImageDraw,ImageFont

OUT=ARTIFACT_DIR / 'v3'
BASE=OUT.parent/'v2'
WIDTH,HEIGHT=928,40
X,Y=30,783
BG='#101720'
DIVIDER='#334355'
GRAY='#B9C6D4'
TEXT='#F4F6FA'
MINT='#A1E7C4'
BLUE='#A2CAFF'
GOLD='#FFCF8E'
FONT=Path('/System/Library/Fonts/Supplemental')

@lru_cache(maxsize=20)
def face(px,bold=False):
    try:return ImageFont.truetype(str(FONT/('Arial Bold.ttf' if bold else 'Arial.ttf')),px)
    except OSError:return ImageFont.load_default(px)


def caption(draw,x,y,value,size,color=GRAY,bold=False):
    draw.text((x,y),value,fill=color,font=face(size,bold))


def roll_display(a):
    status=a['status']
    values=a['dice']
    value='–'.join(str(x) if x is not None else '?' for x in values) if values else '—'
    labels={'vision-track':('Current roll','Visual track'),
            'carried':('Current roll','From nearby frames'),
            'inferred':('Current roll','Inferred from play'),
            'partial-track':('Current roll','One die read'),
            'partial-review':('Current roll','One face remains unclear'),
            'reviewed':('Current roll','Reviewed in nearby frames'),
            'last':('Last roll','Waiting for the next read'),
            'review-conflict':('Current roll','Conflicting roll evidence'),
            'board-untracked':('Current roll','Board out of view'),
            'unresolved':('Current roll','Unresolved')}
    field,detail=labels[status]
    if a.get('reviewInputDiffers'):
        review='–'.join(map(str,a['reviewDice']))
        basis='Visual check' if a['status'] in ('reviewed','partial-review') else 'Visual track'
        detail=f'{basis} · solver used {review}'
    tone=GOLD if status in ('inferred','review-conflict') else GRAY if status=='last' else MINT
    return field,value,detail,tone


def cube_display(b):
    stake=b['stake']
    status=b['status']
    labels={'vision-track':('Current cube','Visual track'),
            'carried':('Current cube','From earlier frames'),
            'offer':('Current cube','Higher face offered'),
            'last':('Last cube','Board out of view'),
            'unresolved':('Current cube','Unresolved')}
    field,detail=labels[status]
    if status=='offer':
        value=f'{stake} → {b["offer"]}'
        detail='Offer pending · response unresolved'
    else:
        value=str(stake) if stake else '—'
    if b.get('evidence')=='standard-opening':
        detail='Standard starting stake'
    return field,value,detail,GOLD if status=='offer' else BLUE


@lru_cache(maxsize=250)
def tile(left,right):
    image=Image.new('RGB',(WIDTH,HEIGHT),BG)
    draw=ImageDraw.Draw(image)
    draw.line((566,6,566,34),fill=DIVIDER,width=1)
    for offset,(label,value,detail,tone) in ((220,left),(582,right)):
        caption(draw,offset,5,label,15,GRAY,True)
        caption(draw,offset+102,1,value,22,tone,True)
        caption(draw,offset+102,25,detail,12,GRAY)
    return np.asarray(image).copy()


def build_strip(source,strip,limit=None):
    count=0
    with av.open(str(strip),'w') as media:
        stream=media.add_stream('libx264',rate=25)
        stream.width=WIDTH
        stream.height=HEIGHT
        stream.pix_fmt='yuv420p'
        stream.options={'preset':'ultrafast','crf':'15','threads':'1'}
        with gzip.open(source,'rt') as data:
            for line in data:
                if limit and count>=limit*25:break
                r=json.loads(line)
                assert r['frame']==count
                image=tile(roll_display(r['roll']),cube_display(r['cube'])).copy()
                seconds=count//25
                cv2.putText(image,f'{seconds//60:02}:{seconds%60:02}   Frame {count:,}',
                    (0,27),cv2.FONT_HERSHEY_SIMPLEX,.58,(185,198,213),1,cv2.LINE_AA)
                frame=av.VideoFrame.from_ndarray(image,format='rgb24')
                frame.pts=count
                for packet in stream.encode(frame):media.mux(packet)
                count+=1
        for packet in stream.encode():media.mux(packet)
    return count


def render(number,preview=None,software=False):
    base=BASE/'games'/f'game-{number:02}-analysis.mp4'
    graphics=OUT/'graphics'
    graphics.mkdir(exist_ok=True)
    out=OUT/'games'
    out.mkdir(exist_ok=True)
    layer=graphics/f'game-{number:02}-value-strip{"-preview" if preview else ""}.mp4'
    count=build_strip(OUT/f'game-{number:02}-current.jsonl.gz',layer,preview)
    if preview:
        final=graphics/f'game-{number:02}-preview.mp4'
    else:
        final=out/f'game-{number:02}-analysis.mp4'
    staged=final.with_suffix('.software.part.mp4' if software else '.part.mp4')
    cmd=['ffmpeg','-nostdin','-v','error','-y','-i',str(base),'-i',str(layer),
         '-filter_complex_threads','3',
         '-filter_complex',f'[0:v][1:v]overlay={X}:{Y}:eof_action=pass:repeatlast=0[v]',
         '-map','[v]','-map','0:a:0']
    if software:
        cmd+=['-c:v','libx264','-preset','ultrafast','-crf','19','-threads','4']
    else:
        cmd+=['-c:v','h264_videotoolbox','-b:v','4300k','-profile:v','high']
    cmd+=['-c:a','copy','-movflags','+faststart']
    if preview:cmd+=['-t',str(preview)]
    subprocess.run(cmd+[str(staged)],check=True)
    os.replace(staged,final)
    result={'game':number,'footageFrames':count,'output':str(final),'bytes':final.stat().st_size}
    print(json.dumps(result),flush=True)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('games',type=int,nargs='*',default=[1,2,3,4,5])
    p.add_argument('--jobs',type=int,default=2)
    p.add_argument('--preview',type=int)
    p.add_argument('--software',action='store_true')
    args=p.parse_args()
    if args.preview and len(args.games)!=1:p.error('Provide one game for a preview')
    with ThreadPoolExecutor(max_workers=args.jobs) as workers:
        list(workers.map(lambda g:render(g,args.preview,args.software),args.games))

if __name__=='__main__':main()
