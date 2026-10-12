# SPDX-License-Identifier: GPL-3.0-or-later
"""Research-only SIMD output neurons, retaining each dot product's order."""
from pathlib import Path
import sys

root = Path(sys.argv[1]) / 'src/lib'
h = root / 'neuralnet.h'
s = h.read_text().replace('    float *arOutputThreshold;\n', '''    float *arOutputThreshold;
#ifdef __wasm_simd128__
    float *arOutputWeight4;
#endif
''')
h.write_text(s)
p = root / 'neuralnet.c'
s = p.read_text()
s = s.replace('    pnn->nTrained = 0;\n', '''    pnn->nTrained = 0;
#ifdef __wasm_simd128__
    pnn->arOutputWeight4 = NULL;
#endif
''')
needle = '''    pnn->arOutputThreshold = 0;
}'''
assert s.count(needle) == 1
s = s.replace(needle, '''    pnn->arOutputThreshold = 0;
#ifdef __wasm_simd128__
    sse_free(pnn->arOutputWeight4);
    pnn->arOutputWeight4 = NULL;
#endif
}''')
needle = '#if !defined(USE_SIMD_INSTRUCTIONS)\n'
assert s.count(needle) == 1
s = s.replace(needle, '''/* Keep the original on-disk/output-major weights intact for save/load.
 * This small extra layout packs four independent output neurons together. */
static int PackOutputWeights(neuralnet *pnn)
{
#ifdef __wasm_simd128__
    const unsigned int groups = pnn->cOutput / 4;
    if (groups) {
        pnn->arOutputWeight4 = sse_malloc(groups * pnn->cHidden * 4 * sizeof(float));
        if (!pnn->arOutputWeight4) return -1;
        for (unsigned int g = 0; g < groups; g++)
            for (unsigned int j = 0; j < pnn->cHidden; j++)
                for (unsigned int lane = 0; lane < 4; lane++)
                    pnn->arOutputWeight4[(g * pnn->cHidden + j) * 4 + lane] =
                        pnn->arOutputWeight[(g * 4 + lane) * pnn->cHidden + j];
    }
#endif
    return 0;
}

''' + needle)
needle = 'static void\nEvaluate(const neuralnet * pnn'
assert s.count(needle) == 1
s = s.replace(needle, '''static void OutputNodes(const neuralnet *pnn, const float *ar, float *arOutput)
{
    unsigned int i = 0, j;
#ifdef __wasm_simd128__
    for (; i + 4 <= pnn->cOutput; i += 4) {
        const float *weights = pnn->arOutputWeight4 + i * pnn->cHidden;
        v128_t sum = wasm_v128_load(pnn->arOutputThreshold + i);
        for (j = 0; j < pnn->cHidden; j++)
            sum = wasm_f32x4_add(sum, wasm_f32x4_mul(wasm_f32x4_splat(ar[j]),
                wasm_v128_load(weights + j * 4)));
        float sums[4];
        wasm_v128_store(sums, sum);
        for (unsigned int lane = 0; lane < 4; lane++)
            arOutput[i + lane] = sigmoid(-pnn->rBetaOutput * sums[lane]);
    }
#endif
    for (; i < pnn->cOutput; i++) {
        float r = pnn->arOutputThreshold[i];
        const float *weights = pnn->arOutputWeight + i * pnn->cHidden;
        for (j = 0; j < pnn->cHidden; j++) r += ar[j] * weights[j];
        arOutput[i] = sigmoid(-pnn->rBetaOutput * r);
    }
}

''' + needle)
for n in ['cHidden', 'pnn->cHidden']:
    old = f'''    /* Calculate activity at output nodes */
    prWeight = pnn->arOutputWeight;

    for (i = 0; i < pnn->cOutput; i++) {{
        float r = pnn->arOutputThreshold[i];

        for (j = 0; j < {n}; j++)
            r += ar[j] * *prWeight++;

        arOutput[i] = sigmoid(-pnn->rBetaOutput * r);
    }}'''
    assert s.count(old) == 1
    s = s.replace(old, '    OutputNodes(pnn, ar, arOutput);')
needle = '''        if (fscanf(pf, "%f\\n", pr++) < 1)
            return -1;

    return 0;
}'''
assert s.count(needle) == 1
s = s.replace(needle, needle.replace('    return 0;', '    return PackOutputWeights(pnn);'))
needle = '''#undef FREAD

    return 0;'''
assert s.count(needle) == 1
s = s.replace(needle, '#undef FREAD\n\n    return PackOutputWeights(pnn);')
p.write_text(s)
