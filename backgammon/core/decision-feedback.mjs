// SPDX-License-Identifier: GPL-3.0-or-later
// Compare one decision at identical settings and in the ORIGINAL cube units.
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
    loss,
    ...lossTone(loss),
    quality: lossTone(loss).label,
    perspective: result.decision?.player ?? result.perspective,
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
