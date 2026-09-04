const assert = require("assert").strict;
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const core = require("../../fantasyland-core.js");
const source = fs.readFileSync(path.join(__dirname, "../../fantasyland-ev/precomputed.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "fantasyland-ev/precomputed.js" });

const dataset = context.window.OFCFantasylandPrecomputed;
const scenarios = [0, 1, 2].flatMap((jokers) => [14, 15, 16, 17].map((cards) => `${cards}-${jokers}`));
const jacksPlusVariants = ["low", "badeucey", "cribbage"];

assert.equal(dataset.schemaVersion, 1, "precomputed EV data should use the supported schema");
assert.equal(dataset.samplesPerConfig, 10000, "precomputed EV data should contain 10,000 hands per configuration");
assert.ok(dataset.solver.includes("trainer-matched-jjjplus-20260904a"), "precomputed EV data should identify the JJJ+ solver");
assert.ok(dataset.solver.includes("trainer-matched-cribbage-20260904a"), "precomputed EV data should identify the 24+ Cribbage repeat solver");
assert.ok(dataset.solver.includes("trainer-matched-cribbage-jjjplus-20260904a"), "precomputed EV data should identify the 24+ Cribbage JJJ+ solver");
assert.deepEqual(Object.keys(dataset.results), core.ACTIVE_VARIANT_ORDER, "precomputed EV data should contain every active variant");
assert.deepEqual(Object.keys(dataset.topRepeatJacksPlusResults), jacksPlusVariants, "precomputed EV data should contain every JJJ+ variant");

core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
  scenarios.forEach((scenario) => validateResult(dataset.results[variant][scenario], variant, `${variant} ${scenario}`));
});

jacksPlusVariants.forEach((variant) => {
  let reducedRepeatConfigs = 0;
  scenarios.forEach((scenario) => {
    const normal = dataset.results[variant][scenario];
    const restricted = dataset.topRepeatJacksPlusResults[variant][scenario];
    validateResult(restricted, variant, `${variant} JJJ+ ${scenario}`);
    assert.equal(restricted.totals.immediateSum, normal.totals.immediateSum, `${variant} ${scenario}: JJJ+ must not change immediate royalty totals`);
    assert.equal(restricted.totals.immediateSquared, normal.totals.immediateSquared, `${variant} ${scenario}: JJJ+ must not change immediate royalty variance inputs`);
    assert.equal(restricted.totals.qualifyCount, normal.totals.qualifyCount, `${variant} ${scenario}: JJJ+ must not change legal-board counts`);
    assert.deepEqual(restricted.totals.distribution, normal.totals.distribution, `${variant} ${scenario}: JJJ+ must not change royalty distributions`);
    assert.ok(restricted.totals.repeatCount <= normal.totals.repeatCount, `${variant} ${scenario}: JJJ+ repeat count cannot exceed the normal rule`);
    assert.equal(
      restricted.totals.repeatDetails.topTripsByRank.slice(0, 11).reduce((sum, count) => sum + count, 0),
      0,
      `${variant} ${scenario}: JJJ+ data must not include top trips below jacks`
    );
    if (restricted.totals.repeatCount < normal.totals.repeatCount) reducedRepeatConfigs += 1;
  });
  assert.ok(reducedRepeatConfigs > 0, `${variant}: JJJ+ should reduce repeat availability in at least one configuration`);
});

function validateResult(result, variant, label) {
  assert.ok(result, `${label}: result should exist`);
  const totals = result.totals;
  assert.equal(result.samples, dataset.samplesPerConfig, `${label}: sample count`);
  assert.equal(totals.samples, result.samples, `${label}: raw sample count`);
  assert.equal(result.immediate, totals.immediateSum / result.samples, `${label}: immediate EV denominator`);
  assert.equal(result.strategy, totals.strategySum / result.samples, `${label}: strategy EV denominator`);
  assert.equal(result.repeatRate, totals.repeatCount / result.samples, `${label}: repeat-rate denominator`);
  assert.equal(result.qualifyRate, totals.qualifyCount / result.samples, `${label}: qualify-rate denominator`);
  assert.equal(result.foulRate, 1 - totals.qualifyCount / result.samples, `${label}: foul-rate denominator`);
  assert.equal(totals.distribution.reduce((sum, count) => sum + count, 0), result.samples, `${label}: royalty bands should partition all hands`);
  assert.equal(totals.repeatSources.slice(1).reduce((sum, count) => sum + count, 0), totals.repeatCount, `${label}: repeat sources should partition repeats`);
  assert.ok([result.immediate, result.strategy, result.repeatRate, result.qualifyRate, result.foulRate, result.recursive].every(Number.isFinite), `${label}: headline values should be finite`);

  const details = totals.repeatDetails;
  const topExpected = [1, 3, 5, 7].reduce((sum, mask) => sum + totals.repeatSources[mask], 0);
  const bottomExpected = [4, 5, 6, 7].reduce((sum, mask) => sum + totals.repeatSources[mask], 0);
  const topTotal = details.topTripsByRank.reduce((sum, count) => sum + count, 0);
  const straightFlushRankTotal = details.bottomStraightFlushByRank.reduce((sum, count) => sum + count, 0);
  const bottomTotal = details.bottomQuadsByRank.reduce((sum, count) => sum + count, 0)
    + straightFlushRankTotal;
  assert.equal(topTotal, topExpected, `${label}: top rank detail should match top repeat sources`);
  assert.equal(bottomTotal, bottomExpected, `${label}: bottom type detail should match bottom repeat sources`);
  assert.equal(
    straightFlushRankTotal,
    details.bottomStraightFlush + details.bottomRoyalFlush,
    `${label}: straight-flush ranks should reconcile to the aggregate`
  );
  assert.equal(
    details.cribbageMiddleByScore.reduce((sum, count) => sum + count, 0),
    variant === "cribbage" ? totals.qualifyCount : 0,
    `${label}: Cribbage middle-score distribution denominator`
  );
  if (variant === "high") assert.equal(totals.qualifyCount, result.samples, `${label}: High Fantasyland cannot foul`);
}

console.log("Precomputed EV dataset regression checks passed");
