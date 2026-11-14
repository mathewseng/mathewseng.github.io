import test from "node:test";
import assert from "node:assert/strict";
import { initialState, positionKey } from "../core/rules.mjs";
import { equityFraction, equityReading } from "../core/equity-bar.mjs";
import { settingsDefaults } from "../core/storage.mjs";
test("equity bar is enabled by default; its fill measures equity against the leader's average win", () => {
  assert.equal(settingsDefaults.equityBar, true);
  assert.equal(equityFraction(0), 0.5);
  const side = (win, gammon = 0, backgammon = 0) => ({ win, gammon, backgammon });
  // Certain singles, gammons and backgammons all fill the rail for the winner.
  for (const [equity, mine] of [[1, side(1)], [2, side(1, 1)], [3, side(1, 1, 1)]]) {
    assert.equal(equityFraction(equity, [mine, side(0)]), 1);
    assert.equal(equityFraction(-equity, [side(0), mine]), 0);
  }
  // Without gammons the fill is the win chance; gammons widen the scale.
  assert.ok(Math.abs(equityFraction(0.5, [side(0.75), side(0.25)]) - 0.75) < 1e-12);
  const gammonish = equityFraction(0.75, [side(0.75, 0.25, 0.05), side(0.25, 0.05)]);
  assert.ok(gammonish > 0.75 && gammonish < 0.8);
  for (const e of [0.1, 0.6, 1, 3, 20]) {
    const chances = [side(0.6, 0.2), side(0.4, 0.1)];
    assert.ok(equityFraction(e, chances) > 0.5 && equityFraction(e, chances) <= 1);
    assert.ok(equityFraction(-e, chances) < 0.5 && equityFraction(-e, chances) >= 0);
    assert.ok(Math.abs(equityFraction(e) + equityFraction(-e) - 1) < 1e-10, "no chances: a plain symmetric scale");
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
  assert.equal(equityReading(source, result).chances, null, "a model without chances shows equity alone");
  const chances = equityReading(source, { ...result, actual: { equity: 0.2, probabilities: [0.6, 0.2, 0.01, 0.1, 0] } }).chances;
  assert.deepEqual(chances, [
    { player: 0, win: 0.4, gammon: 0.1, backgammon: 0, single: 0.30000000000000004, plainGammon: 0.1 },
    { player: 1, win: 0.6, gammon: 0.2, backgammon: 0.01, single: 0.39999999999999997, plainGammon: 0.19 },
  ], "chances are listed per player from the roller's five nested values, with the exclusive shares");
  for (const row of chances)
    assert.ok(Math.abs(row.single + row.plainGammon + row.backgammon - row.win) < 1e-12, "single, gammon and backgammon add up to the win chance");
  const before = equityReading(source, result, {beforeDecision:true});
  assert.equal(before.ivory, -0.4, "Play displays equity before the submitted choice");
  assert.equal(before.choice, "Before decision");
  assert.equal(result.actual.equity, .2, "review's actual grade is preserved");
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
