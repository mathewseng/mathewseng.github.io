# SPDX-License-Identifier: GPL-3.0-or-later
"""Research-only four-lane activation; preserve the original sigmoid arithmetic."""
from pathlib import Path
import sys

p = Path(sys.argv[1]) / 'src/lib/neuralnet.c'
s = p.read_text()
needle = 'static void\nEvaluate(const neuralnet * pnn'
assert s.count(needle) == 1
helper = '''/* Four independent hidden activations. Lookup indices are bounded before
 * scalar gathers. Keep sigmoid.h's arithmetic order and cutoff constants;
 * no approximation change, fused operation, or reassociated reduction. */
static void
ActivateHidden(float *ar, unsigned int count, float beta)
{
    unsigned int i = 0;
#ifdef __wasm_simd128__
    const v128_t zero = wasm_f32x4_splat(0.0f);
    const v128_t one = wasm_f32x4_splat(1.0f);
    const v128_t ten = wasm_f32x4_splat(10.0f);
    const v128_t scale = wasm_f32x4_splat(-beta);
    for (; i + 4 <= count; i += 4) {
        const v128_t xin = wasm_f32x4_mul(scale, wasm_v128_load(ar + i));
        const v128_t magnitude = wasm_f32x4_abs(xin);
        const v128_t x1 = wasm_f32x4_mul(ten, wasm_f32x4_min(magnitude, ten));
        const v128_t index = wasm_i32x4_trunc_sat_f32x4(x1);
        const v128_t lookup = wasm_f32x4_make(
            e[wasm_i32x4_extract_lane(index, 0)], e[wasm_i32x4_extract_lane(index, 1)],
            e[wasm_i32x4_extract_lane(index, 2)], e[wasm_i32x4_extract_lane(index, 3)]);
        const v128_t fraction = wasm_f32x4_add(
            wasm_f32x4_convert_i32x4(wasm_i32x4_sub(wasm_i32x4_splat(10), index)), x1);
        const v128_t reciprocal = wasm_f32x4_div(one,
            wasm_f32x4_add(one, wasm_f32x4_mul(lookup, fraction)));
        const v128_t positive = wasm_f32x4_ge(xin, zero);
        const v128_t normal = wasm_v128_bitselect(reciprocal,
            wasm_f32x4_sub(one, reciprocal), positive);
        const v128_t extreme = wasm_v128_bitselect(wasm_f32x4_splat(1.0f / 19931.370438230298f),
            wasm_f32x4_splat(19930.370438230298f / 19931.370438230298f), positive);
        wasm_v128_store(ar + i, wasm_v128_bitselect(normal, extreme, wasm_f32x4_lt(magnitude, ten)));
    }
#endif
    for (; i < count; i++) ar[i] = sigmoid(-beta * ar[i]);
}

'''
s = s.replace(needle, helper + needle)
for n in ['cHidden', 'pnn->cHidden']:
    old = f'    for (i = 0; i < {n}; i++)\n        ar[i] = sigmoid(-pnn->rBetaHidden * ar[i]);'
    assert s.count(old) == 1
    s = s.replace(old, f'    ActivateHidden(ar, {n}, pnn->rBetaHidden);')
p.write_text(s)
