#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Excluded deterministic cases validate a native worker before collection."""
import argparse, hashlib, json, subprocess
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('native',type=Path)
parser.add_argument('--record-fixture',action='store_true')
parser.add_argument('--output',type=Path)
args=parser.parse_args();root=args.native.resolve()
old=json.loads((FAMILY/'docs/fullgame-remote-validation.json').read_bytes())
prior=json.loads((FAMILY/'docs/fullgame-ablation-inputs.json').read_bytes())
plan=json.loads((FAMILY/'docs/cube-policy-study-inputs.json').read_bytes())
fields=['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies']
cases=[]
for r in old['results']:
 d=next(d for d in prior['plan'] if d['id']==r['id']);c=next(c for c in d['candidates'] if c['board']==r['board']);p=next(p for p in prior['policies'] if p['id']==r['policy'])
 cases.append({'name':r['id']+'|'+r['policy']+'|'+r['board'],'input':[c['original'],c['after'],2,old['seed']]+[p[k] for k in fields]+[0,0,1,0],'expected':r['value']})
for c in plan['plan'][0]['candidates']:
 for name,checker,rules,filter,cache in [('legacy',2,0,0,0),('cache',2,0,0,1),('matched',2,3,0,1),('wide',2,3,1,1),('deep',3,3,2,1)]:
  cases.append({'name':c['role']+'|'+name,'input':[c['original'],c['after'],2,31811004,checker,2,0,0,checker,2,2,rules,filter,1,cache]})
lines=''.join('\t'.join(map(str,c['input']))+'\n' for c in cases)
r=subprocess.run([str(root/'gnubg-core')],cwd=root,input=lines,capture_output=True,text=True,check=True)
values=[json.loads(s) for s in r.stdout.splitlines() if s.startswith('{')]
assert len(values)==len(cases)==26
fixture_path=FAMILY/'docs/cube-policy-v2-smoke-fixture.json'
if args.record_fixture:
 fixture={'schema':1,'binarySHA256':hashlib.sha256((root/'gnubg-core').read_bytes()).hexdigest(),'seed':31811004,'trialsPerCase':2,'excludedFromStudy':True,'cases':[{'name':c['name'],'value':v} for c,v in zip(cases[16:],values[16:])]}
 fixture_path.write_text(json.dumps(fixture,indent=2)+'\n')
fixture=json.loads(fixture_path.read_bytes())
for c,e in zip(cases[16:],fixture['cases']):
 assert c['name']==e['name'];c['expected']=e['value']
maximum=0.0;exact=True
numeric={'equity','cubeless','standardError','mwc','probabilities'}
for c,v in zip(cases,values):
 for key,want in c['expected'].items():
  got=v[key];exact &= got==want
  if key in numeric and want is not None:
   diffs=[abs(a-b) for a,b in zip(got,want)] if isinstance(want,list) else [abs(got-want)]
   maximum=max(maximum,*diffs)
   assert max(diffs)<=1e-5,(c['name'],key,max(diffs))
  else:assert got==want,(c['name'],key)
build=json.loads((root/'build.json').read_bytes())
assert hashlib.sha256((root/'gnubg-core').read_bytes()).hexdigest()==build['binarySHA256']
result={'schema':1,'binarySHA256':build['binarySHA256'],'platform':build['platform'],'architecture':build['architecture'],'cases':26,'legacyCases':16,'policyCases':10,'trialsPerCase':2,'allWithinTolerance':True,'allFieldsExact':exact,'maxNumericDifference':maximum,'tolerance':1e-5,'fixtureSHA256':hashlib.sha256(fixture_path.read_bytes()).hexdigest(),'scriptSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
dest=args.output or FAMILY/'docs/cube-policy-v2-platform-validation.json'
dest.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
