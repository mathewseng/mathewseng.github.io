# SPDX-License-Identifier: GPL-3.0-or-later
"""Extend the frozen cube study with a separately controlled cache-context fix."""
from pathlib import Path
import sys
root=Path(sys.argv[1])
def change(file,old,new):
 p=root/'src'/file;s=p.read_text();assert s.count(old)==1,(file,s.count(old),old[:90]);p.write_text(s.replace(old,new))
p=root/'src/eval.h';p.write_text(p.read_text()+'''
extern int bg_study_cache_context;
extern int BgCubefulCacheKey(const evalcontext*,int,const cubeinfo*,const cubeinfo*);
extern int BgCanCacheCube(const cubeinfo*,const cubeinfo*,int);
''')
change('bridge.c','int bg_study_rules=0, bg_study_filter=0, bg_study_vr=1;','int bg_study_rules=0, bg_study_filter=0, bg_study_vr=1, bg_study_cache_context=0;')
change('bridge.c','int rules,int filter,int vr) {','int rules,int filter,int vr,int cacheContext) {')
change('bridge.c','if(rules<0||rules>3||filter<0||filter>2||vr<0||vr>2)return failure();','if(rules<0||rules>3||filter<0||filter>2||vr<0||vr>2||cacheContext<0||cacheContext>1)return failure();')
change('bridge.c','if(bg_study_rules!=rules)EvalCacheFlush();','if(bg_study_rules!=rules || bg_study_cache_context!=cacheContext)EvalCacheFlush();\n    bg_study_cache_context=cacheContext;')
change('bridge.c','    for(int i=0;i<10;i++)sbAppendf(&b,"%s%lu",i?",":"",bg_study_counters[i]);\n    sbAppend(&b,"]}");','    for(int i=0;i<10;i++)sbAppendf(&b,"%s%lu",i?",":"",bg_study_counters[i]);\n    sbAppendf(&b,"],\\"cacheContext\\":%d}",cacheContext);')
change('bridge.c','short_rollout?2:0,0,0,1);','short_rollout?2:0,0,0,1,0);')
change('eval.c','extern int\nPerfectCubeful(','''/* A multi-cube search shares checker decisions made for pciMove. A branch's
 * cached value therefore depends on that policy context, not just its own cube.
 * Money keys leave bits 7..18 unused. Match keys do not: avoid caching mismatched
 * contexts there rather than squeezing two score/cube states into one key. */
int BgCubefulCacheKey(const evalcontext *ec,int plies,const cubeinfo *branch,const cubeinfo *policy) {
    int key=EvalKey(ec,plies,branch,TRUE);
    if(bg_study_cache_context && plies>0 && !branch->nMatchTo) {
        key ^= (policy->fCubeOwner<0?2:policy->fCubeOwner==policy->fMove)<<7;
        key ^= policy->fJacoby<<9;
        key ^= policy->fBeavers<<10;
        key ^= LogCube(policy->nCube)<<11;
        key ^= policy->fMove<<16;
    }
    return key;
}
int BgCanCacheCube(const cubeinfo *branch,const cubeinfo *policy,int plies) {
    if(!bg_study_cache_context || !plies || !branch->nMatchTo)return 1;
    return branch->nCube==policy->nCube && branch->fCubeOwner==policy->fCubeOwner &&
        branch->fMove==policy->fMove && branch->nMatchTo==policy->nMatchTo &&
        branch->anScore[0]==policy->anScore[0] && branch->anScore[1]==policy->anScore[1] &&
        branch->fCrawford==policy->fCrawford && branch->fJacoby==policy->fJacoby &&
        branch->fBeavers==policy->fBeavers && branch->bgv==policy->bgv;
}

extern int
PerfectCubeful(''')
p=root/'src/eval.c';s=p.read_text();old='ec.nEvalContext = EvalKey(pec, nPlies, &aciCubePos[ici], TRUE);';assert s.count(old)==2;s=s.replace(old,'ec.nEvalContext = BgCubefulCacheKey(pec, nPlies, &aciCubePos[ici], pciMove);');p.write_text(s)
change('eval.c','''        ec.nEvalContext = BgCubefulCacheKey(pec, nPlies, &aciCubePos[ici], pciMove);

        if (CacheLookup''','''        if(!BgCanCacheCube(&aciCubePos[ici],pciMove,nPlies)) {fAll=FALSE;break;}
        ec.nEvalContext = BgCubefulCacheKey(pec, nPlies, &aciCubePos[ici], pciMove);

        if (CacheLookup''')
change('eval.c','''                if (aciCubePos[ici].nCube < 0)
                    continue;

                memcpy(ec.ar''','''                if (aciCubePos[ici].nCube < 0 || !BgCanCacheCube(&aciCubePos[ici],pciMove,nPlies))
                    continue;

                memcpy(ec.ar''')
