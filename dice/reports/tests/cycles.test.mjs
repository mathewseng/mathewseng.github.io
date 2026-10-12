import test from "node:test";
import assert from "node:assert/strict";
import { SIMPLE_CYCLES } from "../cycles.mjs";
import {
  ROLLS,
  SCORE_RULES,
  compareRules,
  scoreRule,
  marginDistribution,
  conditionalRolls,
} from "../matchups.mjs";
import { scoreMatchupRoll } from "../matchup-game.mjs";

// Independent quarter-unit arithmetic; do not call the production scoring functions.
function score([base, mult, offset], [a, b]) {
  const quarterBase =
    base === "sum"
      ? 4 * (a + b)
      : base === "high"
        ? 4 * (a > b ? a : b)
        : base === "low"
          ? 4 * (a < b ? a : b)
          : base === "product"
            ? 4 * a * b
            : base === "average"
              ? 2 * (a + b)
              : 4 * a;
  return quarterBase * mult + 4 * offset;
}
test("all 36 curated cycles retain fixed scores and beat the next rule by exact enumeration", () => {
  assert.equal(SIMPLE_CYCLES.length, 36);
  assert.equal(new Set(SIMPLE_CYCLES.map((c) => c.id)).size, 36);
  for (const c of SIMPLE_CYCLES) {
    for (const [i, id] of c.rules.entries())
      for (const roll of ROLLS)
        assert.equal(4 * scoreRule(id).score(...roll), score(c.parts[i], roll));
    for (const [i, edge] of c.edges.entries()) {
      const counts = { wins: 0, ties: 0, losses: 0, total: 1296 };
      for (const a of ROLLS)
        for (const b of ROLLS) {
          const delta = score(c.parts[i], a) - score(c.parts[(i + 1) % 3], b);
          const expected = delta > 0 ? "wins" : delta < 0 ? "losses" : "ties";
          counts[expected]++;
          assert.equal(scoreMatchupRoll(edge, [...a, ...b]).outcome, expected);
        }
      assert.deepEqual(compareRules(edge.a, edge.b), counts);
      assert.ok(counts.wins > counts.losses, c.id);
      assert.equal(edge.wins, counts.wins);
      assert.equal(edge.ties, counts.ties);
      assert.equal(edge.losses, counts.losses);
    }
    assert.equal(
      c.noTies,
      c.edges.every((e) => e.ties === 0),
    );
    assert.equal(
      c.wholeNumbers,
      c.parts.every((p) => ROLLS.every((r) => score(p, r) % 4 === 0)),
    );
  }
});
test("the three discussed cycles match independently verified fixtures", () => {
  const counts = (c) => c.edges.map((e) => [e.wins, e.ties, e.losses]);
  assert.deepEqual(counts(SIMPLE_CYCLES[0]), [
    [651, 0, 645],
    [651, 0, 645],
    [742, 0, 554],
  ]);
  assert.deepEqual(counts(SIMPLE_CYCLES[1]), counts(SIMPLE_CYCLES[0]));
  assert.deepEqual(counts(SIMPLE_CYCLES[2]), [
    [554, 236, 506],
    [546, 210, 540],
    [546, 210, 540],
  ]);
  assert.deepEqual(counts(SIMPLE_CYCLES[3]), counts(SIMPLE_CYCLES[0]));
});
test("cycle quarter-point scores remain exact in analysis, conditional odds, and swapped play", () => {
  const { a, b } = SIMPLE_CYCLES[0].edges[0];
  assert.equal(scoreMatchupRoll({ a, b }, [1, 1, 1, 1]).bScore, -0.25);
  const margins = marginDistribution(a, b);
  assert.equal(
    margins.reduce((n, r) => n + r.count, 0),
    1296,
  );
  assert.ok(margins.every((r) => Number.isInteger(r.margin * 4)));
  for (const key of ["wins", "ties", "losses"])
    assert.equal(
      conditionalRolls(a, b).reduce((n, r) => n + r[key], 0),
      compareRules(a, b)[key],
    );
  const forward = compareRules(a, b),
    reverse = compareRules(b, a);
  assert.equal(forward.wins, reverse.losses);
  assert.equal(forward.ties, reverse.ties);
});
test("unmodified core rules are acyclic even when ties are excluded", () => {
  const edges = SCORE_RULES.map((a) =>
    SCORE_RULES.flatMap((b, i) => {
      const r = compareRules(a.id, b.id);
      return r.wins > r.losses ? [i] : [];
    }),
  );
  const degree = SCORE_RULES.map(() => 0);
  edges.flat().forEach((i) => degree[i]++);
  const queue = degree.flatMap((n, i) => (n === 0 ? [i] : []));
  for (let k = 0; k < queue.length; k++)
    for (const next of edges[queue[k]])
      if (--degree[next] === 0) queue.push(next);
  assert.equal(queue.length, SCORE_RULES.length);
});
