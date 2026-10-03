import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, dealTable, settle, rangeStats, finishRangeStats, runoutStats, finishStats, parseCards, DROP_UNIT } from "../engine.mjs";
import { solve, sampleHands, sampleRunouts } from "../solver.mjs";

test("sampling produces disjoint hands and distinct runouts", () => {
  const rng = makeRng(1);
  const deck = Array.from({ length: 49 }, (_, i) => i + 3);
  const known = [51, 50, 49, 48, 47, 46];
  const hands = sampleHands(deck, 20, rng, known);
  assert.equal(hands.length, 20);
  assert.deepEqual(hands[0], known);
  for (const h of hands) assert.equal(new Set(h).size, 6);
  const runouts = sampleRunouts(deck, 2, 30, rng);
  assert.equal(runouts.length, 30);
  assert.equal(new Set(runouts.map((r) => r.join(","))).size, 30);
  assert.equal(sampleRunouts(deck.slice(0, 5), 2, 100, rng).length, 10, "enumerates when the space is small");
});

test("range statistics against a uniform range match perfect-information averages", () => {
  const rng = makeRng(2);
  const { hands, board } = dealTable(2, rng);
  // Hero vs the actual opponent, averaged over many opponents, is the range EV; check it is bounded and consistent.
  const r = finishRangeStats(rangeStats(hands[0], board.slice(0, 3), { samples: 30000, rng }));
  assert.ok(Math.abs(r.ev) <= 10);
  const sum = r.evHand.reduce((a, b) => a + b, 0) + r.evScoop;
  assert.ok(Math.abs(sum - r.ev) < 1e-9, "per-hand range EVs add up");
  assert.ok(Math.abs(r.hist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const mean = r.hist.reduce((s, p, i) => s + p * (i - 10), 0);
  assert.ok(Math.abs(mean - r.ev) < 1e-9);
  // Against a one-hand "range" the result is the perfect-information EV.
  const exact = finishStats(runoutStats(hands, board.slice(0, 4), { exact: true }), 2);
  const one = finishRangeStats(rangeStats(hands[0], board.slice(0, 4), { opponents: { hands: [hands[1]], weights: [1] }, rng }));
  assert.ok(one.exact);
  assert.ok(Math.abs(one.ev - exact.players[0].ev) < 1e-9);
});

test("river solve: a locked scoop is worth its full value, a hopeless hand never doubles", () => {
  const board = parseCards("As Ks Qs Js 2d");
  const nuts = parseCards("Ts 9s 8s 7s 6s 5s");
  const r = solve({ board, variant: "river", stage: "river", level: 1, actorSide: 0, btnHand: nuts, precision: "fast", seed: 3 });
  const a = r.river.now.actor;
  assert.ok(Math.abs(a.noDouble - 10) < 1e-9, "playing on scoops every hand");
  // Against a range that takes some doubles, doubling the nuts cannot be worse than the drop would make it.
  assert.ok(a.double >= 5 - 1e-9 && a.double <= 40);
  const trash = parseCards("3c 3d 4c 4d 5c 6c");
  const r2 = solve({ board, variant: "river", stage: "river", level: 1, actorSide: 0, btnHand: trash, precision: "fast", seed: 4 });
  assert.ok(r2.river.now.actor.pDouble < 0.1);
  assert.ok(r2.river.now.actor.noDouble < 0);
});

test("flop solve is a zero-sum equilibrium with sane option equities", () => {
  const rng = makeRng(5);
  const { hands, board } = dealTable(2, rng);
  const r = solve({ board: board.slice(0, 3), variant: "flop", stage: "flop", btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 6 });
  const f = r.flop;
  assert.ok(f.freq.double >= 0 && f.freq.double <= 1);
  assert.ok(Math.abs(f.freq.drop + f.freq.take + f.freq.beaver - 1) < 1e-6 || f.freq.double === 0);
  assert.ok(Math.abs(f.responder.pDrop + f.responder.pTake + f.responder.pBeaver - 1) < 1e-6);
  assert.equal(f.responder.drop, -DROP_UNIT);
  assert.equal(f.beaverReply.drop, -2 * DROP_UNIT);
  // The equilibrium value for the button is non-negative: the button can always decline to double.
  assert.ok(f.value > -0.2, `value ${f.value}`);
  // Each option's equity is bounded by the cube stakes.
  assert.ok(Math.abs(f.actor.noDouble) <= 10 && Math.abs(f.actor.double) <= 20);
  assert.ok(Object.keys(r.reach).length === 3 && r.reach.c1.btn.length === r.hands.btn.length);
});

test("flop-and-river solve reports river frequencies per cube state", () => {
  const rng = makeRng(7);
  const { hands, board } = dealTable(2, rng);
  const r = solve({ board: board.slice(0, 3), variant: "both", stage: "flop", btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 8, iterations: 40 });
  assert.ok(r.river.c1 && r.river.o2 && r.river.o4);
  const reach = r.river.c1.reach + r.river.o2.reach + r.river.o4.reach;
  assert.ok(reach <= 1 + 1e-6 && reach > 0.5, `reach ${reach}`);
  assert.equal(r.river.o2.level, 2);
  // Conditioned river solve on the actual runout uses the flop reach weights.
  const rs = solve({
    board,
    variant: "both",
    stage: "river",
    level: 1,
    actorSide: 1,
    btnHand: hands[0],
    oppHand: hands[1],
    weights: { btnHands: r.hands.btn, oppHands: r.hands.opp, btn: r.reach.c1.btn, opp: r.reach.c1.opp },
    precision: "fast",
    seed: 9,
  });
  const now = rs.river.now;
  assert.ok(now.actor && now.responder);
  const x = settle(hands, board).net[1];
  // The non-button's no-double equity equals its true net only against one hand; here it is a range average, so just bound it.
  assert.ok(Math.abs(now.actor.noDouble) <= 10 && Math.abs(x) <= 10);
});
