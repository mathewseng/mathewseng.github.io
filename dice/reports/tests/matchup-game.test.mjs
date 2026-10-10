import test from "node:test";
import assert from "node:assert/strict";
import { createMatchupSession, scoreMatchupRoll } from "../matchup-game.mjs";
import { ROLLS, compareRules } from "../matchups.mjs";

test("played four-dice outcomes reproduce exact report probabilities", () => {
  for (const [a, b, handicap] of [
    ["sum", "sum", 0],
    ["sum", "max", 0],
    ["max", "min", 0],
    ["max", "avg", 0],
    ["avg", "min", 0],
    ["product", "sum", 0],
    ["sum", "mod10", 0],
    ["avg", "min", -0.5],
    ["doubles-only", "cap7", 2.5],
    ["sum", "sum", 36],
  ]) {
    const counts = { wins: 0, ties: 0, losses: 0, total: 1296 };
    for (const left of ROLLS)
      for (const right of ROLLS)
        counts[
          scoreMatchupRoll({ a, b, handicap }, [...left, ...right]).outcome
        ]++;
    assert.deepEqual(
      counts,
      compareRules(a, b, handicap),
      `${a} vs ${b} ${handicap}`,
    );
  }
  assert.deepEqual(
    scoreMatchupRoll({ a: "avg", b: "mod10", handicap: -0.5 }, [3, 4, 6, 6]),
    {
      aRoll: [3, 4],
      bRoll: [6, 6],
      aBase: 3.5,
      aScore: 3,
      bScore: 2,
      outcome: "wins",
    },
  );
});

test("sessions lock rules and dice, settle once, and tally wins, ties, and losses", () => {
  const rules = { a: "sum", b: "sum", handicap: 0 };
  const session = createMatchupSession(rules);
  rules.a = "product";
  rules.handicap = 30;
  const random = (faces) => {
    const queue = faces.map((face) => face - 1);
    return () => queue.shift();
  };
  assert.equal(session.begin(random([6, 6, 1, 1])), true);
  assert.equal(session.state.rounds, 0);
  assert.equal(session.state.rolling, true);
  assert.equal(
    session.begin(() => {
      throw new Error("Must not resample a pending roll");
    }),
    false,
  );
  assert.equal(session.reset(), false);
  const pending = session.pendingRoll;
  pending.fill(1);
  assert.deepEqual(session.pendingRoll, [6, 6, 1, 1]);
  const first = session.settle();
  assert.equal(first.aScore, 12);
  assert.equal(first.outcome, "wins");
  assert.equal(session.settle(), null);
  assert.throws(() => first.aRoll.fill(1), TypeError);
  session.begin(random([1, 6, 2, 5]));
  assert.equal(session.settle().outcome, "ties");
  session.begin(random([1, 1, 6, 6]));
  assert.equal(session.settle().outcome, "losses");
  assert.deepEqual(
    [
      session.state.wins,
      session.state.ties,
      session.state.losses,
      session.state.rounds,
    ],
    [1, 1, 1, 3],
  );
  assert.deepEqual(session.probabilities, compareRules("sum", "sum"));
  const snapshot = session.state;
  snapshot.wins = 999;
  snapshot.history.length = 0;
  assert.equal(session.state.wins, 1);
  assert.equal(session.state.history.length, 3);
  for (let i = 0; i < 20; i++) {
    session.begin(() => 0);
    session.settle();
  }
  assert.equal(session.state.rounds, 23);
  assert.equal(session.state.ties, 21);
  assert.equal(session.state.history.length, 12);
  assert.equal(session.state.history[0].round, 23);
  assert.equal(session.reset(), true);
  assert.deepEqual(session.state, {
    wins: 0,
    ties: 0,
    losses: 0,
    rounds: 0,
    rolling: false,
    history: [],
  });
});

test("bad rules, dice, handicaps, or entropy never create a counted round", () => {
  assert.throws(
    () => createMatchupSession({ a: "unknown", b: "sum" }),
    RangeError,
  );
  assert.throws(
    () => createMatchupSession({ a: "sum", b: "sum", handicap: 0.3 }),
    RangeError,
  );
  for (const roll of [
    [1, 2, 3],
    [1, 2, 3, 7],
    [1, 2, 3, 1.5],
    [0, 1, 1, 1],
    "1234",
  ])
    assert.throws(
      () => scoreMatchupRoll({ a: "sum", b: "sum" }, roll),
      RangeError,
    );
  const session = createMatchupSession({ a: "sum", b: "max" });
  assert.throws(() => session.begin(() => NaN), RangeError);
  assert.equal(session.state.rolling, false);
  assert.equal(session.state.rounds, 0);
  const queue = [4294967295, 4294967292, 0, 1, 2, 3];
  session.begin(() => queue.shift());
  assert.deepEqual(session.pendingRoll, [1, 2, 3, 4]);
  assert.equal(queue.length, 0);
});
