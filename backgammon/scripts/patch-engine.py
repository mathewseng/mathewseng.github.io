from pathlib import Path
import sys, subprocess
p=Path(sys.argv[1])
x=p/'src/xgid.c'
s=x.read_text().replace('return getCubeInfoFromMatchStateWithBeavers(pci, pms, 3);','return getCubeInfoFromMatchStateWithBeavers(pci, pms, 0);')
x.write_text(s)

# Cubeful leaf equity depends on the root evaluation's cube-efficiency model
# (EvalEfficiency switches at two plies), not just remaining search depth.
# Also distinguish money play from double-match-point: both otherwise encode
# zero away-score bits, but their cubeful cache values use different units.
x=p/'src/eval.c'
s=x.read_text()
needle='''    if (nPlies || fCubefulEquity) {
        /* In match play'''
assert s.count(needle) == 1, 'Pinned EvalKey context changed'
s=s.replace(needle, '''    if (nPlies || fCubefulEquity) {
        /* Web bg4: bit 29 separates match-winning chance from money equity. */
        iKey ^= ((pci->nMatchTo != 0) << 29);
        /* In match play''')
needle='''        if (fCubefulEquity)
            iKey ^= 0x6a47b47e;'''
assert s.count(needle) == 1, 'Pinned EvalKey cubeful marker changed'
s=s.replace(needle, '''        if (fCubefulEquity)
            /* Web bg4: bit 28 identifies EvalEfficiency's root-depth model. */
            iKey ^= 0x6a47b47e ^ ((pec->nPlies >= 2) << 28);''')
x.write_text(s)
x=p/'Makefile.emcc'
s=x.read_text().replace('"_hint",','"_hint", "_bg_score", "_bg_cube", "_bg_value", "_bg_rollout",').replace('-s EXPORT_ES6','-s EXPORT_ES6 -s ENVIRONMENT=web,worker,node')
s=s.replace('DISTDIR = dist', '''DISTDIR = dist

# The scalar fallback keeps upstream -O2. SIMD preserves per-neuron operation
# order; no fast-math, relaxed SIMD, pthreads or cross-origin isolation.
ifeq ($(VARIANT),simd)
CFLAGS := $(filter-out -O2,$(CFLAGS)) -O3 -flto -msimd128 -ffp-contract=off
OBJDIR = obj_simd
DISTDIR = dist_simd
endif''')
x.write_text(s)
subprocess.run(['patch', '-p1', '-i', str(Path(__file__).resolve().parent.parent / 'engine/source/neuralnet-simd.patch')], cwd=p, check=True)

# Rollouts use seeded ISAAC directly. Remove upstream diagnostic spam and make
# the fallback RNG setter real; event handling happens between worker batches.
x=p/'src/stubs.c'
s=x.read_text().replace('printf("STUB! ProcessEvents\\n");', '(void)0;')
s=s.replace('printf("STUB! SetRNG\\n");', '*prng = rngNew; InitRNGSeed((unsigned int)strtoul(szSeed, NULL, 10), rngNew, rngctx);')
x.write_text(s)
x=p/'src/rollout.c'
s=x.read_text().replace('printf("Rollout loop begins!\\n");', '(void)0;').replace('printf("Rollout loop: %d of %d\\n", ro_NextTrial, cGames);', '(void)0;')
x.write_text(s)
