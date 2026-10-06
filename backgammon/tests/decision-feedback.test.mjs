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

test("cube responses reverse equity and match probabilities together; original cube defines EV", async () => {
  const { gradeCube } = await import("../engine/cube-grade.mjs");
  for (const turn of [0, 1]) {
    const source = {
      turn,
      phase: "double",
      pending: { by: turn },
      cube: { value: 4 },
    };
    const r = {
      type: "cube",
      status: "complete",
      units: "normalized-match-equity",
      outcomes: [0.6, 1.2, 1],
      outcomesMWC: [0.6, 0.75, 0.7],
      perspective: turn,
    };
    const f = decisionFeedback(gradeCube(source, r, "take"), source);
    assert.equal(f.perspective, 1 - turn);
    assert.equal(f.before.equity, -1);
    assert.equal(f.actual.equity, -1.2);
    assert.equal(f.actual.mwc, 0.25);
    assert.ok(Math.abs(f.best.mwc - 0.3) < 1e-9);
    assert.equal(f.actual.ev, null);
    assert.equal(f.value, "0.200");
    const money = decisionFeedback(
      gradeCube(
        source,
        { ...r, units: "current-cube-points", outcomesMWC: undefined },
        "take",
      ),
      source,
    );
    assert.equal(money.actual.ev, -4.8);
    assert.equal(money.best.ev, -4);
    assert.equal(money.tone, "large");
  }
});
test("cube offers, beavers and raccoons compare minimax alternatives without changing units", async () => {
  const { gradeCube } = await import("../engine/cube-grade.mjs");
  const r = {
    type: "cube",
    status: "complete",
    units: "current-cube-points",
    outcomes: [0.8, 1.2, 1],
  };
  const s = { phase: "roll", turn: 0, cube: { value: 2 } };
  const f = decisionFeedback(gradeCube(s, r, "roll"), s);
  assert.equal(f.best.action, "double");
  assert.equal(f.best.ev, 2);
  assert.equal(f.actual.ev, 1.6);
  for (const [by, chosen, best] of [
    [0, "beaver", "beaver"],
    [1, "raccoon", "take"],
  ]) {
    const source = { ...s, phase: "double", pending: { by } };
    const result = {
      ...r,
      decisionOptions: [
        { action: "take", equity: 0.4 },
        { action: "pass", equity: by === 0 ? 1 : -1 },
        { action: chosen, equity: -0.3 },
      ],
    };
    const f = decisionFeedback(gradeCube(source, result, chosen), source);
    assert.equal(f.best.action, best);
    assert.equal(f.actual.ev, by === 0 ? 0.6 : -0.6);
  }
  assert.throws(() => gradeCube(s, r, "beaver"), /legal/);
});
test("loss colors are monotonic, label best decisions accurately and reject invalid inputs", async () => {
  const { lossTone } = await import("../core/decision-feedback.mjs");
  assert.deepEqual(
    [0, 0.001, 0.019, 0.02, 0.049, 0.05, 0.099, 0.1, 1].map(
      (x) => lossTone(x).tone,
    ),
    [
      "perfect",
      "close",
      "close",
      "small",
      "small",
      "medium",
      "medium",
      "large",
      "large",
    ],
  );
  for (const x of [NaN, Infinity, -1]) assert.throws(() => lossTone(x));
  const f = decisionFeedback(
    result("current-cube-points", { equity: 0.25 }, { equity: 0.25 }),
    { cube: { value: 8 } },
  );
  assert.equal(f.before.ev, 2);
  assert.equal(f.actual.ev, 2);
  assert.equal(f.before.equity, f.best.equity);
});
