import { rankedFingerings } from './ranking.mjs?v=20261118-layout';

const bitCounts = new Uint8Array(1 << 13);
for (let bits = 1; bits < bitCounts.length; bits++) {
  bitCounts[bits] = bitCounts[bits >> 1] + (bits & 1);
}

let choices;
let minimums;

export function noteMoveCounts() {
  if (minimums) return minimums;
  choices = Array.from({ length: 12 }, (_, pitch) =>
    rankedFingerings(60 + pitch).map(f => ({ ...f, mask: parseInt(f.bits, 2) }))
  );
  minimums = Array.from({ length: 12 }, () => Array(12).fill(null));
  for (let from = 0; from < 12; from++) {
    for (let to = from + 1; to < 12; to++) {
      let best = 13;
      for (const a of choices[from]) {
        for (const b of choices[to]) {
          if (a.shift === b.shift) best = Math.min(best, bitCounts[a.mask ^ b.mask]);
        }
        if (best === 1) break; // Different pitches always require at least one toggle.
      }
      minimums[from][to] = minimums[to][from] = best;
    }
  }
  return minimums;
}

function compareSimplicity(a, b) {
  return a.sideTouches - b.sideTouches
    || a.comfort - b.comfort
    || (a.from.rank + a.to.rank) - (b.from.rank + b.to.rank)
    || a.from.rank - b.from.rank;
}

export function bestNoteMoves(from, to) {
  const toggles = noteMoveCounts()[from][to];
  const options = [];
  let total = 0;
  if (toggles === null) return { toggles, total, options };
  for (const a of choices[from]) {
    for (const b of choices[to]) {
      if (a.shift !== b.shift || bitCounts[a.mask ^ b.mask] !== toggles) continue;
      total++;
      const move = { from: a, to: b, sideTouches: a.sideCount + b.sideCount, comfort: a.comfortCost + b.comfortCost };
      const index = options.findIndex(option => compareSimplicity(move, option) < 0);
      if (index !== -1) options.splice(index, 0, move);
      else if (options.length < 6) options.push(move);
      if (options.length > 6) options.pop();
    }
  }
  return { toggles, total, options };
}
