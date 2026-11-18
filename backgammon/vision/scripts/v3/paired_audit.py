"""Build a blinded sample of further paired crops for an after-freeze check."""
from itertools import combinations
from collections import defaultdict
from pathlib import Path
import json,math,sys
import cv2,numpy as np
from dice_tracks import ROOT,OUT,state_rows

def main():
 cv2.setNumThreads(1)
 history=json.loads((OUT/'value-tracks.json').read_text())
 used={r['id'] for r in json.loads((OUT/'temporal-dice-labels.json').read_text())}
 games=json.loads((ROOT/'v2/timeline.json').read_text())['games']
 maps=defaultdict(list); tracked={}
 for game in games:
  for s in game['segments']:maps[s['clip']].append((game['number'],s))
  tracked[game['number']]=json.loads((OUT/f'game-{game["number"]:02}-value-events.json').read_text())['rolls']
 candidates=[]
 for clip,bundle in enumerate(history):
  for a,b in combinations(bundle['dice'],2):
   if a['id'] in used and b['id'] in used: continue
   first,last=max(a['start'],b['start']),min(a['end'],b['end'])
   if last-first<24 or abs(a['start']-b['start'])>65 or math.hypot(a['x']-b['x'],a['y']-b['y'])<14:
    continue
   f=(first+last)//2
   for g,s in maps[clip]:
    if not s['firstFrame']<=f<s['lastExclusive']:continue
    i=s['firstGameFrame']+f-s['firstFrame']
    seen=next((q['dice'] for q in tracked[g] if q['start']<=i<=q['end']),None)
    candidates.append({'clip':clip,'frame':f,'game':g,'gameFrame':i,
           'a':[a['x'],a['y']],'b':[b['x'],b['y']],'prediction':seen,'duration':last-first})
 result=[];claimed=set()
 for g in range(1,6):
  by_game=[a for a in candidates if a['game']==g]
  for seen in (True,False):
   population=[a for a in by_game if bool(a['prediction'])==seen and a['clip'] not in claimed]
   for a in sorted(population,key=lambda n:-n['duration'])[:3]:
    if a['clip'] in claimed:continue
    claimed.add(a['clip']);result.append(a)
 sheet=np.full((((len(result)+7)//8)*171,8*169,3),25,np.uint8)
 for n,r in enumerate(result):
  row,col=divmod(n,8);x,y=col*169,row*171
  files=sorted((ROOT/'board').glob('*.mp4'))
  c=cv2.VideoCapture(str(files[r['clip']])); c.set(cv2.CAP_PROP_POS_FRAMES,r['frame']); status,im=c.read();c.release()
  if not status:continue
  for j,key in enumerate(('a','b')):
    a,b=[round(i) for i in r[key]]
    die=im[b-11:b+11,a-11:a+11]
    g=cv2.cvtColor(die,cv2.COLOR_BGR2GRAY)
    center=np.median(g[5:17,5:17])
    g=np.clip((g.astype(float)-center)*1.8+128,0,255).astype(np.uint8)
    p=cv2.resize(g,(80,110),interpolation=cv2.INTER_NEAREST)
    sx=x+j*82;sheet[y:y+110,sx:sx+80]=cv2.cvtColor(p,cv2.COLOR_GRAY2BGR)
  cv2.putText(sheet,str(n),(x+5,y+132),0,.55,(255,255,255),1,cv2.LINE_AA)
  cv2.putText(sheet,f'clip {r["clip"]:02}  {r["frame"]/25:.1f}s',(x+5,y+153),0,.51,(205,205,205),1,cv2.LINE_AA)
 cv2.imwrite(str(OUT/'paired-audit.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,97])
 (OUT/'paired-audit-index.json').write_text(json.dumps(result,indent=2)+'\n')
 print('New paired samples',len(result))
if __name__=='__main__':main()
