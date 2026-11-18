"""Resolve the filmed values on a game timeline and label their evidence."""
from __future__ import annotations
from bisect import bisect_right
from collections import Counter,defaultdict
from itertools import combinations
from pathlib import Path

import sys as _sys

_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from project_paths import ARTIFACT_DIR
import gzip,json,math

OUT=ARTIFACT_DIR / 'v3'
ROOT=OUT.parent
BASE=ROOT/'v2'
FPS=25


def extract_game(game,clips,tracks):
    rows=[];ds=[];cs=[];breaks=[]
    for segment in game['segments']:
        clip=segment['clip']
        first,last=segment['firstFrame'],segment['lastExclusive']
        at=segment['firstGameFrame']; shift=at-first
        rows.extend(clips[clip][first:last])
        if segment['discontinuity']:breaks.append(at)
        for raw, dest in ((tracks[clip]['dice'],ds),(tracks[clip]['cube'],cs)):
            for track in raw:
                if track['end']<first or track['start']>=last:continue
                dest.append({**track,'start':max(first,track['start'])+shift,
                          'end':min(last-1,track['end'])+shift,'clip':clip})
    assert len(rows)==game['frames']
    return rows,ds,cs,breaks


def distance(a,b):
    return math.hypot(a['x']-b['x'],a['y']-b['y'])


def combine_dice(tracks,breaks):
    clean=[t for t in tracks if t['value'] and t['location']>=.235 and t['samples']>=7]
    out=[]
    for t in sorted(clean,key=lambda d:d['start']):
        merge=next((a for a in reversed(out) if a['value']==t['value'] and
          distance(a,t)<8.0 and -8<=t['start']-a['end']<=27 and
          not any(a['end']<p<=t['start'] for p in breaks)),None)
        if merge:
            merge['end']=max(merge['end'],t['end']);merge['samples']+=t['samples']
            merge['quality']=max(merge['quality'],t['quality'])
            merge['witnesses'].append(t['id'])
        else:
            out.append({**t,'witnesses':[t['id']]})
    return out


def same_pair(x,y):
    a,b=x['tracks'];c,d=y['tracks']
    return min(max(distance(a,c),distance(b,d)),max(distance(a,d),distance(b,c)))<15


def direct_pairs(tracks,breaks,compatible=None):
    pairs=[]
    for a,b in combinations(tracks,2):
        if compatible is not None and not compatible(a,b):continue
        start=max(a['start'],b['start']); end=min(a['end'],b['end'])
        shorter=min(a['end']-a['start'],b['end']-b['start'])
        if end-start<10 or abs(a['start']-b['start'])>47 or end-start<shorter*.54:
            continue
        if distance(a,b)<13 or any(start<p<=end for p in breaks):
            continue
        shared=a['color']==b['color']
        quality=min(a['quality'],b['quality'])+.065*shared+.015*min(1,(end-start)/40)
        if quality < .64 or (not shared and quality<.65):
            continue
        origin= min(a['start'],b['start']) if abs(a['start']-b['start'])<=13 else start
        retained_end=max(a['end'],b['end']) if abs(a['end']-b['end'])<=17 else end
        pairs.append({'start':origin,'end':retained_end,'lastBothSeen':end,'dice':sorted([a['value'],b['value']]),
            'tracks':[a,b],'quality':round(quality,3),'source':'tracked-vision'})
    selected=[]
    for pair in sorted(pairs,key=lambda x:(x['quality'],x['lastBothSeen']-x['start']),reverse=True):
        if any(max(q['start'],pair['start'])<=min(q['end'],pair['end']) and
               min(q['end'],pair['end'])-max(q['start'],pair['start'])>=11 for q in selected):
            continue
        selected.append(pair)
    merged=[]
    for pair in sorted(selected,key=lambda q:q['start']):
        previous=merged[-1] if merged else None
        if previous and previous['dice']==pair['dice'] and same_pair(previous,pair) and 0<=pair['start']-previous['end']<=32:
            previous['lastBothSeen']=max(previous['lastBothSeen'],pair['lastBothSeen'])
            previous['end']=max(previous['end'],pair['end'])
        else:
            merged.append(pair)
    return merged


def actions_for(game):
    actions=[]
    for d in game['analyses']:
        evidence=d['evidence']
        source='inferred-from-play' if 'partial-dice' in evidence else 'earlier-vision-and-play'
        actions.append({'start':max(0,round(d['startSeconds']*FPS)),
          'end':round(d['endSeconds']*FPS),'dice':sorted(d['dice']),'source':source,
          'grade':d.get('countedInGameLoss',False),'evidence':evidence})
    for d in game['conditional']:
        if d['endSeconds']-d['startSeconds']<.65:continue
        actions.append({'start':max(0,round(d['startSeconds']*FPS)),
          'end':round(d['endSeconds']*FPS),'dice':sorted(d['dice']),'source':'earlier-vision',
          'grade':False,'evidence':d['evidence']})
    return actions


def active_rolls(events,individual,actions,frames,breaks):
    ends=[i['start'] for i in events]
    array=[]
    for i in range(frames):
        j=bisect_right(ends,i)-1
        event=events[j] if j>=0 and not any(events[j]['start']<b<=i for b in breaks) else None
        calls=[r for r in actions if r['start']<=i<=r['end']]
        call=next((r for r in calls if r['grade']),None) or next(iter(calls),None)
        value=None
        if event is not None and i<=event['end']+33:
            if call and call['grade'] and event['dice']!=call['dice']:
                value={'dice':None,'status':'review-conflict','otherRead':event['dice'],'reviewDice':call['dice']}
            else:
                if i<=event['lastBothSeen']:
                    how='vision-track'
                else:
                    how='carried'
                value={'dice':event['dice'],'status':how,
                   'source':event['source'],'witnessTracks':sorted(set(t for l in event['tracks'] for t in l['witnesses']))}
                if call and call['dice']!=value['dice']:
                    value['reviewDice']=call['dice']
                    value['reviewInputDiffers']=True
        if value is None and call and call['source']!='inferred-from-play':
            value={'dice':call['dice'],'status':'carried','source':call['source']}
        elif value is None and call:
            value={'dice':call['dice'],'status':'inferred','source':call['source']}
        if value is None:
            candidates=[t for t in individual if t['start']<=i<=t['end'] and
                        t['quality']>=.85 and t['samples']>=12]
            if len(candidates)==1:
                t=candidates[0]
                value={'dice':[t['value'],None],'status':'partial-track','source':'one-visible-die',
                       'witnessTracks':t['witnesses']}
        if value is None and event and i<=event['end']+250:
            value={'dice':event['dice'],'status':'last','source':event['source']}
        array.append(value or {'dice':None,'status':'unresolved'})
    return array


def verified_cube_events(game,cubes):
    # Each fixed pose is a separate observation; agreement bridges intervals in
    # which the position stays stable or the cube is hidden by play.
    by_key=defaultdict(list)
    for c in cubes:
        if c['face'] is not None and c['end']-c['start']>=10:
            key=(c['face'],c['side'])
            by_key[key].append(c)
    eligible=[]
    for (face,side),rows in by_key.items():
        min_support=7 if side=='playing-surface' else 12
        for c in rows:
            enough=(c['visibleSamples']>=min_support or c['multiviewConfidence']>=.93)
            if enough and (side=='playing-surface' or (c['stake'] in (1,2,4,8,16,32))):
                eligible.append(c)
    for entry in game['reviewedCubeOffers']:
        eligible.append(dict(start=entry['startFrame'],end=entry['endFrame'],face=entry['offeredFace'],
                    stake=None,side='playing-surface',evidence='reviewed-cube-offer',
                    preOfferStake=entry['preOfferStake'], visibleSamples=18))
    return sorted(eligible,key=lambda e:(e['start'],e['evidence']=='reviewed-cube-offer'))


def lasting_cube(game,cubes,breaks):
    frames=game['frames']; events=verified_cube_events(game,cubes)
    out=[]; index=0; confirmed=None; pending=None; latest=None
    if game['number']>1:
        confirmed={'stake':1,'face':None,'evidence':'standard-opening'}
    for i in range(frames):
        if i in breaks:
            confirmed=pending=latest=None
        while index<len(events) and events[index]['start']==i:
            e=events[index]; index+=1
            side=e['side'];offer=side=='playing-surface'
            if offer and e['face']!=4:continue
            if offer:
                old=e.get('preOfferStake',confirmed and confirmed['stake'])
                # An offer displayed as a jump has to double the last stake.
                if old is not None and e['face']==old*2:
                    pending={'stake':old,'offer':e['face'],'face':e['face'],
                      'status':'offer','evidence':e['evidence']}
                    latest=e
            elif not offer:
                if game['number']>1 and i<30 and e['stake']!=1:continue
                confirmed={'stake':e['stake'],'face':e['face'],'evidence':e['evidence']}
                pending=None; latest=e
        if pending:
            out.append(pending);continue
        if not confirmed:
            out.append({'stake':None,'face':None,'status':'unresolved'});continue
        strong=latest is not None and i<=latest['end']
        out.append({**confirmed,'status':'vision-track' if strong else 'carried'})
    return out,events


def compare_models(labels,values):
    direct=train_hits=fuse_hits=selected_hits=0
    previous_total=0
    records={d['id']:d for t in values for d in t['dice']}
    examples=[]
    for x in labels:
        if x['split']!='test':continue
        r=records[x['id']]
        expected=x['value']
        previous_total+=1
        direct+=r['prior']==expected
        train_hits+=r['read']==expected
        fuse_hits+=r['value']==expected
        selected_hits+=r['selectedValue']==expected
        examples.append({'id':x['id'],'expected':expected,'previous':r['prior'],'trained':r['read'],
              'combined':r['value']})
    return {'counts':{'testTracks':previous_total,'oldVoteCorrect':direct,'newReaderCorrect':train_hits,
             'combinedCorrect':fuse_hits,'combinedBeforeAbstentionCorrect':selected_hits,'combinedReads':sum(e['combined'] is not None for e in examples)},
             'examples':examples}


def reviewed_pairs(labels,converted):
    ids={}
    for t in labels:
        if t['split']=='test':
            ids[t['id']]=t['value']
    examples=[]; matched=0
    candidates=[]
    for a,b in combinations(converted,2):
        if a['id'] not in ids or b['id'] not in ids:continue
        if a['clip']!=b['clip']:continue
        first=max(a['start'],b['start']);end=min(a['end'],b['end'])
        if end-first<14 or abs(a['start']-b['start'])>45 or distance(a,b)<13:
            continue
        candidates.append({'start':first,'end':end,'ids':[a['id'],b['id']],
            'dice':sorted([ids[a['id']],ids[b['id']]]),'geometry':[a,b]})
    unique=[]
    for t in sorted(candidates,key=lambda a:(a['end']-a['start']),reverse=True):
        if any(p['start']<=t['end'] and p['end']>=t['start'] for p in unique):continue
        unique.append(t)
    return unique


def main():
    timeline=json.loads((BASE/'timeline.json').read_text())['games']
    tracks=json.loads((OUT/'value-tracks.json').read_text())
    labels=json.loads((OUT/'temporal-dice-labels.json').read_text())
    correction_file=OUT/'reviewed-corrections.json'
    corrections=json.loads(correction_file.read_text()) if correction_file.exists() else []
    files=sorted((BASE/'state').glob('*.jsonl.gz'))
    clips=[]
    for p in files:
        with gzip.open(p,'rt') as f:
            clips.append([json.loads(line) for line in f])
    metrics=compare_models(labels,tracks)
    report=[]; pair_gold=[]
    for game_index in timeline:
        number=game_index['number']
        game=json.loads((BASE/f'game-{number}-analysis.json').read_text())
        rows,ds,cs,breaks=extract_game(game,clips,tracks)
        individual=combine_dice(ds,breaks)
        events=direct_pairs(individual,breaks)
        dice=active_rolls(events,individual,actions_for(game),len(rows),breaks)
        cube, cube_events=lasting_cube(game,cs,breaks)
        test=reviewed_pairs(labels,ds)
        for item in test:
            at=(item['start']+item['end'])//2
            model=next((e['dice'] for e in events if e['start']<=at<=e['end']),None)
            pair_gold.append({'game':number,'frame':at,'expected':item['dice'],'tracked':model,
                 'ids':item['ids']})
        checks=Counter()
        with gzip.open(OUT/f'game-{number:02}-current.jsonl.gz','wt',compresslevel=4) as out:
            for i,((a,b),row) in enumerate(zip(zip(dice,cube),rows)):
                raw=row['state']
                corrected=next((c for c in corrections if c['clip']==row['clip'] and
                               c['first']<=row['frame']<=c['last']),None)
                if corrected:
                    a={'dice':corrected['dice'],'status':corrected['status'],
                       'source':'manual-multiframe-review','reviewNote':corrected['note']}
                    action=next((r for r in actions_for(game) if r['start']<=i<=r['end']),None)
                    if action is not None and action['dice']!=a['dice']:
                        a.update(reviewInputDiffers=True,reviewDice=action['dice'])
                if raw is None:
                    a={'dice':None,'status':'board-untracked'}
                    b={**b,'status':'last' if b['stake'] else 'unresolved'}
                status=a['status'];checks['dice-'+status]+=1
                checks['cube-'+b['status']]+=1
                if raw:
                    checks['baseline-current-roll']+=raw['currentRoll'] is not None
                    checks['baseline-cube']+=bool(raw['cube'] and raw['cube']['stake'])
                output={'frame':i,'clip':row['clip'],'sourceFrame':row['frame'],'sourcePts':row['pts'],
                         'sourceTimeBase':row['timeBase'],'roll':a,'cube':b}
                out.write(json.dumps(output,separators=(',',':'))+'\n')
        plain=[{k:v for k,v in e.items() if k!='tracks'} for e in events]
        (OUT/f'game-{number:02}-value-events.json').write_text(json.dumps({'rolls':plain,'cube':cube_events},indent=2)+'\n')
        report.append({'game':number,'frames':len(rows),'rollEpisodes':len(events),'cubeObservations':len(cube_events),
                       'coverage':dict(checks)})
        print(json.dumps(report[-1]),flush=True)
    pair_values={'reviewed':len(pair_gold),'read':sum(a['tracked'] is not None for a in pair_gold),
           'correct':sum(a['tracked']==a['expected'] for a in pair_gold),'examples':pair_gold}
    (OUT/'context-validation.json').write_text(json.dumps({'diceTrackValidation':metrics,
         'pairValidation':pair_values,'games':report},indent=2)+'\n')
    print('Track values',metrics['counts'],'paired holds',{k:v for k,v in pair_values.items() if k!='examples'},flush=True)

if __name__=='__main__':main()
