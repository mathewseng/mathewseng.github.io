const assert = require("node:assert/strict");
const core = require("../app.js");

function scoreBottomStraightFlush(bottom) {
  const ids = [
    "Ac",
    "Ad",
    "3h",
    "9h",
    "9d",
    "9c",
    "2d",
    "2c",
    ...bottom,
    "4c",
    "6d",
  ].slice(0, 15);
  const rows = {
    top: ["Ac", "Ad", "3h"],
    middle: ["9h", "9d", "9c", "2d", "2c"],
    bottom,
    discard: [],
  };
  return core.evaluateTrainerSubmission(ids, rows, {
    repeatRule: "pineapple",
    fiveKindRule: "none",
  });
}

function assertOptimalBottomStraightFlushRepeats(name, bottom) {
  const result = scoreBottomStraightFlush(bottom);

  assert.equal(result.legal, true, `${name}: board should be legal`);
  assert.equal(result.repeat, true, `${name}: bottom straight flush should repeat`);
  assert.equal(result.correct, true, `${name}: matching optimal board should be correct`);
}

assertOptimalBottomStraightFlushRepeats("natural royal", ["As", "Ks", "Qs", "Js", "Ts"]);
assertOptimalBottomStraightFlushRepeats("joker royal", ["As", "Ks", "Qs", "Js", "JK1"]);

const jokerWheel = scoreBottomStraightFlush(["5s", "4s", "3s", "2s", "JK1"]);
assert.equal(jokerWheel.legal, true, "joker wheel: board should be legal");
assert.equal(jokerWheel.repeat, true, "joker wheel: bottom straight flush should repeat");
