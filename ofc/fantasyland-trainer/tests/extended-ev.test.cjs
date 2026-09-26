const assert = require("assert").strict;
const core = require("../../fantasyland-core.js");
const trainer = require("../app.js");

for (const variant of core.ACTIVE_VARIANT_ORDER) {
  const extended = ["badeucey", "bdp"].includes(variant);
  assert.deepEqual(core.analysisCardCounts(variant), extended ? [14, 15, 16, 17, 18, 19] : [14, 15, 16, 17]);
  assert.equal(core.analysisScenarios(variant).length, extended ? 18 : 12);
  assert.equal(core.supportsVariantCardCount(variant, 18), false, "EV expansion must not change playable rules");
  assert.equal(core.supportsVariantCardCount(variant, 19), false);
  assert.throws(() => core.solveHand(core.dealSeeded(20, 0, "limit"), { variant, allowUnsupportedCardCount: true }), RangeError);
}

for (const variant of ["badeucey", "bdp"]) {
  for (const cards of [18, 19]) for (const jokers of [0, 1, 2]) {
    for (let seed = 0; seed < 3; seed += 1) {
      const ids = core.dealSeeded(cards, jokers, `extended-ev-${variant}-${cards}-${jokers}-${seed}`);
      const options = { variant, mode: "exact", allowUnsupportedCardCount: true };
      for (const topRepeatMinRank of variant === "badeucey" ? [2, 11] : [2]) {
        const actual = trainer.solveVariantHand(ids, variant, { ...options, topRepeatMinRank });
        const reference = core.solveHand(ids, { ...options, topRepeatMinRank, wideSearch: false });
        assert.equal(actual.mode, "exact");
        for (const key of ["bestRoyalty", "bestRepeat"]) {
          assert.equal(actual[key]?.points, reference[key]?.points, `${variant} ${cards}/${jokers} ${seed} ${topRepeatMinRank} ${key}: exact royalties`);
          assert.equal(actual[key]?.tieQuality, reference[key]?.tieQuality, `${key}: exact tie-break quality`);
          if (!actual[key]) continue;
          const rows = Object.fromEntries(["top", "middle", "bottom"].map((role) => [role, actual[key][role].ids]));
          const used = Object.values(rows).flat();
          assert.equal(used.length, 13);
          assert.equal(new Set(used).size, 13);
          assert.ok(used.every((id) => ids.includes(id)));
          const evaluated = core.evaluateBoard(ids, rows, { variant, topRepeatMinRank });
          assert.ok(evaluated.legal, "selected board must qualify without fouling");
          assert.equal(evaluated.points, actual[key].points);
          if (key === "bestRepeat") assert.ok(evaluated.repeat);
        }
      }
    }
  }
}
const noRepeatIds = "2s 2h 3d 3c 4s 4h 6d 6c 8s 8h 9d 9c Ts Th Jd Jc Qs Qh As".split(" ");
const noRepeatOptions = { variant: "badeucey", allowUnsupportedCardCount: true };
const noRepeat = core.solveHand(noRepeatIds, noRepeatOptions);
const noRepeatReference = core.solveHand(noRepeatIds, { ...noRepeatOptions, wideSearch: false });
assert.ok(noRepeat.bestRoyalty);
assert.equal(noRepeat.bestRepeat, null);
assert.equal(noRepeat.bestRoyalty.points, noRepeatReference.bestRoyalty.points, "no-repeat pruning retains the royalty optimum");
assert.equal(noRepeat.bestRoyalty.tieQuality, noRepeatReference.bestRoyalty.tieQuality);
console.log("18/19-card EV exact-search and scope checks passed");
