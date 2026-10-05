/* SPDX-License-Identifier: GPL-3.0-or-later
 * Backgammon web bindings, 2026 Mathew Seng contributors.
 * Score every legal AFTER-position with GNUbg ScoreMove in the ORIGINAL decision context.
 * Both candidates and submitted moves use this binding at identical settings; no hint-list cutoff.
 */
#include "api.h"
#include "eval.h"
#include "xgid.h"
#include "positionid.h"
#include "stringbuffer.h"
#include <string.h>
static const char *failure(void) { return strdup("{\"error\":\"GNUbg evaluation failed\"}"); }
static void output(StringBuffer *b, float *v, cubeinfo *ci, float eq) {
    sbAppendf(b,"\"equity\":%.8f,\"cubeless\":%.8f,\"probabilities\":[%.8f,%.8f,%.8f,%.8f,%.8f]",eq,v[5],v[0],v[1],v[2],v[3],v[4]);
    if(ci->nMatchTo)sbAppendf(b,",\"mwc\":%.8f",eq2mwc(eq,ci));
    else sbAppend(b,",\"mwc\":null");
}
const char *bg_score(const char *original, const char *after, int depth, int beavers) {
    matchstate ms, post; cubeinfo ci; move m; memset(&m,0,sizeof(m));
    if(depth<0||depth>2||parseXgid(&ms,original)<0||parseXgid(&post,after)<0)return failure();
    if(!CheckPosition(ms.anBoard)||!CheckPosition(post.anBoard)||ms.fMove!=post.fMove)return failure();
    if(getCubeInfoFromMatchStateWithBeavers(&ci,&ms,beavers != 0)<0)return failure();
    PositionKey(post.anBoard,&m.key);
    evalcontext ec={ms.fCubeUse,depth,TRUE,TRUE,0.0f};
    if(ScoreMove(NULL,&m,&ci,&ec,depth)<0)return failure();
    StringBuffer b; sbInit(&b);sbAppend(&b,"{");output(&b,m.arEvalMove,&ci,m.rScore);sbAppend(&b,"}");return sbFinalize(&b);
}
const char *bg_cube(const char *xgid,int depth,int beavers) {
    matchstate ms;cubeinfo ci;cubedecision cd;float equity[NUM_CUBEFUL_OUTPUTS],v[2][NUM_ROLLOUT_OUTPUTS];
    if(depth<0||depth>2||parseXgid(&ms,xgid)<0||!CheckPosition(ms.anBoard))return failure();
    if(getCubeInfoFromMatchStateWithBeavers(&ci,&ms,beavers != 0)<0)return failure();
    evalcontext ec={ms.fCubeUse,depth,TRUE,TRUE,0.0f};
    if(!ms.fCubeUse) {
        if(GeneralEvaluationE(v[0],ms.anBoard,&ci,&ec)<0)return failure();
        StringBuffer b;sbInit(&b);sbAppendf(&b,"{\"action\":\"roll\",\"outcomes\":[%.8f,%.8f,%.8f],",v[0][5],v[0][5],v[0][5]);
        output(&b,v[0],&ci,v[0][5]);sbAppend(&b,"}");return sbFinalize(&b);
    }
    if(GeneralCubeDecisionE(v,ms.anBoard,&ci,&ec,NULL)<0)return failure();
    cd=FindCubeDecision(equity,v,&ci);
    PlayerAction action=getActionFromCubeDecision(cd,&ms);
    const char *name=action==ActionDouble?"double":action==ActionTake?"take":action==ActionDrop?"pass":action==ActionBeaver?"beaver":"roll";
    StringBuffer b;sbInit(&b);sbAppendf(&b,"{\"action\":\"%s\",\"cd\":%d,\"outcomes\":[%.8f,%.8f,%.8f],",name,cd,equity[OUTPUT_NODOUBLE],equity[OUTPUT_TAKE],equity[OUTPUT_DROP]);
    output(&b,v[0],&ci,equity[OUTPUT_OPTIMAL]);
    if(ci.nMatchTo)sbAppendf(&b,",\"outcomesMWC\":[%.8f,%.8f,%.8f]",eq2mwc(equity[OUTPUT_NODOUBLE],&ci),eq2mwc(equity[OUTPUT_TAKE],&ci),eq2mwc(equity[OUTPUT_DROP],&ci));
    sbAppend(&b,"}");return sbFinalize(&b);
}
/* Evaluate an actual post-take money position, with the real cube owner.
 * The JS adapter compares legal immediate-redouble branches in one original
 * cube unit. This is a GNUbg evaluation, not a pip-count heuristic. */
const char *bg_value(const char *xgid,int depth,int beavers) {
    matchstate ms;cubeinfo ci;float v[NUM_ROLLOUT_OUTPUTS];
    if(depth<0||depth>2||parseXgid(&ms,xgid)<0||ms.nMatchTo||!CheckPosition(ms.anBoard))return failure();
    if(getCubeInfoFromMatchStateWithBeavers(&ci,&ms,beavers != 0)<0)return failure();
    evalcontext ec={ms.fCubeUse,depth,TRUE,TRUE,0.0f};
    if(GeneralEvaluationE(v,ms.anBoard,&ci,&ec)<0)return failure();
    StringBuffer b;sbInit(&b);sbAppend(&b,"{");output(&b,v,&ci,ec.fCubeful?v[6]:v[5]);sbAppend(&b,"}");return sbFinalize(&b);
}
