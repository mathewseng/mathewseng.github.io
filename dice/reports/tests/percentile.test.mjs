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
  near(tracker.percentile(-1n).lower, (100 * 5) / 12);
  near(tracker.percentile(5n).lower, (100 * 11) / 12);
  tracker.append(game);
  near(tracker.percentile(4n).lower, (100 * 30) / 36);
  near(tracker.percentile(10n).lower, (100 * 71) / 72);
  assert.equal(tracker.percentile(4n).exact, true);
  assert.equal(tracker.percentile(4n).rounds, 2);
  const zeros = createPercentileTracker();
  zeros.append({ n: 1, mode: "sum", payouts: [0, 0, 0, 0, 0, 0] });
  near(zeros.percentile(0n).lower, 50);
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
      near(result.lower, brutePercentile(possible, pnl));
      near(result.upper, result.lower);
    }
  }
});

test("all session rolls count, and BigInt coordinates preserve one-unit differences above safe Number range", () => {
  const tracker = createPercentileTracker();
  for (let i = 0; i < 100; i++) tracker.append(coin);
  near(tracker.percentile(0n).lower, 50);
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
  near(big.percentile(top).lower, 87.5);
  near(big.percentile(top - 1n).lower, 75);
});

test("compressed distributions bound the true percentile at atoms, endpoints and gaps", () => {
  for (const maxBins of [2, 8, 32]) {
    const tracker = createPercentileTracker({ maxBins });
    let possible = [0n],
      sawRange = false;
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
        const result = tracker.percentile(pnl),
          truth = brutePercentile(possible, pnl);
        assert.ok(result.bins <= maxBins);
        assert.ok(result.lower <= truth + 1e-9, `${result.lower} <= ${truth}`);
        assert.ok(result.upper >= truth - 1e-9, `${result.upper} >= ${truth}`);
        assert.ok(result.lower >= 0 && result.upper <= 100);
        if (!result.exact) sawRange = true;
      }
    }
    assert.ok(sawRange);
  }
});

test("percentile formatting shows tails and outward-rounded ranges without inventing precision", () => {
  assert.equal(
    formatPercentile({ lower: 50, upper: 50, exact: true }),
    "50.0%",
  );
  assert.equal(
    formatPercentile({ lower: 0.001, upper: 0.001, exact: true }),
    "<0.1%",
  );
  assert.equal(
    formatPercentile({ lower: 99.999, upper: 99.999, exact: true }),
    ">99.9%",
  );
  assert.equal(
    formatPercentile({ lower: 60.15, upper: 60.21, exact: false }),
    "60.1–60.3%",
  );
  assert.throws(() => createPercentileTracker({ maxBins: 1 }));
  const tracker = createPercentileTracker();
  assert.throws(() => tracker.append({ n: 1, mode: "sum", payouts: [1] }));
  assert.equal(tracker.percentile(0n), null);
  tracker.append(coin);
  assert.throws(() => tracker.percentile(0));
});
