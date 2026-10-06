// SPDX-License-Identifier: GPL-3.0-or-later
import { positionKey } from "./rules.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
// The rail is a nonlinear equity scale, never a win-probability display.
export function equityFraction(equity) {
  return (1 + equity / (1 + Math.abs(equity))) / 2;
}
export function equityReading(source, result) {
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
      : graded.actual || graded.candidates?.[0];
  const perspective = graded.decision?.player ?? graded.perspective;
  if (
    !candidate ||
    !Number.isFinite(candidate.equity) ||
    ![0, 1].includes(perspective)
  )
    return null;
  return {
    ivory: perspective === 0 ? candidate.equity : -candidate.equity,
    units:
      graded.units === "current-cube-points"
        ? "current-cube points"
        : "normalized match equity",
    setting: graded.settings.name,
    choice: graded.actual ? "Your choice" : "Best continuation",
  };
}
