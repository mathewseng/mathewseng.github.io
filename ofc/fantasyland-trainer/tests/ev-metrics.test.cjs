const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const core = require("../../fantasyland-core.js");
const source = fs.readFileSync(path.join(__dirname, "../../fantasyland-ev/app.js"), "utf8");
const context = {
  console,
  document: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  performance: { now: () => Date.now() },
  window: { OFCFantasylandCore: core, setTimeout },
};
vm.runInNewContext(source, context, { filename: "fantasyland-ev/app.js" });

const api = context.window.OFCFantasylandEV;
const closeTo = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`);

core.VARIANT_ORDER.forEach((variant) => {
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

const aggregate = api.finalizeAggregate({
  samples: 4,
  immediateSum: 20,
  immediateSquared: 120,
  strategySum: 18,
  repeatCount: 1,
  repeatPointSum: 8,
  qualifyCount: 3,
  distribution: [1, 1, 1, 1, 0],
});
assert.equal(aggregate.qualifyRate, 0.75, "EV aggregate should retain legal-board probability");
assert.equal(aggregate.foulRate, 0.25, "EV aggregate foul chance should equal one minus legal-board probability");

console.log("EV metric regression tests passed");
