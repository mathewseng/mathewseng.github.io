// Solves two-player Pig for the win (Neller & Presser, "Optimal Play of the Dice Game Pig").
// Usage: node dice/pig/scripts/solve.mjs [targets…]   (default: 50 100)
//
// P(i, j, k) is the chance that the player to move wins with banked score i, opponent score j
// and turn total k:
//   roll = 1/6 · (1 − P(j, i, 0)) + Σ_{r=2..6} 1/6 · P(i, j, k + r)   (P = 1 once i + k ≥ target)
//   hold = 1 − P(j, i + k, 0)                                         (only when k > 0)
//   P    = max(roll, hold)
// Value iteration (in place) runs until no state changes by more than TOLERANCE.
//
// Output: data/pig-<target>.bin, the start-of-turn slice P(i, j, 0) for i, j < target as
// little-endian Float64 in row-major order (index i·target + j). Every other state follows exactly
// from that slice: for fixed (i, j) the recurrence above runs backwards in k with only k = 0
// values of other (i, j) pairs, which is what engine.mjs does at run time.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TOLERANCE = 1e-12;

export function solve(target) {
  const T = target;
  const P = new Float64Array(T * T * T);
  const at = (i, j, k) => (i + k >= T ? 1 : P[(i * T + j) * T + k]);
  let sweeps = 0;
  let delta = 1;
  while (delta > TOLERANCE) {
    delta = 0;
    sweeps += 1;
    for (let i = T - 1; i >= 0; i -= 1) {
      for (let j = T - 1; j >= 0; j -= 1) {
        const pass = (1 - P[(j * T + i) * T]) / 6;
        const base = (i * T + j) * T;
        for (let k = T - i - 1; k >= 0; k -= 1) {
          const roll = pass + (at(i, j, k + 2) + at(i, j, k + 3) + at(i, j, k + 4) + at(i, j, k + 5) + at(i, j, k + 6)) / 6;
          const value = k > 0 ? Math.max(roll, 1 - P[(j * T + i + k) * T]) : roll;
          const change = Math.abs(value - P[base + k]);
          if (change > delta) delta = change;
          P[base + k] = value;
        }
      }
    }
  }
  return { P, at, sweeps, delta };
}

// The run-time reconstruction (mirrors engine.mjs) for checking the slice.
function rowFromSlice(slice, T, i, j) {
  const row = new Float64Array(T - i + 6).fill(1);
  const pass = (1 - slice[j * T + i]) / 6;
  for (let k = T - i - 1; k >= 0; k -= 1) {
    const roll = pass + (row[k + 2] + row[k + 3] + row[k + 4] + row[k + 5] + row[k + 6]) / 6;
    row[k] = k > 0 ? Math.max(roll, 1 - slice[j * T + i + k]) : roll;
  }
  return row;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2).map(Number).filter(Boolean);
  const outDir = new URL('../data/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const T of targets.length ? targets : [50, 100]) {
    const started = Date.now();
    const { P, at, sweeps, delta } = solve(T);
    const slice = new Float64Array(T * T);
    for (let i = 0; i < T; i += 1) for (let j = 0; j < T; j += 1) slice[i * T + j] = P[(i * T + j) * T];
    let worst = 0;
    let rollStates = 0;
    let states = 0;
    for (let i = 0; i < T; i += 1) {
      for (let j = 0; j < T; j += 1) {
        const row = rowFromSlice(slice, T, i, j);
        for (let k = 0; k < T - i; k += 1) {
          worst = Math.max(worst, Math.abs(row[k] - at(i, j, k)));
          states += 1;
          if (k > 0) {
            const roll = (1 - slice[j * T + i]) / 6 + (row[k + 2] + row[k + 3] + row[k + 4] + row[k + 5] + row[k + 6]) / 6;
            if (roll > 1 - slice[j * T + i + k]) rollStates += 1;
          }
        }
      }
    }
    const buffer = Buffer.alloc(slice.length * 8);
    slice.forEach((value, index) => buffer.writeDoubleLE(value, index * 8));
    const file = new URL(`pig-${T}.bin`, outDir);
    writeFileSync(file, buffer);
    console.log(`target ${T}: ${states} states, ${sweeps} sweeps, last change ${delta.toExponential(2)}, `
      + `P(0,0,0) = ${at(0, 0, 0).toFixed(6)}, slice rebuild error ${worst.toExponential(2)}, `
      + `roll in ${rollStates} of ${states - T * T} k>0 states, ${buffer.length} bytes, ${Date.now() - started} ms`);
  }
}
