import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  RANKS,
  SUITS,
  canonicalize,
  parseCards,
  cardName,
  handName,
  bustCategory,
  nextCards,
  decodeData,
  aggregate,
  filterRows,
  summarize,
  csvForRows,
  targetProbability,
  wilson,
} from "../engine.mjs";
const require = createRequire(import.meta.url);
const evaluator = require("../../play/evaluator.js");
const data = JSON.parse(
  fs.readFileSync(new URL("../data/hands.json", import.meta.url), "utf8"),
);
const rows = decodeData(data);
const approx = (actual, expected, epsilon = 1e-10) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const hand = (s) => parseCards(s);

test("complete classes, deal weights, canonical representatives and normalized joint counts", () => {
  assert.equal(rows.length, 16432);
  assert.equal(
    rows.reduce((n, r) => n + r.combinations, 0),
    270725,
  );
  assert.equal(new Set(rows.map((r) => r.name)).size, 16432);
  assert.equal(data.rng, "splitmix64-hashed-class-streams-v1");
  assert.equal(data.totalTrials, data.trialsPerHand * 16432);
  for (const r of rows) {
    assert.deepEqual(canonicalize(r.cards), r.cards);
    assert.ok([1, 4, 6, 12, 24].includes(r.combinations));
    assert.ok(r.joint.every((n) => Number.isSafeInteger(n) && n >= 0));
    approx(
      r.hist.reduce((a, b) => a + b, 0),
      1,
    );
    approx(
      r.categories.reduce((a, b) => a + b, 0),
      1,
    );
    approx(r.survival[13], 0);
    assert.ok(r.mean >= 1 && r.mean <= 13);
    assert.ok(r.p10 <= r.median && r.median <= r.p90);
    assert.ok(r.firstBust <= r.bustBy2);
    for (let k = 1; k < 14; k++)
      assert.ok(r.survival[k] <= r.survival[k - 1] + 1e-10);
  }
});

test("canonicalization maximizes suit counts before using rank tie breaks", () => {
  assert.deepEqual(canonicalize(hand("As Kh Qh Jh")), hand("Ah Ks Qs Js"));
  assert.deepEqual(canonicalize(hand("Ac Kd 8h 3s")), hand("As Kh 8d 3c"));
  assert.deepEqual(canonicalize(hand("As Ah Ks Kh")), hand("As Ah Ks Kh"));
  for (const r of rows.filter((_, i) => i % 47 === 0)) {
    for (const perm of permutations([0, 1, 2, 3]))
      assert.deepEqual(
        canonicalize(r.cards.map((c) => Math.floor(c / 4) * 4 + perm[c % 4])),
        r.cards,
      );
  }
});
function permutations(a) {
  if (!a.length) return [[]];
  return a.flatMap((v, i) =>
    permutations(a.filter((_, j) => i !== j)).map((p) => [v, ...p]),
  );
}

test("bust evaluation handles five-card minimum, wheel, highest ranking, double trips and no wraps", () => {
  for (const [cards, category] of [
    ["As Ah Ad Ac", -1],
    ["As Ah Ad Ac Ks", 3],
    ["As 2h 3d 4c 5s", 0],
    ["As Kh Qd 2c 3s", -1],
    ["As Ks Qs Js Ts", 5],
    ["9h 8h 7h 6h 5h", 4],
    ["As Ah Ad Ks Kh Kd", 2],
    ["As Ks Qs Js 8s Ah Ad Ac", 3],
    ["As Ks Qs Js 8s Ah Ad Kh", 2],
    ["As Ks Qs Js 8s 7h 6d", 1],
    ["As Ah Ks Kh Qs Qh Js Jh", -1],
  ])
    assert.equal(bustCategory(hand(cards)), category, cards);
});

test("JS evaluator agrees with the existing independent five-card-subset evaluator on larger hands", () => {
  let seed = 8592145;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let sample = 0; sample < 180; sample++) {
    const deck = Array.from({ length: 52 }, (_, i) => i),
      n = 5 + (sample % 13);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(random() * (52 - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const cards = deck.slice(0, n),
      ref = evaluator.bestHigh(cards.map(cardName));
    const expected =
      ref.category < 4
        ? -1
        : ref.category === 8
          ? ref.mainRank === 14
            ? 5
            : 4
          : ref.category - 4;
    assert.equal(bustCategory(cards), expected, handName(cards));
  }
});

test("every exact first-draw result agrees with independently evaluated live outs", () => {
  for (const r of rows) {
    const actual = nextCards(r.cards).filter(
      (c) => !c.held && c.category >= 0,
    ).length;
    assert.equal(actual, r.firstOuts, r.name);
  }
});

test("sampled exact second-draw probabilities match explicit unordered endpoints", () => {
  for (const r of rows.filter((_, i) => i % 157 === 0)) {
    const deck = Array.from({ length: 52 }, (_, i) => i).filter(
      (c) => !r.cards.includes(c),
    );
    let busted = 0;
    for (let a = 0; a < 47; a++)
      for (let b = a + 1; b < 48; b++)
        busted += bustCategory([...r.cards, deck[a], deck[b]]) >= 0;
    approx(r.bustBy2, busted / 1128);
  }
});

test("initial quads always bust on draw one, in the four-of-a-kind category", () => {
  const quads = rows.filter((r) => r.pairing === "Four of a kind");
  assert.equal(quads.length, 13);
  for (const r of quads) {
    assert.equal(r.mean, 1);
    assert.equal(r.firstOuts, 48);
    assert.equal(r.hist[0], 1);
    assert.equal(r.categories[3], 1);
    assert.equal(r.meanSE, 0);
    assert.equal(r.combinations, 1);
  }
});

test("Monte Carlo matches exact first- and second-draw probabilities for every class", () => {
  for (const r of rows)
    for (const [p, estimate] of [
      [r.firstBust, r.hist[0]],
      [r.bustBy2, r.hist[0] + r.hist[1]],
    ]) {
      const tolerance = 6 * Math.sqrt((p * (1 - p)) / r.trials) + 2 / r.trials;
      assert.ok(
        Math.abs(p - estimate) <= tolerance,
        `${r.name}: ${p} vs ${estimate}`,
      );
    }
});

test("deal-weighted survival matches the independent exact rank-DP dataset through 13 held cards", () => {
  const exact = JSON.parse(
    fs.readFileSync(
      new URL("../../calculations/data/probabilities.json", import.meta.url),
      "utf8",
    ),
  );
  const a = aggregate(rows),
    w = 270725;
  for (const ref of exact.rows.filter((r) => r.cards >= 5 && r.cards <= 13)) {
    assert.equal(ref.method, "exact");
    const k = ref.cards - 4,
      p = ref.counts.slice(0, 4).reduce((a, b) => a + b, 0) / ref.observations;
    const variance = rows.reduce(
      (v, r) =>
        v +
        ((r.combinations / w) ** 2 * r.survival[k] * (1 - r.survival[k])) /
          (r.trials - 1),
      0,
    );
    assert.ok(
      Math.abs(a.survival[k] - p) < 6 * Math.sqrt(variance) + 1e-8,
      `P(T>${k}): estimated ${a.survival[k]}, exact ${p}`,
    );
    if (k === 1) approx(a.firstBust, 1 - p);
    if (k === 2) approx(a.bustBy2, 1 - p);
  }
});

test("aggregation pools distributions and quantiles; class weighting differs from deal weighting", () => {
  const a = aggregate(rows),
    c = aggregate(rows, "classes");
  approx(
    a.mean,
    rows.reduce((n, r) => n + r.mean * r.combinations, 0) / 270725,
  );
  approx(c.mean, rows.reduce((n, r) => n + r.mean, 0) / 16432);
  assert.ok(Math.abs(a.mean - c.mean) > 0.01);
  approx(
    a.hist.reduce((a, b) => a + b, 0),
    1,
  );
  approx(
    a.joint.reduce((a, b) => a + b, 0),
    1,
  );
  assert.equal(a.median, 6);
  assert.equal(aggregate([]), null);
  const r = rows[1234],
    single = aggregate([r]);
  approx(single.mean, r.mean);
  approx(single.meanSE, r.meanSE);
});

test("filters respect rank multiplicity, arbitrary suit relabeling, numeric bounds and empty results", () => {
  assert.equal(filterRows(rows, { search: "Ah Kc 8s 3d" }).length, 1);
  assert.equal(
    filterRows(rows, { search: "Ah Kc 8s 3d" })[0].name,
    "As Kh 8d 3c",
  );
  assert.equal(filterRows(rows, { search: "AAAA" }).length, 1);
  assert.ok(
    filterRows(rows, { search: "AA" }).every(
      (r) => r.cards.filter((c) => Math.floor(c / 4) === 0).length >= 2,
    ),
  );
  assert.equal(filterRows(rows, { search: "As As As As" }).length, 0);
  assert.equal(filterRows(rows, { search: "<script>" }).length, 0);
  assert.equal(filterRows(rows, { pinned: [] }).length, 0);
  const filtered = filterRows(rows, {
    pairing: "Unpaired",
    suits: "4",
    numeric: [
      { metric: "firstBust", op: "gte", value: "20" },
      { metric: "mean", op: "lte", value: "4" },
    ],
  });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((r) => r.firstBust >= 0.2 && r.mean <= 4));
  assert.equal(filterRows(rows, {}).length, 16432);
});

test("survival payouts use strictly surviving the target and exact first two probabilities", () => {
  const a = aggregate(rows);
  approx(targetProbability(a, 1), 1 - a.firstBust);
  approx(targetProbability(a, 2), 1 - a.bustBy2);
  approx(targetProbability(a, 5), a.survival[5]);
  assert.equal(targetProbability(a, 13), 0);
  const p = targetProbability(a, 5),
    payout = 0.95 / p;
  approx(p * payout - 1, -0.05);
  assert.equal(
    targetProbability(
      rows.find((r) => r.pairing === "Four of a kind"),
      1,
    ),
    0,
  );
});

test("CSV preserves selected rows, raw probability units, all histograms and uncertainty", () => {
  const subset = filterRows(rows, { search: "AAAA" }),
    csv = csvForRows(subset),
    lines = csv.split("\n"),
    headers = lines[0].split(","),
    values = lines[1].split(",");
  assert.equal(lines.length, 2);
  assert.equal(headers.length, values.length);
  assert.equal(headers.length, 64);
  assert.equal(values[0], "As Ah Ad Ac");
  assert.equal(
    Number(values[headers.indexOf("first_bust_probability_exact")]),
    1,
  );
  assert.equal(Number(values[headers.indexOf("survive_1_probability_mc")]), 0);
  assert.equal(Number(values[headers.indexOf("mean_95ci_low")]), 1);
  assert.equal(values[headers.indexOf("hazard_draw_2_probability_mc")], "");
  const interval = wilson(0, 1000000);
  assert.equal(interval[0], 0);
  assert.ok(interval[1] > 0);
});
