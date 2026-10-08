import test from "node:test";
import assert from "node:assert/strict";
import {
  weights,
  SORTS,
  PREFERRED_AMOUNTS,
  STARTING_LOSSES,
  startingLossPreference,
  amountSimplicity,
  scheduleSimplicity,
  outcomes,
  classifyHand,
  sortDisplayed,
  evNumerator,
  isFair,
  solveFinal,
  payoutDivisor,
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
  assert.ok(filterReasons([-1, 0, 25], { n: 2, allowZero: false }).length);
  assert.deepEqual(filterReasons([-1, 0, 25], { n: 2 }), []);
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
test("whole-schedule scaling uses an exact common divisor, including losses and zeros", () => {
  assert.equal(payoutDivisor([-2, 1, 4, 7, 10]), 1n);
  assert.equal(payoutDivisor([-4, 2, 8, 14, 20]), 2n);
  assert.equal(payoutDivisor([-5, 0, 125]), 5n);
  assert.equal(payoutDivisor([0, 0, 0]), 0n);
  const factor = 9007199254740993n;
  assert.equal(payoutDivisor([-factor, 0n, 25n * factor]), factor);
  assert.equal(payoutDivisor([-factor, 0n, 25n * factor + 1n]), 1n);
  assert.deepEqual(filterReasons(FEATURED[4]), []);
  assert.ok(isFair(4, [-4, 2, 8, 14, 20]));
  assert.match(filterReasons([-4, 2, 8, 14, 20]).join(), /2× scaled copy/);
  assert.match(
    filterReasons([0, 0, 0], {
      n: 2,
      minP0: 0,
      maxP0: 0,
      strict: false,
    }).join(),
    /starting-loss list/,
  );
});
test("every ranking excludes scaled copies before its result limit, including when the base is outside bounds", () => {
  for (const sort of SORTS) {
    const result = enumerate({ sort, limit: 200 });
    assert.ok(result.rows.length > 0);
    for (const row of result.rows) assert.equal(payoutDivisor(row.payouts), 1n);
  }
  const result = enumerate({
    minP0: -4,
    maxP0: -4,
    sort: "smoothest",
    limit: 200,
  });
  assert.ok(result.rows.length > 0);
  assert.ok(result.rows.every((row) => payoutDivisor(row.payouts) === 1n));
  assert.ok(!result.rows.some((row) => row.payouts.join() === "-4,2,8,14,20"));
  assert.ok(
    enumerate({ n: 2, limit: 200 }).rows.some((row) => row.payouts.includes(0)),
  );
});
function brute(o) {
  const rows = [];
  function visit(p) {
    if (p.length === weights(o.n, o.mode).length) {
      if (filterReasons(p, o).length === 0)
        rows.push({ payouts: p, metrics: metrics(o.n, p, o.mode) });
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
  for (const sort of SORTS) {
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

test("exact set distributions cover every roll and omit impossible categories", () => {
  const expected = {
    single: {
      2: [30, 6],
      3: [120, 90, 6],
      4: [360, 810, 120, 6],
      5: [720, 5400, 1500, 150, 6],
      6: [720, 28800, 14700, 2250, 180, 6],
    },
    full: {
      2: [30, 6],
      3: [120, 90, 6],
      4: [360, 720, 120, 90, 6],
      5: [720, 3600, 1800, 1200, 300, 150, 6],
      6: [720, 10800, 16200, 14400, 3600, 450, 300, 180, 6],
    },
  };
  for (const mode of ["single", "full"])
    for (let n = 2; n <= 6; n++) {
      assert.deepEqual(weights(n, mode), expected[mode][n]);
      const counted = new Map();
      for (let encoded = 0; encoded < 6 ** n; encoded++) {
        let code = encoded;
        const roll = Array.from({ length: n }, () => {
          const face = (code % 6) + 1;
          code = Math.floor(code / 6);
          return face;
        });
        const key = classifyHand(roll, mode);
        counted.set(key, (counted.get(key) || 0) + 1);
      }
      assert.deepEqual(
        outcomes(n, mode).map((row) =>
          row.members.reduce((sum, key) => sum + counted.get(key), 0),
        ),
        expected[mode][n],
      );
      assert.equal(
        [...counted.values()].reduce((sum, v) => sum + v, 0),
        6 ** n,
      );
      assert.equal(
        counted.size,
        outcomes(n, mode).flatMap((row) => row.members).length,
      );
    }
  assert.deepEqual(
    outcomes(6, "full").map((row) => row.label),
    [
      "Singles",
      "Pair",
      "2 pair",
      "Trips / boat",
      "3 pair / quads",
      "Quads + pair",
      "2 trips",
      "Quints",
      "Sexts",
    ],
  );
  assert.deepEqual(
    outcomes(4, "full").map((row) => row.label),
    ["Singles", "Pair", "Trips", "2 pair", "Quads"],
  );
  assert.throws(() => weights(4, "unknown"));
});
test("set classification distinguishes full patterns and largest-group scoring", () => {
  const examples = [
    [[1, 2, 3, 4, 5, 6], "singles", "set-1"],
    [[1, 1, 2, 3, 4, 5], "pair", "set-2"],
    [[1, 1, 2, 2, 3, 4], "two-pair", "set-2"],
    [[1, 1, 2, 2, 3, 3], "three-pair", "set-2"],
    [[1, 1, 1, 2, 3, 4], "trips", "set-3"],
    [[1, 1, 1, 2, 2, 3], "boat", "set-3"],
    [[1, 1, 1, 2, 2, 2], "two-trips", "set-3"],
    [[1, 1, 1, 1, 2, 3], "quads", "set-4"],
    [[1, 1, 1, 1, 2, 2], "quads-pair", "set-4"],
    [[1, 1, 1, 1, 1, 2], "quints", "set-5"],
    [[1, 1, 1, 1, 1, 1], "sexts", "set-6"],
  ];
  for (const [roll, full, single] of examples) {
    assert.equal(classifyHand(roll, "full"), full);
    assert.equal(
      classifyHand(
        roll.reverse().map((v) => 7 - v),
        "single",
      ),
      single,
    );
  }
  assert.throws(() => classifyHand([0, 2]));
});
test("set fairness and final-payout repair use the six-outcome final weight", () => {
  for (const mode of ["single", "full"]) {
    assert.equal(evNumerator(2, [-1, 5], mode), 0n);
    assert.equal(evNumerator(2, [-1, 6], mode), 6n);
    assert.equal(solveFinal(2, [-1], mode), 5n);
    assert.deepEqual(
      enumerate({ n: 2, mode }).rows.map((row) => row.payouts),
      [[-1, 5]],
    );
    const m = metrics(2, [-1, 5], mode);
    assert.equal(m.maxMatchWeight, 6);
    assert.equal(m.steepness, 100);
    assert.equal(m.smoothness, 100);
  }
  assert.equal(solveFinal(4, [-1, 0, 1, 2], "full"), 10n);
  assert.equal(evNumerator(4, [-1, 0, 1, 2, 10], "full"), 0n);
  assert.equal(
    solveFinal(4, [-9007199254740993n, 0, 0], "single"),
    540431955284459580n,
  );
  assert.throws(() => evNumerator(6, [1, 2, 3, 4, 5, 6], "full"));
});
test("pruned set searches match exhaustive brute force with either zero or ordering setting", () => {
  for (const mode of ["single", "full"])
    for (const n of [2, 3, 4])
      for (const strict of [true, false])
        for (const allowZero of [true, false]) {
          const o = normalizeOptions({
            mode,
            n,
            minP0: -2,
            maxP0: 0,
            maxPayout: 4,
            strict,
            allowZero,
            sort: "lowest-max",
            limit: 200,
          });
          const expected = brute(o),
            actual = enumerate(o, { maxMs: Infinity, maxNodes: Infinity });
          assert.equal(actual.complete, true);
          assert.equal(actual.found, expected.length);
          assert.deepEqual(actual.rows, expected.slice(0, 200));
        }
  for (const mode of ["single", "full"])
    for (const n of [5, 6]) {
      const result = enumerate({ n, mode }, { maxMs: Infinity });
      assert.equal(result.complete, true);
      assert.ok(result.found > 0);
      for (const row of result.rows)
        assert.deepEqual(filterReasons(row.payouts, { n, mode }), []);
    }
});
test("every displayed column supports both sort directions without changing rank or membership", () => {
  const rows = enumerate({ n: 4, mode: "full" }).rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
  for (const key of [
    "rank",
    "payout:0",
    "payout:1",
    "payout:2",
    "payout:3",
    "payout:4",
    "max",
    "range",
    "largestJump",
    "stdev",
    "simplicity",
    "smoothness",
    "steepness",
    "recommended",
  ]) {
    const value = (row) =>
      key === "rank"
        ? row.rank
        : key.startsWith("payout:")
          ? row.payouts[Number(key.slice(7))]
          : row.metrics[key];
    for (const dir of ["asc", "desc"]) {
      const sorted = sortDisplayed(rows, key, dir);
      assert.deepEqual(
        sorted.map((row) => row.rank).sort((a, b) => a - b),
        rows.map((row) => row.rank),
      );
      assert.ok(
        sorted.every(
          (row, i) =>
            !i ||
            (dir === "asc"
              ? value(sorted[i - 1]) <= value(row)
              : value(sorted[i - 1]) >= value(row)),
        ),
      );
    }
  }
  assert.deepEqual(
    rows.map((row) => row.rank),
    Array.from({ length: rows.length }, (_, i) => i + 1),
  );
});

test("payout volatility is probability-weighted, centered, and distinct from jump smoothness", () => {
  const near = (actual, expected) =>
    assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} vs ${expected}`);
  const pair = metrics(2, [-1, 5], "full");
  near(pair.variance, 5);
  near(pair.stdev, Math.sqrt(5));
  near(metrics(4, FEATURED[4]).variance, 10830 / 1296);
  near(metrics(4, [-1, 0, 1, 2, 10], "full").variance, 1440 / 1296);
  near(metrics(2, [1, 7], "single").variance, 5); // nonzero EV must be centered
  near(metrics(2, [-2, 10], "single").stdev, 2 * Math.sqrt(5));
  assert.equal(metrics(2, [5, 5], "single").stdev, 0);
  // Six-dice grouped weights: explicitly verify the sum of squares and mean.
  const payouts = [-4, -3, -2, 0, 1, 2, 3, 4, 5];
  const counts = [720, 10800, 16200, 14400, 3600, 450, 300, 180, 6];
  const mean = counts.reduce((sum, w, i) => sum + w * payouts[i], 0) / 46656;
  const expected =
    counts.reduce((sum, w, i) => sum + w * payouts[i] ** 2, 0) / 46656 -
    mean ** 2;
  near(metrics(6, payouts, "full").variance, expected);
});
test("absolute amount simplicity favors zero, tiny primes, small factors and fewer repeats", () => {
  const order = [0, ...PREFERRED_AMOUNTS];
  for (let i = 1; i < order.length; i++)
    assert.ok(amountSimplicity(order[i - 1]) > amountSimplicity(order[i]));
  assert.equal(amountSimplicity(0), 100);
  assert.equal(amountSimplicity(1), 98);
  for (const n of [2, 3, 4, 5, 7, 11, 13, 49, 60, 97, 100, 999983])
    assert.equal(amountSimplicity(-n), amountSimplicity(n));
  assert.ok(amountSimplicity(4) > amountSimplicity(8));
  assert.ok(amountSimplicity(8) > amountSimplicity(16));
  assert.ok(amountSimplicity(7) > amountSimplicity(11));
  assert.ok(amountSimplicity(11) > amountSimplicity(97));
  assert.ok(amountSimplicity(60) > amountSimplicity(49));
  assert.ok(amountSimplicity(7) > amountSimplicity(49));
  assert.equal(amountSimplicity(12), 82);
  assert.ok(
    Math.abs(amountSimplicity(16) - 70 / (1 + 0.05 * 4 + 0.025 * 3)) < 1e-10,
  );
  assert.ok(amountSimplicity(100) > amountSimplicity(9));
  assert.throws(() => amountSimplicity(1.5));
});
test("shared factors reward subsets without counting zeros, ones or repeated prime powers as extra matches", () => {
  const shared = scheduleSimplicity([-1, 2, 4, 6, 8]);
  assert.equal(shared.sharedFactor, 2);
  assert.equal(shared.sharedCount, 4);
  assert.equal(shared.sharedFactorScore, 80);
  assert.equal(shared.baseSimplicity, 0.75 * shared.amountSimplicity + 20);
  assert.equal(shared.simplicity, shared.baseSimplicity);
  assert.deepEqual(scheduleSimplicity([1, -2, -4, -6, -8]), shared);
  assert.equal(scheduleSimplicity([0, -1, 2, 4, 6, 8]).sharedFactorScore, 80);
  assert.equal(scheduleSimplicity([0, 0, 1, -1, 2]).sharedFactorScore, 0);
  assert.equal(scheduleSimplicity([8, 16, 25]).sharedCount, 2);
  assert.equal(scheduleSimplicity([25, 9, 2, 0]).sharedFactor, null);
  assert.equal(scheduleSimplicity([15, 6, 10]).sharedFactor, 2); // tie, deterministic
  assert.ok(
    filterReasons([-4, 2, 8, 14, 20]).some((s) => s.includes("scaled copy")),
  );
});
test("any prime payout above five sharply reduces schedule simplicity, with sign symmetry and compounding", () => {
  const seven = scheduleSimplicity([-1, 2, 7]);
  assert.equal(seven.primePayoutCount, 1);
  assert.equal(seven.primeMultiplier, 0.25);
  assert.equal(seven.simplicity, seven.baseSimplicity * 0.25);
  const eleven = scheduleSimplicity([-1, 2, 11]);
  assert.ok(eleven.primeMultiplier < seven.primeMultiplier);
  assert.ok(eleven.simplicity < seven.simplicity);
  const both = scheduleSimplicity([-7, 2, 11]);
  assert.equal(both.primeMultiplier, (0.25 * 7) / 44);
  assert.deepEqual(both, scheduleSimplicity([7, -2, -11]));
  assert.equal(scheduleSimplicity([-1, 14, 49]).primePayoutCount, 0);
  assert.equal(scheduleSimplicity([-1, 0, 2, 3, 5]).primeMultiplier, 1);
});
test("Recommended gives simplicity fifty points and starting-loss preference thirty", () => {
  // Equal positive jumps give smoothness 100, bend 1, full increasing share.
  const m = metrics(2, [-1, 2, 5]);
  assert.ok(
    Math.abs(
      m.recommended -
        (0.5 * m.simplicity + 30 + 10 + 5 / (1 + 5 / 50) + 1.25 + 2.5),
    ) < 1e-10,
  );
  for (const sort of ["lowest-stdev", "highest-stdev", "simplest"]) {
    const o = normalizeOptions({
      n: 2,
      minP0: -2,
      maxP0: 0,
      maxPayout: 6,
      strict: false,
      sort,
      limit: 5,
    });
    const expected = brute(o),
      actual = enumerate(o, { maxNodes: Infinity, maxMs: Infinity });
    assert.equal(actual.complete, true);
    assert.deepEqual(actual.rows, expected.slice(0, 5));
    const direction = sort === "lowest-stdev" ? 1 : -1,
      key = sort === "simplest" ? "simplicity" : "stdev";
    assert.ok(
      actual.rows.every(
        (row, i) =>
          !i ||
          direction * (row.metrics[key] - actual.rows[i - 1].metrics[key]) >= 0,
      ),
    );
  }
});

test("starting losses follow the exact requested order and exclude every unlisted value", () => {
  const expected = [
    -1, -2, -3, -5, -4, -10, -6, -8, -12, -15, -20, -25, -30, -40, -50, -60,
    -75, -100,
  ];
  assert.deepEqual(STARTING_LOSSES, expected);
  assert.equal(startingLossPreference(-1), 100);
  assert.equal(startingLossPreference(-2), 75);
  for (let i = 1; i < expected.length; i++)
    assert.ok(
      startingLossPreference(expected[i - 1]) >
        startingLossPreference(expected[i]),
    );
  for (const value of [-101, -99, -11, -9, -7, 0, 1])
    assert.equal(startingLossPreference(value), 0);
  // Independent fair primitive witness for each allowed starting loss.
  for (const value of expected) {
    const payouts = [value, 1, -25 * value - 10];
    const options = {
      n: 2,
      minP0: value,
      maxP0: value,
      maxPayout: 2500,
      limit: 200,
      sort: "lowest-max",
    };
    assert.deepEqual(filterReasons(payouts, options), []);
    assert.ok(
      enumerate(options, { maxNodes: Infinity, maxMs: Infinity }).rows.some(
        (r) => r.payouts.join() === payouts.join(),
      ),
    );
  }
  for (const sort of SORTS) {
    const result = enumerate(
      {
        n: 2,
        minP0: -100,
        maxP0: 0,
        maxPayout: 50,
        strict: false,
        sort,
        limit: 200,
      },
      { maxNodes: Infinity, maxMs: Infinity },
    );
    assert.ok(result.rows.every((r) => expected.includes(r.payouts[0])));
    assert.ok(
      result.rows.some((r) => r.payouts.includes(0)),
      "Zero remains allowed outside the starting loss",
    );
  }
  assert.equal(
    enumerate({ n: 2, minP0: -7, maxP0: -7, maxPayout: 200 }).found,
    0,
  );
  assert.match(
    filterReasons([-7, 1, 165], { n: 2, minP0: -10, maxPayout: 200 }).join(),
    /starting-loss list/,
  );
  const capped = enumerate(
    { n: 6, minP0: -100, maxP0: -1, maxPayout: 1000, strict: false },
    { maxNodes: 500, maxMs: Infinity },
  );
  assert.equal(capped.complete, false);
  assert.ok(capped.rows.every((r) => expected.includes(r.payouts[0])));
});
