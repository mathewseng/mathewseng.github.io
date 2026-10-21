/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "api.h"
#include "eval.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
const char *bg_rollout_config(const char*,const char*,int,int,int,int,int);
#ifdef BG_ABLATION
const char *bg_rollout_ex(const char*,const char*,int,int,int,int,int,int,int,int,int);
#endif
int main(void) {
    move a={0},b={0}; b.key.data[6]=1;
    if(CompareMoves(&a,&a)!=0 || CompareMoves(&a,&b)>=0 || CompareMoves(&b,&a)<=0) return 6;
    a.rScore=1; if(CompareMoves(&a,&b)>=0 || CompareMoves(&b,&a)<=0) return 6;
    if(init()) return 2;
    if(!getenv("BG_ROLLOUT_SMALL_CACHE") && (EvalCacheResize(1u<<22)<0 || CacheResize(&cpEval,1u<<20)<0)) return 5;
    char line[2048]; puts("READY"); fflush(stdout);
    while(fgets(line,sizeof(line),stdin)) {
        #ifdef BG_ABLATION
        const int fields=11;
#else
        const int fields=7;
#endif
        char *a[11],*p=line;
        for(int i=0;i<fields;i++){a[i]=p;char *end=strchr(p,i==fields-1?'\n':'\t');if(!end)return 3;*end=0;p=end+1;}
#ifdef BG_ABLATION
        const char *v=bg_rollout_ex(a[0],a[1],atoi(a[2]),(int)strtoul(a[3],NULL,10),atoi(a[4]),atoi(a[5]),atoi(a[6]),atoi(a[7]),atoi(a[8]),atoi(a[9]),atoi(a[10]));
#else
        const char *v=bg_rollout_config(a[0],a[1],atoi(a[2]),(int)strtoul(a[3],NULL,10),atoi(a[4]),atoi(a[5]),atoi(a[6]));
#endif
        puts(v?v:"{}");free((void*)v);fflush(stdout);
    }
    shutdown();return 0;
}
