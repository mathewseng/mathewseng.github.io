#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the identical ARM64 executable on the connected compute host."""
import json,subprocess,concurrent.futures,pathlib,hashlib,datetime
FAMILY=pathlib.Path(__file__).resolve().parents[1]
LOCAL='/tmp/bg-fullgame-ablation-v1'
REMOTE='/tmp/codex-backgammon-fullgame-01a15639'
plans=json.loads((FAMILY/'docs/rollout-diagnostic-inputs.json').read_bytes())['plan']
policies={'short':[2,2,5,2,1,2,2],'full-matched':[2,2,0,2,1,2,2],'full-strong':[2,2,0,0,2,2,2],'full-cube3':[2,3,0,0,2,3,2]}
ssh=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=5','mattgpt']
build=json.loads(pathlib.Path(LOCAL,'build.json').read_bytes())
remote_hash=subprocess.check_output(ssh+['shasum -a 256 '+REMOTE+'/gnubg-core'],text=True).split()[0]
assert remote_hash==build['binarySHA256']==hashlib.sha256(pathlib.Path(LOCAL,'gnubg-core').read_bytes()).hexdigest()

def run(remote):
 command=ssh+['cd '+REMOTE+' && exec ./gnubg-core'] if remote else [LOCAL+'/gnubg-core']
 p=subprocess.Popen(command,cwd=LOCAL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
 assert p.stdout.readline().strip()=='READY'
 out=[]
 try:
  for d in [plans[0],plans[6]]:
   for c in d['candidates']:
    for policy,args in policies.items():
     p.stdin.write('\t'.join(map(str,[c['original'],c['after'],2,987654321,*args]))+'\n');p.stdin.flush()
     out.append({'id':d['id'],'board':c['board'],'policy':policy,'value':json.loads(p.stdout.readline())})
  p.stdin.close();assert p.wait(timeout=15)==0
 finally:
  if p.poll() is None:p.terminate();p.wait()
 return out
with concurrent.futures.ThreadPoolExecutor(2) as ex:
 local,remote=list(ex.map(run,[False,True]))
assert local==remote,[(i,x,y) for i,(x,y) in enumerate(zip(local,remote)) if x!=y]
report={'schema':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'mattgpt','binarySHA256':remote_hash,'cases':len(local),'trialsPerCase':2,'seed':987654321,'exactJSONParity':True,
 'remoteArchitecture':subprocess.check_output(ssh+['uname -m'],text=True).strip(),'remoteOS':subprocess.check_output(ssh+['sw_vers -productVersion'],text=True).strip(),'results':local}
(FAMILY/'docs/fullgame-remote-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('Same executable hash and all',len(local),'seeded native JSON results match exactly')
