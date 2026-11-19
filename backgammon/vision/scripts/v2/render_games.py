"""Render each verified game with player state, running loss and full move tables."""
from __future__ import annotations
import argparse
from bisect import bisect_right
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
import gzip, json, math, subprocess, sys
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR, RECORDING_DIR

import av
import cv2
import numpy as np
from PIL import Image,ImageDraw,ImageFont

ROOT=ARTIFACT_DIR
OUT=ROOT/'v2'
RECORDINGS=RECORDING_DIR
WIDTH,HEIGHT=1920,1080
FPS=25
BX,BY,BW,BH=30,85,928,696
PX,PY,PW,PH=30,825,928,224
AX,AY,AW,AH=982,85,908,964
FONT=Path('/System/Library/Fonts/Supplemental')
BG='#101720'; CARD='#192330'; BORDER='#334355'; PAPER='#F4F6FA'
GRAY='#B9C6D4'; MINT='#9FE7C0'; GOLD='#FFCD8A'; BLUE='#A2CAFF'
PER_PAGE=24
PAGE_SECONDS=4


@lru_cache(maxsize=40)
def face(size,bold=False):
    try:return ImageFont.truetype(str(FONT/('Arial Bold.ttf' if bold else 'Arial.ttf')),size)
    except OSError:return ImageFont.load_default(size)


def text(draw,x,y,value,size=20,fill=PAPER,bold=False,anchor=None):
    draw.text((x,y),str(value),fill=fill,font=face(size,bold),anchor=anchor)


def percent(n):
    return f'{100*n:.1f}%'


def to_bgr(img):
    return cv2.cvtColor(np.asarray(img),cv2.COLOR_RGB2BGR)


def panel(width,height):
    img=Image.new('RGB',(width,height),CARD)
    draw=ImageDraw.Draw(img)
    draw.rectangle((0,0,width-1,height-1),outline=BORDER,width=1)
    return img,draw


def asset_header(game):
    img=Image.new('RGB',(WIDTH,HEIGHT),BG)
    d=ImageDraw.Draw(img)
    text(d,30,19,f'Office-3 Backgammon  /  Game {game["number"]:02}',33,bold=True)
    text(d,745,34,game['opening'],19,GRAY)
    text(d,1890,33,'SITE GNUbg REVIEW',18,BLUE,True,anchor='ra')
    return to_bgr(img)


def player_card(position_marker, stale=False, losses=(0,0), grades=(0,0), final=False):
    image,draw=panel(PW,PH)
    text(draw,20,15,'Final game totals' if final else 'Player equity and cumulative EV loss',24,bold=True)
    headers=(('Player',21),('Equity',168),('Win',266),('Single',367),('Gammon',473),('BG',590),('EV loss',676),('Graded',798))
    for title,x in headers:text(draw,x,58,title,17,GRAY)
    draw.line((20,84,PW-20,84),fill=BORDER)
    for i,name in enumerate(('White','Dark')):
        y=100+i*43
        text(draw,21,y,name,22,MINT if i==0 else BLUE,True)
        p=position_marker['players'][i] if position_marker else None
        values= [f'{p["equity"]:+.3f}',percent(sum(p['chances'])),*[percent(n) for n in p['chances']]] if p else ['—']*5
        for (_,x),value in zip(headers[1:6],values):text(draw,x,y,value,21)
        text(draw,676,y,f'{losses[i]:.3f}',22,GOLD,True)
        text(draw,798,y,grades[i],21)
    if final:
        summary='Normalized equity loss from graded decisions'
    elif not position_marker:
        summary='Position estimate awaits a readable checker state'
    elif stale:
        summary='Last readable position  •  Current position unresolved'
    else:
        who=position_marker['turn']
        summary=position_marker.get('basis') or ('3-ply current position  •  '+
          (f'{who.title()} on roll' if who else 'Roller unresolved, both on-roll cases averaged'))
    text(draw,20,195,summary,17,GRAY)
    return to_bgr(image)


def move_table(draw,amount,offset,x,y,width,items):
    text(draw,x,y,'Rank  Checker move',18,GRAY)
    text(draw,x+width-96,y,'3 ply',17,GRAY,anchor='ra')
    text(draw,x+width-17,y,'4 ply',17,GRAY,anchor='ra')
    y+=32
    for i,a in enumerate(items):
        if a['isBest'] or a['isPlayed']:
            draw.rectangle((x-7,y-5,x+width-6,y+27),fill='#203B38' if a['isBest'] else '#38333B')
        row=i+offset+1
        text(draw,x,y,f'{row:02}',16,GRAY)
        name=a['notation'].replace('Pass — no legal move','Pass')
        text(draw,x+33,y,name,18,MINT if a['isBest'] else GOLD if a['isPlayed'] else PAPER,a['isBest'])
        text(draw,x+width-96,y,f'{a["equity3"]:+.3f}',18,anchor='ra')
        text(draw,x+width-17,y,f'{a["equity4"]:+.3f}' if a.get('equity4') is not None else '—',18,anchor='ra')
        y+=42


def action_card(entry,kind,page=0,conditional_side=None,review=False):
    img,draw=panel(AW,AH)
    x=22
    text(draw,x,21,'Decision actions' if not review else 'Decision review',26,bold=True)
    if kind=='none':
        text(draw,x,92,'Decision unresolved',32,bold=True)
        text(draw,x,151,'A full board, readable roll and verified mover are needed',21,GRAY)
        text(draw,x,182,'to rank a checker decision.',21,GRAY)
        return to_bgr(img)
    if kind=='cube':
        text(draw,x,72,f'{entry["offerer"].title()} offers {entry["preOfferStake"]} → {entry["offeredFace"]}',25,MINT,True)
        text(draw,x,133,'Optimal cube action',21,GRAY)
        text(draw,x,172,entry['recommendation'],37,bold=True)
        text(draw,x,232,f'Best reply  {entry["bestReply"]}  •  actual reply unresolved',21,GRAY)
        text(draw,x,277,f'Offer EV loss  {entry["offerEvLoss"]:.3f}',23,GOLD,True)
        draw.line((x,340,AW-x,340),fill=BORDER)
        text(draw,x,366,'Action',22,GRAY);text(draw,AW-x,366,'4-ply EV',22,GRAY,anchor='ra')
        for i,(title,key) in enumerate((('No redouble','noDouble'),('Redouble / take','take'),('Redouble / pass','pass'))):
            y=420+i*57
            text(draw,x,y,title,24,MINT if i==0 else PAPER)
            text(draw,AW-x,y,f'{entry["options"][key]:+.3f}',24,anchor='ra')
        text(draw,x,668,'Reviewed position  •  money-game rules assumed',19,GRAY)
        return to_bgr(img)
    if kind=='conditional' and conditional_side is None:
        text(draw,x,72,f'Roll {entry["dice"][0]}–{entry["dice"][1]}  •  mover unresolved',23,GOLD,True)
        for i,d in enumerate(entry['byPlayer']):
            y=135+345*i
            text(draw,x,y,f'If {d["player"]} moves',23,GRAY)
            best=d['best']['notation'].replace('Pass — no legal move','Pass')
            text(draw,x,y+37,best,30,MINT,True)
            text(draw,AW-x,y+45,f'{d["best"]["equity"]:+.3f} at 4 ply',20,MINT,anchor='ra')
            move_table(draw,5,0,x,y+97,AW-75,d['actions'][:5])
            text(draw,AW-x,y+321,f'{len(d["actions"])} legal results • full table in review cards',16,GRAY,anchor='ra')
        text(draw,x,904,'EV loss awaits a verified played move',19,GRAY)
        return to_bgr(img)
    if kind=='conditional':
        entry=entry['byPlayer'][conditional_side]
    dice='–'.join(map(str,entry['dice']))
    prefix='If ' if kind=='conditional' else ''
    inferred=entry['evidence']=='unique-legal-roll-with-partial-dice-evidence'
    roll_label='Inferred roll' if inferred else 'Roll'
    text(draw,x,71,f'{prefix}{entry["player"].title()} moves  •  {roll_label} {dice}',24,GOLD if inferred else MINT,True)
    text(draw,x,119,'Optimal move  •  4-ply shortlist',19,GRAY)
    identity=entry['best']['notation'].replace('Pass — no legal move','Pass')
    text(draw,x,151,identity,32,bold=True)
    text(draw,AW-x,161,f'{entry["best"]["equity"]:+.3f} EV',23,MINT,True,anchor='ra')
    played=entry['played']
    if played is not None:
        text(draw,x,204,f'Played  {played["notation"]}',21)
        loss_label='Estimated EV loss' if inferred else 'EV loss'
        text(draw,AW-x,204,f'{loss_label}  {entry["evLoss"]:.3f}',21,GOLD,True,anchor='ra')
    else:
        text(draw,x,204,'Played move unresolved',20,GRAY)
    draw.line((x,252,AW-x,252),fill=BORDER)
    items=entry['actions']
    n=len(items)
    shown=items[page*PER_PAGE:(page+1)*PER_PAGE]
    width=(AW-56)//2
    move_table(draw,len(shown[:12]),page*PER_PAGE,x,280,width,shown[:12])
    if len(shown)>12:
        move_table(draw,len(shown[12:]),page*PER_PAGE+12,x+width+15,280,width,shown[12:])
    pages=max(1,math.ceil(n/PER_PAGE))
    text(draw,x,827,f'{n} legal result{"s" if n!=1 else ""}  •  Page {page+1}/{pages}',20,PAPER,True)
    text(draw,x,863,'All actions at 3 ply  •  top four and played result rechecked at 4 ply',17,GRAY)
    if pages>1 and not review:
        text(draw,x,895,'More actions appear on the review cards after the footage.',18,GRAY)
    elif inferred:
        text(draw,x,895,'Partial dice evidence. This estimate stays outside the running loss.',18,GRAY)
    elif entry['evidence']=='visible-roll-and-validated-dice-color':
        text(draw,x,895,'Mover inferred from the observed dice set.',18,GRAY)
    return to_bgr(img)


def reviewed_cube_position(offer):
    p=offer['outcomeProbabilities']
    a={'equity':offer['equity'],'chances':[p[k] for k in ('winSingle','winGammon','winBackgammon')]}
    b={'equity':-offer['equity'],'chances':[p[k] for k in ('loseSingle','loseGammon','loseBackgammon')]}
    return {'basis':'4-ply reviewed pre-redouble position', 'turn':offer['offerer'],
            'players':[a,b] if offer['offerer']=='white' else [b,a]}


def board_marks(pixels,state):
    if state is None:return pixels
    out=pixels.copy()
    for c in state['checkers']:
        x,y=c['center']
        cv2.circle(out,(x,y),15,(147,235,158) if c['color']=='white' else (255,182,101),1,cv2.LINE_AA)
    for r in state.get('stackReadings',[]):
        if r['point']<=12:
            col=12-r['point']; ypos=177
        else:
            col=r['point']-13; ypos=235
        c=(81,115,152,187,222,256,316,350,386,421,456,491)[col]
        cv2.putText(out,f'+{r["added"]}',(c-8,ypos),cv2.FONT_HERSHEY_SIMPLEX,.36,(0,205,255),1,cv2.LINE_AA)
    for v in state['dice']:
        x,y=v['center']
        color=(94,232,255) if v['value'] else (165,165,165)
        cv2.rectangle(out,(x-9,y-9),(x+9,y+9),color,1)
        cv2.putText(out,str(v['value'] or '?'),(x+9,y-7),0,.46,color,1,cv2.LINE_AA)
    cube=state['cube']
    if cube:
        x,y=cube['center'];cv2.rectangle(out,(x-11,y-11),(x+11,y+11),(115,179,255),1)
    return out


def clock_label(frame,state):
    total=frame//25
    roll='unresolved'
    cube='unresolved'
    if state:
        if state['currentRoll']:
            roll='-'.join(map(str,state['currentRoll']))
        c=state['cube']
        if c:
            cube=str(c['stake']) if c['stake'] else f'face {c["face"]}' if c['face'] else 'unresolved'
    return f'{total//60:02}:{total%60:02}   Frame {frame:,}     Visible roll {roll}   |   Cube {cube}'


def stroke_label(image,label):
    cv2.putText(image,label,(BX+1,810),cv2.FONT_HERSHEY_SIMPLEX,.62,(213,198,185),1,cv2.LINE_AA)


class FrameWriter:
    def __init__(self,target,software=False,bitrate=3_500_000,*,software_preset='ultrafast',software_crf=23):
        self.target=target
        if hasattr(target, 'write'):
            self.writer = av.open(target, 'w', format='mp4',
                                  options={'movflags': 'frag_keyframe+empty_moov+default_base_moof'})
        else:
            self.writer = av.open(str(target), 'w')
        self.stream=self.writer.add_stream('libx264' if software else 'h264_videotoolbox',rate=FPS)
        self.stream.width=WIDTH;self.stream.height=HEIGHT
        self.stream.pix_fmt='yuv420p' if software else 'nv12'
        if software:self.stream.options={'crf':str(software_crf),'preset':software_preset,'threads':'2'}
        else:
            self.stream.bit_rate=bitrate
            self.stream.options={'allow_sw':'1','realtime':'0','profile':'high'}
        self.frame_count=0
    def write(self,canvas):
        frame=av.VideoFrame.from_ndarray(canvas,format='bgr24')
        frame.pts=self.frame_count
        for packet in self.stream.encode(frame):self.writer.mux(packet)
        self.frame_count+=1
    def close(self):
        for packet in self.stream.encode():self.writer.mux(packet)
        self.writer.close()


def audio_mux(video,dest,segments,extra_frames):
    command=['ffmpeg','-nostdin','-v','error','-y','-i',str(video)]
    filters=[]
    for i,s in enumerate(segments,1):
        dur=(s['lastExclusive']-s['firstFrame'])/FPS
        command+=['-ss',str(s['sourceStartSeconds']),'-t',str(dur),'-i',str(RECORDINGS/s['source'])]
        filters.append(f'[{i}:a:0]aresample=48000:async=1:first_pts=0,apad,atrim=duration={dur},asetpts=N/SR/TB[a{i}]')
    n=len(segments)
    if extra_frames:
        dur=extra_frames/FPS
        filters.append(f'anullsrc=r=48000:cl=stereo,atrim=duration={dur}[a{n+1}]');n+=1
    concat=''.join(f'[a{i}]' for i in range(1,n+1))
    filters.append(f'{concat}concat=n={n}:v=0:a=1[aout]')
    command+=['-filter_complex_threads','2','-filter_complex',';'.join(filters),'-map','0:v:0','-map','[aout]',
              '-c:v','copy','-c:a','aac','-b:a','144k','-movflags','+faststart',str(dest)]
    subprocess.run(command,check=True)


def active_entries(game):
    entries=[]
    for rank,name in ((3,'reviewedCubeOffers'),(2,'analyses'),(1,'conditional')):
        for idx,e in enumerate(game[name]):
            entries.append((e['startSeconds'],e['endSeconds'],rank,idx,e))
    return sorted(entries,key=lambda e:e[0])


def render(game,output,software=False,limit=None):
    cv2.setNumThreads(1)
    number=game['number']
    output.mkdir(exist_ok=True,parents=True)
    video=output/f'.game-{number:02}-video.mp4'
    staging=output/f'.game-{number:02}-mux.mp4'
    final=output/f'game-{number:02}-analysis.mp4'
    writer=FrameWriter(video,software)
    header=asset_header(game)
    entries=active_entries(game)
    kind_for={1:'conditional',2:'checker',3:'cube'}
    waiting=action_card(None,'none')
    positions=sorted(game['positions'],key=lambda p:p['startSeconds'])
    starts=[p['startSeconds'] for p in positions]
    history=sorted(game['lossEvents'],key=lambda e:e['seconds'])
    hist=0;losses=[0.,0.];grades=[0,0];cache={}; old_player=None
    window=0;matching=[]
    last_panel=None
    reference_frames={}
    target_frames={e['preMoveFrame'] for e in game['analyses'] if len(e['actions'])>PER_PAGE}
    target_frames.update(row['byPlayer'][0]['preMoveFrame'] for row in game['conditional'])
    segments=game['segments']
    for segment in segments:
        with av.open(str(ROOT/'board'/segment['source'])) as source,gzip.open(OUT/'state'/f'{Path(segment["source"]).stem}.jsonl.gz','rt') as data:
            source.streams.video[0].codec_context.thread_count=1
            for i,(frame,line) in enumerate(zip(source.decode(video=0),data,strict=True)):
                if i<segment['firstFrame']:continue
                if i>=segment['lastExclusive']:break
                index=segment['firstGameFrame']+i-segment['firstFrame']
                if limit is not None and index>=limit:
                    writer.close()
                    video.rename(output/f'game-{number:02}-preview.mp4')
                    return {'previewFrames':index}
                old=json.loads(line)
                state=old['state']
                now=index/FPS
                if index in target_frames:
                    reference_frames[index]=frame.to_ndarray(format='bgr24')
                while hist<len(history) and history[hist]['seconds']<=now:
                    event=history[hist]
                    side=int(event['player']=='dark')
                    losses[side]+=event['loss'];grades[side]+=1;hist+=1
                pi=bisect_right(starts,now)-1
                pos=positions[pi] if pi>=0 else None
                stale=pos is not None and now>pos['endSeconds']+.35
                while window<len(entries) and entries[window][0]<=now:
                    matching.append(entries[window]);window+=1
                matching=[e for e in matching if e[1]>=now]
                active=max(matching,key=lambda e:(e[2],e[0]),default=None)
                reviewed=active is not None and active[2]==3
                player_key=((3,active[3]) if reviewed else (pi,stale),hist)
                if old_player!=player_key:
                    marker=reviewed_cube_position(active[4]) if reviewed else pos
                    last_panel=player_card(marker,False if reviewed else stale,losses,grades)
                    old_player=player_key
                if active:
                    key=active[2:4]
                    if key not in cache:cache[key]=action_card(active[4],kind_for[key[0]])
                    action=cache[key]
                else:action=waiting
                canvas=header.copy()
                pixels=board_marks(frame.to_ndarray(format='bgr24'),state)
                canvas[BY:BY+BH,BX:BX+BW]=cv2.resize(pixels,(BW,BH),interpolation=cv2.INTER_LINEAR)
                canvas[AY:AY+AH,AX:AX+AW]=action
                canvas[PY:PY+PH,PX:PX+PW]=last_panel
                stroke_label(canvas,clock_label(index,state))
                writer.write(canvas)
    assert writer.frame_count==game['frames'],(number,writer.frame_count)
    overflow=[]
    for e in game['analyses']:
        for page in range(1,math.ceil(len(e['actions'])/PER_PAGE)):
            overflow.append((e,'checker',page,None,e['preMoveFrame']))
    for e in game['conditional']:
        for side,d in enumerate(e['byPlayer']):
            for page in range(math.ceil(len(d['actions'])/PER_PAGE)):
                overflow.append((e,'conditional',page,side,d['preMoveFrame']))
    for e,kind,page,side,index in overflow:
        canvas=header.copy()
        reference=reference_frames[index]
        canvas[BY:BY+BH,BX:BX+BW]=cv2.resize(reference,(BW,BH),interpolation=cv2.INTER_LINEAR)
        canvas[AY:AY+AH,AX:AX+AW]=action_card(e,kind,page,side,review=True)
        canvas[PY:PY+PH,PX:PX+PW]=player_card(None,False,losses,grades,final=True)
        stroke_label(canvas,f'Review card   |   Pre-move frame {index:,}')
        for _ in range(PAGE_SECONDS*FPS):writer.write(canvas)
    writer.close()
    audio_mux(video,staging,segments,writer.frame_count-game['frames'])
    staging.replace(final)
    video.unlink()
    print(json.dumps({'game':number,'file':str(final),'footageFrames':game['frames'],
                      'exportFrames':writer.frame_count,'reviewCards':len(overflow)}),flush=True)


def finalize_loss(game,path):
    losses=[event for event in game['lossEvents'] if event['kind']=='cube']
    for decision in game['analyses']:
        evidence=decision['evidence']
        counted=decision['evLoss'] is not None and evidence not in (
            'unique-legal-roll-with-partial-dice-evidence','visible-roll-and-validated-dice-color')
        decision['countedInGameLoss']=counted
        if counted:
            when=decision['observedResultFrame']
            if when is None:when=round(decision['endSeconds']*FPS)
            losses.append({'seconds':when/FPS,'player':decision['player'],
                           'loss':decision['evLoss'],'kind':'checker','evidence':evidence})
    game['lossEvents']=sorted(losses,key=lambda event:event['seconds'])
    game['cumulative']={}
    for player in ('white','dark'):
        scored=[e['loss'] for e in losses if e['player']==player]
        game['cumulative'][player]={'loss':sum(scored),'graded':len(scored)}
    staged=path.with_suffix('.updated.json')
    staged.write_text(json.dumps(game,indent=2)+'\n')
    staged.replace(path)
    return game


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('game',type=int)
    p.add_argument('--limit',type=int)
    p.add_argument('--software',action='store_true')
    args=p.parse_args()
    path=OUT/f'game-{args.game}-analysis.json'
    game=finalize_loss(json.loads(path.read_text()),path)
    render(game,OUT/'games',args.software,args.limit)

if __name__=='__main__':main()
