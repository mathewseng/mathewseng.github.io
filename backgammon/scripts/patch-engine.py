from pathlib import Path
import sys
p=Path(sys.argv[1])
x=p/'src/xgid.c'
s=x.read_text().replace('return getCubeInfoFromMatchStateWithBeavers(pci, pms, 3);','return getCubeInfoFromMatchStateWithBeavers(pci, pms, 0);')
x.write_text(s)
x=p/'Makefile.emcc'
s=x.read_text().replace('"_hint",','"_hint", "_bg_score", "_bg_cube", "_bg_value", "_bg_rollout",').replace('-s EXPORT_ES6','-s EXPORT_ES6 -s ENVIRONMENT=web,worker,node')
x.write_text(s)

# Rollouts use seeded ISAAC directly. Remove upstream diagnostic spam and make
# the fallback RNG setter real; event handling happens between worker batches.
x=p/'src/stubs.c'
s=x.read_text().replace('printf("STUB! ProcessEvents\\n");', '(void)0;')
s=s.replace('printf("STUB! SetRNG\\n");', '*prng = rngNew; InitRNGSeed((unsigned int)strtoul(szSeed, NULL, 10), rngNew, rngctx);')
x.write_text(s)
x=p/'src/rollout.c'
s=x.read_text().replace('printf("Rollout loop begins!\\n");', '(void)0;').replace('printf("Rollout loop: %d of %d\\n", ro_NextTrial, cGames);', '(void)0;')
x.write_text(s)
