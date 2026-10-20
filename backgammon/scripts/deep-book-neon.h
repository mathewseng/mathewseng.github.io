/* SPDX-License-Identifier: GPL-3.0-or-later
 * Offline ARM64 translation of bg6's WASM SIMD operations. Inputs are finite;
 * sigmoid indices are clamped to [0,100] before integer conversion.
 * Keep separate multiply/add operations; compile with -ffp-contract=off.
 */
#include <arm_neon.h>
#include <string.h>
typedef float32x4_t v128_t;
static inline v128_t wasm_v128_load(const void *p) { v128_t x; memcpy(&x,p,16); return x; }
static inline void wasm_v128_store(void *p,v128_t x) { memcpy(p,&x,16); }
#define wasm_f32x4_splat vdupq_n_f32
#define wasm_f32x4_add vaddq_f32
#define wasm_f32x4_sub vsubq_f32
#define wasm_f32x4_mul vmulq_f32
#define wasm_f32x4_div vdivq_f32
#define wasm_f32x4_abs vabsq_f32
#define wasm_f32x4_min vminq_f32
#define wasm_f32x4_ge(a,b) vreinterpretq_f32_u32(vcgeq_f32(a,b))
#define wasm_f32x4_lt(a,b) vreinterpretq_f32_u32(vcltq_f32(a,b))
#define wasm_f32x4_make(a,b,c,d) ((float32x4_t){a,b,c,d})
#define wasm_i32x4_splat(a) vreinterpretq_f32_s32(vdupq_n_s32(a))
#define wasm_i32x4_sub(a,b) vreinterpretq_f32_s32(vsubq_s32(vreinterpretq_s32_f32(a),vreinterpretq_s32_f32(b)))
#define wasm_i32x4_trunc_sat_f32x4(a) vreinterpretq_f32_s32(vcvtq_s32_f32(a))
#define wasm_f32x4_convert_i32x4(a) vcvtq_f32_s32(vreinterpretq_s32_f32(a))
#define wasm_i32x4_extract_lane(a,i) vgetq_lane_s32(vreinterpretq_s32_f32(a),i)
#define wasm_v128_bitselect(a,b,m) vbslq_f32(vreinterpretq_u32_f32(m),a,b)
