/* SPDX-License-Identifier: GPL-3.0-or-later
 * Offline research driver. Each line is original XGID, after XGID, depth,
 * beavers, separated by tabs. The ordinary web engine is not modified.
 */
#include "api.h"
#include "eval.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
const char *bg_score(const char*,const char*,int,int);
int main(void) {
    if(init()) return 2;
    /* Offline workers have more memory than a mobile browser. No search,
     * pruning, weights or arithmetic settings change with cache capacity. */
    if(EvalCacheResize(1u<<23)<0 || CacheResize(&cpEval,1u<<21)<0) return 5;
    char line[2048]; puts("READY"); fflush(stdout);
    while(fgets(line,sizeof(line),stdin)) {
        char *original=strtok(line,"\t"), *after=strtok(NULL,"\t"),
            *d=strtok(NULL,"\t"), *b=strtok(NULL,"\t\n");
        if(!original||!after||!d||!b) return 3;
        int depth=atoi(d), beavers=atoi(b);
        if(depth<0||depth>6||beavers<0||beavers>1) return 4;
        const char *v=bg_score(original,after,depth,beavers);
        puts(v?v:"{}"); free((void*)v); fflush(stdout);
    }
    shutdown(); return 0;
}
