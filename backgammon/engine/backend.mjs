// SPDX-License-Identifier: GPL-3.0-or-later
// A tiny module containing v128.const/drop is validated. Feature detection, not user-agent
// sniffing: the scalar build stays usable when SIMD is unsupported or rejected.
export function supportsSIMD(wasm = globalThis.WebAssembly) {
  try {
    return wasm.validate(new Uint8Array([
      0,97,115,109,1,0,0,0, 1,4,1,96,0,0, 3,2,1,0,
      10,23,1,21,0,253,12, 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, 26,11,
    ]));
  } catch { return false; }
}
export const backendPath = backend => backend === "simd" ? "./vendor/simd/" : "./vendor/";
