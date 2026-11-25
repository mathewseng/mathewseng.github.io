"""boxeval.py MODEL...: per truth frame, top-1 and gated (0.8 / 0.3 / both turns) reads of legible boxed objects."""
import json, re, cv2, numpy as np, onnxruntime as ort, math, sys, glob, os
CODES=[s+r for s in 'SHCD' for r in 'A23456789TJQK']+['none']
T=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'eval', 'eye-truth')
def mk(p):
    s=ort.InferenceSession(p,providers=['CPUExecutionProvider']); n=s.get_inputs()[0].name
    def run(ims):
        x=np.stack(ims).astype(np.float32)/255; x=np.concatenate([x,x[:,::-1,::-1]])
        l=s.run(None,{n:np.ascontiguousarray(x.transpose(0,3,1,2))})[0]; e=np.exp(l-l.max(1,keepdims=True)); pr=e/e.sum(1,keepdims=True); k=len(ims)
        return pr[:k],pr[k:]
    return run
runs={os.path.basename(m):mk(m) for m in sys.argv[1:]}
tot={k:[0,0,0,0] for k in runs}
for lf in sorted(glob.glob(f'{T}/labels/*.txt')):
    name=os.path.basename(lf)[:-4]; sess=name[:5]
    d=json.load(open(f'{T}/objects/{name}.json')); lab={int(m[1]):m[2] for m in (re.match(r'(\d+) (\S+)',l) for l in open(lf)) if m}
    rows={round(json.loads(l)['t'],3):json.loads(l) for l in open(f'../scan/{sess}/state.jsonl')}
    dets=rows[round(d['t'],3)]['dets']; ims=[];labs=[]
    for o in d['objects']:
        l=lab.get(o['id'],'?')
        if not re.fullmatch(r'[SHCD][A2-9TJQK]',l) or o['kind']!='box': continue
        best=min(dets,key=lambda q:math.hypot(q['x']-o['bx'],q['y']-o['by']))
        if 'crop' not in best: continue
        ims.append(cv2.imread(f"../scan/{sess}/crops/{best['crop']}")); labs.append(l)
    if not ims: continue
    line=[name]
    for k,run in runs.items():
        p1,p2=run(ims); p=(p1+p2)/2; top=p.argmax(1)
        gate=[(p[i,t]>=0.8 and p[i,t]-np.sort(p[i])[-2]>=0.3 and p1[i].argmax()==t==p2[i].argmax() and min(p1[i,t],p2[i,t])>=0.8 and t!=52) for i,t in enumerate(top)]
        right=sum(g and CODES[t]==l for g,t,l in zip(gate,top,labs)); wrong=[(CODES[t],l) for g,t,l in zip(gate,top,labs) if g and CODES[t]!=l]
        t1=sum(CODES[t]==l for t,l in zip(top,labs))
        tot[k][0]+=len(labs); tot[k][1]+=t1; tot[k][2]+=right; tot[k][3]+=len(wrong)
        line.append(f'{k}: top1 {t1}/{len(labs)} gated {right} wrong {wrong}')
    print(' | '.join(line))
for k,v in tot.items(): print(k,'boxes',v[0],'top1',v[1],'gated right',v[2],'gated WRONG',v[3])
