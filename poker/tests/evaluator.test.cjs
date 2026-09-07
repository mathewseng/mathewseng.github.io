const assert = require("node:assert/strict");
const Catalog = require("../game-catalog.js");
const Eval = require("../evaluator.js");

{
  const royal = Eval.evaluateFiveHigh(["As", "Ks", "Qs", "Js", "Ts"]);
  const quads = Eval.evaluateFiveHigh(["Ah", "Ad", "Ac", "As", "2s"]);
  const boat = Eval.evaluateFiveHigh(["Kh", "Kd", "Kc", "2s", "2d"]);
  assert.ok(royal.quality > quads.quality);
  assert.ok(quads.quality > boat.quality);
  assert.equal(royal.name, "Royal flush");
  assert.equal(Eval.evaluateFiveHigh(["As", "2h", "3c", "4d", "5s"]).name, "5-high straight");
}

{
  const nuts = Eval.evaluateFiveDeuce(["7s", "5h", "4c", "3d", "2s"]);
  const six = Eval.evaluateFiveDeuce(["7s", "6h", "4c", "3d", "2s"]);
  const wheel = Eval.evaluateFiveDeuce(["As", "5h", "4c", "3d", "2s"]);
  assert.ok(nuts.quality > six.quality);
  assert.ok(six.quality > wheel.quality, "aces remain high and A2345 is not a 2-7 straight");
}

{
  const wheel = Eval.evaluateFiveA5(["As", "2h", "3c", "4d", "5s"]);
  const six = Eval.evaluateFiveA5(["2s", "3h", "4c", "5d", "6s"]);
  assert.ok(wheel.quality > six.quality);
  assert.equal(wheel.qualifiesEight, true);
}

{
  const omaha = Eval.bestOmahaHigh(["As", "Ah", "2c", "3c"], ["Ac", "Ad", "Ks", "Qh", "Jd"]);
  assert.equal(omaha.categoryName, "Quads");
  const low = Eval.bestOmahaA5(["As", "2h", "Kd", "Kc"], ["3c", "4d", "5s", "Qh", "Jd"]);
  assert.equal(low.qualifiesEight, true);
  assert.equal(low.tie.join(","), "5,4,3,2,1");
}

{
  const nuts = Eval.bestBadugi(["As", "2h", "3d", "4c"]);
  const threeCard = Eval.bestBadugi(["As", "2s", "3d", "4c"]);
  assert.equal(nuts.count, 4);
  assert.equal(nuts.name, "4-3-2-A Badugi");
  assert.equal(threeCard.count, 3);
  assert.ok(nuts.quality > threeCard.quality);
}

{
  const o8 = Eval.evaluateGame(Catalog.getGame("o8"), ["As", "2h", "Kd", "Kc"], [["3c", "4d", "5s", "Qh", "Jd"]]);
  assert.equal(o8.length, 2);
  assert.equal(o8[1].qualifies, true);
  const archie = Eval.evaluateGame("archie", ["9s", "9h", "8d", "3c", "2s"]);
  assert.equal(archie[0].qualifies, true);
  assert.equal(archie[1].qualifies, false);
  const archieLow = Eval.evaluateGame("archie", ["As", "2h", "3d", "4c", "8s"]);
  assert.equal(archieLow[1].qualifies, true);
}

console.log("Mixed poker evaluator tests passed.");
