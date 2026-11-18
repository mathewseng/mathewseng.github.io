#!/usr/bin/env python3
"""Extract frame-addressable backgammon observations with explicit abstention."""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from fractions import Fraction
import gzip
import json
import os
from pathlib import Path

import av
import cv2
import numpy as np

from project_paths import ARTIFACT_DIR, CALIBRATION_REPO

WORK = ARTIFACT_DIR
FACES = (None, 2, 4, 8, 16, 32, 64)
COLUMNS = np.array([81, 115, 152, 187, 222, 256, 316, 350, 386, 421, 456, 491])
KERNEL = np.ones((3, 3), np.uint8)
THRESHOLDS = (.50, .46, .14, .14, .14)
CHECKER_COLORS = ('white', 'dark')


def softmax(values):
    values = np.exp(values - values.max(axis=-1, keepdims=True))
    return values / values.sum(axis=-1, keepdims=True)


def model(root, name):
    return cv2.dnn.readNetFromONNX(str(root / (name + '.onnx')))


def center_crop(image, x, y, pad=16):
    padded = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_REFLECT_101)
    return padded[y:y+2*pad, x:x+2*pad]


def evaluate_patches(network, patches):
    if not patches:
        return []
    network.setInput(cv2.dnn.blobFromImages(patches, 1/255))
    return softmax(network.forward())


def skip_nearby(candidates, radius):
    kept = []
    for x, y, score in sorted(candidates, key=lambda entry: -entry[2]):
        if all((x-a)**2 + (y-b)**2 > radius**2 for a,b,_ in kept):
            kept.append((x,y,score))
    return kept


def point_for(x, y):
    if x < 53:
        return 'left-tray'
    if x > 511:
        return 'right-tray'
    if 266 <= x <= 293:
        return 'bar'
    column = int(np.argmin(abs(COLUMNS-x)))
    if abs(int(COLUMNS[column])-x) > 18 or 192 <= y <= 228:
        return 'loose'
    return 12-column if y < 210 else 13+column


def hand_regions(pixels):
    b, g, r = pixels.astype(np.int16).transpose(2, 0, 1)
    warm = ((r-b > 24) & (r-g > 6) & (r > 110)).astype(np.uint8)
    warm = cv2.morphologyEx(warm, cv2.MORPH_OPEN, KERNEL)
    labels, _, boxes, _ = cv2.connectedComponentsWithStats(warm, 8)
    return [(int(x),int(y),int(x+w),int(y+h)) for x,y,w,h,a in boxes[1:] if a >= 140]


def within_hand(x, y, hands, margin=7):
    return any(l-margin <= x <= r+margin and t-margin <= y <= b+margin for l,t,r,b in hands)


def cube_centers(pixels):
    gray = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY)
    candidates = []
    for x0, x1 in ((5, 51), (514, 554)):
        _, _, boxes, centers = cv2.connectedComponentsWithStats((gray[:,x0:x1] > 194).astype(np.uint8), 8)
        for (_, _, w, h, area), (x, y) in zip(boxes[1:], centers[1:]):
            if 14<=w<=32 and 13<=h<=30 and 140<=area<=740:
                confidence = max(.1, .82 - (abs(w-23)+abs(h-22))*.032)
                candidates.append((round(float(x))+x0, round(float(y)), confidence))
    return candidates


def offered_cube_model(pixels, template):
    if template is None:
        return None
    x0,y0=60,129
    gray=cv2.cvtColor(pixels[y0:281,x0:506],cv2.COLOR_BGR2GRAY)
    response=cv2.matchTemplate(gray,template,cv2.TM_CCOEFF_NORMED)
    _,score,_,(x,y)=cv2.minMaxLoc(response)
    if score<.89:
        return None
    return {'center':[x+x0+template.shape[1]//2,y+y0+template.shape[0]//2],
            'face':4,'stake':None,'side':'playing-surface','score':round(score,3),
            'evidence':'office-3-printed-four-template'}


def white_die_centers(pixels, background):
    gray = cv2.cvtColor(pixels, cv2.COLOR_BGR2GRAY).astype(np.int16)
    bg = cv2.cvtColor(background, cv2.COLOR_BGR2GRAY).astype(np.int16)
    signal = ((gray-bg > 19) & (gray > 209)).astype(np.uint8)
    signal[:13] = 0
    signal[-13:] = 0
    signal[:,:58] = 0
    signal[:,263:296] = 0
    signal[:,506:] = 0
    signal = cv2.morphologyEx(signal,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    _, _, boxes, centers = cv2.connectedComponentsWithStats(signal, 8)
    for (_, _, w, h, area), (x, y) in zip(boxes[1:], centers[1:]):
        if 7<=w<=22 and 7<=h<=22 and 41<=area<=245:
            yield round(float(x)-1),round(float(y)-1),.17


class GameVision:
    def __init__(self, models=WORK/'models'):
        self.locator = model(models, 'locator')
        self.dice = model(models, 'dice_real' if (models/'dice_real.onnx').exists() else 'dice')
        self.cube = model(models, 'cube_real' if (models/'cube_real.onnx').exists() else 'cube')
        self.background = cv2.imread(str(WORK/'review/clean-board.jpg'))
        template=models/'cube-four-template.png'
        self.offer_template=cv2.imread(str(template),cv2.IMREAD_GRAYSCALE) if template.exists() else None

    def locate(self, pixels):
        self.locator.setInput(cv2.dnn.blobFromImage(pixels,1/255))
        field = 1/(1+np.exp(-np.clip(self.locator.forward()[0],-30,30)))
        peaks = []
        for k, grid in enumerate(field):
            rows, columns = np.where((grid > THRESHOLDS[k]) & (grid == cv2.dilate(grid,KERNEL)))
            peaks.append([(int(x)*4,int(y)*4,float(grid[y,x])) for y,x in zip(rows,columns)])
        return peaks

    def observations(self, pixels):
        peaks = self.locate(pixels)
        hands = hand_regions(pixels)
        checkers = []
        for kind, color in enumerate(CHECKER_COLORS):
            for x,y,score in skip_nearby(peaks[kind],20):
                zone = point_for(x,y)
                if within_hand(x,y,hands,3):
                    continue
                if isinstance(zone, int) or zone == 'bar' or zone == 'loose':
                    checkers.append({'color': color, 'center': [x,y], 'zone': zone,
                                     'score': round(score,3)})
        dice_candidates = peaks[2] + peaks[3] + list(white_die_centers(pixels,self.background))
        dice_candidates = [(x,y,score) for x,y,score in dice_candidates
            if 61<=x<=505 and 19<=y<=402 and not 264<=x<=295 and not within_hand(x,y,hands,4)
            and all((x-a)**2+(y-b)**2 > 18**2 for a,b in (c['center'] for c in checkers))]
        dice_candidates = skip_nearby(dice_candidates,12)[:12]
        dice = []
        for (x,y,score), odds in zip(dice_candidates,evaluate_patches(self.dice,[center_crop(pixels,x,y) for x,y,_ in dice_candidates])):
            top = int(odds.argmax())
            crop = pixels[y-4:y+5,x-4:x+5]
            color = 'dark' if np.mean(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) < 145) > .24 else 'white'
            if top == 0 or (color == 'white' and score <= .17 and odds[top] < .78):
                continue
            if np.std(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)) < 6:
                continue
            margin = odds[top] - float(np.partition(odds,-2)[-2])
            confidence = float(odds[top])
            if score < .20 and confidence < .54:
                continue
            threshold = .82
            value = top if confidence >= threshold and margin >= .30 else None
            dice.append({'center':[x,y], 'color':color,'value':value,'candidateValue':top,'score':round(confidence,3),
                         'locationScore':round(score,3)})
        cubes = cube_centers(pixels)
        cubes.extend((x,y,score) for x,y,score in peaks[4] if x<=45 or x>=518 or
                     (score>=.185 and 60<x<505 and 40<y<380 and not 262<x<294 and
                     all((x-a)**2+(y-b)**2>20**2 for a,b in (c['center'] for c in checkers))))
        cubes = skip_nearby([(x,y,s) for x,y,s in cubes if not within_hand(x,y,hands,0)],12)[:5]
        cube = None
        read_cubes = []
        for (x,y,score), odds in zip(cubes,evaluate_patches(self.cube,[center_crop(pixels,x,y) for x,y,_ in cubes])):
            i = int(odds.argmax())
            if i == 0:
                continue
            probability = float(odds[i])
            tray = x<=47 or x>=516
            quality = score*.49+probability*.51 if tray else score*.35+probability*.65
            if tray or (probability>=.92 and FACES[i] in (4,8,16,32,64)):
                read_cubes.append((quality, x,y,i,probability))
        if read_cubes:
            quality,x,y,i,confidence = max(read_cubes)
            if quality >= .45:
                face = FACES[i] if confidence >= .86 else None
                side = ('near-side' if y>285 else 'far-side' if y<130 else 'centered'
                        ) if x<=47 or x>=516 else 'playing-surface'
                if face == 64 and side != 'centered':
                    face = None
                stake = None if side=='playing-surface' else 1 if side=='centered' and face==64 else face
                cube = {'center':[x,y],'face':face,'stake':stake,'side':side,'score':round(confidence,3)}
        offer=offered_cube_model(pixels,self.offer_template)
        if offer is not None and not within_hand(*offer['center'],hands,2):
            cube=offer
        points = [[0,0] for _ in range(24)]
        bar = [0,0]
        for checker in checkers:
            slot = checker['zone']
            color = CHECKER_COLORS.index(checker['color'])
            if slot == 'bar':
                bar[color] += 1
            elif isinstance(slot,int):
                points[slot-1][color] += 1
        totals = [bar[k]+sum(p[k] for p in points) for k in range(2)]
        tray = self.tray_presence(pixels,hands)
        conflicting = any(a and b for a,b in points) or any(t>15 for t in totals)
        off = [None,None]
        if not hands and not conflicting and not any(c['zone']=='loose' for c in checkers):
            for k, total in enumerate(totals):
                if total == 15 or tray[k]:
                    off[k] = 15-total
        status = 'occluded' if hands else 'ambiguous' if conflicting else 'partial'
        if status == 'partial' and all(x is not None for x in off):
            status = 'inferred-tray' if any(off) else 'all-30-visible'
        occluded_points = [p for p in range(1,25) if self.occluded(p,hands)]
        return {'checkers':checkers,'points':points,'bar':bar,'borneOff':off,'visibleCheckerTotals':totals,
                'trayEvidence':tray,'checkerStatus':status,'occludedPoints':occluded_points,
                'handRegions':hands,'dice':dice,'cube':cube,
                'position': {'points':points,'bar':bar,'borneOff':off} if status in ('all-30-visible','inferred-tray') else None}

    @staticmethod
    def occluded(point, hands):
        top = point <= 12
        x = COLUMNS[12-point if top else point-13]
        low, high = (13,198) if top else (222,407)
        return any(l-14<=x<=r+14 and t<=high and b>=low for l,t,r,b in hands)

    def tray_presence(self,pixels,hands):
        gray = cv2.cvtColor(pixels,cv2.COLOR_BGR2GRAY).astype(np.int16)
        background = cv2.cvtColor(self.background,cv2.COLOR_BGR2GRAY).astype(np.int16)
        white, dark = False, False
        for left,right in ((8,47),(516,552)):
            for y in range(8,391,9):
                x = (left+right)//2
                if within_hand(x,y,hands,12):
                    continue
                patch = gray[y:y+19,left:right]
                difference = patch-background[y:y+19,left:right]
                # White edges in the storage trough have long bright horizontal
                # stripes. Dark checker faces or edge stacks occupy a broad strip.
                white |= bool(np.mean(patch>217)>.42 and np.mean(difference>30)>.42)
                dark |= bool(np.mean((patch<111)&(difference<-10))>.45)
        return [white,dark]


class RollState:
    def __init__(self):
        self.previous = None
        self.last = None
        self.since = 0

    def update(self, evidence, seconds):
        dice = evidence['dice']
        choice = None
        if len(dice) == 2 and all(d['value'] is not None for d in dice):
            choice = sorted((d['value'], *d['center']) for d in dice)
        ready = False
        if choice and self.previous and all(a[0]==b[0] and (a[1]-b[1])**2+(a[2]-b[2])**2<=7**2
                                             for a,b in zip(choice,self.previous)):
            ready = seconds-self.since >= .19
        else:
            self.since = seconds
            self.previous = choice
        current = sorted(x[0] for x in choice) if ready else None
        if current is not None:
            self.last = {'values':current,'observedAtSeconds':seconds}
        evidence['currentRoll'] = current
        evidence['rollStatus'] = 'settled-visible' if ready else 'unresolved' if dice else 'not-visible'
        evidence['lastSettledRollInClip'] = self.last
        return evidence


def describe(pixels, row):
    out = pixels.copy()
    state = row.get('state')
    if state:
        for c in state['checkers']:
            x,y = c['center']
            color = (154,234,104) if c['color']=='white' else (255,178,69)
            cv2.circle(out,(x,y),15,color,1,cv2.LINE_AA)
        for d in state['dice']:
            x,y = d['center']
            cv2.rectangle(out,(x-9,y-9),(x+9,y+9),(0,230,255),1)
            cv2.putText(out,str(d['value'] or '?'),(x+9,y-7),0,.53,(40,240,255),1,cv2.LINE_AA)
        cube=state['cube']
        if cube:
            x,y=cube['center']
            cv2.rectangle(out,(x-12,y-12),(x+12,y+12),(68,155,255),1)
        for l,t,r,b in state['handRegions']:
            cv2.rectangle(out,(l,t),(r,b),(98,120,255),1)
    image = cv2.copyMakeBorder(out,25,39,0,0,cv2.BORDER_CONSTANT,value=(23,26,33))
    def text(value,origin,scale=.47):
        cv2.putText(image,str(value),origin,0,scale,(235,239,246),1,cv2.LINE_AA)
    text(f"Office-3  |  clip {row['clip']:02}  |  {row['seconds']:.2f}s", (8,17))
    if state:
        cube = state['cube']
        text(f"Roll {state['currentRoll'] or '?'}   Cube {(cube and cube['stake']) or '?'}   Checkers {state['visibleCheckerTotals']}  {state['checkerStatus']}", (8,465))
    else:
        text("Board untracked", (8,465))
    return image


def infer_clip(job):
    video_path, preview, force = job
    cv2.setNumThreads(1)
    result = WORK/'state'/f'{video_path.stem}.jsonl.gz'
    if result.exists() and not force and not preview:
        return {'source':video_path.name,'status':'exists'}
    temporary = result.with_suffix('.part.gz')
    truth = WORK/'tracking'/f'{video_path.stem}.jsonl.gz'
    vision = GameVision()
    temporal = RollState()
    stats = Counter()
    if preview:
        writer = av.open(str(WORK/'review'/f'annotated-{video_path.name}'),'w',options={'movflags':'+faststart'})
        stream = writer.add_stream('libx264',rate=25)
        stream.width,stream.height,stream.pix_fmt=560,484,'yuv420p'
        stream.codec_context.time_base=Fraction(1,90000)
        stream.options={'crf':'19','preset':'veryfast','threads':'2'}
    with av.open(str(video_path)) as reader,gzip.open(truth,'rt') as positions,gzip.open(temporary,'wt',compresslevel=2) as output:
        for frame, line in zip(reader.decode(video=0),positions,strict=True):
            row = json.loads(line)
            if frame.pts is None or abs(float(frame.pts*frame.time_base)-row['outputPts90k']/90000)>.0002:
                raise ValueError(f'Frame mismatch {video_path} {row["frame"]}')
            state = None
            stats['frames'] += 1
            pixels = None
            if row['board']['status'] == 'tracked':
                pixels = frame.to_ndarray(format='bgr24')
                state = temporal.update(vision.observations(pixels),row['seconds'])
                stats[state['checkerStatus']] += 1
                if state['currentRoll']:
                    stats['settledRoll'] += 1
                if state['cube'] and state['cube']['face']:
                    stats['cubeFace'] += 1
                if state['cube'] and state['cube']['stake']:
                    stats['cubeStake'] += 1
            else:
                stats['untracked'] += 1
                temporal.previous = None
            row['state'] = state
            output.write(json.dumps(row,separators=(',',':'))+'\n')
            if preview:
                image = describe(pixels if pixels is not None else np.zeros((420,560,3),np.uint8),row)
                out = av.VideoFrame.from_ndarray(image,format='bgr24')
                out.pts,out.time_base=row['outputPts90k'],Fraction(1,90000)
                for packet in stream.encode(out):writer.mux(packet)
    if preview:
        for packet in stream.encode():writer.mux(packet)
        writer.close()
    os.replace(temporary,result)
    return {'source':video_path.name, **stats}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation',required=True)
    t = sub.add_parser('infer')
    t.add_argument('--jobs',type=int,default=4)
    t.add_argument('--start',type=int,default=0)
    t.add_argument('--stop',type=int)
    t.add_argument('--preview',action='store_true')
    t.add_argument('--force',action='store_true')
    single = sub.add_parser('predict-image')
    single.add_argument('image',type=Path)
    single.add_argument('--raw',action='store_true',help='Apply Office-3 unwarp and track the native 1920×1080 frame first')
    single.add_argument('--repo',type=Path,default=CALIBRATION_REPO)
    q = sub.add_parser('query')
    q.add_argument('clip',help='Source filename or zero-based clip number')
    group = q.add_mutually_exclusive_group(required=True)
    group.add_argument('--frame',type=int)
    group.add_argument('--seconds',type=float)
    args = parser.parse_args()
    if args.operation == 'predict-image':
        cv2.setNumThreads(1)
        pixels = cv2.imread(str(args.image))
        if pixels is None:
            parser.error('Could not read input image')
        tracked = None
        if args.raw:
            from board_video import BoardTracker,pixel_roi,table_warp
            if pixels.shape != (1080,1920,3):
                parser.error('Expected native 1920×1080 Office-3 camera pixels')
            with table_warp(args.repo) as warp:
                pixels, tracked = BoardTracker().find(pixel_roi(warp.apply(pixels)))
        elif pixels.shape != (420,560,3):
            parser.error('Expected a 560×420 stabilized crop, or use --raw')
        state = GameVision().observations(pixels) if pixels is not None else None
        print(json.dumps({'board':tracked,'state':state,'rollStatus':'single-frame-no-settling-evidence'},indent=2))
        return
    if args.operation == 'query':
        if args.clip.isdigit():
            sources = sorted((WORK/'board').glob('office-3-wide_*.mp4'))
            if int(args.clip)>=len(sources):
                parser.error('Clip index is out of range')
            source = sources[int(args.clip)]
            path = WORK/'state'/f'{source.stem}.jsonl.gz'
        else:
            path = WORK/'state'/f'{Path(args.clip).stem}.jsonl.gz'
        if not path.is_file():
            parser.error('No state file for that clip')
        with gzip.open(path,'rt') as f:
            rows = (json.loads(line) for line in f)
            if args.frame is not None:
                row = next((r for r in rows if r['frame']==args.frame),None)
            else:
                row = min(rows,key=lambda r:abs(r['seconds']-args.seconds))
        if row is None:
            parser.error('No matching frame')
        decision_file=WORK/'decisions.json'
        if decision_file.exists():
            clips=json.loads(decision_file.read_text())['clips']
            clip=next((c for c in clips if c['clip']==row['clip']),None)
            if clip is not None:
                seconds=row['seconds']
                for lane,out_name in (('analyses','checkerAnalyses'),('conditional','conditionalAnalyses'),
                                      ('reviewedCubeOffers','cubeAnalyses')):
                    row[out_name]=[a for a in clip.get(lane,[])
                                   if a['startSeconds']<=seconds<=a['endSeconds']]
        print(json.dumps(row,indent=2))
        return
    (WORK/'state').mkdir(exist_ok=True)
    paths = sorted(p for p in (WORK/'board').glob('*.mp4') if '.part.' not in p.name)[args.start:args.stop]
    jobs = [(path,args.preview,args.force) for path in paths]
    if args.jobs == 1:
        for job in jobs:print(json.dumps(infer_clip(job)),flush=True)
    else:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for result in pool.map(infer_clip,jobs):
                print(json.dumps(result),flush=True)


if __name__ == '__main__':
    main()
