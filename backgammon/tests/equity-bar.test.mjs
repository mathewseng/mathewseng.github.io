import test from "node:test";
import assert from "node:assert/strict";
import { initialState, positionKey } from "../core/rules.mjs";
import { equityFraction, equityReading } from "../core/equity-bar.mjs";
import { settingsDefaults } from "../core/storage.mjs";
test("equity bar is opt-in; its symmetric nonlinear scale is not a probability", () => {
  assert.equal(settingsDefaults.equityBar, false);
  assert.equal(equityFraction(0), 0.5);
  for (const e of [0.1, 1, 3, 20]) {
    assert.ok(equityFraction(e) > 0.5 && equityFraction(e) < 1);
    assert.ok(Math.abs(equityFraction(e) + equityFraction(-e) - 1) < 1e-10);
  }
});
test("equity readings reject stale results and preserve actual choice, player and match units", () => {
  const source = initialState({ phase: "move", dice: [3, 1] });
  const result = {
    status: "complete",
    positionKey: positionKey(source),
    type: "checker",
    perspective: 1,
    units: "current-cube-points",
    settings: { name: "Quick" },
    candidates: [{ equity: 0.4 }],
    actual: { equity: 0.2 },
  };
  assert.equal(equityReading(source, result).ivory, -0.2);
  assert.equal(
    equityReading(source, { ...result, actual: null }).ivory,
    -0.4,
  );
  assert.equal(
    equityReading(source, { ...result, positionKey: "stale" }),
    null,
  );
  assert.equal(
    equityReading(source, { ...result, status: "pending" }),
    null,
  );
  const cube = {
    ...result,
    type: "cube",
    units: "normalized-match-equity",
    decision: { player: 0, best: { equity: 0.7 } },
  };
  assert.equal(equityReading(source, cube).ivory, 0.7);
  assert.equal(
    equityReading(source, cube).units,
    "normalized match equity",
  );
});

test("a player who cannot double sees continuation equity, not an illegal cube choice", () => {
  const source = initialState({
    phase: "roll",
    cube: { value: 2, owner: 1 },
  });
  const result = {
    type: "cube",
    status: "complete",
    positionKey: positionKey(source),
    perspective: 0,
    available: false,
    outcomes: [0.125, 0.8, 1],
    settings: { name: "Quick" },
    units: "current-cube-points",
  };
  assert.equal(equityReading(source, result).ivory, 0.125);
});
