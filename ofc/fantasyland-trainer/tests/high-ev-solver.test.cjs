const assert = require("assert").strict;

const Core = require("../../fantasyland-core.js");
const Trainer = require("../app.js");

const falseFoulFixtures = [
  ["Qs", "2s", "9h", "5h", "3c", "Th", "Tc", "Kh", "3h", "Ts", "As", "9c", "4c", "4d"],
  ["8c", "8h", "Jd", "6s", "3h", "8d", "2h", "3c", "4s", "Ts", "6c", "Tc", "5d", "5h", "4c"],
  ["Qs", "7h", "9s", "Tc", "Jh", "Kd", "4s", "Qd", "Ad", "9c", "4h", "8d", "4c", "2h", "Kc", "2c"],
  ["9h", "Kh", "5d", "4s", "Js", "6h", "6c", "Kd", "Jc", "8d", "Ks", "3c", "3d", "9s", "5c", "As", "Ah"],
];

falseFoulFixtures.forEach((ids) => {
  const solved = Trainer.solveHand(ids);
  assert.ok(solved.best, ids.length + "-card High fixture must always produce a legal board");
  assert.ok(Number.isFinite(solved.best.points), "High fixture must produce a finite royalty score");
});

const cachedRow = ["JK1", "As", "Ah", "Kd", "Qc"].map((id, handIndex) => ({ ...Trainer.cardFromId(id), handIndex }));
const firstCachedEvaluation = Trainer.evaluateBestFive(cachedRow);
const remappedRow = cachedRow.map((card) => ({ ...card, handIndex: card.handIndex + 20 }));
const remappedEvaluation = Trainer.evaluateBestFive(remappedRow);
assert.equal(firstCachedEvaluation.strength, remappedEvaluation.strength, "cached joker rows must keep the same exact hand strength");
assert.ok(remappedEvaluation.assignments.has(20), "cached joker assignments must be remapped to the current hand indexes");
assert.ok(!remappedEvaluation.assignments.has(0), "cached joker assignments must not leak indexes from an earlier hand");

for (const cards of [14, 15, 16, 17]) {
  for (const jokers of [0, 1, 2]) {
    const sampleCount = jokers === 2 ? 2 : jokers === 1 ? 3 : 8;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const label = cards + "C-" + jokers + "J-" + sample;
      const seed = Core.hashSeed("HIGH-EV-INVARIANT-" + label).toString(16);
      const ids = Core.dealSeeded(cards, jokers, seed);
      const solved = Trainer.solveHand(ids);
      assert.ok(solved.best, "High " + label + " must not foul");
      assert.ok(Number.isFinite(solved.best.points), "High royalty score must be finite");
      assert.equal(Boolean(solved.bestRepeat), Boolean(solved.best && solved.best.repeat), "preferred High board must repeat exactly when a repeat line exists");
    }
  }
}

console.log("High EV solver regression checks passed.");
