#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Replay excluded cases for both exact native binaries before sample collection."""
import argparse,hashlib,json,subprocess,concurrent.futures
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1];PREFIX='filtered-rollout-v1';HASH=lambda b:hashlib.sha256(b).hexdigest()
p=argparse.ArgumentParser();p.add_argument('native',type=Path);p.add_argument('--record-fixture',action='store_true');p.add_argument('--output',type=Path);args=p.parse_args();root=args.native.resolve()
plan=json.loads((FAMILY/f'docs/{PREFIX}-inputs.json').read_bytes());build=json.loads((root/'runtime-build.json').read_bytes())
fields=['checkerPlies','cubePlies','truncationPlies','lateAfterPlies','lateCheckerPlies','lateCubePlies','endpointPlies','rulesMode','filter','vrPlies','cacheContext']
cases=[]
for d in plan['plan']:
 for policy in plan['policies']:
  if d['id'] not in policy['caseIds']:continue
  choices=d['candidates'] if d['id']=='reply-7985255600f3563f-44' else d['candidates'][:1]
  for c in choices:
   cases.append({'name':'|'.join([d['id'],policy['id'],c['candidateId']]),'runtime':policy['runtime'],'input':[c['original'],c['after'],2,31811004]+[policy[k] for k in fields]})
assert len(cases)==12
for name,digest in build['binaries'].items():assert HASH((root/build['files'][name]).read_bytes())==digest
for name,digest in build['assets'].items():assert HASH((root/name).read_bytes())==digest
def run(case):
 r=subprocess.run([str(root/build['files'][case['runtime']])],cwd=root,input='\t'.join(map(str,case['input']))+'\n',capture_output=True,text=True,check=True)
 values=[json.loads(s) for s in r.stdout.splitlines() if s.startswith('{')];assert len(values)==1
 return {'name':case['name'],'runtime':case['runtime'],'value':values[0]}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,cases))
fixture_path=FAMILY/f'docs/{PREFIX}-smoke-fixture.json'
if args.record_fixture:
 old=json.loads((FAMILY/'docs/cube-policy-v2-smoke-fixture.json').read_bytes())
 for r in results:
  if r['runtime']!='legacy':continue
  role='previous-choice' if r['name'].endswith('|c0') else 'xg-choice';want=next(x['value'] for x in old['cases'] if x['name']==role+'|matched')
  assert abs(r['value']['equity']-want['equity'])<1e-5,'Buggy control must replay its frozen predecessor'
 fixture={'schema':1,'binaries':build['binaries'],'cases':cases,'results':results,'seed':31811004,'trialsPerCase':2,'excludedFromStudy':True}
 fixture_path.write_text(json.dumps(fixture,indent=2)+'\n')
fixture=json.loads(fixture_path.read_bytes());assert fixture['cases']==cases
maximum=0.;exact=True
numeric={'equity','cubeless','standardError','mwc','mwcStandardError','probabilities'}
for got,want in zip(results,fixture['results']):
 assert (got['name'],got['runtime'])==(want['name'],want['runtime'])
 for key,w in want['value'].items():
  g=got['value'][key];exact &= g==w
  if key in numeric and w is not None:
   diffs=[abs(a-b) for a,b in zip(g,w)] if isinstance(w,list) else [abs(g-w)];maximum=max(maximum,*diffs);assert max(diffs)<=1e-5,(got['name'],key,max(diffs))
  else:assert g==w,(got['name'],key,g,w)
report={'schema':1,'binaries':build['binaries'],'platform':build['platform'],'architecture':build['architecture'],'cases':len(cases),'trialsPerCase':2,'allWithinTolerance':True,'allFieldsExact':exact,'maxNumericDifference':maximum,'tolerance':1e-5,'fixtureSHA256':HASH(fixture_path.read_bytes()),'scriptSHA256':HASH(Path(__file__).read_bytes())}
dest=args.output or root/'platform-validation.json';dest.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
