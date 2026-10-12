# SPDX-License-Identifier: GPL-3.0-or-later
"""Research-only hidden-neuron tiling; preserve each neuron's input order."""
from pathlib import Path
import sys

p = Path(sys.argv[1]) / "src/lib/neuralnet.c"
s = p.read_text()
needle = "static void\nEvaluate(const neuralnet * pnn"
assert s.count(needle) == 1
helper = """#ifdef __wasm_simd128__
/* Keep sixteen hidden accumulators in registers instead of loading/storing
 * every accumulator after every input. Sparse inputs are collected once, in
 * their original order; no reassociation or horizontal reduction is used.
 * Weight storage and scalar builds are unchanged. */
static void
AccumulateHidden(const neuralnet *pnn, const float *input, float *ar, int delta)
{
    const unsigned int hidden = pnn->cHidden;
    const float **weights = g_alloca(pnn->cInput * sizeof(*weights));
    float *amounts = g_alloca(pnn->cInput * sizeof(*amounts));
    unsigned int count = 0, i, j;
    for (i = 0; i < pnn->cInput; i++) {
        if (input[i] != 0.0f) {
            weights[count] = pnn->arHiddenWeight + i * hidden;
            amounts[count++] = input[i];
        }
    }
    for (j = 0; j + 16 <= hidden; j += 16) {
        v128_t a = wasm_v128_load(ar + j);
        v128_t b = wasm_v128_load(ar + j + 4);
        v128_t c = wasm_v128_load(ar + j + 8);
        v128_t d = wasm_v128_load(ar + j + 12);
        for (i = 0; i < count; i++) {
            const float amount = amounts[i], *w = weights[i] + j;
            if (amount == 1.0f) {
                a = wasm_f32x4_add(a, wasm_v128_load(w));
                b = wasm_f32x4_add(b, wasm_v128_load(w + 4));
                c = wasm_f32x4_add(c, wasm_v128_load(w + 8));
                d = wasm_f32x4_add(d, wasm_v128_load(w + 12));
            } else if (delta && amount == -1.0f) {
                a = wasm_f32x4_sub(a, wasm_v128_load(w));
                b = wasm_f32x4_sub(b, wasm_v128_load(w + 4));
                c = wasm_f32x4_sub(c, wasm_v128_load(w + 8));
                d = wasm_f32x4_sub(d, wasm_v128_load(w + 12));
            } else {
                const v128_t scale = wasm_f32x4_splat(amount);
                a = wasm_f32x4_add(a, wasm_f32x4_mul(wasm_v128_load(w), scale));
                b = wasm_f32x4_add(b, wasm_f32x4_mul(wasm_v128_load(w + 4), scale));
                c = wasm_f32x4_add(c, wasm_f32x4_mul(wasm_v128_load(w + 8), scale));
                d = wasm_f32x4_add(d, wasm_f32x4_mul(wasm_v128_load(w + 12), scale));
            }
        }
        wasm_v128_store(ar + j, a);
        wasm_v128_store(ar + j + 4, b);
        wasm_v128_store(ar + j + 8, c);
        wasm_v128_store(ar + j + 12, d);
    }
    for (; j < hidden; j++) {
        float value = ar[j];
        for (i = 0; i < count; i++) {
            const float amount = amounts[i], weight = weights[i][j];
            if (amount == 1.0f) value += weight;
            else if (delta && amount == -1.0f) value -= weight;
            else value += weight * amount;
        }
        ar[j] = value;
    }
}
#endif

"""
s = s.replace(needle, helper + needle)
# Wrap each original accumulation loop; preserve scalar code verbatim.
for name, input_name, end, delta in [
    ("Evaluate", "arInput", "    if (saveAr)", 0),
    ("EvaluateFromBase", "arInputDif", "    for (i = 0; i < pnn->cHidden; i++)\n        ar[i] = sigmoid", 1),
]:
    function = s.index("static void\n" + name + "(")
    start = s.index("    prWeight = pnn->arHiddenWeight;", function)
    finish = s.index(end, start)
    original = s[start:finish]
    s = (s[:start] + "#ifdef __wasm_simd128__\n"
         + f"    AccumulateHidden(pnn, {input_name}, ar, {delta});\n"
         + "#else\n" + original + "#endif\n\n" + s[finish:])
p.write_text(s)
