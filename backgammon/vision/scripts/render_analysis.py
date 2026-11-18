#!/usr/bin/env python3
"""Render frame-synchronous checker/dice labels and site-solver overlays."""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
from functools import lru_cache
import gzip
import json
from pathlib import Path
import subprocess

import av
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from game_state import WORK

from project_paths import RECORDING_DIR

SOURCE = RECORDING_DIR
FONTS = Path('/System/Library/Fonts/Supplemental')
SIZE = (1088, 544)
PTS = Fraction(1, 90000)
BOARD_X, BOARD_Y = 20, 54
PANEL_X = 604
BG = '#121821'
PANEL = '#1B2431'
RULE = '#314051'
FG = '#F2F4F8'
SUB = '#B6C3D0'
ACCENT = '#9EE8C1'
WARM = '#FFD291'


@lru_cache(maxsize=64)
def font(size, bold=False):
    try:
        return ImageFont.truetype(str(FONTS / ('Arial Bold.ttf' if bold else 'Arial.ttf')),size)
    except OSError:
        return ImageFont.load_default(size)


def label(draw, position, value, size=16, color=FG, bold=False):
    face=font(size,bold)
    draw.text(position,value,fill=color,font=face)


def pct(value):
    return f'{100*value:.1f}%'


def draw_outcomes(draw, outcome, y, title):
    positions=(PANEL_X+130,PANEL_X+239,PANEL_X+354)
    for i,text in enumerate(('Single','Gammon','Backgammon')):
        label(draw,(positions[i],y),text,13,SUB)
    y+=22
    for j, side in enumerate(('win','lose')):
        label(draw,(PANEL_X+18,y+22*j),f'{title} {side}',14,ACCENT if side=='win' else SUB)
        for i,suffix in enumerate(('Single','Gammon','Backgammon')):
            label(draw,(positions[i],y+22*j),pct(outcome[side+suffix]),15)


def new_layout(source,index):
    canvas=Image.new('RGB',SIZE,BG)
    draw=ImageDraw.Draw(canvas)
    draw.rectangle((PANEL_X,54,SIZE[0]-20,476), fill=PANEL,outline=RULE,width=1)
    label(draw,(20,14),'Office-3  /  Backgammon',23,bold=True)
    label(draw,(391,21),f'{index+1:02d}  {source[-10:-4]} EST',13,SUB)
    label(draw,(PANEL_X+18,20),'Checker move analysis',18,bold=True)
    return canvas


def complete_panel(source,index,entry):
    canvas=new_layout(source,index)
    draw=ImageDraw.Draw(canvas)
    x=PANEL_X+18
    label(draw,(x,71),f'{entry["player"].title()} to move  •  {entry["dice"][0]}–{entry["dice"][1]}',17,ACCENT,True)
    label(draw,(x,103),'Best move',15,SUB)
    word=entry['best']['notation'].replace('Pass — no legal move','Pass')
    label(draw,(x,127),word,25,bold=True)
    label(draw,(x,166),f'Equity {entry["best"]["equity"]:+.3f}',18,bold=True)
    played=entry['played']
    if played is not None:
        loss=entry['evLoss']
        label(draw,(x+242,165),f'EV loss {loss:.3f}',18,WARM if loss>.02 else ACCENT,True)
        label(draw,(x,197),f'Played  {played["notation"]}',17)
    else:
        label(draw,(x,197),'Played move unresolved',17,SUB)
    draw.line((x,229,SIZE[0]-39,229),fill=RULE,width=1)
    draw_outcomes(draw,entry['best']['outcomeProbabilities'],244,'Best')
    if played is not None:
        draw_outcomes(draw,played['outcomeProbabilities'],326,'Played')
    draw.line((x,404,SIZE[0]-39,404),fill=RULE,width=1)
    label(draw,(x,416),f'GNUbg {entry["preset"]["plies"]}-ply  •  {entry["equityUnits"]}',15,SUB)
    evidence={'visible-roll-and-legal-observed-result':'Visible roll and observed legal result',
              'temporal-roll-and-legal-observed-result':'Tracked dice and observed legal result',
              'unique-legal-roll-with-partial-dice-evidence':'Roll inferred from legal move and visible dice',
              'visible-roll-and-validated-dice-color':'Mover identified from verified dice-set use'}
    label(draw,(x,442),evidence.get(entry['evidence'],entry['evidence']),13,SUB)
    return canvas


def conditional_panel(source,index,entry):
    canvas=new_layout(source,index)
    draw=ImageDraw.Draw(canvas)
    x=PANEL_X+18
    label(draw,(x,71),f'Roll {entry["dice"][0]}–{entry["dice"][1]}  •  Mover unresolved',17,WARM,True)
    for i,a in enumerate(entry['byPlayer']):
        y=115+i*151
        label(draw,(x,y),f'If {a["player"]} moves',16,SUB)
        name=a['best']['notation'].replace('Pass — no legal move','Pass')
        label(draw,(x,y+24),name,20,bold=True)
        label(draw,(x+280,y+27),f'{a["best"]["equity"]:+.3f} equity',15,ACCENT)
        draw_outcomes(draw,a['best']['outcomeProbabilities'],y+56,'')
        draw.line((x,y+128,SIZE[0]-39,y+128),fill=RULE)
    label(draw,(x,440),'EV loss unavailable without a verified played move',14,SUB)
    return canvas


def cube_panel(source,index,entry):
    canvas=new_layout(source,index)
    draw=ImageDraw.Draw(canvas)
    x=PANEL_X+18
    draw.rectangle((PANEL_X+5,12,SIZE[0]-22,46),fill=BG)
    label(draw,(x,20),'Doubling cube analysis',18,bold=True)
    label(draw,(x,71),f'{entry["offerer"].title()} offers  {entry["preOfferStake"]} → {entry["offeredFace"]}',17,ACCENT,True)
    label(draw,(x,103),'Best cube action',15,SUB)
    label(draw,(x,126),entry['recommendation'],25,bold=True)
    label(draw,(x,163),f'Equity {entry["equity"]:+.3f}',18,bold=True)
    label(draw,(x+230,163),f'Offer EV loss {entry["offerEvLoss"]:.3f}',17,WARM,True)
    label(draw,(x,198),f'Best reply  {entry["bestReply"]}   •   Reply unverified',16)
    draw.line((x,230,SIZE[0]-39,230),fill=RULE)
    for j,(title,key) in enumerate((('No redouble','noDouble'),('Redouble / take','take'),('Redouble / pass','pass'))):
        label(draw,(x,244+24*j),title,16,SUB)
        label(draw,(x+290,244+24*j),f'{entry["options"][key]:+.3f}',16)
    draw_outcomes(draw,entry['outcomeProbabilities'],323,'Position')
    draw.line((x,404,SIZE[0]-39,404),fill=RULE)
    label(draw,(x,416),f'GNUbg {entry["preset"]["plies"]}-ply  •  {entry["equityUnits"]}',15,SUB)
    label(draw,(x,442),'Reviewed position  •  Money-game rules assumed',13,SUB)
    return canvas


def waiting_panel(source,index,status):
    canvas=new_layout(source,index)
    draw=ImageDraw.Draw(canvas)
    x=PANEL_X+18
    label(draw,(x,75),'Move analysis unavailable',22,bold=True)
    lines={
      'untracked':('The open board is outside the tracker.',),
      'occluded':('A hand or arm covers part of the board.',),
      'position':('The full checker position is unresolved.',),
      'roll':('A settled pair of dice is unresolved.',),
      'mover':('The mover or completed play is unresolved.',),
    }
    for i,value in enumerate(lines[status]):
        label(draw,(x,116+i*22),value,16,SUB)
    return canvas


def board_marks(pixels,state):
    # BGR colors used here, RGB in the layout below.
    if state is None:
        return pixels
    pixels=pixels.copy()
    for c in state['checkers']:
        x,y=c['center']
        color=(161,239,154) if c['color']=='white' else (244,180,99)
        cv2.circle(pixels,(x,y),15,color,1,cv2.LINE_AA)
    for d in state['dice']:
        x,y=d['center']
        value=d['value']
        color=(95,230,255) if value else (180,180,180)
        cv2.rectangle(pixels,(x-9,y-9),(x+9,y+9),color,1)
        cv2.putText(pixels,str(value or '?'),(x+8,y-8),0,.48,color,1,cv2.LINE_AA)
    c=state['cube']
    if c:
        x,y=c['center']
        cv2.rectangle(pixels,(x-12,y-12),(x+12,y+12),(131,179,255),1)
    return pixels


def all_windows(clip):
    windows=[]
    # Definite decisions take precedence when overlay time windows touch.
    for i,a in enumerate(clip['analyses']):
        windows.append((a['startSeconds'],a['endSeconds'],2,i,complete_panel(clip['source'],clip['clip'],a)))
    for i,a in enumerate(clip['conditional']):
        windows.append((a['startSeconds'],a['endSeconds'],1,i,conditional_panel(clip['source'],clip['clip'],a)))
    for i,a in enumerate(clip.get('reviewedCubeOffers',[])):
        windows.append((a['startSeconds'],a['endSeconds'],3,i,cube_panel(clip['source'],clip['clip'],a)))
    return windows


def clip_overlay(clip):
    cv2.setNumThreads(1)
    source=clip['source']
    index=clip['clip']
    original=SOURCE/source
    target=WORK/'overlays'/source
    intermediate=target.with_suffix('.part-video.mp4')
    in_progress=target.with_suffix('.part-mux.mp4')
    if target.exists() and not clip.get('force'):
        return {'clip':index,'status':'exists'}
    windows=all_windows(clip)
    wait={code:waiting_panel(source,index,code) for code in ('untracked','occluded','position','roll','mover')}
    rows=WORK/'state'/f'{Path(source).stem}.jsonl.gz'
    frame_count, with_analysis=0,0
    with av.open(str(WORK/'board'/source)) as video, av.open(str(intermediate),'w') as out,gzip.open(rows,'rt') as reader:
        stream=out.add_stream('libx264',rate=25)
        stream.width,stream.height=SIZE
        stream.pix_fmt='yuv420p'
        stream.codec_context.time_base=PTS
        stream.options={'crf':'22','preset':'ultrafast','threads':'2'}
        for frame,line in zip(video.decode(video=0),reader,strict=True):
            row=json.loads(line)
            assert abs(float(frame.pts*frame.time_base)-row['outputPts90k']/90000)<.0002
            state=row['state']
            when=row['seconds']
            active=max((w for w in windows if w[0]<=when<=w[1]),key=lambda w:(w[2],w[0]),default=None)
            status='untracked' if state is None else 'occluded' if state['handRegions'] else \
                   'position' if not state['position'] else 'roll' if not state['currentRoll'] else 'mover'
            canvas=(active[4] if active else wait[status]).copy()
            mark=board_marks(frame.to_ndarray(format='bgr24'),state)
            canvas.paste(Image.fromarray(cv2.cvtColor(mark,cv2.COLOR_BGR2RGB)),(BOARD_X,BOARD_Y))
            draw=ImageDraw.Draw(canvas)
            label(draw,(20,492),f'{when:05.2f}s  •  Frame {row["frame"]}',14,SUB)
            if state:
                roll='–'.join(map(str,state['currentRoll'])) if state['currentRoll'] else 'unresolved'
                c=state['cube']
                cube=str(c['stake']) if c and c['stake'] else f'face {c["face"]}' if c and c['face'] else 'unresolved'
                label(draw,(190,492),f'Roll {roll}  •  Cube {cube}',16,FG,True)
                n,m=state['visibleCheckerTotals']
                tag={'all-30-visible':'fully visible','inferred-tray':'tray count inferred',
                     'occluded':'occluded','partial':'partial','ambiguous':'ambiguous'}[state['checkerStatus']]
                label(draw,(20,517),f'Checker detections  {n} white, {m} dark  •  {tag}',14,SUB)
            else:
                label(draw,(190,492),'Board untracked',16,SUB)
            label(draw,(PANEL_X+18,500),'Win and loss percentages are from the mover’s perspective.',13,SUB)
            outframe=av.VideoFrame.from_ndarray(np.asarray(canvas),format='rgb24')
            outframe.time_base=PTS
            outframe.pts=row['outputPts90k']
            for packet in stream.encode(outframe):out.mux(packet)
            frame_count+=1
            with_analysis+=active is not None
        for packet in stream.encode():out.mux(packet)
    subprocess.run(['ffmpeg','-nostdin','-hide_banner','-v','error','-i',str(intermediate),'-i',str(original),
                    '-map','0:v:0','-map','1:a:0?','-c','copy','-movflags','+faststart',str(in_progress)],check=True)
    in_progress.replace(target)
    intermediate.unlink()
    return {'clip':index,'frames':frame_count,'analysisFrames':with_analysis}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--start',type=int,default=0)
    parser.add_argument('--stop',type=int)
    parser.add_argument('--jobs',type=int,default=6)
    parser.add_argument('--force',action='store_true')
    args=parser.parse_args()
    (WORK/'overlays').mkdir(exist_ok=True)
    data=json.loads((WORK/'decisions.json').read_text())['clips'][args.start:args.stop]
    data=[dict(clip,force=args.force) for clip in data]
    if args.jobs==1:
        for clip in data:
            print(json.dumps(clip_overlay(clip)),flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(clip_overlay,data):
                print(json.dumps(result),flush=True)


if __name__=='__main__':
    main()
