import test from "node:test";
import assert from "node:assert/strict";
import { initialState, clone, replay, legalTurns } from "../core/rules.mjs";
import { playAction, validateTakebacks } from "../core/table.mjs";
import { practiceTarget, replacePracticeRoll } from "../core/practice.mjs";
import { lastMove } from "../core/play-session.mjs";
import {
  session,
  accept,
  envelope,
  validateSession,
} from "../core/protocol.mjs";
function table(initial = initialState({ matchLength: 0 })) {
  return {
    id: "practice",
    started: true,
    initial,
    state: clone(initial),
    events: [],
    config: { mode: "computer" },
  };
}
function move(t) {
  return playAction(t, {
    type: "move",
    steps: legalTurns(t.state)[0].steps,
  });
}
function start() {
  return playAction(table(), { type: "opening", dice: [6, 1] }, 0);
}
test("practice replaces opening dice without replaying the opening contest or changing stakes", () => {
  const original = start(),
    before = clone(original),
    next = replacePracticeRoll(original, 0, [2, 2]);
  assert.deepEqual(original, before);
  assert.deepEqual(next.state.dice, [2, 2]);
  assert.equal(next.state.turn, 0);
  assert.deepEqual(next.state.cube, original.state.cube);
  assert.deepEqual(next.events[0], original.events[0]);
  assert.equal(next.events[1].action.type, "practice-roll");
  assert.deepEqual(replay(next.initial, next.events).at(-1), next.state);
  assert.equal(practiceTarget(original, 1), null);
});
test("reroll rewinds either side, preserves removed decisions, and replays deterministically", () => {
  let original = move(start());
  original = move(playAction(original, { type: "roll", dice: [4, 3] }));
  for (const player of [0, 1]) {
    const target = practiceTarget(original, player),
      next = replacePracticeRoll(original, player, [3, 2]);
    assert.equal(next.state.turn, player);
    assert.equal(target.state.phase, "move");
    assert.deepEqual(target.state.dice, player === 0 ? [6, 1] : [4, 3]);
    assert.deepEqual(next.state.points, target.state.points);
    assert.deepEqual(
      next.undoLog.at(-1).events,
      original.events.slice(target.index),
    );
    assert.equal(next.undoLog.at(-1).reason, "practice-roll");
    validateTakebacks(next, true);
    assert.deepEqual(replay(next.initial, next.events).at(-1), next.state);
    assert.deepEqual(lastMove(move(next)).dice, [3, 2]);
    assert.deepEqual(next.replayDice, []);
  }
});
test("practice validates dice and never mutates invalid input", () => {
  const original = start(),
    before = clone(original);
  for (const dice of [[0, 1], [7, 2], [1], [1.5, 2]])
    assert.throws(() => replacePracticeRoll(original, 0, dice));
  assert.deepEqual(original, before);
  assert.throws(() => replacePracticeRoll(original, 1, [2, 3]), /no roll/);
  assert.equal(
    practiceTarget({ ...original, config: { mode: "online" } }, 0),
    null,
  );
});
test("practice automatically passes a blocked replacement roll", () => {
  const s = initialState({ phase: "move", dice: [1, 2], matchLength: 0 });
  s.points.fill(0);
  s.points[5] = 14;
  s.bar = [1, 0];
  for (let i = 18; i < 24; i++) s.points[i] = -2;
  s.points[17] = -3;
  const next = replacePracticeRoll(table(s), 0, [6, 6]);
  assert.equal(next.state.turn, 1);
  assert.equal(next.state.phase, "roll");
  assert.equal(next.events.at(-1).automatic, true);
  assert.deepEqual(replay(next.initial, next.events).at(-1), next.state);
});
test("practice can replay a winning turn, restoring scores before that decision", () => {
  const s = initialState({ phase: "move", dice: [2, 1], matchLength: 0 });
  s.points.fill(0);
  s.points[0] = 1;
  s.points[23] = -15;
  s.off = [14, 0];
  const won = move(table(s)),
    next = replacePracticeRoll(won, 0, [3, 4]);
  assert.equal(next.state.phase, "over"); // The replacement also wins automatically.
  assert.deepEqual(next.state.scores, won.state.scores); // Not awarded twice.
  assert.deepEqual(replay(next.initial, next.events).at(-1), next.state);
  const newGame = playAction(won, { type: "next" });
  assert.equal(practiceTarget(newGame, 0), null);
});
test("online protocol rejects practice commands and recovery snapshots containing practice dice", () => {
  const options = {
    hostId: "host",
    connected: ["host", "guest"],
    dice: () => [6, 1],
  };
  let s = session([
    { id: "host", name: "A" },
    { id: "guest", name: "B" },
  ]);
  s = accept(
    s,
    "host",
    envelope(s, "host", { type: "start" }, "start"),
    options,
  );
  assert.throws(
    () =>
      accept(
        s,
        "host",
        envelope(
          s,
          "host",
          { type: "practice-roll", dice: [6, 6] },
          "practice",
        ),
        options,
      ),
    /Practice dice/,
  );
  assert.throws(
    () =>
      validateSession({
        ...s,
        events: [
          ...s.events,
          { actor: 0, action: { type: "practice-roll", dice: [6, 6] } },
        ],
      }),
    /Practice dice/,
  );
});
