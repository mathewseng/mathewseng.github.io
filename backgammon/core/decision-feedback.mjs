// SPDX-License-Identifier: GPL-3.0-or-later
// Compare one decision at identical settings and in the ORIGINAL cube units.
export const REVISION_WARNING_LOSS = 0.002;
export const needsRevisionWarning = loss => Number.isFinite(loss) && loss > REVISION_WARNING_LOSS + 1e-10;
export function lossTone(loss) {
  if (!Number.isFinite(loss) || loss < 0)
    throw new Error("Invalid decision loss.");
  // Presentation bands, not a claim of statistically significant errors or PR.
  return loss <= 1e-7
    ? { tone: "perfect", label: "Best evaluated" }
    : loss < 0.02
      ? { tone: "close", label: "Small difference" }
      : loss < 0.05
        ? { tone: "small", label: "Some loss" }
        : loss < 0.1
          ? { tone: "medium", label: "Larger loss" }
          : { tone: "large", label: "High loss" };
}
// GNUbg's five nested chances for the player on roll, as one row per player:
// winning at all, by a gammon or better, and by a backgammon.
export function outcomeChances(probabilities, player) {
  if (!Array.isArray(probabilities) || probabilities.length < 5 || ![0, 1].includes(player) ||
      probabilities.slice(0, 5).some((n) => !Number.isFinite(n)))
    return null;
  const clamp = (n) => Math.min(1, Math.max(0, n));
  const [win, gammon, backgammon, loseGammon, loseBackgammon] = probabilities.map(clamp);
  return [
    { player, win, gammon, backgammon },
    { player: 1 - player, win: 1 - win, gammon: loseGammon, backgammon: loseBackgammon },
  ].sort((a, b) => a.player - b.player);
}
export function decisionFeedback(result, source = null) {
  if (
    !["checker", "cube"].includes(result.type) ||
    result.status !== "complete"
  )
    throw new Error("A completed decision evaluation is required.");
  const best =
      result.type === "cube"
        ? result.decision?.best
        : result.candidates?.[0],
    actual =
      result.type === "cube" ? result.decision?.actual : result.actual;
  if (
    !best ||
    !actual ||
    ![best.equity, actual.equity].every(Number.isFinite)
  )
    throw new Error("The played decision has not been evaluated.");
  const loss = Math.max(0, best.equity - actual.equity),
    money = result.units === "current-cube-points";
  const cube = source?.cube?.value ?? 1;
  const row = (c) => ({ ...c, ev: money ? c.equity * cube : null });
  return {
    best: row(best),
    actual: row(actual),
    before: row(best),
    choices:
      result.type === "cube" ? result.decision.choices.map(row) : null,
    loss,
    ...lossTone(loss),
    quality: lossTone(loss).label,
    perspective: result.decision?.player ?? result.perspective,
    // Chances always describe the player on roll. Cube choices share the
    // position's chances; each checker move carries its own.
    chancePlayer: result.perspective,
    positionChances: result.type === "cube" ? result.probabilities ?? null : null,
    cube,
    money,
    label: money ? "EV lost" : "Equity lost",
    value: loss.toFixed(3),
    units: money ? "current-cube points" : "normalized match equity",
    matchChanceLoss:
      !money && Number.isFinite(best.mwc) && Number.isFinite(actual.mwc)
        ? Math.max(0, best.mwc - actual.mwc) * 100
        : null,
  };
}
