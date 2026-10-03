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
  riverOptions,
  analyzeDecision,
  positionValue,
  deltaHist,
  flipHist,
  gradeChoice,
  flopActor,
  riverActor,
  riverAfterFlop,
  VARIANTS,
  DROP_UNIT,
  MAX_NET,
} from "../engine.mjs";

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
  // One heart in the hand: no flush, but a Broadway straight with T.
  assert.equal(categoryOf(omahaValue(board, ...P("Th 3c"))), 4);
  // Two hearts complete the flush.
  assert.equal(categoryOf(omahaValue(board, ...P("Th 3h"))), 8);
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

test("river cube decisions follow the last-roll logic", () => {
  // Scoop locked: doubling only earns the 5-point drop, so play on.
  const scoop = analyzeDecision({ hist: deltaHist(10), level: 1 });
  assert.equal(scoop.best, "noDouble");
  assert.ok(scoop.tooGood);
  // Ahead by 4: double, opponent drops (5 > 4).
  const four = analyzeDecision({ hist: deltaHist(4), level: 1 });
  assert.equal(four.best, "double");
  assert.equal(four.response, "drop");
  assert.equal(four.value, 5);
  // Ahead by 2: double, opponent takes (lose 4 < lose 5).
  const two = analyzeDecision({ hist: deltaHist(2), level: 1 });
  assert.equal(two.best, "double");
  assert.equal(two.response, "take");
  assert.equal(two.value, 4);
  // Behind: no double; a double would be beavered.
  const behind = analyzeDecision({ hist: deltaHist(-2), level: 1 });
  assert.equal(behind.best, "noDouble");
  assert.equal(behind.response, "beaver");
  assert.equal(behind.beaverReply, "take");
  // At cube 2 the drop is worth 10.
  assert.equal(riverOptions(4, 2).drop, 10);
  assert.equal(riverOptions(-3, 2).beaverDrop, -20);
});

test("flop decision values the river cube by backward induction", () => {
  // 50/50 between +10 and -10: without river action a double is a take and worth 0 either way.
  const hist = new Array(2 * MAX_NET + 1).fill(0);
  hist[0] = 0.5;
  hist[2 * MAX_NET] = 0.5;
  const none = analyzeDecision({ hist, level: 1, riverAfter: "none" });
  assert.ok(Math.abs(none.cubeless) < 1e-9);
  assert.ok(Math.abs(none.noDouble) < 1e-9);
  assert.ok(Math.abs(none.take) < 1e-9);
  // With the opponent holding river access, a scoop for them is still only worth a 5 drop... they are too good, so values stay symmetric.
  const opp = analyzeDecision({ hist, level: 1, riverAfter: "opponent" });
  assert.ok(Math.abs(opp.noDouble) < 1e-9);
  // Skewed: 80% +4, 20% -4 -> cubeless 2.4. Double/take = 4.8 > drop 5? no, 4.8 < 5 so they take: value 4.8 > 2.4.
  const h2 = new Array(2 * MAX_NET + 1).fill(0);
  h2[4 + MAX_NET] = 0.8;
  h2[-4 + MAX_NET] = 0.2;
  const a = analyzeDecision({ hist: h2, level: 1, riverAfter: "none" });
  assert.ok(Math.abs(a.cubeless - 2.4) < 1e-9);
  assert.equal(a.best, "double");
  assert.equal(a.response, "take");
  assert.ok(Math.abs(a.value - 4.8) < 1e-9);
  // With the actor holding river access after the flop, the +4 runouts become a 5-point drop on the river.
  const b = analyzeDecision({ hist: h2, level: 1, riverAfter: "actor" });
  assert.ok(Math.abs(b.noDouble - (0.8 * 5 + 0.2 * -4)) < 1e-9);
  assert.ok(Math.abs(positionValue({ hist: h2, level: 1, riverAfter: "actor" }) - b.noDouble) < 1e-9);
  // Flipping the histogram negates the position value with swapped river access.
  const pv = positionValue({ hist: h2, level: 1, riverAfter: "opponent" });
  const pv2 = positionValue({ hist: flipHist(h2), level: 1, riverAfter: "actor" });
  assert.ok(Math.abs(pv + pv2) < 1e-9);
});

test("variants assign cube access", () => {
  const centered = { level: 1, owner: null };
  assert.equal(flopActor(VARIANTS.flop, 1), 1);
  assert.equal(flopActor(VARIANTS.river, 1), null);
  assert.equal(riverActor(VARIANTS.flop, 1), null);
  assert.equal(riverActor(VARIANTS.river, 1, centered), 1);
  assert.equal(riverActor(VARIANTS.both, 1, centered), 0);
  assert.equal(riverActor(VARIANTS.both, 1, { level: 2, owner: 0 }), 0);
  assert.equal(riverAfterFlop(VARIANTS.both), "opponent");
  assert.equal(riverAfterFlop(VARIANTS.flop), "none");
  assert.equal(DROP_UNIT, 5);
});

test("grading reports the loss of a wrong choice", () => {
  const a = analyzeDecision({ hist: deltaHist(4), level: 1 });
  const g = gradeChoice(a, "double", "noDouble");
  assert.equal(g.best, "double");
  assert.ok(Math.abs(g.error - 1) < 1e-9);
  const r = gradeChoice(a, "response", "take");
  assert.equal(r.best, "drop");
  assert.ok(Math.abs(r.error - 3) < 1e-9);
});

test("deck helpers deal disjoint cards", () => {
  const t = dealTable(7, makeRng(5));
  const all = t.hands.flat().concat(t.board);
  assert.equal(new Set(all).size, 47);
  assert.equal(new Set(shuffledDeck(makeRng(1))).size, 52);
});
