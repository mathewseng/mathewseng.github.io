"""survive.py SESS DIFF.json: for each name a namediff lost, whether the old sim (../sim-base-SESS.json) still reports it on the
same spot 1 s later (lost-then-back) or the slot is gone. Used to check feltHide (README)."""
import json,sys
# for each namediff loss: did the base slot (same pos, same name) still report the name 1.5 s after t1?
s=sys.argv[1]; base=json.load(open(f'../sim-base-{s}.json')); d=json.load(open(sys.argv[2]))
ts=[f['t'] for f in base]
import bisect
surv=[]; gone=[]
for x in d:
    for a,b,n in x['pairs']:
        if b is not None: continue
        i=bisect.bisect_right(ts,x['t1']+1.0)
        ok=False
        for f in base[i:i+3]:
            if any(t['card']==a and abs(t['x']-x['x'])<8 and abs(t['y']-x['y'])<8 for t in f['table']): ok=True
        (surv if ok else gone).append((x['slot'],round(x['t0'],1),round(x['t1'],1),round(x['x']),round(x['y']),a,n))
print(s,'lost-then-back',len(surv),'gone',len(gone))
for z in surv: print('  back',z)
