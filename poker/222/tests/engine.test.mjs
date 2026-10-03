import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCards,
  cardName,
  eval5,
  categoryOf,
  handLabel,
  Board,
  omahaValue,
  describeSplit,
  pairNet,
  settle,
  runoutStats,
  finishStats,
  mergeStats,
  completions,
  makeRng,
  dealTable,
  shuffledDeck,
  riverBest,
  analyzeDecision,
  positionValue,
  deltaHist,
  flipHist,
  gradeChoice,
  actorOn,
  laterCubeStreets,
  variantOf,
  VARIANT_ORDER,
  DROP_UNIT,
  MAX_CUBE,
  MAX_NET,
} from "../engine.mjs";
import { chainDepth } from "../cube-rules.mjs";

const P = parseCards;

test("five-card categories and ordering", () => {
  assert.equal(categoryOf(eval5(P("As Ks Qs Js Ts"))), 8);
  assert.equal(handLabel(eval5(P("As Ks Qs Js Ts"))), "Royal flush");
  assert.equal(categoryOf(eval5(P("5h 4h 3h 2h Ah"))), 8);
  assert.equal(handLabel(eval5(P("5h 4h 3h 2h Ah"))), "Straight flush, five-high");
  assert.equal(categoryOf(eval5(P("9c 9d 9h 9s 2c"))), 7);
  assert.equal(categoryOf(eval5(P("9c 9d 9h 2s 2c"))), 6);
  assert.equal(categoryOf(eval5(P("Kc 9c 7c 4c 2c"))), 5);
  assert.equal(categoryOf(eval5(P("5h 4c 3h 2d Ah"))), 4);
  assert.equal(categoryOf(eval5(P("9c 9d 9h 3s 2c"))), 3);
  assert.equal(categoryOf(eval5(P("9c 9d 3h 3s 2c"))), 2);
  assert.equal(categoryOf(eval5(P("9c 9d 4h 3s 2c"))), 1);
  assert.equal(categoryOf(eval5(P("Kc 9d 4h 3s 2c"))), 0);
  assert.ok(eval5(P("6h 5c 4h 3d 2h")) > eval5(P("5h 4c 3h 2d Ah")), "six-high straight beats wheel");
  assert.ok(eval5(P("Ac Ad 3h 3s 2c")) > eval5(P("Kc Kd Qh Qs Jc")), "aces up beats kings up");
  assert.ok(eval5(P("Ac Ad 3h 3s 4c")) > eval5(P("Ah As 3d 3c 2c")), "kicker decides");
  assert.ok(eval5(P("2c 2d 2h 2s 3c")) > eval5(P("Ac Ad Ah Ks Kc")), "quads beat a full house");
  assert.equal(handLabel(eval5(P("Ac Ad Ah Ks Kc"))), "Full house, aces full of kings");
});

test("Omaha value uses exactly two hole cards and three board cards", () => {
  const board = new Board(P("Ah Kh Qh Jh 2c"));
  // A lone ten cannot make the straight: only three board cards may play.
  assert.equal(categoryOf(omahaValue(board, ...P("Th 3c"))), 0);
  // Ten and nine with K Q J make a straight; in hearts, a straight flush.
  assert.equal(categoryOf(omahaValue(board, ...P("Th 9c"))), 4);
  assert.equal(categoryOf(omahaValue(board, ...P("Th 9h"))), 8);
  // Two hearts without the straight: a flush.
  assert.equal(categoryOf(omahaValue(board, ...P("Th 3h"))), 5);
  // Four hearts on board do not make a flush with one heart, and no ten means no straight.
  assert.equal(categoryOf(omahaValue(board, ...P("9h 3c"))), 0);
  // Two hearts without a ten: flush, not a straight flush.
  assert.equal(categoryOf(omahaValue(board, ...P("9h 3h"))), 5);
});

test("forced split picks hand 1, then hand 2, then the rest, with suit tie-breaks", () => {
  const board = P("Ah 7d 7c 2s 9h");
  const split = describeSplit(P("7h Ad Ac Kd 4c 3c"), board);
  // Best Omaha hand: Ad Ac with Ah 7d 7c is aces full of sevens, which beats sevens full of aces (7h + an ace).
  assert.deepEqual(split[0].cards.map(cardName), ["Ad", "Ac"]);
  assert.equal(split[0].label, "Full house, aces full of sevens");
  // Hand 2 from 7h Kd 4c 3c: 7h with the king kicker makes trip sevens.
  assert.deepEqual(split[1].cards.map(cardName), ["Kd", "7h"]);
  assert.equal(split[1].label, "Trip sevens");
  assert.deepEqual(split[2].cards.map(cardName), ["4c", "3c"]);
});

test("suit ordering breaks ties: spades first", () => {
  const board = P("Kc Kd 8h 3s 2c");
  // Any ace with any card makes KK A-high two pair... all pairs tie as "two pair kings and ..."? No: each pair of hole cards plays with KK.
  // Hole: As Ah Ad Ac 5d 4d -> AA + KK = aces up. Hand 1 must be As Ah (spade, then heart).
  const split = describeSplit(P("As Ah Ad Ac 5d 4d"), board);
  assert.deepEqual(split[0].cards.map(cardName), ["As", "Ah"]);
  assert.deepEqual(split[1].cards.map(cardName), ["Ad", "Ac"]);
  assert.deepEqual(split[2].cards.map(cardName), ["5d", "4d"]);
});

test("pairwise scoring and scoop bonus", () => {
  assert.equal(pairNet([3, 2, 1], [1, 1, 0]), 10);
  assert.equal(pairNet([3, 2, 1], [4, 1, 0]), 0);
  assert.equal(pairNet([3, 2, 1], [3, 2, 1]), 0);
  assert.equal(pairNet([3, 2, 1], [3, 1, 2]), 1);
  assert.equal(pairNet([1, 1, 0], [3, 2, 1]), -10);
  const hands = [P("As Ad Kh Kd 2c 3c"), P("7s 7d 6h 6d 8c 9c"), P("Qs Qd Jh Jd 4c 5c")];
  const board = P("Ah Kc 7h Jc 2d");
  const r = settle(hands, board);
  assert.equal(r.net.reduce((a, b) => a + b, 0), 0, "zero sum");
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.perHand[i].reduce((a, b) => a + b, 0) + r.scoop[i] - r.net[i]) < 1e-9);
});

test("runout statistics: exact enumeration matches sample size and partitions merge", () => {
  const rng = makeRng(3);
  const { hands, board } = dealTable(2, rng);
  const flop = board.slice(0, 3);
  const whole = runoutStats(hands, flop, { exact: true });
  assert.equal(whole.count, completions(2, 3));
  assert.equal(whole.count, 666);
  const parts = [0, 1, 2].map((i) => runoutStats(hands, flop, { exact: true, partIndex: i, partCount: 3 }));
  const merged = mergeStats(parts);
  assert.equal(merged.count, 666);
  for (let i = 0; i < 2; i++) assert.ok(Math.abs(merged.ev[i] - whole.ev[i]) < 1e-9);
  const f = finishStats(whole, 2);
  assert.ok(Math.abs(f.players[0].ev + f.players[1].ev) < 1e-9, "zero sum");
  for (const p of f.players) {
    const sum = p.evHand.reduce((a, b) => a + b, 0) + p.evScoop;
    assert.ok(Math.abs(sum - p.ev) < 1e-9, "per-hand EVs add up");
    for (let h = 0; h < 3; h++) assert.ok(p.win[h] + p.tie[h] <= 1 + 1e-9);
  }
  // Histogram is a probability distribution with mean equal to seat 0's EV.
  const mean = f.hist.reduce((s, p, i) => s + p * (i - MAX_NET), 0);
  assert.ok(Math.abs(mean - f.players[0].ev) < 1e-9);
  assert.ok(Math.abs(f.hist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // Win-the-hand totals across players: outright wins are at most one per hand per runout.
  for (let h = 0; h < 3; h++) assert.ok(f.players[0].win[h] + f.players[1].win[h] <= 1 + 1e-9);
});

test("sampled statistics approximate exact ones", () => {
  const rng = makeRng(11);
  const { hands, board } = dealTable(3, rng);
  const exact = finishStats(runoutStats(hands, board.slice(0, 3), { exact: true }), 3);
  const sampled = finishStats(runoutStats(hands, board.slice(0, 3), { exact: false, samples: 20000, rng }), 3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(exact.players[i].ev - sampled.players[i].ev) < 0.25, `seat ${i}: ${exact.players[i].ev} vs ${sampled.players[i].ev}`);
});

test("face-up river chain follows the last-roll logic with a 6-point drop", () => {
  // Scoop locked: doubling only earns the 6-point drop, so play on.
  const scoop = analyzeDecision({ hist: deltaHist(10), level: 1 });
  assert.equal(scoop.best, "noDouble");
  assert.ok(scoop.tooGood);
  // Ahead by 5: double, opponent drops (6 > 5).
  const five = analyzeDecision({ hist: deltaHist(5), level: 1 });
  assert.equal(five.best, "double");
  assert.equal(five.response, "drop");
  assert.equal(five.value, 6);
  // Ahead by 2: double, opponent takes (lose 4 < lose 6).
  const two = analyzeDecision({ hist: deltaHist(2), level: 1 });
  assert.equal(two.best, "double");
  assert.equal(two.response, "take");
  assert.equal(two.value, 4);
  // Behind: no double; a double would be beavered and the chain escalates.
  const behind = analyzeDecision({ hist: deltaHist(-2), level: 1 });
  assert.equal(behind.best, "noDouble");
  assert.equal(behind.response, "reraise");
  assert.equal(behind.value, -2);
  // Node options are in the chooser's view and the chain is capped at MAX_CUBE.
  assert.equal(behind.nodes[1].options.find((o) => o.id === "drop").eq, -DROP_UNIT);
  assert.equal(behind.nodes.length, chainDepth(1) + 1);
  assert.equal(behind.nodes[chainDepth(1)].options.length, 2, "no re-raise at the cap");
  assert.equal(riverBest(4, 2), 12);
});

test("flop decision values the river cube by backward induction", () => {
  const hist = new Array(2 * MAX_NET + 1).fill(0);
  hist[0] = 0.5;
  hist[2 * MAX_NET] = 0.5;
  const none = analyzeDecision({ hist, level: 1, riverAfter: "none" });
  assert.ok(Math.abs(none.cubeless) < 1e-9);
  assert.ok(Math.abs(none.noDouble) < 1e-9);
  const opp = analyzeDecision({ hist, level: 1, riverAfter: "opponent" });
  assert.ok(Math.abs(opp.noDouble) < 1e-9);
  // 80% +4, 20% -4 -> cubeless 2.4. Double/take = 4.8 < drop 6, so they take: value 4.8 > 2.4.
  const h2 = new Array(2 * MAX_NET + 1).fill(0);
  h2[4 + MAX_NET] = 0.8;
  h2[-4 + MAX_NET] = 0.2;
  const a = analyzeDecision({ hist: h2, level: 1, riverAfter: "none" });
  assert.ok(Math.abs(a.cubeless - 2.4) < 1e-9);
  assert.equal(a.best, "double");
  assert.equal(a.response, "take");
  assert.ok(Math.abs(a.value - 4.8) < 1e-9);
  // With the actor holding river access, the +4 runouts become a 4-point take on the river (double, take at 2).
  const b = analyzeDecision({ hist: h2, level: 1, riverAfter: "actor" });
  assert.ok(Math.abs(b.noDouble - (0.8 * riverBest(4, 1) + 0.2 * riverBest(-4, 1))) < 1e-9);
  assert.ok(Math.abs(positionValue({ hist: h2, level: 1, riverAfter: "actor" }) - b.noDouble) < 1e-9);
  const pv = positionValue({ hist: h2, level: 1, riverAfter: "opponent" });
  const pv2 = positionValue({ hist: flipHist(h2), level: 1, riverAfter: "actor" });
  assert.ok(Math.abs(pv + pv2) < 1e-9);
});

test("seven variants and the street actor rule", () => {
  assert.deepEqual(VARIANT_ORDER, ["p", "f", "r", "pf", "pr", "fr", "pfr"]);
  const centered = { level: 1, owner: null };
  assert.equal(actorOn("f", "flop", 1, centered), 1, "button doubles on the only cube street");
  assert.equal(actorOn("f", "river", 1, centered), null);
  assert.equal(actorOn("fr", "river", 1, centered), 0, "second cube street alternates to the non-button");
  assert.equal(actorOn("fr", "river", 1, { level: 2, owner: 0 }), 0, "owner redoubles");
  assert.equal(actorOn("pfr", "flop", 0, centered), 1);
  assert.equal(actorOn("pfr", "river", 0, centered), 0);
  assert.equal(actorOn("pfr", "river", 0, { level: 2, owner: 1 }), 1);
  assert.equal(actorOn("r", "river", 1, { level: 64, owner: 0 }), null, "cube at the cap");
  assert.equal(variantOf("both").id, "fr");
  assert.deepEqual(laterCubeStreets("pfr", "flop"), ["river"]);
  assert.equal(DROP_UNIT, 6);
  assert.equal(MAX_CUBE, 64);
});

test("grading reports the loss of a wrong choice at a chain node", () => {
  const a = analyzeDecision({ hist: deltaHist(5), level: 1 });
  const g = gradeChoice(a, 0, "noDouble");
  assert.equal(g.best, "double");
  assert.ok(Math.abs(g.error - 1) < 1e-9);
  const r = gradeChoice(a, 1, "take");
  assert.equal(r.best, "drop");
  assert.ok(Math.abs(r.error - 4) < 1e-9);
});

test("deck helpers deal disjoint cards", () => {
  const t = dealTable(7, makeRng(5));
  const all = t.hands.flat().concat(t.board);
  assert.equal(new Set(all).size, 47);
  assert.equal(new Set(shuffledDeck(makeRng(1))).size, 52);
});
