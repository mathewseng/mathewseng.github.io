/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Exercise the real filtered search, then score every candidate independently. */
#include "api.h"
#include "eval.h"
#include "xgid.h"
#include "positionid.h"
#include "movefilters.inc"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int argc,char **argv){
 if(argc!=2||init())return 2;if(EvalCacheResize(0)!=0)return 3;
 matchstate ms;cubeinfo ci;movelist ml;
 if(parseXgid(&ms,argv[1])<0||getCubeInfoFromMatchStateWithBeavers(&ci,&ms,0)<0)return 4;
 evalcontext ec={ms.fCubeUse,2,1,1,0};movefilter filters[MAX_FILTER_PLIES][MAX_FILTER_PLIES]=MOVEFILTER_NORMAL;
 if(FindnSaveBestMoves(&ml,ms.anDice[0],ms.anDice[1],ms.anBoard,NULL,0,&ci,&ec,filters)<0)return 5;
 move best=ml.amMoves[ml.iMoveBest];
 printf("{\"cacheEntries\":%u,\"selectedPositionID\":\"%s\",\"selectedDepth\":%d,\"selectedScore\":%.9g,\"rows\":[",GetEvalCacheEntries(),PositionIDFromKey(&best.key),best.esMove.ec.nPlies,best.rScore);
 for(unsigned i=0;i<ml.cMoves;i++){
  move m=ml.amMoves[i];TanBoard board;PositionFromKey(board,&m.key);
  printf("%s{\"positionID\":\"%s\",\"filteredDepth\":%d,\"filteredScore\":%.9g,\"board\":[",i?",":"",PositionIDFromKey(&m.key),m.esMove.ec.nPlies,m.rScore);
  for(int a=0;a<2;a++){printf("%s[",a?",":"");for(int b=0;b<25;b++)printf("%s%u",b?",":"",board[a][b]);printf("]");}printf("],\"scores\":[");
  for(int depth=0;depth<=2;depth+=2){ec.nPlies=depth;if(ScoreMove(NULL,&m,&ci,&ec,depth)<0)return 6;printf("%s%.9g",depth?",":"",m.rScore);}printf("]}");
 }
 printf("]}\n");free(ml.amMoves);shutdown();return 0;
}
