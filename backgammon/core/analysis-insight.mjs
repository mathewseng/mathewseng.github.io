// SPDX-License-Identifier: GPL-3.0-or-later
import { applyStep, pipCount } from "./rules.mjs";
export function moveFeatures(source, steps) {
  const after = steps.reduce((s, step) => applyStep(s, step), source),
    player = source.turn,
    sign = player === 0 ? 1 : -1;
  const owned = after.points.map((n) => n * sign);
  return {
    blots: owned.filter((n) => n === 1).length,
    madePoints: owned.filter((n) => n >= 2).length,
    hit: after.bar[1 - player] - source.bar[1 - player],
    borneOff: after.off[player] - source.off[player],
    pips: pipCount(after, player),
  };
}
export function comparisonSummary(result, previous = null) {
  const best = result.candidates?.[0],
    next = result.candidates?.[1];
  if (!best) return null;
  const gap = next ? best.equity - next.equity : null;
  const sampling =
    result.method === "rollout" && next
      ? 1.96 * (best.standardError + next.standardError)
      : null;
  return {
    gap,
    close: gap !== null && (sampling !== null ? gap <= sampling : gap < 0.02),
    sampling,
    changed: previous?.candidates?.[0]
      ? previous.candidates[0].key !== best.key
      : null,
    previousName: previous?.settings.name,
  };
}
