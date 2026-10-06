import { test } from "node:test";
import assert from "node:assert/strict";
import { decisionFeedback } from "../core/decision-feedback.mjs";

const result = (units, best, actual) => ({
  type: "checker",
  status: "complete",
  units,
  candidates: [best, actual],
  actual,
});
test("money feedback uses current-cube equity, including negative equities", () => {
  const f = decisionFeedback(
    result("current-cube-points", { equity: -0.25 }, { equity: -0.41 }),
  );
  assert.equal(f.value, "0.160");
  assert.equal(f.label, "EV lost");
  assert.equal(f.units, "current-cube points");
  assert.equal(f.matchChanceLoss, null);
});
test("match equity and match-winning chance remain separate units", () => {
  for (const perspective of [0, 1]) {
    const r = result(
      "normalized-match-equity",
      { equity: 0.82, mwc: 0.76 },
      { equity: 0.62, mwc: 0.71 },
    );
    r.perspective = perspective;
    const f = decisionFeedback(r);
    assert.equal(f.label, "Equity lost");
    assert.equal(f.value, "0.200");
    assert.ok(Math.abs(f.matchChanceLoss - 5) < 1e-10);
  }
});
test("equivalent decisions have zero loss and incomplete results never get a made-up grade", () => {
  assert.equal(
    decisionFeedback(
      result("current-cube-points", { equity: 0.1 }, { equity: 0.1 }),
    ).value,
    "0.000",
  );
  for (const r of [
    { type: "cube" },
    { ...result("current-cube-points", { equity: 1 }, null) },
    { ...result("current-cube-points", { equity: NaN }, { equity: 1 }) },
  ])
    assert.throws(() => decisionFeedback(r));
});
