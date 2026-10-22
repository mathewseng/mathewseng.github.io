# SPDX-License-Identifier: GPL-3.0-or-later
"""Instrumented research build; leaves historical binaries/patches untouched."""
from pathlib import Path
import sys, shutil
root=Path(sys.argv[1]); scripts=Path(__file__).resolve().parent
shutil.copyfile(scripts/'rollout-cube-policy.h',root/'src/rollout-cube-policy.h')
def change(file, old, new):
    p=root/'src'/file; s=p.read_text()
    assert s.count(old)==1, (file,old[:100],s.count(old))
    p.write_text(s.replace(old,new))
header='''
#include "rollout-cube-policy.h"
extern int bg_study_rules, bg_study_filter, bg_study_vr;
extern unsigned long bg_study_counters[10];
extern int bg_study_max_cube;
extern int BgMoneyCubeDecision(float values[4], float output[7], const TanBoard board, cubeinfo *ci, const evalcontext *ec);
'''
change('eval.h','#endif /* EVAL_H */','#endif /* EVAL_H */') if False else None
p=root/'src/eval.h';p.write_text(p.read_text()+header)
change('bridge.c','#include "movefilters.inc"','#include "movefilters.inc"\nint bg_study_rules=0, bg_study_filter=0, bg_study_vr=1;\nunsigned long bg_study_counters[10];\nint bg_study_max_cube=1;')
change('bridge.c','const movefilter filters[MAX_FILTER_PLIES][MAX_FILTER_PLIES]=MOVEFILTER_NORMAL;','''const movefilter normal[MAX_FILTER_PLIES][MAX_FILTER_PLIES]=MOVEFILTER_NORMAL;
        const movefilter huge[MAX_FILTER_PLIES][MAX_FILTER_PLIES]=MOVEFILTER_HUGE;
        const movefilter large[MAX_FILTER_PLIES][MAX_FILTER_PLIES]=MOVEFILTER_LARGE;
        const movefilter (*filters)[MAX_FILTER_PLIES]=bg_study_filter==1?huge:bg_study_filter==2?large:normal;''')
change('bridge.c','memcpy(rcRollout.aaamfChequer[i],filters,sizeof(filters));','memcpy(rcRollout.aaamfChequer[i],filters,sizeof(rcRollout.aaamfChequer[i]));')
change('bridge.c','memcpy(rcRollout.aaamfLate[i],filters,sizeof(filters));','memcpy(rcRollout.aaamfLate[i],filters,sizeof(rcRollout.aaamfLate[i]));')
change('bridge.c','int lateCube,int endpoint) {\n    matchstate state','int lateCube,int endpoint,int rules,int filter,int vr) {\n    matchstate state')
change('bridge.c','    if(truncate<0','''    if(rules<0||rules>3||filter<0||filter>2||vr<0||vr>2)return failure();
    if(bg_study_rules!=rules)EvalCacheFlush();
    bg_study_rules=rules;bg_study_filter=filter;bg_study_vr=vr;
    memset(bg_study_counters,0,sizeof(bg_study_counters));bg_study_max_cube=1;
    if(truncate<0''')
change('bridge.c','getCubeInfoFromMatchStateWithBeavers(&ci,&state,0)','getCubeInfoFromMatchStateWithBeavers(&ci,&state,rules>=2)')
change('bridge.c','    sbAppend(&b,"}");return sbFinalize(&b);\n}\n\nconst char *bg_rollout_config','''    sbAppendf(&b,",\\"rulesMode\\":%d,\\"filter\\":%d,\\"vrPlies\\":%d,\\"maxCube\\":%d,\\"cubeActions\\":[",rules,filter,vr,bg_study_max_cube);
    for(int i=0;i<10;i++)sbAppendf(&b,"%s%lu",i?",":"",bg_study_counters[i]);
    sbAppend(&b,"]}");return sbFinalize(&b);
}

const char *bg_rollout_config''')
change('bridge.c','short_rollout?2:0);','short_rollout?2:0,0,0,1);')
# Deep checker experiments retain the same, unbiased 1-ply control variate.
change('rollout.c','''            if (aecVarRedn[i].nPlies)
                aecVarRedn[i].nPlies--;''','''            aecVarRedn[i].nPlies=bg_study_vr;''')
# Correct the accepted cube, ownership and terminal payoff together.
change('rollout.c','''                    cd = FindCubeDecision(arDouble, aar, pci);

                    switch (cd) {''','''                    bg_study_counters[7]++;
                    if (bg_study_rules && !pci->nMatchTo) {
                        float values[4];
                        if (BgMoneyCubeDecision(values,aar[0],(ConstTanBoard)aanBoard[ici],pci,pecCube[pci->fMove])<0) return -1;
                        BgCubeChoice choice=bg_cube_decision(values[0],values[1],values[2],values[3],pci->nCube,pci->fCubeOwner,pci->fMove,bg_study_rules-1);
                        bg_study_counters[choice.action]++;
                        if(choice.action) {
                            SetCubeInfo(pci,choice.multiplier*pci->nCube,choice.owner,pci->fMove,pci->nMatchTo,pci->anScore,pci->fCrawford,pci->fJacoby,pci->fBeavers,pci->bgv);
                            if(pci->nCube>bg_study_max_cube)bg_study_max_cube=pci->nCube;
                            if(choice.winner>=0) {
                                *pf=FALSE;cUnfinished--;
                                for(i=0;i<=OUTPUT_EQUITY;i++)aarOutput[ici][i]=aar[0][i];
                                aarOutput[ici][OUTPUT_CUBEFUL_EQUITY]=choice.winner==pci->fMove?1.0f:-1.0f;
                                if(iTurn&1)InvertEvaluationR(aarOutput[ici],pci);
                            }
                        }
                        continue;
                    }
                    cd = FindCubeDecision(arDouble, aar, pci);

                    switch (cd) {''')
# Avoid doing both cube evaluations in matched mode.
change('rollout.c','''                    if (GeneralCubeDecisionE(aar, (ConstTanBoard)aanBoard[ici], pci, pecCube[pci->fMove], 0) < 0)''','''                    if ((!bg_study_rules || pci->nMatchTo) && GeneralCubeDecisionE(aar, (ConstTanBoard)aanBoard[ici], pci, pecCube[pci->fMove], 0) < 0)''')
change('rollout.c','''                /* Find best move :-) */''','''                bg_study_counters[8]++;
                if(pci->nCube>bg_study_max_cube)bg_study_max_cube=pci->nCube;
                if(pci->nCube>=BG_STUDY_CUBE_LIMIT)bg_study_counters[9]++;
                /* Find best move :-) */''')
# Money cube limits matter in the evaluation cache as well as legal play.
change('eval.c','''        if (fCubefulEquity)
            /* Web bg4''','''        if(bg_study_rules && !pci->nMatchTo && (pec->fCubeful || fCubefulEquity)) iKey ^= LogCube(pci->nCube)<<19;
        if (fCubefulEquity)
            /* Web bg4''')
change('eval.c','''        fCube = (pci->fCubeOwner == -1) || (pci->fCubeOwner == pci->fMove);''','''        fCube = ((pci->fCubeOwner == -1) || (pci->fCubeOwner == pci->fMove)) && (!bg_study_rules || pci->nCube<BG_STUDY_CUBE_LIMIT);''')
# At search nodes include the beaver response in the backup. Raccoons are
# dominated when both players use the same scale-invariant continuation value.
# Actual rollout decisions evaluate each legal branch separately (below).
change('eval.c','''            GetDPEq(NULL, &rDP, &aci[i]);

            if (rDT >= rND''','''            GetDPEq(NULL, &rDP, &aci[i]);
            if(bg_study_rules && !aci[i].nMatchTo && aci[i].fBeavers) {
                BgCubeChoice response=bg_cube_response(rDT,2.0f*rDT,4.0f*rDT,aci[i].nCube,aci[i].fCubeOwner,aci[i].fMove,bg_study_rules-1);
                rDT=response.value;
            }

            if (rDT >= rND''')
change('eval.c','''                    /* money play */

                    switch (pc) {''','''                    /* money play */
                    if(bg_study_rules && aci[ici].nCube>=BG_STUDY_CUBE_LIMIT) {
                        arCf[ici]=Utility(arOutput,&aci[ici]);
                        continue;
                    }
                    switch (pc) {''')
p=root/'src/eval.c';p.write_text(p.read_text()+'''
/* Evaluate all legal immediate offers in one search, sharing board work.
 * No reference data enters the continuation values. */
int BgMoneyCubeDecision(float values[4], float output[7], const TanBoard board, cubeinfo *ci, const evalcontext *ec) {
    cubeinfo branches[4]; float cf[4], chances[NUM_OUTPUTS];
    int count=2;
    if(ci->fBeavers && ci->nCube<=BG_STUDY_CUBE_LIMIT/4) count=3;
    if(bg_study_rules==3 && ci->nCube<=BG_STUDY_CUBE_LIMIT/8) count=4;
    for(int i=0;i<count;i++) {
        branches[i]=*ci; branches[i].nCube=ci->nCube*(1<<i);
        if(i) branches[i].fCubeOwner=!ci->fMove;
    }
    if(EvaluatePositionCubeful3(NULL,board,chances,cf,branches,count,ci,ec,ec->nPlies,TRUE))return -1;
    for(int i=0;i<4;i++)values[i]=i<count?cf[i]*(1<<i):0.0f;
    for(int i=0;i<NUM_OUTPUTS;i++)output[i]=chances[i];
    output[OUTPUT_EQUITY]=UtilityME(chances,ci);output[OUTPUT_CUBEFUL_EQUITY]=values[0];
    return 0;
}
''')
