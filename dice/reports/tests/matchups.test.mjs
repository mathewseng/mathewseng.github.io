import test from "node:test";
import assert from "node:assert/strict";
import {
  SCORE_RULES,
  ROLLS,
  scoreDistribution,
  compareRules,
  conditionalRolls,
  handicapSeries,
  matchupCatalogue,
  twoDiceEvents,
  fourDiceEvents,
  marginDistribution,
  ruleAgreement,
  fraction,
} from "../matchups.mjs";

test("requested matchups agree with independent four-dice enumeration fixtures", () => {
  // Fixtures independently enumerated with Python itertools.product, not the
  // engine's weighted distribution comparison.
  for (const [a, b, counts] of [
    ["sum", "sum", [575, 146, 575]],
    ["sum", "max", [981, 125, 190]],
    ["max", "min", [995, 146, 155]],
    ["max", "avg", [861, 108, 327]],
    ["avg", "min", [861, 108, 327]],
    ["product", "sum", [799, 67, 430]],
    ["sum", "mod10", [779, 133, 384]],
  ]) {
    const result = compareRules(a, b);
    assert.deepEqual(
      [result.wins, result.ties, result.losses],
      counts,
      `${a} vs ${b}`,
    );
  }
});

test("score distributions retain averages, modulo wrap, and multiplicities", () => {
  assert.equal(ROLLS.length, 36);
  assert.equal(new Set(ROLLS.map(String)).size, 36);
  assert.deepEqual(
    scoreDistribution("sum").map((row) => row.count),
    [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1],
  );
  assert.deepEqual(
    scoreDistribution("max").map((row) => row.count),
    [1, 3, 5, 7, 9, 11],
  );
  assert.deepEqual(
    scoreDistribution("min").map((row) => row.count),
    [11, 9, 7, 5, 3, 1],
  );
  assert.deepEqual(
    scoreDistribution("avg"),
    scoreDistribution("sum").map((row) => ({ ...row, score: row.score / 2 })),
  );
  assert.deepEqual(
    scoreDistribution("mod10").map((row) => row.count),
    [3, 2, 2, 2, 3, 4, 5, 6, 5, 4],
  );
  assert.deepEqual(
    scoreDistribution("mod6"),
    Array.from({ length: 6 }, (_, score) => ({ score, count: 6 })),
  );
  for (const rule of SCORE_RULES) {
    const rows = scoreDistribution(rule.id);
    assert.equal(
      rows.reduce((sum, row) => sum + row.count, 0),
      36,
    );
    assert.ok(
      rows.every(
        (row) => Number.isInteger(row.score * 2) && Number.isInteger(row.count),
      ),
    );
  }
});

test("every catalogue pairing partitions 1296 outcomes and reverses correctly", () => {
  const catalogue = matchupCatalogue();
  assert.equal(catalogue.length, 1024);
  for (const row of catalogue) {
    assert.equal(row.wins + row.ties + row.losses, 1296);
    const reverse = compareRules(row.b, row.a);
    assert.equal(row.wins, reverse.losses);
    assert.equal(row.ties, reverse.ties);
    const rolls = conditionalRolls(row.a, row.b);
    for (const key of ["wins", "ties", "losses"])
      assert.equal(
        rolls.reduce((sum, roll) => sum + roll[key], 0),
        row[key],
      );
    assert.ok(
      rolls.every((roll) => roll.wins + roll.ties + roll.losses === 36),
    );
  }
});

test("handicaps move wins monotonically, preserve half-points, and swap signs", () => {
  for (const [a, b] of [
    ["sum", "sum"],
    ["max", "avg"],
    ["product", "sum"],
    ["avg", "min"],
  ]) {
    const series = handicapSeries(a, b);
    assert.equal(series.length, 49);
    for (let i = 1; i < series.length; i++) {
      assert.ok(series[i].wins >= series[i - 1].wins);
      assert.ok(series[i].losses <= series[i - 1].losses);
    }
    for (const h of [-36, -3.5, 0, 2.5, 36]) {
      const result = compareRules(a, b, h),
        reversed = compareRules(b, a, -h);
      assert.equal(result.wins, reversed.losses);
      assert.equal(result.ties, reversed.ties);
      const conditional = conditionalRolls(a, b, h);
      assert.equal(
        conditional.reduce((sum, row) => sum + row.wins, 0),
        result.wins,
      );
    }
  }
  assert.deepEqual(compareRules("sum", "sum", 0.5), {
    wins: 721,
    ties: 0,
    losses: 575,
    total: 1296,
  });
  assert.equal(compareRules("sum", "sum", 36).wins, 1296);
  assert.equal(compareRules("sum", "sum", -36).losses, 1296);
  assert.deepEqual(compareRules("sum", "plus2", 2), compareRules("sum", "sum"));
  assert.deepEqual(compareRules("avg", "avg"), compareRules("sum", "sum"));
});

test("event reference counts handle overlap, parity, and same-roll comparisons", () => {
  const events = twoDiceEvents();
  assert.equal(events.length, 123);
  const counts = new Map(events.map((row) => [row.label, row.count]));
  for (const [label, count] of [
    ["Any doubles", 6],
    ["Double six", 1],
    ["At least one 6", 11],
    ["Exactly one 6", 10],
    ["No sixes", 25],
    ["Sum ≥ 7", 21],
    ["Consecutive faces (gap = 1)", 10],
    ["Prime sum (2, 3, 5, 7, 11)", 15],
    ["Prime product (2, 3, 5)", 6],
    ["Product > sum (same roll)", 24],
    ["Product = sum (same roll)", 1],
    ["Even product", 27],
    ["Product < sum (same roll)", 11],
    ["Product is a perfect square", 8],
    ["One die divides the other", 22],
    ["Sum between 6 and 8, inclusive", 16],
    ["Both dice prime (2, 3, or 5)", 9],
  ])
    assert.equal(counts.get(label), count, label);
  assert.equal(
    events
      .filter((row) => row.group === "Exact sums")
      .reduce((sum, row) => sum + row.count, 0),
    36,
  );
  assert.equal(fraction(146, 1296), "73/648");
  assert.equal(fraction(0, 1296), "0/1");
  assert.equal(fraction(1296, 1296), "1/1");
  for (const group of [
    "Max distribution",
    "Min distribution",
    "Gap distribution",
    "Product distribution",
    "Exact unordered pairs",
  ])
    assert.equal(
      events
        .filter((row) => row.group === group)
        .reduce((sum, row) => sum + row.count, 0),
      36,
      group,
    );
  assert.equal(new Set(events.map((row) => row.label)).size, events.length);
});

test("new rule fixtures agree with independent Python four-dice enumeration", () => {
  for (const [id, counts] of [
    ["floor-avg", [78, 81, 1137]],
    ["ceil-avg", [114, 99, 1083]],
    ["double-gap", [228, 90, 978]],
    ["weighted-max", [1046, 66, 184]],
    ["weighted-min", [850, 106, 340]],
    ["product-mod10", [217, 99, 980]],
    ["product-mod6", [35, 42, 1219]],
    ["cap7", [400, 181, 715]],
    ["doubles-only", [99, 18, 1179]],
    ["no-doubles", [476, 128, 692]],
    ["far7", [30, 40, 1226]],
    ["prime-bonus", [755, 137, 404]],
    ["odd", [785, 122, 389]],
    ["mod12", [540, 145, 611]],
  ]) {
    const row = compareRules(id, "sum");
    assert.deepEqual([row.wins, row.ties, row.losses], counts, id);
  }
  assert.deepEqual(scoreDistribution("gap"), scoreDistribution("far7"));
});

test("margin distributions preserve every outcome and handicap shift", () => {
  const sum = marginDistribution("sum", "sum");
  // Coefficients of (x + ... + x^6)^4, reflected about a margin of zero.
  assert.deepEqual(
    sum.map((row) => row.count),
    [
      1, 4, 10, 20, 35, 56, 80, 104, 125, 140, 146, 140, 125, 104, 80, 56, 35,
      20, 10, 4, 1,
    ],
  );
  for (const a of SCORE_RULES)
    for (const b of SCORE_RULES) {
      const rows = marginDistribution(a.id, b.id);
      const result = compareRules(a.id, b.id);
      assert.equal(
        rows.reduce((sum, row) => sum + row.count, 0),
        1296,
      );
      assert.equal(
        rows
          .filter((row) => row.margin > 0)
          .reduce((sum, row) => sum + row.count, 0),
        result.wins,
      );
      assert.equal(
        rows.find((row) => row.margin === 0)?.count || 0,
        result.ties,
      );
      assert.deepEqual(
        marginDistribution(a.id, b.id, 0.5),
        rows.map((row) => ({ ...row, margin: row.margin + 0.5 })),
      );
    }
});

test("agreement grid distinguishes winner reversals from tie changes", () => {
  // Python itertools.product over all four faces, comparing sum and product.
  assert.deepEqual(ruleAgreement("sum", "product"), [
    [555, 10, 10],
    [40, 66, 40],
    [10, 10, 555],
  ]);
  assert.deepEqual(ruleAgreement("sum", "avg"), [
    [575, 0, 0],
    [0, 146, 0],
    [0, 0, 575],
  ]);
  for (const a of SCORE_RULES)
    for (const b of SCORE_RULES) {
      const grid = ruleAgreement(a.id, b.id);
      const transpose = ruleAgreement(b.id, a.id);
      const aCounts = compareRules(a.id, a.id),
        bCounts = compareRules(b.id, b.id);
      assert.equal(
        grid.flat().reduce((sum, count) => sum + count, 0),
        1296,
      );
      for (const [i, key] of ["wins", "ties", "losses"].entries()) {
        assert.equal(
          grid[i].reduce((sum, count) => sum + count, 0),
          aCounts[key],
        );
        assert.equal(
          grid.reduce((sum, row) => sum + row[i], 0),
          bCounts[key],
        );
        for (let j = 0; j < 3; j++) assert.equal(grid[i][j], transpose[j][i]);
      }
    }
});

test("four-dice event counts cover collisions, dominance, and disagreement", () => {
  const events = fourDiceEvents();
  assert.equal(events.length, 29);
  const counts = new Map(events.map((row) => [row.label, row.count]));
  for (const [label, expected] of [
    ["Identical ordered rolls", 36],
    ["Same pair, either order", 6 + 30 * 2],
    ["No faces shared by A and B", 6 * 25 + 30 * 16],
    ["At least one face shared by A and B", 1296 - 6 * 25 - 30 * 16],
    ["Exactly one distinct face shared", 606],
    ["Two distinct faces shared", 60],
    ["Both players roll doubles", 36],
    ["Exactly one player rolls doubles", 2 * 6 * 30],
    ["Neither player rolls doubles", 900],
    ["All four dice show different faces", 6 * 5 * 4 * 3],
    ["At least one repeated face across four dice", 1296 - 6 * 5 * 4 * 3],
    ["All four dice show the same face", 6],
    ["At least one 6 across four dice", 1296 - 5 ** 4],
    ["Exactly one 6 across four dice", 4 * 5 ** 3],
    ["Each player has at least one 6", 11 ** 2],
    ["Equal sums", 146],
    ["A’s sum beats B’s sum", 575],
    ["Sums differ by exactly 1", 280],
    ["Sums differ by at least 5", 2 * (56 + 35 + 20 + 10 + 4 + 1)],
    ["Both sums have the same parity", 648],
    ["Combined total across four dice is 14", 146],
    ["A beats B in both corresponding positions", 15 ** 2],
    ["A is no lower in either corresponding position", 21 ** 2],
    ["A’s max and min both strictly beat B’s", 295],
    ["A’s lowest die beats B’s highest die", 155],
    ["A wins on sum but loses on product", 10],
    ["A wins on max but loses on min", 100],
    ["Equal sums but different products", 80],
    ["Equal products but different sums", 20],
  ])
    assert.equal(counts.get(label), expected, label);
  assert.ok(
    events.every(
      (row) => row.total === 1296 && row.count >= 0 && row.count <= 1296,
    ),
  );
});

test("reject unknown rules and invalid handicaps", () => {
  assert.throws(() => compareRules("unknown", "sum"), RangeError);
  for (const h of [NaN, Infinity, 37, -37, 0.1, "2"])
    assert.throws(() => compareRules("sum", "sum", h), RangeError);
});
