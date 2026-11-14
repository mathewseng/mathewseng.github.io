// Solves two-player Farkle for the win, the way Neller & Presser solved Pig and Farkle, for this
// site's scoring and final-round rule.
// Usage: node dice/farkle/scripts/solve.mjs [target:opening …]   (default: all four tables)
//
// W(b, d) is the chance that the player about to start a turn with b banked beats d (units of
// 50; a final-round tie counts as half). One turn of (b, d) is a finite problem over the turn
// total once three things are known (engine.mjs: winSetup and solveTurn):
//   bank t  → 1 − W(d, b + t), or, when b + t reaches the target, 1 − G(b + t − d) where G is the
//             rival's chance on their last turn (engine.mjs: finalTable)
//   Farkle  → 1 − W(d, b)
// Banking only raises scores, so pairs are solved from the highest b + d down. (b, d) and (d, b)
// depend on each other only through their Farkle values. For fixed choices each start value is
// linear in its Farkle value, W(b, d) = a + c·(1 − W(d, b)), so the pair is a 2 × 2 linear system:
// solve it, re-solve both turns at the new values, and repeat until nothing moves (policy
// iteration; it settles in a few rounds).
//
// Output: data/farkle-<target>-<opening>.bin, W(b, d) as little-endian Float64 at b·T + d.
// Checks: the Bellman residual at every start state, how often a turn's value falls as its total
// rises (it does just short of the target, which is why the solver weighs every keep, not only
// the highest-scoring one), and the first player's chance at 0–0.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UNIT, winSetup, solveTurn } from '../engine.mjs';

const TOLERANCE = 1e-15;

function turnAt(T, W, b, d, f, openingUnits) {
  return solveTurn({ ...winSetup({ T, W, b, d, f, openingUnits }) });
}

export function solve(target, opening) {
  const T = target / UNIT;
  const openingUnits = opening / UNIT;
  const W = new Float64Array(T * T).fill(0.5);
  let rounds = 0;
  let worst = 0;
  for (let s = 2 * T - 2; s >= 0; s -= 1) {
    for (let b = Math.max(0, s - T + 1); b <= Math.min(T - 1, s); b += 1) {
      const d = s - b;
      if (b > d) continue;
      // A good first guess: the neighbouring solved pair.
      let y = d + 1 < T ? W[b * T + d + 1] : 0.5;
      let x = b + 1 < T ? W[d * T + b + 1] : 0.5;
      for (let round = 1; ; round += 1) {
        if (b === d) {
          const r = turnAt(T, W, b, b, 1 - y, openingUnits).start;
          const next = (r.a + r.c) / (1 + r.c);
          const moved = Math.abs(next - y);
          y = next;
          if (moved < TOLERANCE || round > 60) { rounds += round; worst = Math.max(worst, round); break; }
          continue;
        }
        const one = turnAt(T, W, b, d, 1 - x, openingUnits).start; // y = a1 + c1·(1 − x)
        const two = turnAt(T, W, d, b, 1 - y, openingUnits).start; // x = a2 + c2·(1 − y)
        const ny = (one.a + one.c - one.c * (two.a + two.c)) / (1 - one.c * two.c);
        const nx = two.a + two.c * (1 - ny);
        const moved = Math.max(Math.abs(ny - y), Math.abs(nx - x));
        y = ny;
        x = nx;
        if (moved < TOLERANCE || round > 60) { rounds += round; worst = Math.max(worst, round); break; }
      }
      W[b * T + d] = y;
      W[d * T + b] = b === d ? y : x;
    }
  }
  return { T, W, rounds, worst };
}

export function verify(target, opening, W) {
  const T = target / UNIT;
  const openingUnits = opening / UNIT;
  let residual = 0;
  let dips = 0;
  for (let b = 0; b < T; b += 1) {
    for (let d = 0; d < T; d += 1) {
      const turn = turnAt(T, W, b, d, 1 - W[d * T + b], openingUnits);
      residual = Math.max(residual, Math.abs(turn.roll(0, 6) - W[b * T + d]));
      const value = (t, k) => (t < turn.top ? turn.VA[t * 7 + k] + turn.VC[t * 7 + k] * turn.f : turn.bank(t));
      for (let k = 1; k <= 6; k += 1) {
        for (let t = 1; t < turn.top; t += 1) if (value(t + 1, k) < value(t, k) - 1e-12) dips += 1;
      }
    }
  }
  return { residual, dips };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const jobs = args.length ? args.map((arg) => arg.split(':').map(Number)) : [[5000, 0], [5000, 500], [10000, 0], [10000, 500]];
  const outDir = new URL('../data/', import.meta.url);
  mkdirSync(outDir, { recursive: true });
  for (const [target, opening = 0] of jobs) {
    const started = Date.now();
    const { T, W, rounds, worst } = solve(target, opening);
    const solved = Date.now();
    const { residual, dips } = verify(target, opening, W);
    const bytes = new Uint8Array(W.length * 8);
    const view = new DataView(bytes.buffer);
    W.forEach((value, i) => view.setFloat64(i * 8, value, true));
    const name = `farkle-${target}-${opening}.bin`;
    writeFileSync(new URL(name, outDir), bytes);
    const pairs = (T * (T + 1)) / 2;
    console.log(`${name}: ${bytes.length} bytes; solved in ${((solved - started) / 1000).toFixed(1)} s (${(rounds / pairs).toFixed(2)} rounds a pair, worst ${worst}), checked in ${((Date.now() - solved) / 1000).toFixed(1)} s`);
    console.log(`  Bellman residual ${residual.toExponential(2)}; spots where a bigger turn total is worth less: ${dips}; first player at 0–0: ${(W[0] * 100).toFixed(3)}%`);
  }
}
