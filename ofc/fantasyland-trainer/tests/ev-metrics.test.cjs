const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const core = require("../../fantasyland-core.js");
const trainerCore = require("../app.js");
const source = fs.readFileSync(path.join(__dirname, "../../fantasyland-ev/app.js"), "utf8");
const context = {
  console,
  document: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  performance: { now: () => Date.now() },
  window: { OFCFantasylandCore: core, OFCSolverCore: trainerCore, setTimeout },
};
vm.runInNewContext(source, context, { filename: "fantasyland-ev/app.js" });

const api = context.window.OFCFantasylandEV;
const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`);
const currentSolver = "trainer-exactdist-20260907b+trainer-exact-jjjplus-20260907b";
const emptyCache = { results: {}, topRepeatJacksPlusResults: {} };

assert.equal(
  JSON.stringify(api.parseResultsCache(JSON.stringify({ schemaVersion: 1, solver: "outdated-solver", results: { cribbage: { stale: true } } }))),
  JSON.stringify(emptyCache),
  "results cached by an older solver should be discarded"
);
assert.equal(
  JSON.stringify(api.parseResultsCache(JSON.stringify({ schemaVersion: 2, solver: currentSolver, results: { cribbage: { current: true } } }))),
  JSON.stringify(emptyCache),
  "results cached without a separate JJJ+ result store should be discarded"
);
assert.equal(
  JSON.stringify(api.parseResultsCache(JSON.stringify({
    schemaVersion: 3,
    solver: currentSolver,
    results: { cribbage: { current: true } },
    topRepeatJacksPlusResults: { cribbage: { restricted: true } },
  }))),
  JSON.stringify({
    results: { cribbage: { current: true } },
    topRepeatJacksPlusResults: { cribbage: { restricted: true } },
  }),
  "results cached by the current solver should be restored"
);
assert.equal(JSON.stringify(api.parseResultsCache("not-json")), JSON.stringify(emptyCache), "malformed cached results should be discarded");

const delegatedVariants = [];
const delegationContext = {
  console,
  document: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  performance: { now: () => Date.now() },
  window: {
    OFCFantasylandCore: core,
    OFCSolverCore: {
      solveVariantHand(ids, variant, options) {
        delegatedVariants.push({ ids, variant, options });
        return { best: { points: 0 }, bestRoyalty: null, bestRepeat: null };
      },
    },
    setTimeout,
  },
};
vm.runInNewContext(source, delegationContext, { filename: "fantasyland-ev-delegation.js" });
core.ACTIVE_VARIANT_ORDER.forEach((variant) => delegationContext.window.OFCFantasylandEV.solveSample(["As"], variant));
delegationContext.window.OFCFantasylandEV.solveSample(["As"], "low", 11);
assert.deepEqual(delegatedVariants.slice(0, -1).map(({ variant }) => variant), core.ACTIVE_VARIANT_ORDER, "every active EV variant should delegate to the trainer solver");
assert.equal(delegatedVariants.every(({ options }) => options.allowUnsupportedCardCount === true), true, "EV delegation should retain off-rule analytical card counts");
assert.equal(delegatedVariants[delegatedVariants.length - 1].options.topRepeatMinRank, 11, "JJJ+ EV samples should pass the top-repeat threshold into the trainer solver");

const previousFalseFoul = ["Qs", "2s", "9h", "5h", "3c", "Th", "Tc", "Kh", "3h", "Ts", "As", "9c", "4c", "4d"];
const exactHigh = api.solveSample(previousFalseFoul, "high");
assert.ok(exactHigh.best, "EV High samples must use the trainer's complete solver and never report a false foul");

core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
  const scenarios = Array.from(api.scenariosForVariant(variant), (scenario) => ({ cards: scenario.cards, jokers: scenario.jokers }));
  assert.equal(scenarios.length, 12, `${variant}: EV should include all twelve exact-hand configurations`);
  assert.deepEqual(
    [...new Set(scenarios.map((scenario) => scenario.cards))],
    [14, 15, 16, 17],
    `${variant}: EV should include 14 through 17 cards, including off-rule hypotheticals`
  );
});

[14, 15, 16, 17].forEach((cards) => {
  [1, 2].forEach((deckJokers) => {
    const sum = Array.from({ length: deckJokers + 1 }, (_, jokers) => api.hypergeometricJokers(cards, jokers, deckJokers)).reduce((total, value) => total + value, 0);
    closeTo(sum, 1, `${cards} cards / ${deckJokers}J deck probabilities should sum to one`);
  });
  closeTo(api.hypergeometricJokers(cards, 1, 1), cards / 53, `${cards} cards from a one-joker deck should draw the joker with n/53 probability`);
});

const synthetic = {
  "14-0": { immediate: 10, repeatRate: 0.1, foulRate: 0.2 },
  "14-1": { immediate: 20, repeatRate: 0.3, foulRate: 0.4 },
  "14-2": { immediate: 30, repeatRate: 0.5, foulRate: 0.6 },
};
const oneJ = api.aggregateDeckResults(synthetic, 14, 1);
const oneJProbability = api.hypergeometricJokers(14, 1, 1);
closeTo(oneJ.immediate, 10 * (1 - oneJProbability) + 20 * oneJProbability, "one-joker deck royalty EV should weight 0J and 1J exact results");
closeTo(oneJ.repeatRate, 0.1 * (1 - oneJProbability) + 0.3 * oneJProbability, "one-joker deck repeat chance should be probability weighted");
closeTo(oneJ.foulRate, 0.2 * (1 - oneJProbability) + 0.4 * oneJProbability, "one-joker deck foul chance should be probability weighted");

const twoJ = api.aggregateDeckResults(synthetic, 14, 2);
const twoJWeights = [0, 1, 2].map((jokers) => api.hypergeometricJokers(14, jokers, 2));
closeTo(twoJ.immediate, 10 * twoJWeights[0] + 20 * twoJWeights[1] + 30 * twoJWeights[2], "two-joker deck royalty EV should weight all exact joker counts");
assert.equal(api.aggregateDeckResults({ "14-0": synthetic["14-0"] }, 14, 1), null, "deck aggregates should wait for every required exact-hand result");

const recursiveSynthetic = {
  "14-0": { strategy: 10, recursiveRepeatRate: 0.1 },
  "14-1": { strategy: 20, recursiveRepeatRate: 0.3 },
  "14-2": { strategy: 30, recursiveRepeatRate: 0.5 },
};
const futureStrategy = 10 * twoJWeights[0] + 20 * twoJWeights[1] + 30 * twoJWeights[2];
const futureRepeat = 0.1 * twoJWeights[0] + 0.3 * twoJWeights[1] + 0.5 * twoJWeights[2];
closeTo(api.recursiveValueForScenario(recursiveSynthetic, { cards: 14, jokers: 0 }), 10 / 0.9, "zero-joker recursive EV should remain in the 52-card game");
closeTo(
  api.recursiveValueForScenario(recursiveSynthetic, { cards: 14, jokers: 1 }),
  20 + 0.3 * (futureStrategy / (1 - futureRepeat)),
  "joker recursive EV should weight future 0J, 1J, and 2J Fantasyland deals from the 54-card deck"
);

const aggregate = api.finalizeAggregate({
  samples: 4,
  immediateSum: 20,
  immediateSquared: 120,
  strategySum: 18,
  repeatCount: 1,
  repeatPointSum: 8,
  repeatSources: [0, 0, 1, 0, 0, 0, 0, 0],
  repeatDetails: {
    topTripsByRank: Array(15).fill(0),
    topBdpWheel: 0,
    bottomQuadsByRank: Array(15).fill(0),
    bottomStraightFlushByRank: Array(15).fill(0),
    bottomStraightFlush: 0,
    bottomRoyalFlush: 0,
    cribbageMiddleByScore: Array.from({ length: 30 }, (_, score) => score === 11 ? 3 : 0),
  },
  qualifyCount: 3,
  distribution: Array.from({ length: 128 }, (_, score) => score < 4 ? 1 : 0),
});
assert.equal(aggregate.qualifyRate, 0.75, "EV aggregate should retain legal-board probability");
assert.equal(aggregate.foulRate, 0.25, "EV aggregate foul chance should equal one minus legal-board probability");
assert.equal(aggregate.totals.samples, 4, "EV aggregate should retain raw totals for cumulative runs");
assert.equal(aggregate.totals.repeatSources[2], 1, "EV aggregate should retain the middle-row repeat source");

const restored = api.aggregateFromResult(aggregate);
assert.deepEqual(Array.from(restored.distribution), Array.from({ length: 128 }, (_, score) => score < 4 ? 1 : 0), "cumulative runs should restore exact distribution totals");
assert.equal(restored.immediateSum, 20, "cumulative runs should restore immediate royalty totals");
const merged = api.mergeAggregate(restored, {
  samples: 2,
  immediateSum: 8,
  immediateSquared: 34,
  strategySum: 7,
  repeatCount: 1,
  repeatPointSum: 6,
  repeatSources: [0, 1, 0, 0, 0, 0, 0, 0],
  repeatDetails: {
    topTripsByRank: Array.from({ length: 15 }, (_, rank) => rank === 14 ? 1 : 0),
    topBdpWheel: 0,
    bottomQuadsByRank: Array(15).fill(0),
    bottomStraightFlushByRank: Array(15).fill(0),
    bottomStraightFlush: 0,
    bottomRoyalFlush: 0,
    cribbageMiddleByScore: Array.from({ length: 30 }, (_, score) => score === 12 ? 2 : 0),
  },
  qualifyCount: 2,
  distribution: Array.from({ length: 128 }, (_, score) => score === 1 || score === 2 ? 1 : 0),
});
assert.equal(merged.samples, 6, "cumulative runs should add sample counts");
assert.deepEqual(Array.from(merged.repeatSources), [0, 1, 1, 0, 0, 0, 0, 0], "cumulative runs should merge repeat-source buckets");
assert.equal(merged.repeatDetails.topTripsByRank[14], 1, "cumulative runs should merge top trips ranks");
assert.equal(merged.repeatDetails.cribbageMiddleByScore[11], 3, "cumulative runs should retain existing Cribbage score frequencies");
assert.equal(merged.repeatDetails.cribbageMiddleByScore[12], 2, "cumulative runs should add new Cribbage score frequencies");
assert.equal(api.finalizeAggregate(merged).immediate, 28 / 6, "cumulative runs should calculate EV from all saved and new samples");

assert.equal(api.sampleChunkSize(24), 1, "small runs should checkpoint each sample");
assert.equal(api.sampleChunkSize(100000), 25, "large runs should use bounded worker chunks");
assert.equal(api.formatDuration(61000), "1m 01s", "time estimates should remain compact and precise");

assert.equal(
  api.applyPrecomputedResults({ schemaVersion: 1, samplesPerConfig: 9999, results: {} }),
  0,
  "the production page should reject a baseline below 10k samples per configuration"
);
assert.equal(
  api.applyPrecomputedResults({ schemaVersion: 1, solver: "outdated-solver", samplesPerConfig: 10000, results: {} }),
  0,
  "the production page should reject a baseline from a different solver"
);
const completeBaseline = {};
core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
  completeBaseline[variant] = {};
  api.scenariosForVariant().forEach((scenario) => {
    const totals = {
      ...aggregate.totals,
      samples: 10000,
      distribution: Array.from({ length: 128 }, (_, score) => score === 5 ? 10000 : 0),
      repeatDetails: {
        ...aggregate.totals.repeatDetails,
        cribbageMiddleByScore: variant === "cribbage"
          ? aggregate.totals.repeatDetails.cribbageMiddleByScore
          : Array(30).fill(0),
      },
    };
    completeBaseline[variant][`${scenario.cards}-${scenario.jokers}`] = {
      ...aggregate,
      samples: 10000,
      totals,
    };
  });
});
const completeJacksPlusBaseline = {};
["low", "badeucey", "cribbage"].forEach((variant) => {
  completeJacksPlusBaseline[variant] = completeBaseline[variant];
});
assert.equal(
  api.applyPrecomputedResults({
    schemaVersion: 1,
    solver: currentSolver,
    samplesPerConfig: 10000,
    results: completeBaseline,
    topRepeatJacksPlusResults: completeJacksPlusBaseline,
  }),
  10000,
  "a complete 10k-per-row baseline should pass the production gate"
);

console.log("EV metric regression tests passed");
