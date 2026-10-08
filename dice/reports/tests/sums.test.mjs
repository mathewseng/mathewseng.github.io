import test from "node:test";
import assert from "node:assert/strict";
import { outcomes, classifyHand, validateGame } from "../outcomes.mjs";
import {
  enumerate,
  evNumerator,
  filterReasons,
  metrics,
  normalizeOptions,
  payoutDivisor,
  sortDisplayed,
} from "../engine.mjs";
import {
  SUM_FAMILIES,
  describeSumRule,
  evaluateSumRule,
  sumPayoutGroups,
  plainSumRule,
} from "../sum-rules.mjs";
import { playableSchedule, scoreRoll, createSession } from "../game.mjs";

test("sum distributions and scoring match every ordered roll for one through six dice", () => {
  for (let n = 1; n <= 6; n++) {
    const categories = outcomes(n, "sum"),
      counts = Array(5 * n + 1).fill(0);
    assert.equal(categories.length, 5 * n + 1);
    const result = enumerate({ n, mode: "sum" });
    assert.equal(result.complete, true);
    const game = playableSchedule({
      n,
      mode: "sum",
      payouts: result.rows[0].payouts,
    });
    let totalPayout = 0n;
    for (let code = 0; code < 6 ** n; code++) {
      let remaining = code;
      const roll = Array.from({ length: n }, () => {
        const face = (remaining % 6) + 1;
        remaining = Math.floor(remaining / 6);
        return face;
      });
      const total = roll.reduce((a, b) => a + b, 0),
        scored = scoreRoll(game, roll);
      counts[total - n]++;
      assert.equal(classifyHand(roll, "sum"), `sum-${total}`);
      assert.equal(scored.label, `Sum ${total}`);
      assert.equal(scored.payout, game.payouts[total - n]);
      totalPayout += BigInt(scored.payout);
    }
    assert.deepEqual(
      categories.map((c) => c.weight),
      counts,
    );
    assert.deepEqual(counts, [...counts].reverse());
    assert.equal(totalPayout, 0n);
  }
  assert.deepEqual(
    outcomes(2, "sum").map((c) => c.weight),
    [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1],
  );
  for (const mode of ["chosen", "single", "full"])
    assert.throws(() => validateGame(1, mode));
  assert.throws(() => classifyHand([0], "sum"));
});

test("every rule family produces exact primitive tables, with independently reconstructed rules", () => {
  for (let n = 1; n <= 6; n++)
    for (const sumFamily of Object.keys(SUM_FAMILIES)) {
      const options = { n, mode: "sum", sumFamily, limit: 12 };
      const result = enumerate(options, { maxMs: Infinity });
      assert.equal(result.scope, "sum-rules");
      assert.ok(result.rows.length, `${n} dice / ${sumFamily}`);
      assert.equal(result.complete, true);
      const keys = new Set();
      for (const row of result.rows) {
        assert.equal(row.rule.family, sumFamily);
        if (row.rule.modifier?.type === "multiply") {
          const modifier = row.rule.modifier;
          assert.ok(
            row.payouts.some(
              (value, i) =>
                value !== 0 && (n + i) % modifier.period === modifier.offset,
            ),
            "Multiplier changes a nonzero payout",
          );
        }
        assert.deepEqual(
          row.payouts,
          outcomes(n, "sum").map((_, i) => evaluateSumRule(n + i, row.rule)),
        );
        assert.equal(evNumerator(n, row.payouts, "sum"), 0n);
        assert.equal(payoutDivisor(row.payouts), 1n);
        assert.deepEqual(filterReasons(row.payouts, options), []);
        assert.ok(describeSumRule(row.rule).length);
        assert.ok(!keys.has(row.payouts.join()));
        keys.add(row.payouts.join());
        assert.deepEqual(row.metrics, metrics(n, row.payouts, "sum", row.rule));
      }
    }
});

test("sum filters use the worst loss, allow repeated ranges, and respect budgets and alternate rankings", () => {
  const p = [1, 1, 1, -1, -1, -1];
  assert.equal(normalizeOptions({ mode: "sum", n: 1 }).strict, false);
  assert.deepEqual(
    filterReasons(p, { n: 1, mode: "sum", minP0: -1, maxP0: -1 }),
    [],
  );
  assert.match(
    filterReasons(p, { n: 1, mode: "sum", strict: true }).join(),
    /decrease/,
  );
  assert.deepEqual(
    filterReasons([...p].reverse(), { n: 1, mode: "sum", strict: true }),
    [],
  );
  for (const sort of [
    "recommended",
    "lowest-stdev",
    "highest-stdev",
    "simplest",
    "lowest-loss",
  ]) {
    const options = {
      n: 6,
      mode: "sum",
      sort,
      strict: true,
      allowZero: false,
      minP0: -3,
      maxP0: -1,
      limit: 10,
    };
    const r = enumerate(options, { maxMs: Infinity });
    assert.ok(r.rows.length);
    for (const row of r.rows)
      assert.deepEqual(filterReasons(row.payouts, options), []);
    const ranked = r.rows.map((row, i) => ({ ...row, rank: i + 1 }));
    for (const key of ["loss", "ruleEase", "recommended", "stdev"])
      for (const direction of ["asc", "desc"]) {
        const values = sortDisplayed(ranked, key, direction).map(
          (row) => row.metrics[key],
        );
        assert.deepEqual(
          values,
          [...values].sort((a, b) => (direction === "asc" ? a - b : b - a)),
        );
      }
  }
  const partial = enumerate(
    { mode: "sum", n: 6 },
    { maxNodes: 1000, maxMs: Infinity },
  );
  assert.equal(partial.complete, false);
  assert.equal(partial.nodes, 1000);
  assert.equal(enumerate({ mode: "sum", n: 6 }, { maxMs: 0 }).complete, false);
  assert.equal(enumerate({ mode: "sum", n: 1, minP0: -7, maxP0: -7 }).found, 0);
});

test("sum simplicity rewards repeated amounts and readable rules, and grouped paytables partition all totals", () => {
  const p = [-1, -1, -1, 1, 1, 1],
    repeated = metrics(1, p, "sum");
  assert.equal(repeated.ruleEase, 100);
  assert.equal(repeated.startingLossPreference, 100);
  const expected = 0.5 * repeated.simplicity + 30 + 15 + 5 / (1 + 1 / 50);
  assert.ok(Math.abs(repeated.recommended - expected) < 1e-10);
  const more = metrics(2, [-1, -1, -1, -1, -1, 0, 1, 1, 1, 1, 1], "sum");
  assert.equal(more.unlistedPayoutCount, 0);
  const unlisted = metrics(1, [-1, -1, 9, 9, 9, 9], "sum");
  assert.equal(unlisted.unlistedPayoutCount, 1);
  assert.equal(unlisted.unlistedMultiplier, 0.1);
  const groups = sumPayoutGroups(1, [-1, 1, -1, 1, -1, 1]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Totals 1, 3, 5");
  assert.deepEqual(
    groups.map((g) => g.weight),
    [3, 3],
  );
  assert.deepEqual(
    groups.flatMap((g) => g.indices).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    p.map((_, i) => evaluateSumRule(i + 1, plainSumRule(1, p))),
    p,
  );
  const session = createSession();
  session.begin({ n: 1, mode: "sum", payouts: p }, 1, () => 5);
  assert.equal(session.settle().payout, 1);
  assert.equal(session.state.pnl, 1n);
  assert.equal(session.settle(), null);
});
