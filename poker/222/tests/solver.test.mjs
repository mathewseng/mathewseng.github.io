import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, dealTable, rangeStats, finishRangeStats, runoutStats, finishStats, parseCards, DROP_UNIT } from "../engine.mjs";
import { solve, sampleHands, sampleCombos, localExecutor } from "../solver.mjs";
import { offerRaise, reraise, canReraise, dropCost, chainDepth, reraiseName, levelAfter } from "../cube-rules.mjs";

// Every option in an equilibrium mix must be within the tolerance of the best option.
function assertConsistent(stage, tol = 0.08) {
  for (const nd of stage.nodes) {
    if (!nd.reached || nd.ownReach < 0.02) continue;
    const best = Math.max(...nd.options.map((o) => o.ev));
    for (const o of nd.options) if (o.prob > 0.02) assert.ok(o.ev >= best - tol * Math.max(1, nd.prevLevel), `node ${nd.k}: ${o.id} ${o.ev.toFixed(3)} in the mix (${(o.prob * 100).toFixed(0)}%) but best is ${best.toFixed(3)}`);
    const sum = nd.options.reduce((s, o) => s + o.prob, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6);
  }
}

test("cube rules: raise chain bookkeeping", () => {
  const p1 = offerRaise(1, 0, 1);
  assert.deepEqual([p1.k, p1.level, p1.drop, p1.raiser, p1.responder], [1, 2, 6, 0, 1]);
  const p2 = reraise(p1);
  assert.deepEqual([p2.k, p2.level, p2.drop, p2.raiser, p2.responder], [2, 4, 12, 1, 0]);
  assert.equal(reraiseName(1), "Beaver");
  assert.equal(reraiseName(2), "Raccoon");
  assert.equal(dropCost(2, 3), DROP_UNIT * 8);
  assert.equal(chainDepth(1), 6);
  assert.equal(chainDepth(16), 2);
  let p = p1;
  while (canReraise(p)) p = reraise(p);
  assert.equal(p.level, 64);
  assert.equal(levelAfter(1, 6), 64);
});

test("sampling produces disjoint hands and distinct combos", () => {
  const rng = makeRng(1);
  const deck = Array.from({ length: 49 }, (_, i) => i + 3);
  const known = [51, 50, 49, 48, 47, 46];
  const hands = sampleHands(deck, 20, rng, known);
  assert.equal(hands.length, 20);
  assert.deepEqual(hands[0], known);
  for (const h of hands) assert.equal(new Set(h).size, 6);
  const runouts = sampleCombos(deck, 2, 30, rng);
  assert.equal(runouts.length, 30);
  assert.equal(new Set(runouts.map((r) => r.join(","))).size, 30);
  assert.equal(sampleCombos(deck.slice(0, 5), 2, 100, rng).length, 10, "enumerates when the space is small");
});

test("range statistics against a uniform range are consistent", () => {
  const rng = makeRng(2);
  const { hands, board } = dealTable(2, rng);
  const r = finishRangeStats(rangeStats(hands[0], board.slice(0, 3), { samples: 30000, rng }));
  assert.ok(Math.abs(r.ev) <= 10);
  const sum = r.evHand.reduce((a, b) => a + b, 0) + r.evScoop;
  assert.ok(Math.abs(sum - r.ev) < 1e-9, "per-hand range EVs add up");
  assert.ok(Math.abs(r.hist.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const exact = finishStats(runoutStats(hands, board.slice(0, 4), { exact: true }), 2);
  const one = finishRangeStats(rangeStats(hands[0], board.slice(0, 4), { opponents: { hands: [hands[1]], weights: [1] }, rng }));
  assert.ok(one.exact);
  assert.ok(Math.abs(one.ev - exact.players[0].ev) < 1e-9);
});

test("river solve converges and its mixes match its equities", async () => {
  const rng = makeRng(5);
  const { hands, board } = dealTable(2, rng);
  const r = await solve({ variant: "r", board, btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 3 });
  assert.equal(r.entry, "river");
  assert.ok(r.exploitability < 0.05, `exploitability ${r.exploitability}`);
  assertConsistent(r.stage);
  const n0 = r.stage.nodes[0];
  assert.ok(n0.freq.double >= 0 && n0.freq.double <= 1);
  assert.ok(Math.abs(r.stage.nodes[1].options.find((o) => o.id === "drop").ev + DROP_UNIT) < 1e-9);
  assert.ok(Object.keys(r.reach).length === chainDepth(1) + 1);
  for (const key of Object.keys(r.reach)) assert.equal(r.reach[key].btn.length, r.hands.btn.length);
});

test("a locked scoop never doubles when every reply would be a drop", async () => {
  const board = parseCards("As Ks Qs Js 2d");
  const nuts = parseCards("Ts 9s 8s 7s 6s 5s");
  const r = await solve({ variant: "r", board, btnHand: nuts, precision: "fast", seed: 4 });
  const n0 = r.stage.nodes[0];
  assert.ok(Math.abs(n0.options[0].ev - 10) < 1e-9, "playing on scoops every hand");
  assert.ok(n0.options[1].ev >= 6 - 1e-9);
  const trash = parseCards("3c 3d 4c 4d 5c 6c");
  const r2 = await solve({ variant: "r", board, btnHand: trash, precision: "fast", seed: 5 });
  assert.ok(r2.stage.nodes[0].options[1].prob < 0.05, "hopeless hands do not double");
});

test("flop solve conditions later streets and reports aggregates", async () => {
  const rng = makeRng(7);
  const { hands, board } = dealTable(2, rng);
  const r = await solve({ variant: "fr", board: board.slice(0, 3), btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 8, iterations: 60 });
  assert.equal(r.entry, "flop");
  assert.ok(r.aggregates.river["1:c"] && r.aggregates.river["2:1"], "river states after no double and after a take");
  const reach = Object.values(r.aggregates.river).reduce((s, st) => s + st.entry, 0);
  assert.ok(reach <= 1 + 1e-6 && reach > 0.6, `reach ${reach}`);
  // A river solve on the actual runout, conditioned on the flop take.
  const w = r.reach["2:1"];
  const rs = await solve({ variant: "fr", board, entry: { level: 2, owner: 1 }, btnHand: hands[0], oppHand: hands[1], weights: { btnHands: r.hands.btn, oppHands: r.hands.opp, btn: w.btn, opp: w.opp }, precision: "fast", seed: 9 });
  assert.equal(rs.stage.actorSide, 1, "the non-button owns the cube and may redouble");
  assert.equal(rs.stage.base, 2);
  assert.ok(rs.exploitability < 0.1);
  assertConsistent(rs.stage);
  // Executors give the same structure.
  const r4 = await solve({ variant: "fr", board: board.slice(0, 3), btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 8, iterations: 40 }, [localExecutor(), localExecutor()]);
  assert.equal(r4.stage.nodes.length, r.stage.nodes.length);
});

test("preflop solves cover the three preflop variants with later streets", async () => {
  const rng = makeRng(11);
  const { hands } = dealTable(2, rng);
  const r = await solve({ variant: "pf", board: [], btnHand: hands[0], oppHand: hands[1], precision: "fast", seed: 12, iterations: 40, flops: 4, runouts: 8, hands: 30 });
  assert.equal(r.entry, "preflop");
  assert.ok(r.aggregates.flop["1:c"], "flop play after no preflop double");
  assert.ok(r.reach["1:c"] && r.reach["2:1"]);
  const r2 = await solve({ variant: "pr", board: [], precision: "fast", seed: 13, iterations: 30, boards: 12, hands: 24 });
  assert.ok(r2.aggregates.river["1:c"]);
  const r3 = await solve({ variant: "pfr", board: [], precision: "fast", seed: 14, iterations: 20, flops: 3, runouts: 6, hands: 20 });
  assert.ok(r3.aggregates.river && r3.aggregates.flop);
  assert.ok(Object.keys(r3.aggregates.river).some((k) => k.endsWith(":0")), "river states owned by the button after a flop take");
});
