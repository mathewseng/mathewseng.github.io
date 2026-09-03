const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const core = require("../../fantasyland-core.js");
const trainer = require("../app.js");

const workerContext = { console, performance: { now: () => Date.now() }, setTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../fantasyland-core.js"), "utf8"), workerContext);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"), workerContext);
assert.ok(workerContext.OFCFantasylandCore, "worker runtime should expose the Fantasyland variant core");
assert.ok(workerContext.OFCSolverCore, "worker runtime should initialize the trainer solver from globalThis");
assert.ok(
  workerContext.OFCSolverCore.solveVariantHand(["As", "Ah", "Ad", "Ks", "Kh", "Kd", "Qs", "Qh", "Qd", "Js", "Jh", "Jd", "Ts", "Th"], "high").best,
  "worker runtime should solve a Fantasyland hand"
);

function cards(ids) {
  return ids.map(core.makeCard);
}

function exhaustiveWildEvaluation(ids, evaluator) {
  const row = cards(ids);
  const jokers = row.filter((card) => card.joker);
  const blocked = new Set(row.filter((card) => !card.joker).map((card) => card.id));
  const deck = ["s", "h", "d", "c"].flatMap((suit) => ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"].map((rank) => core.makeCard(`${rank}${suit}`))).filter((card) => !blocked.has(card.id));
  let best = null;
  const consider = (replacements) => {
    let replacement = 0;
    const evaluation = evaluator(row.map((card) => (card.joker ? replacements[replacement++] : card)));
    if (!best || compareEvaluation(evaluation, best) > 0) best = evaluation;
  };
  if (!jokers.length) consider([]);
  else if (jokers.length === 1) deck.forEach((card) => consider([card]));
  else for (let first = 0; first < deck.length; first += 1) for (let second = first + 1; second < deck.length; second += 1) consider([deck[first], deck[second]]);
  return best;
}

function compareEvaluation(left, right) {
  if (Boolean(left.qualifies) !== Boolean(right.qualifies)) return left.qualifies ? 1 : -1;
  if (Boolean(left.repeat) !== Boolean(right.repeat)) return left.repeat ? 1 : -1;
  if ((left.points || 0) !== (right.points || 0)) return (left.points || 0) - (right.points || 0);
  return (left.quality || 0) - (right.quality || 0);
}

function assertSameEvaluation(actual, expected, message) {
  assert.equal(actual.qualifies, expected.qualifies, `${message}: qualification`);
  assert.equal(actual.repeat, expected.repeat, `${message}: repeat`);
  assert.equal(actual.points, expected.points, `${message}: royalties`);
  assert.equal(actual.quality, expected.quality, `${message}: quality`);
}

for (let sample = 0; sample < 500; sample += 1) {
  const ids = core.dealSeeded(5, 0, `FAST-HIGH-${sample}`);
  const descriptive = core.evaluateHighFive(cards(ids));
  const fast = core.evaluateHighFiveFast(cards(ids));
  assert.equal(fast.category, descriptive.category, `fast high: category should match for ${ids.join(" ")}`);
  assert.equal(fast.strength, descriptive.strength, `fast high: strength should match for ${ids.join(" ")}`);
  assert.equal(core.highFiveStrengthOnly(cards(ids)), descriptive.strength, `packed high: strength should match for ${ids.join(" ")}`);
  assert.deepEqual(fast.ranks, descriptive.ranks, `fast high: kickers should match for ${ids.join(" ")}`);
  assert.equal(core.cribbageScoreTotalFast(cards(ids)), core.cribbageScoreTotal(cards(ids)), `packed cribbage: score should match for ${ids.join(" ")}`);
}

[
  ["low", ["JK1", "JK2", "7s", "5h", "2d"], core.evaluateDeuceSeven],
  ["badeucey", ["JK1", "JK2", "7s", "5h", "2d"], core.evaluateBadeucey],
  ["bdp", ["JK1", "JK2", "8s", "5h", "2d"], core.evaluateBdpLow],
  ["cribbage", ["JK1", "JK2", "Js", "8s", "7h"], core.evaluateCribbage],
].forEach(([variant, ids, evaluator]) => {
  const preview = core.previewRows(ids, { top: [], middle: ids, bottom: [] }, { variant });
  const exhaustive = exhaustiveWildEvaluation(ids, evaluator);
  assertSameEvaluation(preview.rowEvals.middle, exhaustive, `${variant}: optimized middle joker scan should match exhaustive search`);
});

const bdpTopJokers = ["JK1", "JK2", "As"];
const bdpTopPreview = core.previewRows(bdpTopJokers, { top: bdpTopJokers, middle: [], bottom: [] }, { variant: "bdp" });
assertSameEvaluation(
  bdpTopPreview.rowEvals.top,
  exhaustiveWildEvaluation(bdpTopJokers, core.evaluateBdpTop),
  "bdp: optimized top joker scan should match exhaustive search"
);

const bdpBottomJokers = ["JK1", "JK2", "Ts", "Th", "2d"];
const bdpBottomPreview = core.previewRows(bdpBottomJokers, { top: [], middle: [], bottom: bdpBottomJokers }, { variant: "bdp" });
assertSameEvaluation(
  bdpBottomPreview.rowEvals.bottom,
  exhaustiveWildEvaluation(bdpBottomJokers, core.evaluateBdpBottom),
  "bdp: optimized bottom joker scan should match exhaustive search"
);

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

assert.equal(core.VARIANT_ORDER.indexOf("bdp"), core.VARIANT_ORDER.indexOf("badeucey") + 1, "bdp: selector order should place BDP directly after Badeucey");
assert.deepEqual(core.ACTIVE_VARIANT_ORDER, ["high", "low", "badeucey", "bdp", "cribbage"], "config: archived variants should stay out of production selectors");
assert.equal(core.VARIANTS.badugijack.archived, true, "config: BadugiJack logic should remain registered as archived");
assert.equal(core.VARIANTS.doubleblackjack.archived, true, "config: Double Blackjack logic should remain registered as archived");
assert.deepEqual(core.variantCardCounts("high"), [14, 15, 16, 17], "config: High should retain all four card counts");
assert.deepEqual(core.variantCardCounts("badeucey"), [14, 15, 16, 17], "config: Badeucey should support fourteen through seventeen cards");
assert.deepEqual(core.variantCardCounts("bdp"), [17], "config: BDP should use only seventeen cards");
assert.deepEqual(
  core.variantScenarios("badeucey"),
  [
    { cards: 14, jokers: 0 },
    { cards: 15, jokers: 0 },
    { cards: 16, jokers: 0 },
    { cards: 17, jokers: 0 },
    { cards: 14, jokers: 1 },
    { cards: 15, jokers: 1 },
    { cards: 16, jokers: 1 },
    { cards: 17, jokers: 1 },
    { cards: 14, jokers: 2 },
    { cards: 15, jokers: 2 },
    { cards: 16, jokers: 2 },
    { cards: 17, jokers: 2 },
  ],
  "config: Badeucey should expose all twelve card/joker configurations"
);
assert.deepEqual(
  core.variantScenarios("bdp"),
  [
    { cards: 17, jokers: 0 },
    { cards: 17, jokers: 1 },
    { cards: 17, jokers: 2 },
  ],
  "config: BDP should expose three card/joker configurations"
);

[
  [["As", "2h", "3d"], true, 12, "3hi"],
  [["As", "2h", "4d"], true, 8, "4hi"],
  [["As", "2h", "5d"], true, 4, "5hi"],
  [["As", "2h", "6d"], true, 0, "6hi"],
  [["As", "Ah", "3d"], false, 0, "Foul"],
  [["As", "2s", "3d"], false, 0, "Foul"],
].forEach(([ids, qualifies, points, label]) => {
  const evaluation = core.evaluateBdpTop(cards(ids));
  assert.equal(evaluation.qualifies, qualifies, `bdp top: ${ids.join(" ")} qualification`);
  assert.equal(evaluation.points, points, `bdp top: ${ids.join(" ")} royalties`);
  assert.equal(evaluation.name, label, `bdp top: ${ids.join(" ")} label`);
  assert.equal(evaluation.repeat, false, "bdp top: top Badugi never repeats Fantasyland");
});

[
  [["7s", "5h", "4d", "3c", "2s"], 12, "7hi"],
  [["8s", "7h", "5d", "4c", "2s"], 6, "8hi"],
  [["9s", "7h", "5d", "4c", "2s"], 3, "9hi"],
  [["Ts", "8h", "6d", "4c", "2s"], 0, "Thi"],
].forEach(([ids, points, label]) => {
  const evaluation = core.evaluateBdpLow(cards(ids));
  assert.equal(evaluation.qualifies, true, `bdp middle: ${label} should qualify`);
  assert.equal(evaluation.points, points, `bdp middle: ${label} royalty breakpoint`);
  assert.equal(evaluation.name, label, `bdp middle: ${label} display label`);
  assert.equal(evaluation.repeat, false, "bdp middle: the 2-7 wheel does not repeat Fantasyland");
});

[
  [["Ks", "Kh", "9d", "8c", "6s"], true, 0, false, "Pair"],
  [["9s", "8h", "7d", "6c", "5s"], true, 6, false, "Straight"],
  [["As", "Js", "8s", "4s", "2s"], true, 12, false, "Flush"],
  [["Ks", "Kh", "Kd", "9c", "9s"], true, 18, false, "Boat"],
  [["Qs", "Qh", "Qd", "Qc", "2s"], true, 30, true, "Quads"],
  [["9s", "8s", "7s", "6s", "5s"], true, 45, true, "Straight Flush"],
  [["As", "Ks", "Qs", "Js", "Ts"], true, 75, true, "Royal Flush"],
  [["As", "Kh", "9d", "7c", "4s"], false, 0, false, "Foul"],
].forEach(([ids, qualifies, points, repeat, label]) => {
  const evaluation = core.evaluateBdpBottom(cards(ids));
  assert.equal(evaluation.qualifies, qualifies, `bdp bottom: ${label} qualification`);
  assert.equal(evaluation.points, points, `bdp bottom: ${label} should score three times normal royalties`);
  assert.equal(evaluation.repeat, repeat, `bdp bottom: ${label} repeat rule`);
  assert.equal(evaluation.name, label, `bdp bottom: ${label} display label`);
});

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

const fourThreeBadugiJack = core.evaluateBadugiJackConcrete(
  cards(["As", "2h", "3d", "4c"]),
  cards(["7c", "7d", "7h"])
);
assert.equal(fourThreeBadugiJack.qualifies, true, "badugijack: a 4/3 split may qualify");
assert.equal(fourThreeBadugiJack.points, 18, "badugijack: a four-card wheel plus three-card 21 should score eighteen");

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
assert.equal(cribbageTwentyFour.cribbagePoints, 24, "cribbage: Js Jh 5s 5h 5d should score twenty-four raw points");
assert.equal(cribbageTwentyFour.points, 14, "cribbage: royalties should equal the raw score minus ten");
assert.equal(cribbageTwentyFour.breakdown.nobs, 2, "cribbage: each suited jack should score one");
assert.equal(cribbageTwentyFour.repeat, true, "cribbage: twenty-two or more should repeat");
assert.equal(cribbageTwentyFour.extraFantasyCard, true, "cribbage: twenty-two or more should award an extra Fantasyland card");

const doubleRuns = core.cribbageScore(cards(["6s", "7h", "7d", "8c", "8s"]));
assert.equal(doubleRuns.runs, 12, "cribbage: 67788 should score four runs of three");

const cribbageBreakdown = core.evaluateCribbage(cards(["Js", "8s", "8h", "7s", "6s"]));
assert.equal(cribbageBreakdown.cribbagePoints, 17, "cribbage: J8876 with four spades should score seventeen raw points");
assert.equal(cribbageBreakdown.points, 7, "cribbage: a seventeen-point middle should earn seven royalties");
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
assert.equal(partialCribbage.cribbagePoints, 2, "cribbage: a partial fifteen should show its raw score immediately");
assert.equal(partialCribbage.points, 0, "cribbage: an incomplete row should not award royalties");
assert.equal(partialCribbage.qualifies, false, "cribbage: a partial middle cannot qualify yet");
assert.deepEqual(partialCribbage.scoreComponents.map(({ label }) => label), ["15"], "cribbage: partial score should expose its breakdown");

const partialCribbagePreview = core.previewRows(
  ["7s", "8h"],
  { top: [], middle: ["7s", "8h"], bottom: [] },
  { variant: "cribbage" }
);
assert.equal(partialCribbagePreview.rowEvals.middle.cribbagePoints, 2, "cribbage: live partial-row preview should use the variable-length scorer");
const partialCribbageJokerPreview = core.previewRows(
  ["JK1", "8h"],
  { top: [], middle: ["JK1", "8h"], bottom: [] },
  { variant: "cribbage" }
);
assert.ok(partialCribbageJokerPreview.rowEvals.middle.cribbagePoints >= 2, "cribbage: live partial-row joker preview should remain scoreable");

[
  [["As", "Ks", "Qs", "Js", "Ts"], 10, false, 0, false, false, false],
  [["As", "Ks", "Qs", "Ts", "5s"], 11, true, 1, false, false, false],
  [["As", "Js", "3s", "2s", "Ah"], 17, true, 7, false, false, false],
  [["As", "Ks", "3s", "2s", "2h"], 18, true, 8, true, false, false],
  [["Ks", "Qs", "Js", "5s", "Kh"], 21, true, 11, true, false, false],
  [["Ks", "Qs", "Js", "5s", "5h"], 22, true, 12, true, true, true],
].forEach(([ids, rawPoints, qualifies, royalties, fantasy, repeat, extraFantasyCard]) => {
  const evaluation = core.evaluateCribbage(cards(ids));
  assert.equal(core.cribbageScoreTotal(cards(ids)), rawPoints, `cribbage: fast and descriptive scoring should agree at ${rawPoints} points`);
  assert.equal(evaluation.cribbagePoints, rawPoints, `cribbage: ${rawPoints}-point threshold fixture`);
  assert.equal(evaluation.qualifies, qualifies, `cribbage: ${rawPoints} raw points qualification`);
  assert.equal(evaluation.points, royalties, `cribbage: ${rawPoints} raw points royalty conversion`);
  assert.equal(evaluation.fantasy, fantasy, `cribbage: ${rawPoints} raw points Fantasyland entry`);
  assert.equal(evaluation.repeat, repeat, `cribbage: ${rawPoints} raw points repeat threshold`);
  assert.equal(evaluation.extraFantasyCard, extraFantasyCard, `cribbage: ${rawPoints} raw points extra-card threshold`);
});

const cribbageOuterRows = {
  top: ["2c", "3d", "4h"],
  bottom: ["As", "Ah", "Ad", "9c", "8d"],
};
[
  [["Ks", "Qs", "Js", "5s", "Kh"], false, "21-point"],
  [["Ks", "Qs", "Js", "5s", "5h"], true, "22-point"],
].forEach(([middle, repeat, label]) => {
  const rows = { ...cribbageOuterRows, middle };
  const evaluation = core.evaluateBoard([...rows.top, ...middle, ...rows.bottom], rows, { variant: "cribbage" });
  assert.equal(evaluation.legal, true, `cribbage board: ${label} fixture should be legal`);
  assert.equal(evaluation.repeat, repeat, `cribbage board: ${label} middle repeat boundary`);
  assert.equal(evaluation.repeatMask, repeat ? 2 : 0, `cribbage board: ${label} should identify the middle as its repeat source`);
});

for (let mask = 0; mask <= 7; mask += 1) {
  assert.equal(
    core.repeatMaskFromEvaluations({ repeat: Boolean(mask & 1) }, { repeat: Boolean(mask & 2) }, { repeat: Boolean(mask & 4) }),
    mask,
    `repeat source: mask ${mask} should preserve every row combination`
  );
}

const cribbageThreeSourceRows = {
  top: ["2s", "2h", "2d"],
  middle: ["Ks", "Qs", "Js", "5s", "5h"],
  bottom: ["As", "Ah", "Ad", "Ac", "8d"],
};
const cribbageThreeSource = core.evaluateBoard(
  [...cribbageThreeSourceRows.top, ...cribbageThreeSourceRows.middle, ...cribbageThreeSourceRows.bottom],
  cribbageThreeSourceRows,
  { variant: "cribbage" }
);
assert.equal(cribbageThreeSource.legal, true, "cribbage repeat source: three-row fixture should be legal");
assert.equal(cribbageThreeSource.repeatMask, 7, "cribbage repeat source: trips, 22+ middle, and quads should identify all three rows");
assert.deepEqual(
  trainer.repeatDetailForSolution(cribbageThreeSource),
  {
    repeatMask: 7,
    topTripsRank: 2,
    middleCribbagePoints: 22,
    bottomKind: "quads",
    bottomQuadsRank: 14,
  },
  "repeat detail: board evaluation should expose the top rank, middle score, and bottom quad rank"
);
assert.equal(
  trainer.repeatDetailForSolution({ repeatMask: 4, rowEvals: { bottom: { category: core.CATEGORY.STRAIGHT_FLUSH, mainRank: 14 } } }).bottomKind,
  "royal-flush",
  "repeat detail: an ace-high straight flush should be separated as a royal flush"
);
assert.equal(
  trainer.repeatDetailForSolution({ repeatMask: 4, rowEvals: { bottom: { category: core.CATEGORY.STRAIGHT_FLUSH, mainRank: 13 } } }).bottomKind,
  "straight-flush",
  "repeat detail: non-royal straight flushes should stay in their own bucket"
);

const highThreeSourceRows = {
  top: ["2s", "2h", "2d"],
  middle: ["3s", "3h", "3d", "3c", "4d"],
  bottom: ["9s", "Ts", "Js", "Qs", "Ks"],
};
const highThreeSource = core.evaluateBoard(
  [...highThreeSourceRows.top, ...highThreeSourceRows.middle, ...highThreeSourceRows.bottom],
  highThreeSourceRows,
  { variant: "high" }
);
assert.equal(highThreeSource.legal, true, "high repeat source: three-source fixture should be legal");
assert.equal(highThreeSource.repeatMask, 7, "high repeat source: trips, middle quads, and a bottom straight flush should identify all three rows");
assert.deepEqual(
  trainer.repeatDetailForSolution(highThreeSource),
  {
    repeatMask: 7,
    topTripsRank: 2,
    middleCribbagePoints: null,
    bottomKind: "straight-flush",
    bottomQuadsRank: 0,
  },
  "high repeat detail: top trips and the exact bottom repeat type should be retained"
);

const lowThreeSourceRows = {
  top: ["6s", "6h", "6d"],
  middle: ["7s", "5h", "4d", "3c", "2s"],
  bottom: ["As", "Ah", "Ad", "Ac", "Kd"],
};
const lowThreeSource = core.evaluateBoard(
  [...lowThreeSourceRows.top, ...lowThreeSourceRows.middle, ...lowThreeSourceRows.bottom],
  lowThreeSourceRows,
  { variant: "low" }
);
assert.equal(lowThreeSource.legal, true, "low repeat source: three-source fixture should be legal");
assert.equal(lowThreeSource.repeatMask, 7, "low repeat source: trips, a wheel low, and quads should identify all three rows");
assert.deepEqual(
  trainer.repeatDetailForSolution(lowThreeSource),
  {
    repeatMask: 7,
    topTripsRank: 6,
    middleCribbagePoints: null,
    bottomKind: "quads",
    bottomQuadsRank: 14,
  },
  "low repeat detail: top trips and bottom quads should retain their exact ranks"
);

const badeuceyMiddleOnlyRows = {
  top: ["Qs", "Jd", "9c"],
  middle: ["7s", "5h", "4d", "3c", "2s"],
  bottom: ["As", "Kh", "Qd", "Jc", "9h"],
};
const badeuceyMiddleOnly = core.evaluateBoard(
  [...badeuceyMiddleOnlyRows.top, ...badeuceyMiddleOnlyRows.middle, ...badeuceyMiddleOnlyRows.bottom],
  badeuceyMiddleOnlyRows,
  { variant: "badeucey" }
);
assert.equal(badeuceyMiddleOnly.legal, true, "badeucey repeat source: middle-only fixture should be legal");
assert.equal(badeuceyMiddleOnly.repeatMask, 2, "badeucey repeat source: the double wheel should identify the middle only");

const badeuceyThreeSourceRows = {
  top: ["6s", "6h", "6d"],
  middle: ["7s", "5h", "4d", "3c", "2s"],
  bottom: ["As", "Ah", "Ad", "Ac", "Kd"],
};
const badeuceyThreeSource = core.evaluateBoard(
  [...badeuceyThreeSourceRows.top, ...badeuceyThreeSourceRows.middle, ...badeuceyThreeSourceRows.bottom],
  badeuceyThreeSourceRows,
  { variant: "badeucey" }
);
assert.equal(badeuceyThreeSource.legal, true, "badeucey repeat source: three-source fixture should be legal");
assert.equal(badeuceyThreeSource.repeatMask, 7, "badeucey repeat source: trips, the double wheel, and quads should identify all three rows");
assert.deepEqual(
  trainer.repeatDetailForSolution(badeuceyThreeSource),
  {
    repeatMask: 7,
    topTripsRank: 6,
    middleCribbagePoints: null,
    bottomKind: "quads",
    bottomQuadsRank: 14,
  },
  "badeucey repeat detail: top trips and bottom quads should retain their exact ranks"
);

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
  [["As", "5s", "5h"], "11/21", 5],
  [["9s", "7s", "5s"], "Suited 21", 13],
].forEach(([ids, label, points]) => {
  const result = core.evaluateBlackjack(cards(ids));
  assert.equal(result.label, label, `blackjack: ${ids.join(" ")} display label`);
  assert.equal(result.points, points, `blackjack: ${ids.join(" ")} royalty breakpoint`);
});

assert.equal(core.evaluateBlackjack(cards(["9s", "7h"])).label, "16 Foul", "blackjack: sub-17 final hand should foul");
assert.equal(core.evaluateBlackjack(cards(["Ks", "Qh", "2d"])).label, "22 Bust", "blackjack: over-21 hand should bust");
assert.equal(core.evaluateBlackjack(cards(["As"]), { final: false, requiredCards: 3, allowNatural: false }).label, "A", "blackjack: a lone ace should remain readable");
assert.equal(core.evaluateBlackjack(cards(["As", "6h"])).label, "7/17", "blackjack: a soft seventeen should show both totals");
const fixedThreePreview = core.evaluateBlackjack(cards(["As", "Kh"]), { final: false, requiredCards: 3, allowNatural: false });
assert.equal(fixedThreePreview.label, "11/21", "blackjack: a fixed three-card hand should show a soft total instead of BJ");
assert.equal(fixedThreePreview.qualifies, false, "blackjack: a fixed three-card hand cannot qualify with only two cards");
assert.equal(fixedThreePreview.points, 0, "blackjack: an incomplete fixed three-card hand cannot score BJ royalties");

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

const incompleteDoubleBlackjack = core.evaluateDoubleBlackjackConcrete(cards(["As", "Kh"]), []);
assert.equal(incompleteDoubleBlackjack.blackjackThree.label, "11/21", "double blackjack: the incomplete three-card side should not display BJ");

const bdpRows = {
  top: ["As", "2h", "3d"],
  middle: ["7c", "5s", "4h", "3c", "2d"],
  bottom: ["Qs", "Qh", "Qd", "Qc", "Ks"],
};
const bdpIds = Object.values(bdpRows).flat();
const bdpBoard = core.evaluateBoard(bdpIds, bdpRows, { variant: "bdp" });
assert.equal(bdpBoard.legal, true, "bdp board: independently qualifying rows should make a legal board");
assert.equal(bdpBoard.points, 54, "bdp board: 3hi, 7hi, and triple bottom quads should total fifty-four");
assert.equal(bdpBoard.repeat, true, "bdp board: bottom quads should repeat Fantasyland");
assert.equal(bdpBoard.repeatMask, 4, "bdp repeat source: only the bottom row can repeat Fantasyland");
assert.deepEqual(
  trainer.repeatDetailForSolution(bdpBoard),
  {
    repeatMask: 4,
    topTripsRank: 0,
    middleCribbagePoints: null,
    bottomKind: "quads",
    bottomQuadsRank: 12,
  },
  "bdp repeat detail: bottom quads should retain their exact rank"
);
assert.deepEqual(bdpBoard.rowPoints, { top: 12, middle: 12, bottom: 30 }, "bdp board: row royalties should remain separate");

const bdpJokerRows = { ...bdpRows, top: ["As", "2h", "JK1"] };
const bdpJokerIds = Object.values(bdpJokerRows).flat();
const bdpJokerBoard = core.evaluateBoard(bdpJokerIds, bdpJokerRows, { variant: "bdp" });
assert.equal(bdpJokerBoard.legal, true, "bdp joker: a top joker should complete a qualifying three-card Badugi");
assert.equal(bdpJokerBoard.assignments.get("JK1").rank, 3, "bdp joker: the top joker should make the 3hi nuts");
assert.ok(!["s", "h"].includes(bdpJokerBoard.assignments.get("JK1").suit), "bdp joker: the assigned card should preserve three different suits");

const bdpFoulRows = { ...bdpRows, bottom: ["Ah", "Kh", "9d", "8c", "6s"] };
const bdpFoulBottom = core.evaluateBoard(Object.values(bdpFoulRows).flat(), bdpFoulRows, { variant: "bdp" });
assert.equal(bdpFoulBottom.legal, false, "bdp board: a high-card bottom should foul even when top and middle qualify");
assert.equal(bdpFoulBottom.rowNames.bottom, "Foul", "bdp board: a completed foul should retain bottom-row feedback");
assert.equal(bdpFoulBottom.rowNames.middle, "7hi", "bdp board: a completed foul should retain qualifying middle feedback");
assert.equal(bdpFoulBottom.points, 24, "bdp board: live foul feedback should retain earned top and middle royalties");

assert.throws(
  () => core.solveHand(bdpIds.concat("9h"), { variant: "bdp", mode: "exact" }),
  /BDP Fantasyland needs 17 cards/,
  "bdp solver: hands below seventeen cards should be rejected"
);
const hypotheticalBdp = core.solveHand(bdpIds.concat("9h"), { variant: "bdp", mode: "exact", allowUnsupportedCardCount: true });
assert.ok(hypotheticalBdp.best, "bdp analysis: an explicit analytical override should solve off-rule card counts");
assert.equal(hypotheticalBdp.best.repeat, true, "bdp analysis: hypothetical solves should retain normal repeat rules");
assert.equal(
  core.hasQualifyingMiddle(bdpIds.concat("9h"), "bdp", { allowUnsupportedCardCount: true }),
  true,
  "bdp analysis: qualification checks should honor the analytical override"
);
const bdpSolved = core.solveHand(bdpIds.concat(["9h", "8d", "6c", "Jh"]), { variant: "bdp", mode: "fast", maskLimit: 600, beamLimit: 360 });
assert.ok(bdpSolved.best, "bdp solver: a qualifying hand should produce a legal solution");
assert.equal(bdpSolved.best.repeat, true, "bdp solver: a bottom quads repeat line should be preserved");
assert.equal(bdpSolved.best.top.eval.qualifies, true, "bdp solver: top must qualify as three-card Badugi");
assert.equal(bdpSolved.best.middle.eval.qualifies, true, "bdp solver: middle must qualify as 2-7 low");
assert.equal(bdpSolved.best.bottom.eval.qualifies, true, "bdp solver: bottom must qualify with a pair or better");

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

const flexibleBadugiJackRows = {
  top: ["Kh", "Kd"],
  middleBadugi: ["As", "2h", "3d", "4c"],
  middleBlackjack: ["7s", "7h", "7d"],
  bottom: ["Qs", "Qh", "Qd", "Qc"],
};
const flexibleBadugiJackIds = Object.values(flexibleBadugiJackRows).flat();
assert.equal(core.rowsComplete("badugijack", flexibleBadugiJackRows), true, "badugijack: exactly thirteen cards may leave one outer slot empty in each row");
const flexibleBadugiJackBoard = core.evaluateBoard(flexibleBadugiJackIds, flexibleBadugiJackRows, { variant: "badugijack" });
assert.equal(flexibleBadugiJackBoard.legal, true, "badugijack: a legal 2/7/4 board should evaluate");
assert.equal(flexibleBadugiJackBoard.points, 36, "badugijack: shortened outer rows should retain earned royalties");
assert.equal(flexibleBadugiJackBoard.repeat, true, "badugijack: bottom quads should repeat on a shortened bottom row");
[
  [3, 3, 2, 5],
  [1, 4, 3, 5],
  [3, 4, 3, 3],
  [2, 3, 3, 5],
  [3, 4, 2, 4],
].forEach(([top, badugi, blackjack, bottom]) => {
  assert.equal(
    core.rowsComplete("badugijack", {
      top: Array(top).fill("top"),
      middleBadugi: Array(badugi).fill("badugi"),
      middleBlackjack: Array(blackjack).fill("blackjack"),
      bottom: Array(bottom).fill("bottom"),
    }),
    true,
    `badugijack: ${top}/${badugi + blackjack}/${bottom} should be a valid thirteen-card layout`
  );
});
assert.equal(
  core.rowsComplete("badugijack", { ...flexibleBadugiJackRows, top: ["Kh", "Kd", "Kc"] }),
  false,
  "badugijack: the former fourteen-card board should be rejected"
);

assert.equal(core.buildSeed("2026-08-29", 16, 2, "badeucey", 0), "2026-08-29-16C-2J-BADEUCEY-0", "seed: canonical Badeucey format");
assert.equal(core.buildSeed("2026-08-29", 14, 0, "badeucey", 0), "2026-08-29-14C-0J-BADEUCEY-0", "seed: fourteen-card Badeucey should be valid");
assert.equal(core.buildSeed("2026-08-29", 15, 0, "badeucey", 0), "2026-08-29-15C-0J-BADEUCEY-0", "seed: fifteen-card Badeucey should be valid");
assert.equal(core.buildSeed("2026-08-29", 17, 1, "bdp", 2), "2026-08-29-17C-1J-BDP-2", "seed: BDP should have its own seed label");
assert.throws(() => core.buildSeed("2026-08-29", 16, 0, "bdp", 0), /BDP Fantasyland needs 17 cards/, "seed: BDP should reject sixteen cards");
assert.equal(core.buildSeed("2026-08-29", 17, 1, "badugijack", 3), "2026-08-29-17C-1J-BADUGIJACK-3", "seed: BadugiJack should have its own seed label");
assert.equal(core.buildSeed("2026-08-29", 16, 2, "doubleblackjack", 4), "2026-08-29-16C-2J-DOUBLEBLACKJACK-4", "seed: Double Blackjack should have its own seed label");

const firstDeal = core.dealSeeded(14, 2, "2026-08-29-14C-2J-LOW-0");
const secondDeal = core.dealSeeded(14, 2, "2026-08-29-14C-2J-LOW-0");
assert.deepEqual(firstDeal, secondDeal, "seed: identical seeds should reproduce the hand");
assert.equal(firstDeal.length, 14, "seed: deal should have requested card count");
assert.equal(firstDeal.filter((id) => id.startsWith("JK")).length, 2, "seed: deal should have requested jokers");

for (const variant of ["low", "badeucey", "bdp", "badugijack", "doubleblackjack", "cribbage"]) {
  const cards = core.variantCardCounts(variant)[0];
  const deal = core.findQualifyingDeal("2026-08-29", cards, 0, variant, { maxAttempts: 5000 });
  assert.equal(core.hasQualifyingMiddle(deal.ids, variant), true, `seed: ${variant} deal should be middle-qualified`);
  assert.equal(deal.rawSeed, core.buildSeed("2026-08-29", cards, 0, variant, deal.counter), `seed: ${variant} counter should match raw seed`);
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
assert.equal(
  boundedFirst.best.top.ids.length + boundedFirst.best.middle.ids.length + boundedFirst.best.bottom.ids.length,
  13,
  "bounded search: BadugiJack solutions should place exactly thirteen cards"
);
assert.ok(boundedFirst.best.top.ids.length >= 1 && boundedFirst.best.top.ids.length <= 3, "bounded search: BadugiJack top should use one to three cards");
assert.ok(boundedFirst.best.bottom.ids.length >= 3 && boundedFirst.best.bottom.ids.length <= 5, "bounded search: BadugiJack bottom should use three to five cards");

const doubleBlackjackSolveIds = ["6s", "6h", "2d", "9s", "7s", "5s", "Ah", "Kh", "Ks", "Kd", "Kc", "9d", "9c", "3h"];
const doubleBlackjackSolved = core.solveHand(doubleBlackjackSolveIds, { variant: "doubleblackjack", mode: "exact" });
assert.ok(doubleBlackjackSolved.best, "bounded search: Double Blackjack sample should find a legal board");
assert.equal(doubleBlackjackSolved.best.repeat, true, "bounded search: Double Blackjack should preserve the suited-21 repeat line");

function solverMetricDigest(result) {
  return {
    bestPoints: result.best?.points ?? null,
    bestRepeats: Boolean(result.best?.repeat),
    royaltyPoints: result.bestRoyalty?.points ?? null,
    repeatPoints: result.bestRepeat?.points ?? null,
  };
}

[
  ["low", 14, 2, { mode: "exact" }],
  ["badeucey", 14, 2, { mode: "exact" }],
  ["cribbage", 14, 2, { mode: "exact" }],
  ["low", 17, 2, { mode: "fast" }],
  ["badeucey", 17, 2, { mode: "fast" }],
  ["cribbage", 17, 2, { mode: "fast" }],
  ["bdp", 17, 2, { mode: "fast", maskLimit: 160, beamLimit: 100 }],
].forEach(([variant, cardCount, jokers, options]) => {
  const ids = core.dealSeeded(cardCount, jokers, `BOARD-PARITY-${variant}-${cardCount}-${jokers}`);
  const optimized = core.solveHand(ids, { variant, allowUnsupportedCardCount: true, ...options });
  const legacy = core.solveHand(ids, { variant, allowUnsupportedCardCount: true, legacyIndependentSearch: true, ...options });
  assert.deepEqual(solverMetricDigest(optimized), solverMetricDigest(legacy), `${variant}: optimized board search should preserve trainer metrics`);
});

console.log("variant core regression tests passed");
