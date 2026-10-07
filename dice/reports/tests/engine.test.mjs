import test from "node:test";
import assert from "node:assert/strict";
import {
  weights,
  evNumerator,
  isFair,
  solveFinal,
  normalizeOptions,
  filterReasons,
  metrics,
  enumerate,
  compareSchedules,
  FEATURED,
} from "../engine.mjs";

test("exact binomial outcome weights for every supported dice count", () => {
  const expected = {
    2: [25, 10, 1],
    3: [125, 75, 15, 1],
    4: [625, 500, 150, 20, 1],
    5: [3125, 3125, 1250, 250, 25, 1],
    6: [15625, 18750, 9375, 2500, 375, 30, 1],
  };
  for (const [n, w] of Object.entries(expected)) {
    assert.deepEqual(weights(+n), w);
    assert.equal(
      w.reduce((a, b) => a + b),
      6 ** +n,
    );
  }
  assert.throws(() => weights(7));
  assert.throws(() => weights(2.5));
});
test("both requested schedules are exactly fair; one-unit perturbations are not", () => {
  for (const n of [3, 4]) {
    const p = FEATURED[n];
    assert.equal(evNumerator(n, p), 0n);
    assert.ok(isFair(n, p));
    for (let k = 0; k <= n; k++) {
      for (const delta of [-1, 1]) {
        const unfair = p.map((v, i) => v + (i === k ? delta : 0));
        assert.equal(evNumerator(n, unfair), BigInt(weights(n)[k] * delta));
        assert.equal(isFair(n, unfair), false);
      }
    }
  }
  assert.equal(evNumerator(2, [-1, 1, 5]), -10n);
});
test("BigInt EV and final solving do not round even far above safe Number precision", () => {
  const huge = 900719925474099312345678901234567890n;
  assert.equal(evNumerator(2, [-huge, 0n, 25n * huge]), 0n);
  assert.equal(evNumerator(2, [-huge, 0n, 25n * huge + 1n]), 1n);
  assert.equal(solveFinal(2, [-huge, 0]), 25n * huge);
  assert.throws(() => evNumerator(2, [1.5, 2, 3]));
  assert.throws(() => evNumerator(2, [Number.MAX_SAFE_INTEGER + 1, 2, 3]));
  assert.throws(() => evNumerator(2, [1, 2]));
  assert.throws(() => evNumerator(2, ["", 2, 3]));
});
test("solve the final payout from every preceding payout", () => {
  assert.equal(solveFinal(3, [-2, 1, 8]), 55n);
  assert.equal(solveFinal(4, [-2, 1, 3, 12]), 60n);
  assert.equal(solveFinal(4, [-2, 1, 3, 11]), 80n);
  assert.equal(solveFinal(2, [1, 2]), -45n);
  assert.throws(() => solveFinal(3, [-2, 1]));
});
test("filters cover zeros, strict order, bounds, and exact fairness", () => {
  assert.deepEqual(filterReasons(FEATURED[4]), []);
  assert.ok(filterReasons(FEATURED[4], { maxPayout: 59 }).length);
  assert.ok(filterReasons(FEATURED[4], { minP0: -1 }).length);
  assert.ok(filterReasons([-1, 0, 25], { n: 2 }).length);
  assert.deepEqual(filterReasons([-1, 0, 25], { n: 2, allowZero: true }), []);
  assert.ok(filterReasons([-1, 3, -5], { n: 2 }).length);
  assert.deepEqual(filterReasons([-1, 3, -5], { n: 2, strict: false }), []);
  assert.ok(
    filterReasons([-1, 3, -5], { n: 2, strict: false, minP0: -2 }).length,
  );
  assert.throws(() => normalizeOptions({ minP0: 0, maxP0: -1 }));
  assert.throws(() => normalizeOptions({ maxPayout: 1000001 }));
  assert.throws(() => normalizeOptions({ maxPayout: 100.5 }));
  assert.throws(() => normalizeOptions({ limit: 201 }));
});
function brute(o) {
  const rows = [];
  function visit(p) {
    if (p.length === o.n + 1) {
      if (filterReasons(p, o).length === 0)
        rows.push({ payouts: p, metrics: metrics(o.n, p) });
      return;
    }
    const lo = o.minP0,
      hi = p.length ? o.maxPayout : o.maxP0;
    for (let v = lo; v <= hi; v++) visit([...p, v]);
  }
  visit([]);
  return rows.sort(compareSchedules(o.sort));
}
test("pruned enumeration equals an independent exhaustive Cartesian search", () => {
  for (const n of [2, 3, 4])
    for (const strict of [true, false])
      for (const allowZero of [true, false]) {
        const o = normalizeOptions({
          n,
          minP0: -2,
          maxP0: 1,
          maxPayout: 5,
          strict,
          allowZero,
          sort: "lowest-max",
          limit: 200,
        });
        const expected = brute(o),
          actual = enumerate(o, { maxMs: Infinity, maxNodes: Infinity });
        assert.equal(actual.complete, true);
        assert.equal(actual.found, expected.length, JSON.stringify(o));
        assert.deepEqual(actual.rows, expected.slice(0, 200));
      }
});
test("all defaults complete, generated schedules pass all filters, and references are naturally enumerated", () => {
  for (let n = 2; n <= 6; n++) {
    const result = enumerate({ n }, { maxMs: Infinity });
    assert.equal(result.complete, true);
    assert.ok(result.found > 0);
    for (const { payouts } of result.rows)
      assert.deepEqual(filterReasons(payouts, { n }), []);
  }
  for (const n of [3, 4]) {
    const result = enumerate(
      { n, minP0: -2, maxP0: -2, limit: 200, sort: "jackpot" },
      { maxMs: Infinity },
    );
    assert.ok(result.rows.some((r) => r.payouts.join() === FEATURED[n].join()));
  }
});
test("bounded search is explicitly partial, ranks explored results, and respects cap", () => {
  const o = {
    n: 6,
    maxPayout: 10000,
    strict: false,
    allowZero: true,
    sort: "jackpot",
    limit: 15,
  };
  const result = enumerate(o, { maxNodes: 3000, maxMs: Infinity });
  assert.equal(result.complete, false);
  assert.equal(result.nodes, 3000);
  assert.ok(result.rows.length <= 15);
  for (const row of result.rows)
    assert.deepEqual(filterReasons(row.payouts, o), []);
  assert.deepEqual(
    result.rows,
    [...result.rows].sort(compareSchedules(o.sort)),
  );
});
test("ranking orders, result limits, and no-solution cases", () => {
  for (const sort of [
    "recommended",
    "smoothest",
    "steepest",
    "lowest-max",
    "jackpot",
    "lowest-loss",
    "largest-jump",
    "range",
  ]) {
    const result = enumerate({ sort, limit: 7 });
    assert.ok(result.rows.length <= 7);
    assert.deepEqual(
      result.rows,
      [...result.rows].sort(compareSchedules(sort)),
    );
  }
  const empty = enumerate({ n: 6, maxPayout: 2, minP0: -1, maxP0: -1 });
  assert.equal(empty.complete, true);
  assert.equal(empty.found, 0);
});
test("style and probability metrics have documented meanings", () => {
  const m = metrics(4, [-4, 2, 8, 14, 20]);
  assert.equal(m.smoothness, 100);
  assert.equal(m.steepness, 50);
  assert.deepEqual(m.jumps, [6, 6, 6, 6]);
  assert.equal(m.largestJump, 6);
  assert.equal(m.range, 24);
  assert.equal(m.max, 20);
  assert.equal(m.winWeight, 671);
  assert.equal(m.total, 1296);
  assert.equal(metrics(4, [-1, -1, -1, -1, 10]).steepness, 100);
  assert.equal(metrics(2, [0, 0, 0]).smoothness, 100);
  assert.equal(metrics(2, [0, 0, 0]).steepness, 0);
  const nonlinear = metrics(4, FEATURED[4]);
  assert.ok(nonlinear.smoothness < 100);
  assert.ok(nonlinear.steepness > 50);
});
