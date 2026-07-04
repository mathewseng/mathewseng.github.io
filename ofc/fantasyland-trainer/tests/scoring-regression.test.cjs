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

function scoreRows(rows) {
  const ids = [...rows.top, ...rows.middle, ...rows.bottom, ...(rows.discard || [])];
  return core.scoreTrainerRows(ids, rows, {
    repeatRule: "pineapple",
    fiveKindRule: "none",
  });
}

function assertMaxPointBottomStraightFlushRepeats(name, bottom) {
  const result = scoreBottomStraightFlush(bottom);

  assert.equal(result.legal, true, `${name}: board should be legal`);
  assert.equal(result.repeat, true, `${name}: bottom straight flush should repeat`);
  assert.equal(result.correct, true, `${name}: max-point repeat line should be correct`);
}

assertMaxPointBottomStraightFlushRepeats("natural royal", ["As", "Ks", "Qs", "Js", "Ts"]);
assertMaxPointBottomStraightFlushRepeats("joker royal", ["As", "Ks", "Qs", "Js", "JK1"]);

const jokerWheel = scoreBottomStraightFlush(["5s", "4s", "3s", "2s", "JK1"]);
assert.equal(jokerWheel.legal, true, "joker wheel: board should be legal");
assert.equal(jokerWheel.repeat, true, "joker wheel: bottom straight flush should repeat");

const topTrips = scoreRows({
  top: ["Ac", "Ad", "Ah"],
  middle: ["9s", "8h", "7d", "6c", "5s"],
  bottom: ["Kh", "Kd", "Kc", "2h", "2d"],
  discard: [],
});
assert.equal(topTrips.legal, true, "top trips: board should be legal");
assert.equal(topTrips.repeat, true, "top trips should repeat");

const bottomQuads = scoreRows({
  top: ["Ac", "Kd", "3h"],
  middle: ["9s", "8h", "7d", "6c", "5s"],
  bottom: ["Qh", "Qs", "Qd", "Qc", "2h"],
  discard: [],
});
assert.equal(bottomQuads.legal, true, "bottom quads: board should be legal");
assert.equal(bottomQuads.repeat, true, "bottom quads should repeat");

const globalJoker = scoreRows({
  top: ["Qs", "Qd", "3c"],
  middle: ["Ah", "Kh", "Qh", "Jh", "JK1"],
  bottom: ["9s", "9d", "9c", "2c", "2d"],
  discard: [],
});
assert.equal(globalJoker.legal, true, "global joker: lower assignment should avoid a foul");
assert.equal(globalJoker.rowNames.middle, "Ace-high flush", "global joker: middle should score as the legal flush");
assert.equal(globalJoker.assignments.get("JK1").id, "9h", "global joker: joker should not become the fouling Th");

const reportedHand = scoreRows({
  top: ["Jh", "Jc", "JK1"],
  middle: ["7s", "7h", "JK2", "Ts", "Td"],
  bottom: ["8h", "8d", "8c", "6h", "6c"],
  discard: ["2h", "3s", "4d"],
});
assert.equal(reportedHand.legal, true, "reported hand: joker assignments should avoid a foul");
assert.equal(reportedHand.points, 37, "reported hand: should score 37 royalties");
assert.equal(reportedHand.repeat, true, "reported hand: top trips should repeat");
assert.equal(reportedHand.rowNames.top, "Three jacks", "reported hand: top joker should make trips");
assert.equal(reportedHand.rowNames.middle, "7 full of tens", "reported hand: middle joker should make sevens full");
