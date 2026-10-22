/* SPDX-License-Identifier: GPL-3.0-or-later
 * Money cube offer tree. Values and payoffs are in the pre-offer cube unit,
 * always from the original doubler's perspective. The original responder
 * retains ownership through beaver/raccoon. A tie accepts/rolls rather than
 * offering another cube. This helper has no engine or reference-book input.
 */
#ifndef BG_ROLLOUT_CUBE_POLICY_H
#define BG_ROLLOUT_CUBE_POLICY_H
#define BG_STUDY_CUBE_LIMIT 1024
/* action: 0 roll, 1 take, 2 ordinary pass, 3 beaver take,
 *         4 beaver pass, 5 raccoon take, 6 raccoon pass. */
typedef struct { int action, multiplier, owner, winner; float value; } BgCubeChoice;
static inline BgCubeChoice bg_cube_after_beaver(float beaver, float raccoon,
                                                 int cube, int doubler, int immediate) {
    BgCubeChoice reply={3,4,!doubler,-1,beaver};
    if (-2.0f>reply.value) reply=(BgCubeChoice){4,2,!doubler,!doubler,-2.0f};
    if (immediate>=2 && cube<=BG_STUDY_CUBE_LIMIT/8) {
        BgCubeChoice r={5,8,!doubler,-1,raccoon};
        if (4.0f<r.value) r=(BgCubeChoice){6,4,!doubler,doubler,4.0f};
        if (r.value>reply.value) reply=r;
    }
    return reply;
}
static inline BgCubeChoice bg_cube_response(float take, float beaver, float raccoon,
                                             int cube, int owner, int doubler, int immediate) {
    BgCubeChoice result={1,2,!doubler,-1,take};
    if (immediate && cube<=BG_STUDY_CUBE_LIMIT/4) {
        BgCubeChoice reply=bg_cube_after_beaver(beaver,raccoon,cube,doubler,immediate);
        if (reply.value<result.value) result=reply;
    }
    if (1.0f<result.value) result=(BgCubeChoice){2,1,owner,doubler,1.0f};
    return result;
}
static inline BgCubeChoice bg_cube_decision(float noDouble, float take, float beaver, float raccoon,
                                             int cube, int owner, int doubler, int immediate) {
    BgCubeChoice result={0,1,owner,-1,noDouble};
    if (cube>=BG_STUDY_CUBE_LIMIT || (owner!=-1 && owner!=doubler)) return result;
    BgCubeChoice response=bg_cube_response(take,beaver,raccoon,cube,owner,doubler,immediate);
    if (response.value>noDouble) result=response;
    return result;
}
#endif
