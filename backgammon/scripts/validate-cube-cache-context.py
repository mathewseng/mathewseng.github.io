#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Reproduce wrong-policy cache hits without sampling any study outcomes."""
import hashlib, json, shlex, subprocess, sys, tempfile
from pathlib import Path
FAMILY = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/bg-cube-study-v2')
BUILD = json.loads((ROOT / 'build.json').read_bytes())
HASH = lambda b: hashlib.sha256(b).hexdigest()

DECLARATIONS = '''
static int auditOn, auditCount;
static struct {TanBoard board; cubeinfo branch, policy; evalcontext ec; int plies; float cf;} auditRows[128];
'''
CAPTURE = '''
                if(auditOn && auditCount<128 && nPlies>0 &&
                   (pciMove->nCube!=aciCubePos[ici].nCube || pciMove->fCubeOwner!=aciCubePos[ici].fCubeOwner)) {
                    int k=auditCount++;
                    memcpy(auditRows[k].board,anBoard,sizeof(TanBoard));
                    auditRows[k].branch=aciCubePos[ici]; auditRows[k].policy=*pciMove;
                    auditRows[k].ec=*pec; auditRows[k].plies=nPlies; auditRows[k].cf=arCubeful[ici];
                }
'''
AUDIT = r'''
int AuditCache(const TanBoard board,cubeinfo *ci,const evalcontext *ec) {
    float values[4],out[7],cached[128]; int hits[128],hitCount=0;
    auditCount=0; auditOn=1; EvalCacheFlush();
    if(BgMoneyCubeDecision(values,out,board,ci,ec))return 20;
    auditOn=0;
    for(int k=0;k<auditCount;k++) {
        evalcache key; float chance[5]; PositionKey(auditRows[k].board,&key.key);
        key.nEvalContext=BgCubefulCacheKey(&auditRows[k].ec,auditRows[k].plies,&auditRows[k].branch,&auditRows[k].branch);
        hits[k]=CacheLookup(&cEval,&key,chance,&cached[k])==CACHEHIT;
        hitCount+=hits[k];
    }
    float maxActual=0,maxReplay=0; int wrongActual=0,wrongReplay=0;
    for(int k=0;k<auditCount;k++) {
        float fresh,warm,prob[5]; evalcache key;
        EvalCacheFlush();
        if(EvaluatePositionCubeful4(NULL,auditRows[k].board,prob,&fresh,&auditRows[k].branch,1,&auditRows[k].branch,&auditRows[k].ec,auditRows[k].plies,FALSE))return 21;
        if(hits[k]) {
            float error=fabsf(fresh-cached[k]); if(error>maxActual)maxActual=error;
            wrongActual+=error>0.00001f;
        }
        /* Replay the captured cache write, then query with the branch's own
         * checker policy. The fixed key must miss this incompatible entry. */
        EvalCacheFlush(); PositionKey(auditRows[k].board,&key.key);
        key.nEvalContext=BgCubefulCacheKey(&auditRows[k].ec,auditRows[k].plies,&auditRows[k].branch,&auditRows[k].policy);
        memcpy(key.ar,prob,sizeof(float)*5); key.ar[5]=auditRows[k].cf;
        CacheAdd(&cEval,&key,GetHashKey(cEval.hashMask,&key));
        if(EvaluatePositionCubeful3(NULL,auditRows[k].board,prob,&warm,&auditRows[k].branch,1,&auditRows[k].branch,&auditRows[k].ec,auditRows[k].plies,FALSE))return 22;
        float error=fabsf(fresh-warm); if(error>maxReplay)maxReplay=error;
        wrongReplay+=error>0.00001f;
    }
    printf("{\"cacheContext\":%d,\"capturedNodes\":%d,\"actualQueryHits\":%d,\"incorrectActualHits\":%d,\"maxActualError\":%.9g,\"incorrectReplayQueries\":%d,\"maxReplayError\":%.9g}\n",bg_study_cache_context,auditCount,hitCount,wrongActual,maxActual,wrongReplay,maxReplay);
    fflush(stdout); return 0;
}
'''
MAIN = r'''
#include "api.h"
#include "eval.h"
#include "xgid.h"
#include <stdio.h>
extern int AuditCache(const TanBoard,cubeinfo*,const evalcontext*);
int main(void) {
    if(init())return 2;
    EvalCacheResize(1u<<22); CacheResize(&cpEval,1u<<20);
    evalcontext ec={1,2,1,1,0}; bg_study_rules=3; bg_study_cache_context=1;
    cubeinfo branch={0},policy={0}; int keys[744],n=0;
    branch.nCube=1;branch.fCubeOwner=-1;branch.fJacoby=1;
    for(int owner=-1;owner<2;owner++)for(int turn=0;turn<2;turn++)
    for(int jacoby=0;jacoby<2;jacoby++)for(int beavers=0;beavers<2;beavers++)for(int log=0;log<=30;log++) {
        policy=branch;policy.fCubeOwner=owner;policy.fMove=turn;policy.fJacoby=jacoby;policy.fBeavers=beavers;policy.nCube=1<<log;
        int key=BgCubefulCacheKey(&ec,1,&branch,&policy);
        for(int i=0;i<n;i++)if(key==keys[i])return 30;
        keys[n++]=key;
    }
    branch.nMatchTo=7;policy=branch;
    if(!BgCanCacheCube(&branch,&policy,1))return 31;
    policy.nCube=2;if(BgCanCacheCube(&branch,&policy,1)||!BgCanCacheCube(&branch,&policy,0))return 32;
    policy=branch;policy.fCubeOwner=0;if(BgCanCacheCube(&branch,&policy,1))return 33;
    policy=branch;policy.anScore[0]=1;if(BgCanCacheCube(&branch,&policy,1))return 34;
    printf("{\"distinctPolicyKeys\":%d,\"matchGuardsPass\":true}\n",n);
    char line[1024];
    while(fgets(line,sizeof(line),stdin)) {
        matchstate ms;cubeinfo ci;if(parseXgid(&ms,line)<0)return 3;
        getCubeInfoFromMatchStateWithBeavers(&ci,&ms,1);ci.fMove=!ci.fMove;SwapSides(ms.anBoard);
        for(int fixed=0;fixed<=1;fixed++) {bg_study_cache_context=fixed;int r=AuditCache(ms.anBoard,&ci,&ec);if(r)return r;}
    }
    shutdown();return 0;
}
'''

source = (ROOT / 'src/eval.c').read_text()
anchor = 'extern int\nEvalKey('
assert source.count(anchor) == 1
source = source.replace(anchor, DECLARATIONS + '\n' + anchor)
anchor = '                ec.nEvalContext = BgCubefulCacheKey(pec, nPlies, &aciCubePos[ici], pciMove);'
assert source.count(anchor) == 1
source = source.replace(anchor, CAPTURE + anchor) + AUDIT
plan = json.loads((FAMILY / 'docs/cube-policy-study-inputs.json').read_bytes())
candidates = plan['plan'][0]['candidates']
with tempfile.TemporaryDirectory(prefix='bg-cache-regression-') as scratch:
    scratch = Path(scratch)
    (scratch / 'eval.c').write_text(source)
    (scratch / 'main.c').write_text(MAIN)
    flags = shlex.split(BUILD['flags'])
    for stem in ['eval', 'main']:
        subprocess.run(['clang', *flags, '-c', str(scratch / (stem+'.c')), '-o', str(scratch / (stem+'.o'))], cwd=ROOT, check=True, capture_output=True)
    objects = [str(p) for p in (ROOT / 'obj').rglob('*.o') if p.name not in ['eval.o','gnubg-core.o']]
    subprocess.run(['clang', *objects, str(scratch/'eval.o'), str(scratch/'main.o'), '-o', str(scratch/'probe'), *(['-lm'] if sys.platform=='linux' else [])], check=True, capture_output=True)
    r = subprocess.run([str(scratch/'probe')], cwd=ROOT, input=''.join(c['after']+'\n' for c in candidates), check=True, capture_output=True, text=True)
rows = [json.loads(s) for s in r.stdout.splitlines() if s.startswith('{')]
assert len(rows) == 5 and rows[0]['distinctPolicyKeys'] == 744
for i,c in enumerate(candidates):
    old,fixed = rows[1+2*i:3+2*i]
    assert old['incorrectActualHits'] > 0 and old['maxActualError'] > .001
    assert old['incorrectReplayQueries'] > 0
    assert fixed['incorrectActualHits'] == fixed['incorrectReplayQueries'] == 0
    assert fixed['maxActualError'] <= 1e-5 and fixed['maxReplayError'] <= 1e-5
    old['role']=fixed['role']=c['role']
result = {'schema':1,'binarySHA256':BUILD['binarySHA256'],'validationScriptSHA256':HASH(Path(__file__).read_bytes()),'kind':'deterministic search-node cache regression; no study samples','tolerance':1e-5,'keyValidation':rows[0],'cases':rows[1:]}
(FAMILY/'docs/cube-cache-context-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
