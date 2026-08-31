const assert = require("assert").strict;
const core = require("../../fantasyland-core.js");

function cards(ids) {
  return ids.map(core.makeCard);
}

const wheelLow = core.evaluateDeuceSeven(cards(["7s", "5h", "4d", "3c", "2s"]));
assert.equal(wheelLow.qualifies, true, "low: 75432 should qualify");
assert.equal(wheelLow.points, 4, "low: 7-high should score four");
assert.equal(wheelLow.repeat, true, "low: 75432 should repeat");

const straightLow = core.evaluateDeuceSeven(cards(["6s", "5h", "4d", "3c", "2s"]));
assert.equal(straightLow.qualifies, false, "low: a straight should not qualify");

const flushLow = core.evaluateDeuceSeven(cards(["Ts", "8s", "6s", "4s", "2s"]));
assert.equal(flushLow.qualifies, false, "low: a flush should not qualify");

const tenLow = core.evaluateDeuceSeven(cards(["Ts", "8h", "6d", "4c", "2s"]));
assert.equal(tenLow.qualifies, true, "low: a clean ten-low should qualify");
assert.equal(tenLow.points, 0, "low: ten-high should score zero");

[
  [["8s", "7h", "5d", "4c", "2s"], 2],
  [["9s", "7h", "5d", "4c", "2s"], 1],
].forEach(([ids, points]) => {
  assert.equal(core.evaluateDeuceSeven(cards(ids)).points, points, `low: ${ids[0][0]}-high royalty breakpoint`);
});

const badeuceyWheel = core.evaluateBadeucey(cards(["7s", "5h", "4d", "3c", "2s"]));
assert.equal(badeuceyWheel.qualifies, true, "badeucey: wheel low plus four-card Badugi should qualify");
assert.equal(badeuceyWheel.points, 16, "badeucey: both wheels should score sixteen");
assert.equal(badeuceyWheel.repeat, true, "badeucey: both wheels should repeat");
assert.deepEqual(
  badeuceyWheel.scoreComponents.map(({ key, points }) => [key, points]),
  [["badugi", 12], ["low", 4]],
  "badeucey: score components should be separate with Badugi first"
);
assert.deepEqual(
  badeuceyWheel.scoreComponents.map(({ label }) => label),
  ["5hi", "7hi"],
  "badeucey: each split score should retain its own hand description"
);

const sixHighBadeucey = core.evaluateBadeucey(cards(["7s", "6h", "5d", "4c", "2s"]));
assert.equal(sixHighBadeucey.points, 12, "badeucey: 7-low plus 6-high Badugi should score twelve");

const sevenHighBadeucey = core.evaluateBadeucey(cards(["8s", "7h", "6d", "5c", "2s"]));
assert.equal(sevenHighBadeucey.points, 6, "badeucey: 8-low plus 7-high Badugi should score six");

const badugiJackNuts = core.evaluateBadugiJackConcrete(
  cards(["As", "2h", "3d", "4c"]),
  cards(["Ah", "Ks"])
);
assert.equal(badugiJackNuts.qualifies, true, "badugijack: wheel plus blackjack should qualify");
assert.equal(badugiJackNuts.points, 21, "badugijack: wheel plus blackjack should score twenty-one");
assert.equal(badugiJackNuts.repeat, true, "badugijack: five-high or better plus blackjack should repeat");
assert.deepEqual(
  badugiJackNuts.scoreComponents.map(({ key, points }) => [key, points]),
  [["badugi", 13], ["blackjack", 8]],
  "badugijack: score components should be separate with Badugi first"
);
assert.deepEqual(
  badugiJackNuts.scoreComponents.map(({ label }) => label),
  ["4hi", "BJ"],
  "badugijack: Badugi should be the first named score component"
);

const threeThreeBadugiJack = core.evaluateBadugiJackConcrete(
  cards(["As", "2h", "3d"]),
  cards(["7c", "7d", "7h"])
);
assert.equal(threeThreeBadugiJack.qualifies, true, "badugijack: a 3/3 split may qualify");
assert.equal(threeThreeBadugiJack.points, 5, "badugijack: three-card 21 should score five");

const badugiJackSuited = core.evaluateBadugiJackConcrete(
  cards(["2s", "4h", "6d", "9c"]),
  cards(["Ah", "Kh"])
);
assert.equal(badugiJackSuited.points, 14, "badugijack: 9-high Badugi plus suited blackjack should score fourteen");
assert.equal(badugiJackSuited.blackjack.suitedNatural, true, "badugijack: same-suit ace and ten-value card is suited blackjack");

const badugiJackBreakpoints = [
  ["4", 13],
  ["5", 8],
  ["6", 5],
  ["7", 3],
  ["8", 2],
  ["9", 1],
];
badugiJackBreakpoints.forEach(([high, points]) => {
  const evaluation = core.evaluateBadugiJackConcrete(
    cards(["As", "2h", "3d", `${high}c`]),
    cards(["9s", "8h"])
  );
  assert.equal(evaluation.badugi.points, points, `badugijack: ${high}-high Badugi breakpoint`);
});

const badugiJackBlackjackBreakpoints = [
  [["9s", "8h"], 0],
  [["Ts", "8h"], 1],
  [["Ts", "9h"], 2],
  [["Ts", "Qh"], 3],
  [["7s", "7h", "7d"], 5],
  [["Ah", "Ks"], 8],
  [["Ah", "Kh"], 13],
];
badugiJackBlackjackBreakpoints.forEach(([blackjackIds, points]) => {
  const evaluation = core.evaluateBadugiJackConcrete(
    cards(["2s", "4h", "6d", "9c"]),
    cards(blackjackIds)
  );
  assert.equal(evaluation.blackjack.points, points, `badugijack: ${blackjackIds.join(" ")} blackjack breakpoint`);
});

const threeCardBadugi = core.evaluateBadugiJackConcrete(
  cards(["As", "2h", "3d"]),
  cards(["9c", "8d", "2c"])
);
assert.equal(threeCardBadugi.qualifies, true, "badugijack: three-card Badugi with 19 should qualify");
assert.equal(threeCardBadugi.badugi.points, 0, "badugijack: only a four-card Badugi earns royalties");

const cribbageTwentyFour = core.evaluateCribbage(cards(["Js", "Jh", "5s", "5h", "5d"]));
assert.equal(cribbageTwentyFour.points, 24, "cribbage: Js Jh 5s 5h 5d should score twenty-four");
assert.equal(cribbageTwentyFour.breakdown.nobs, 2, "cribbage: each suited jack should score one");
assert.equal(cribbageTwentyFour.repeat, true, "cribbage: twenty-four should repeat");

const doubleRuns = core.cribbageScore(cards(["6s", "7h", "7d", "8c", "8s"]));
assert.equal(doubleRuns.runs, 12, "cribbage: 67788 should score four runs of three");

const cribbageBreakdown = core.evaluateCribbage(cards(["Js", "8s", "8h", "7s", "6s"]));
assert.equal(cribbageBreakdown.points, 17, "cribbage: J8876 with four spades should score seventeen");
assert.deepEqual(
  cribbageBreakdown.scoreComponents.map(({ label, points }) => [label, points]),
  [
    ["4 Card Flush", 4],
    ["2 Runs of 3", 6],
    ["Pair", 2],
    ["2 15s", 4],
    ["Suited J", 1],
  ],
  "cribbage: score description should retain every source in display order"
);

const partialCribbage = core.evaluateCribbage(cards(["7s", "8h"]));
assert.equal(partialCribbage.points, 2, "cribbage: a partial fifteen should score immediately");
assert.equal(partialCribbage.qualifies, false, "cribbage: a partial middle cannot qualify yet");
assert.deepEqual(partialCribbage.scoreComponents.map(({ label }) => label), ["15"], "cribbage: partial score should expose its breakdown");

const lowFoul = core.evaluateDeuceSeven(cards(["Js", "9h", "7d", "5c", "2s"]));
assert.equal(lowFoul.name, "Jhi Foul", "low: an otherwise clean jack-low should name the high card and foul");
assert.equal(lowFoul.status, "foul", "low: a failed low should expose a danger state");

[
  [["9s", "8h"], "17", 0],
  [["Ts", "8h"], "18", 1],
  [["Ts", "9h"], "19", 2],
  [["Ts", "Qh"], "20", 3],
  [["7s", "7h", "7d"], "21", 5],
  [["As", "Kh"], "BJ", 8],
  [["As", "Ks"], "Suited BJ", 13],
  [["As", "5s", "5h"], "21", 5],
  [["9s", "7s", "5s"], "Suited 21", 13],
].forEach(([ids, label, points]) => {
  const result = core.evaluateBlackjack(cards(ids));
  assert.equal(result.label, label, `blackjack: ${ids.join(" ")} display label`);
  assert.equal(result.points, points, `blackjack: ${ids.join(" ")} royalty breakpoint`);
});

assert.equal(core.evaluateBlackjack(cards(["9s", "7h"])).label, "16 Foul", "blackjack: sub-17 final hand should foul");
assert.equal(core.evaluateBlackjack(cards(["Ks", "Qh", "2d"])).label, "22 Bust", "blackjack: over-21 hand should bust");

const doubleBlackjack = core.evaluateDoubleBlackjackConcrete(
  cards(["7s", "7h", "7d"]),
  cards(["As", "Kh"])
);
assert.equal(doubleBlackjack.qualifies, true, "double blackjack: both split hands at 17+ should qualify");
assert.equal(doubleBlackjack.points, 13, "double blackjack: 21 plus blackjack should score thirteen");
assert.deepEqual(
  doubleBlackjack.scoreComponents.map(({ label, points }) => [label, points]),
  [["21", 5], ["BJ", 8]],
  "double blackjack: each split score should remain separate"
);

const doubleBlackjackRepeat = core.evaluateDoubleBlackjackConcrete(
  cards(["9s", "7s", "5s"]),
  cards(["Ah", "Kh"])
);
assert.equal(doubleBlackjackRepeat.repeat, true, "double blackjack: suited 21 plus blackjack should repeat");

const doubleBlackjackFoul = core.evaluateDoubleBlackjackConcrete(
  cards(["9s", "4h", "2d"]),
  cards(["As", "Kh"])
);
assert.equal(doubleBlackjackFoul.qualifies, false, "double blackjack: one failed split should foul the middle");
assert.deepEqual(
  doubleBlackjackFoul.scoreComponents.map(({ label }) => label),
  ["15 Foul", "BJ"],
  "double blackjack: qualifying split labels should still remain visible"
);

const lowBoard = core.evaluateBoard(
  ["6s", "6h", "2d", "7s", "5h", "4d", "3c", "2s", "Kh", "Kd", "Kc", "9d", "9c", "Ah"],
  {
    top: ["6s", "6h", "2d"],
    middle: ["7s", "5h", "4d", "3c", "2s"],
    bottom: ["Kh", "Kd", "Kc", "9d", "9c"],
  },
  { variant: "low" }
);
assert.equal(lowBoard.legal, true, "low board: qualifying middle and legal outer rows should be legal");
assert.equal(lowBoard.points, 11, "low board: top pair, wheel low, and bottom boat should sum royalties");
assert.equal(lowBoard.repeat, true, "low board: wheel low should repeat");

const independentJokers = core.evaluateBoard(
  ["7s", "7c", "Qh", "As", "Kd", "Qc", "Jh", "JK1", "Ts", "Th", "Tc", "JK2", "2d", "4h"],
  {
    top: ["7s", "7c", "Qh"],
    middle: ["As", "Kd", "Qc", "Jh", "JK1"],
    bottom: ["Ts", "Th", "Tc", "JK2", "2d"],
  },
  { variant: "high" }
);
assert.equal(independentJokers.legal, true, "jokers: independent row assignments should make a legal board");
assert.equal(independentJokers.assignments.get("JK1").id, "Ts", "jokers: a row may reuse a natural card that appears in another row");
assert.equal(independentJokers.assignments.get("JK2").rank, 10, "jokers: the bottom joker should independently complete quads");

const sameRowJokers = core.evaluateBoard(
  ["7s", "7c", "Qh", "9s", "9h", "5d", "4c", "2s", "Ts", "Th", "Tc", "JK1", "JK2", "3h"],
  {
    top: ["7s", "7c", "Qh"],
    middle: ["9s", "9h", "5d", "4c", "2s"],
    bottom: ["Ts", "Th", "Tc", "JK1", "JK2"],
  },
  { variant: "high" }
);
assert.notEqual(sameRowJokers.assignments.get("JK1").id, sameRowJokers.assignments.get("JK2").id, "jokers: two jokers in one row cannot become the same exact card");

assert.equal(core.buildSeed("2026-08-29", 14, 2, "badeucey", 0), "2026-08-29-14C-2J-BADEUCEY-0", "seed: canonical daily format");
assert.equal(core.buildSeed("2026-08-29", 17, 1, "badugijack", 3), "2026-08-29-17C-1J-BADUGIJACK-3", "seed: BadugiJack should have its own seed label");
assert.equal(core.buildSeed("2026-08-29", 16, 2, "doubleblackjack", 4), "2026-08-29-16C-2J-DOUBLEBLACKJACK-4", "seed: Double Blackjack should have its own seed label");

const firstDeal = core.dealSeeded(14, 2, "2026-08-29-14C-2J-LOW-0");
const secondDeal = core.dealSeeded(14, 2, "2026-08-29-14C-2J-LOW-0");
assert.deepEqual(firstDeal, secondDeal, "seed: identical seeds should reproduce the hand");
assert.equal(firstDeal.length, 14, "seed: deal should have requested card count");
assert.equal(firstDeal.filter((id) => id.startsWith("JK")).length, 2, "seed: deal should have requested jokers");

for (const variant of ["low", "badeucey", "badugijack", "doubleblackjack", "cribbage"]) {
  const deal = core.findQualifyingDeal("2026-08-29", 14, 0, variant, { maxAttempts: 5000 });
  assert.equal(core.hasQualifyingMiddle(deal.ids, variant), true, `seed: ${variant} deal should be middle-qualified`);
  assert.equal(deal.rawSeed, core.buildSeed("2026-08-29", 14, 0, variant, deal.counter), `seed: ${variant} counter should match raw seed`);
}

const incrementedLowDeal = core.findQualifyingDeal("TEST-29", 14, 0, "low", { maxAttempts: 100 });
assert.equal(incrementedLowDeal.counter, 1, "seed: an unplayable counter-zero Low hand should advance to one");
assert.equal(incrementedLowDeal.rawSeed, "TEST-29-14C-0J-LOW-1", "seed: incremented seed should retain the canonical format");
assert.equal(core.hasQualifyingMiddle(incrementedLowDeal.ids, "low"), true, "seed: incremented Low hand should qualify");

const randomDeal = core.findQualifyingDeal("A1B2C3D4", 14, 0, "low", { daily: false, maxAttempts: 100 });
assert.equal(randomDeal.seed, core.hashSeed(randomDeal.rawSeed).toString(16).padStart(8, "0").toUpperCase(), "seed: random deals should shuffle from the hash of their raw seed");

const boundedIds = ["6s", "6h", "2d", "As", "2h", "3d", "4c", "Ah", "Ks", "Kh", "Kd", "Kc", "9d", "9c"];
const boundedFirst = core.solveHand(boundedIds, { variant: "badugijack", mode: "fast", maskLimit: 40, beamLimit: 24 });
const boundedSecond = core.solveHand(boundedIds, { variant: "badugijack", mode: "fast", maskLimit: 40, beamLimit: 24 });
assert.ok(boundedFirst.best, "bounded search: BadugiJack sample should find a legal board");
assert.equal(Number.isFinite(boundedFirst.best.points), true, "bounded search: points should always be finite");
assert.equal(boundedFirst.best.points, boundedSecond.best.points, "bounded search: identical cards and bounds should be deterministic");
assert.deepEqual(boundedFirst.best.top.ids, boundedSecond.best.top.ids, "bounded search: selected board should be reproducible");

const doubleBlackjackSolveIds = ["6s", "6h", "2d", "9s", "7s", "5s", "Ah", "Kh", "Ks", "Kd", "Kc", "9d", "9c", "3h"];
const doubleBlackjackSolved = core.solveHand(doubleBlackjackSolveIds, { variant: "doubleblackjack", mode: "exact" });
assert.ok(doubleBlackjackSolved.best, "bounded search: Double Blackjack sample should find a legal board");
assert.equal(doubleBlackjackSolved.best.repeat, true, "bounded search: Double Blackjack should preserve the suited-21 repeat line");

console.log("variant core regression tests passed");
