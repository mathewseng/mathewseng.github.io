// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey } from "./rules.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
import { outcomeChances } from "./decision-feedback.mjs";
// The bottom player's share of the rail. Equity is measured against the
// average size of the leader's wins, so a certain single game, gammon or
// backgammon fills the rail, and without gammons the share is the win chance.
export function equityFraction(equity, chances = null) {
  const side = chances?.[equity >= 0 ? 0 : 1];
  const size = side?.win > 0 ? (side.win + side.gammon + side.backgammon) / side.win : 1;
  return Math.min(1, Math.max(0, (1 + equity / Math.max(1, size)) / 2));
}
export function equityReading(source, result, {beforeDecision = false} = {}) {
  if (
    !result ||
    result.status !== "complete" ||
    result.positionKey !== positionKey(source)
  )
    return null;
  const graded =
    result.type === "cube" && result.available !== false && !result.decision
      ? gradeCube(
          source,
          result,
          source.phase === "double" ? "take" : "roll",
        )
      : result;
  const candidate =
    graded.type === "cube"
      ? graded.available === false
        ? { equity: graded.outcomes?.[0] }
        : graded.decision.best
      : (!beforeDecision && graded.actual) || graded.candidates?.[0];
  const perspective = graded.decision?.player ?? graded.perspective;
  if (
    !candidate ||
    !Number.isFinite(candidate.equity) ||
    ![0, 1].includes(perspective)
  )
    return null;
  return {
    ivory: perspective === 0 ? candidate.equity : -candidate.equity,
    // One row per player (ivory first), or null when the model has no chances.
    chances: outcomeChances(candidate.probabilities ?? graded.probabilities, graded.perspective),
    units:
      graded.units === "current-cube-points"
        ? "current-cube points"
        : "normalized match equity",
    setting: graded.settings.name,
    choice: beforeDecision ? "Before decision" : graded.actual ? "Your choice" : "Best continuation",
  };
}
