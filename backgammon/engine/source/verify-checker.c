/* SPDX-License-Identifier: GPL-3.0-or-later
 * Optional diagnostic ABI. The historical bg_score ABI and corresponding
 * bridge source remain unchanged for reproducible earlier experiments.
 */
#include "api.h"
#include "eval.h"
#include "backgammon.h"
#include "xgid.h"
#include "positionid.h"
#include "stringbuffer.h"
#include <stdlib.h>
#include <string.h>

const char *bg_score_config(const char *original, const char *after,
                            int depth, int beavers, int pruning) {
    matchstate ms, post;
    cubeinfo ci;
    move m;
    memset(&m, 0, sizeof(m));
    if (depth < 0 || depth > 4 || (pruning != 0 && pruning != 1) ||
        parseXgid(&ms, original) < 0 || parseXgid(&post, after) < 0 ||
        !CheckPosition(ms.anBoard) || !CheckPosition(post.anBoard) ||
        ms.fMove != post.fMove ||
        getCubeInfoFromMatchStateWithBeavers(&ci, &ms, beavers != 0) < 0)
        return strdup("{\"error\":\"GNUbg checker verification failed\"}");
    PositionKey(post.anBoard, &m.key);
    evalcontext ec = {ms.fCubeUse, depth, pruning, TRUE, 0.0f};
    if (ScoreMove(NULL, &m, &ci, &ec, depth) < 0)
        return strdup("{\"error\":\"GNUbg checker verification failed\"}");
    StringBuffer b;
    sbInit(&b);
    sbAppendf(&b, "{\"equity\":%.8f,\"cubeless\":%.8f,"
        "\"probabilities\":[%.8f,%.8f,%.8f,%.8f,%.8f],\"pruning\":%s,",
        m.rScore, m.arEvalMove[5], m.arEvalMove[0], m.arEvalMove[1],
        m.arEvalMove[2], m.arEvalMove[3], m.arEvalMove[4], pruning ? "true" : "false");
    if (ci.nMatchTo) sbAppendf(&b, "\"mwc\":%.8f}", eq2mwc(m.rScore, &ci));
    else sbAppend(&b, "\"mwc\":null}");
    return sbFinalize(&b);
}
