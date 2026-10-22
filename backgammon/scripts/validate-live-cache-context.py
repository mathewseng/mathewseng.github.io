#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Run the deterministic regression on the production source before and after bg8."""
import ast,hashlib,json,subprocess,tarfile,tempfile
from pathlib import Path
FAMILY=Path(__file__).resolve().parents[1]
audit_source=(FAMILY/'scripts/validate-cube-cache-context.py').read_text()
constants={}
for node in ast.parse(audit_source).body:
 if isinstance(node,ast.Assign) and len(node.targets)==1 and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ['DECLARATIONS','CAPTURE','AUDIT']:
  constants[node.targets[0].id]=ast.literal_eval(node.value)
archive=FAMILY/'engine/source/gnubg-core-955555c-bg7.tar.gz'
patch=FAMILY/'engine/source/checker-context-bg8.patch'
candidates=json.loads((FAMILY/'docs/cube-policy-study-inputs.json').read_bytes())['plan'][0]['candidates']
results=[]
for fixed in [0,1]:
 with tempfile.TemporaryDirectory(prefix='bg-live-cache-') as tmp:
  root=Path(tmp)
  with tarfile.open(archive) as a:a.extractall(root)
  if fixed:subprocess.run(['patch','-p1','-i',str(patch.resolve())],cwd=root,check=True,capture_output=True)
  source=(root/'src/eval.c').read_text()
  source=source.replace('extern int\nEvalKey(',constants['DECLARATIONS']+'\nstatic int bg_study_cache_context='+str(fixed)+';\nextern int\nEvalKey(')
  if not fixed:
   fallback='static int CheckerPolicyCacheKey(const evalcontext *ec,int plies,const cubeinfo *branch,const cubeinfo *policy) {return EvalKey(ec,plies,branch,TRUE);}\n'
   source=source.replace('extern int\nPerfectCubeful(',fallback+'extern int\nPerfectCubeful(')
  key='                ec.nEvalContext = '+('CheckerPolicyCacheKey(pec, nPlies, &aciCubePos[ici], pciMove);' if fixed else 'EvalKey(pec, nPlies, &aciCubePos[ici], TRUE);')
  assert source.count(key)==1
  source=source.replace(key,constants['CAPTURE']+key)
  audit=constants['AUDIT'].replace('BgCubefulCacheKey','CheckerPolicyCacheKey').replace('if(BgMoneyCubeDecision(values,out,board,ci,ec))return 20;','float rootValues[2][7]; if(GeneralCubeDecisionE(rootValues,board,ci,ec,NULL))return 20;')
  (root/'src/eval.c').write_text(source+audit)
  (root/'src/gnubg-core.c').write_text('''#include "api.h"
#include "eval.h"
#include "xgid.h"
#include <stdio.h>
extern int AuditCache(const TanBoard,cubeinfo*,const evalcontext*);
int main(void){if(init())return 2;EvalCacheResize(1u<<22);CacheResize(&cpEval,1u<<20);
char line[1024];while(fgets(line,sizeof(line),stdin)){matchstate ms;cubeinfo ci;if(parseXgid(&ms,line)<0)return 3;
getCubeInfoFromMatchStateWithBeavers(&ci,&ms,0);ci.fMove=!ci.fMove;SwapSides(ms.anBoard);evalcontext ec={1,2,1,1,0};
int r=AuditCache(ms.anBoard,&ci,&ec);if(r)return r;}shutdown();return 0;}
''')
  subprocess.run(['make','-j8','CC=clang','CFLAGS=-O3 -ffp-contract=off -Isrc -Isrc/lib -Wno-unused-parameter'],cwd=root,check=True,capture_output=True)
  r=subprocess.run([str(root/'gnubg-core')],cwd=root,input=''.join(c['after']+'\n' for c in candidates),capture_output=True,text=True,check=True)
  rows=[json.loads(s) for s in r.stdout.splitlines() if s.startswith('{')]
  assert len(rows)==2
  for c,row in zip(candidates,rows):
   row['role']=c['role']
   if fixed:assert row['incorrectReplayQueries']==row['incorrectActualHits']==0 and row['maxReplayError']<=1e-5
   else:assert row['incorrectActualHits']>0 and row['maxActualError']>1e-5
  results+=rows
HASH=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r={'schema':1,'kind':'production-source deterministic cache regression; no rollout samples','sourceArchiveSHA256':HASH(archive),'patchSHA256':HASH(patch),'auditScriptSHA256':HASH(FAMILY/'scripts/validate-cube-cache-context.py'),'scriptSHA256':HASH(Path(__file__)),'compiler':subprocess.check_output(['clang','--version'],text=True).strip(),'cases':results}
(FAMILY/'docs/live-cache-context-validation.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r,indent=2))
