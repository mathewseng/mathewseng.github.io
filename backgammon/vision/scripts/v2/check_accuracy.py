from collections import Counter
import gzip,json
from pathlib import Path
import cv2,numpy as np
from vision import CameraReader,GameVision,ROOT,OUT,evaluate_patches,center_crop

def check_points():
 cv2.setNumThreads(1)
 base=GameVision(); update=CameraReader()
 old=Counter(); new=Counter(); examples=[]
 for line in (OUT/'blind-checkers.txt').read_text().splitlines():
  if line.startswith('#') or not line:continue
  key,w,d,bar=[field.strip() for field in line.split('|')]
  expected=np.zeros((24,2),int)
  for color,items in enumerate((w,d)):
   for item in items.split():
    p,n=map(int,item.split(':'));expected[p-1,color]=n
  bars=list(map(int,bar.split(',')))
  assert (expected.sum(axis=0)+bars).tolist()==[15,15],key
  im=cv2.imread(str(ROOT/'samples'/f'{key}.jpg'))
  s=base.observations(im)
  def check(state,stats):
   match=(np.array(state['points'])==expected).all(axis=1)
   b=state['bar']==bars
   stats.update(points=int(match.sum()), exact=int(match.all() and b),bars=b)
   return [i+1 for i,x in enumerate(match) if not x]
  prev=check(s,old)
  update.correct_stacks(im,s)
  curr=check(s,new)
  examples.append(dict(image=key,oldWrongPoints=prev,newWrongPoints=curr))
 labels=json.loads((ROOT/'labels'/'dice.json').read_text())
 tp=tn=pos=neg=0
 for r in labels:
  if r['split']!='test':continue
  im=cv2.imread(str(ROOT/'samples'/f'{r["image"]}.jpg'))
  x,y=r['center']
  p=center_crop(im,x,y,32)
  update.dice.setInput(cv2.dnn.blobFromImage(p,1/255))
  f=1/(1+np.exp(-update.dice.forward()[0,0]))
  found=bool(f[13:20,13:20].max()>.32)
  pos+=bool(r['value']);neg+=not r['value']
  tp+=bool(r['value']) and found;tn+=not r['value'] and not found
 old_count=Counter();new_count=Counter()
 for fi,fo in zip(sorted((ROOT/'state').glob('*.jsonl.gz')),sorted((OUT/'state').glob('*.jsonl.gz')),strict=True):
  for p,c in ((fi,old_count),(fo,new_count)):
   with gzip.open(p,'rt') as f:
    for line in f:
     row=json.loads(line);s=row['state'];c['frames']+=1
     if s:
      c['tracked']+=1
      c['withPosition']+=s['position'] is not None
      c['withRoll']+=s['currentRoll'] is not None
      c['withCube']+=bool(s['cube'] and s['cube']['face'] is not None)
      c['stackCorrections']+=bool(s.get('stackReadings'))
 result={'checkerBlind':dict(frames=len(examples),points=len(examples)*24,baseline=old,updated=new,examples=examples),
         'dieLocatorCameraPatch':dict(positive=pos,detected=tp,negative=neg,correctNegative=tn),
         'allFrames':dict(baseline=old_count,updated=new_count)}
 (OUT/'validation.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k!='checkerBlind'},indent=2))
 print('Checker blind', len(examples),old,new)
if __name__=='__main__':check_points()
