#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import json, subprocess, hashlib
from pathlib import Path
family=Path(__file__).resolve().parents[1]
old=json.loads((family/'docs/fullgame-remote-validation.json').read_text())
plan=json.loads((family/'docs/fullgame-ablation-inputs.json').read_text())
checks=[]
for row in old['results']:
    d=next(d for d in plan['plan'] if d['id']==row['id'])
    c=next(c for c in d['candidates'] if c['board']==row['board'])
    policy=next(p for p in plan['policies'] if p['id']==row['policy'])
    fields=[c['original'],c['after'],2,old['seed']]+[policy[k] for k in ['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies']]+[0,0,1]
    checks.append(fields)
root=Path('/tmp/bg-cube-study-final-v1')
p=subprocess.run([str(root/'gnubg-core')],cwd=root,input=''.join('\t'.join(map(str,r))+'\n' for r in checks),capture_output=True,text=True,check=True)
values=[json.loads(s) for s in p.stdout.splitlines() if s.startswith('{')]
assert len(values)==len(checks)==16
for prior,new in zip(old['results'],values):
    assert all(new[k]==v for k,v in prior['value'].items()), (prior['id'],prior['policy'])
result={'schema':1,'binarySHA256':hashlib.sha256((root/'gnubg-core').read_bytes()).hexdigest(),'legacyBinarySHA256':old['binarySHA256'],'cases':16,'trialsPerCase':2,'seed':old['seed'],'legacyOutputsExact':True,'cubeTransitionTests':{'cases':56,'players':2,'cubeValues':[1,2,16,128],'rulesParity':'core/rules.mjs','separateCapAndOfferDepthTests':True}}
(family/'docs/cube-policy-native-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print('16 native legacy cases reproduce every previous output field exactly')
