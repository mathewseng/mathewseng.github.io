// SPDX-License-Identifier: GPL-3.0-or-later
// Differences always compare evaluations from the SAME original decision,
// player perspective and settings. Match equity is not money-game EV.
export function decisionFeedback(result) {
  if (result.type !== "checker" || result.status !== "complete")
    throw new Error("A completed checker evaluation is required.");
  const best = result.candidates[0],
    actual = result.actual;
  if (!best || !actual || ![best.equity, actual.equity].every(Number.isFinite))
    throw new Error("The played move has not been evaluated.");
  const loss = Math.max(0, best.equity - actual.equity);
  const money = result.units === "current-cube-points";
  return {
    best,
    actual,
    loss,
    label: money ? "EV lost" : "Equity lost",
    value: loss.toFixed(3),
    units: money ? "current-cube points" : "normalized match equity",
    matchChanceLoss:
      !money && Number.isFinite(best.mwc) && Number.isFinite(actual.mwc)
        ? Math.max(0, best.mwc - actual.mwc) * 100
        : null,
  };
}
