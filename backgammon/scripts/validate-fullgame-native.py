# SPDX-License-Identifier: GPL-3.0-or-later
# Optional native regression check; builds must exist before running.
import json,subprocess,concurrent.futures
plans=json.load(open('backgammon/docs/rollout-diagnostic-inputs.json'))['plan']
def run(build,new):
 p=subprocess.Popen([build+'/gnubg-core'],cwd=build,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 assert p.stdout.readline().strip()=='READY'
 out=[]
 for d in [plans[0],plans[6]]:
  for c in d['candidates']:
   for cfg in [[2,2,1],[2,2,0],[1,1,0]]:
    checker,cube,short=cfg
    args=[checker,cube,5 if short else 0,2 if short else 0,1 if short else checker,cube,2 if short else 0] if new else cfg
    p.stdin.write('\t'.join(map(str,[c['original'],c['after'],2,987654321,*args]))+'\n');p.stdin.flush();out.append(json.loads(p.stdout.readline()))
 p.terminate();p.wait();return out
with concurrent.futures.ThreadPoolExecutor(2) as ex:
 a,b=list(ex.map(lambda x:run(*x),[('/tmp/bg-strong-rollout-native-v3',False),('/tmp/bg-fullgame-ablation-v1',True)]))
assert a==b,[(i,x,y) for i,(x,y) in enumerate(zip(a,b)) if x!=y]
print('12 baseline/full-game parity cases exactly match')
