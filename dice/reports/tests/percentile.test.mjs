import test from "node:test";
import assert from "node:assert/strict";
import { createPercentileTracker, formatPercentile } from "../percentile.mjs";
import { scoreRoll } from "../game.mjs";

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);
const coin = { n: 1, mode: "sum", payouts: [-1, -1, -1, 1, 1, 1] };
function orderedPayouts(game) {
  return Array.from({ length: 6 ** game.n }, (_, encoded) => {
    const roll = Array.from({ length: game.n }, () => {
      const face = (encoded % 6) + 1;
      encoded = Math.floor(encoded / 6);
      return face;
    });
    return BigInt(scoreRoll(game, roll).payout);
  });
}
function brutePercentile(results, observed) {
  return (
    (100 *
      results.reduce(
        (sum, p) => sum + (p < observed ? 1 : p === observed ? 0.5 : 0),
        0,
      )) /
    results.length
  );
}

test("session percentile uses probability weights and midpoint ties, not category ranks", () => {
  const tracker = createPercentileTracker();
  assert.equal(tracker.percentile(0n), null);
  const game = { n: 2, mode: "single", payouts: [-1, 5] };
  tracker.append(game);
  near(tracker.percentile(-1n).value, (100 * 5) / 12);
  near(tracker.percentile(5n).value, (100 * 11) / 12);
  tracker.append(game);
  near(tracker.percentile(4n).value, (100 * 30) / 36);
  near(tracker.percentile(10n).value, (100 * 71) / 72);
  assert.equal(tracker.percentile(4n).exact, true);
  assert.equal(tracker.percentile(4n).rounds, 2);
  const zeros = createPercentileTracker();
  zeros.append({ n: 1, mode: "sum", payouts: [0, 0, 0, 0, 0, 0] });
  near(zeros.percentile(0n).value, 50);
});

test("mixed schedules match independent enumeration of all ordered roll combinations", () => {
  for (const game of [
    { n: 2, mode: "chosen", payouts: [-1, 0, 25] },
    { n: 2, mode: "full", payouts: [-1, 5] },
    { n: 3, mode: "single", payouts: [-1, 0, 20] },
  ]) {
    const tracker = createPercentileTracker();
    tracker.append(coin);
    tracker.append(game);
    const possible = orderedPayouts(coin).flatMap((a) =>
      orderedPayouts(game).map((b) => a + b),
    );
    for (const pnl of new Set(possible)) {
      const result = tracker.percentile(pnl);
      assert.equal(result.exact, true);
      near(result.value, brutePercentile(possible, pnl));
    }
  }
});

test("all session rolls count, and BigInt coordinates preserve one-unit differences above safe Number range", () => {
  const tracker = createPercentileTracker();
  for (let i = 0; i < 100; i++) tracker.append(coin);
  near(tracker.percentile(0n).value, 50);
  assert.equal(tracker.percentile(0n).rounds, 100);
  const huge = Number.MAX_SAFE_INTEGER;
  const big = createPercentileTracker();
  const game = {
    n: 1,
    mode: "sum",
    payouts: [-huge, -huge, -huge, huge, huge, huge],
  };
  big.append(game);
  big.append(game);
  const top = BigInt(huge) * 2n;
  near(big.percentile(top).value, 87.5);
  near(big.percentile(top - 1n).value, 75);
});

test("dense and sparse distributions agree with independently enumerated sessions, including sigma coverage", () => {
  for (const maxDenseStates of [2, 10000]) {
    const tracker = createPercentileTracker({ maxDenseStates });
    let possible = [0n];
    for (const magnitude of [1, 7, 49, 343]) {
      const game = {
        n: 1,
        mode: "sum",
        payouts: [-magnitude, -1, 0, 0, 1, magnitude],
      };
      tracker.append(game);
      possible = possible.flatMap((a) =>
        game.payouts.map((p) => a + BigInt(p)),
      );
      const probes = new Set(possible.flatMap((p) => [p - 1n, p, p + 1n]));
      for (const pnl of probes) {
        const result = tracker.percentile(pnl);
        assert.equal(result.exact, true);
        near(result.value, brutePercentile(possible, pnl));
      }
      const result = tracker.percentile(0n);
      near(result.mean, 0);
      near(
        result.variance,
        possible.reduce((s, p) => s + Number(p) ** 2, 0) / possible.length,
      );
      for (const band of result.bands) {
        const inside = possible.filter(
          (p) =>
            p >= BigInt(Math.ceil(band.lower)) &&
            p <= BigInt(Math.floor(band.upper)),
        ).length;
        near(band.probability, (100 * inside) / possible.length);
      }
    }
  }
});

test("169-roll screenshot regression retains all PnL values and a single accurate percentile", () => {
  const tracker = createPercentileTracker();
  for (let i = 0; i < 169; i++)
    tracker.append({ n: 5, mode: "full", payouts: [-2, -1, 0, 2, 4, 8, 40] });
  const result = tracker.percentile(-14n);
  // Independent 45-digit Decimal convolution, using the ordered-roll counts
  // [720, 3600, 1800, 1200, 300, 150, 6] out of 7776.
  near(result.value, 32.116804047159707438);
  near(result.variance, 766.759259259259259);
  near(result.stdev, 27.690418184983397958);
  assert.equal(result.exact, true);
  assert.equal(result.states, 7099);
  assert.equal(formatPercentile(result), "32.1%");
  assert.equal(result.minimum, "-338");
  assert.equal(result.maximum, "6760");
  assert.ok(
    result.bands[0].probability > 69 && result.bands[0].probability < 70,
  );
});

test("session variance sums each played schedule and fixed payouts have no spread", () => {
  const tracker = createPercentileTracker();
  tracker.append(coin);
  tracker.append({ n: 2, mode: "single", payouts: [-1, 5] });
  const result = tracker.percentile(6n);
  near(result.variance, 6);
  near(result.stdev, Math.sqrt(6));
  near(result.zScore, Math.sqrt(6));
  near(result.value, (100 * 23) / 24);
  for (const [index, expected] of [250 / 3, 275 / 3, 100].entries())
    near(result.bands[index].probability, expected);
  const constant = createPercentileTracker();
  constant.append({ n: 1, mode: "sum", payouts: [0, 0, 0, 0, 0, 0] });
  const fixed = constant.percentile(0n);
  assert.equal(fixed.stdev, 0);
  assert.equal(fixed.zScore, null);
  assert.ok(fixed.bands.every((band) => band.probability === 100));
});

test("extreme state budgets explicitly mark a numeric estimate while retaining analytic variance", () => {
  const limited = createPercentileTracker({
    maxDenseStates: 2,
    maxSparseStates: 2,
  });
  const full = createPercentileTracker();
  for (let i = 0; i < 1000; i++) {
    limited.append(coin);
    full.append(coin);
  }
  for (const pnl of [-60n, -20n, 0n, 20n, 21n, 60n]) {
    const estimate = limited.percentile(pnl),
      truth = full.percentile(pnl);
    assert.equal(estimate.exact, false);
    assert.equal(estimate.variance, 1000);
    assert.ok(Math.abs(estimate.value - truth.value) < 0.1);
    assert.match(formatPercentile(estimate), /^\d+\.\d%$/);
    for (let i = 0; i < 3; i++)
      assert.ok(
        Math.abs(estimate.bands[i].probability - truth.bands[i].probability) <
          0.1,
      );
  }
});

test("percentile formatting always gives one number, and invalid inputs fail before updating", () => {
  assert.equal(formatPercentile({ value: 50 }), "50.0%");
  assert.equal(formatPercentile({ value: 0.001 }), "0.0%");
  assert.equal(formatPercentile({ value: 99.999 }), "100.0%");
  assert.equal(formatPercentile({ value: 60.15 }), "60.1%");
  assert.throws(() => createPercentileTracker({ maxDenseStates: 1 }));
  const tracker = createPercentileTracker();
  assert.throws(() => tracker.append({ n: 1, mode: "sum", payouts: [1] }));
  assert.equal(tracker.percentile(0n), null);
  tracker.append(coin);
  assert.throws(() => tracker.percentile(0));
});
