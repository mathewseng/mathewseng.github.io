import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalTurns,
  transition,
  replay,
  clone,
} from "../core/rules.mjs";
import { defaultPlayRules } from "../core/play-session.mjs";
import {
  playAction,
  forcedTurn,
  settleForced,
  tableDice,
  takebackTarget,
  undoTurn,
  validateTakebacks,
} from "../core/table.mjs";
import {
  session,
  accept,
  envelope,
  recover,
  checkpoint,
  verifyHistory,
} from "../core/protocol.mjs";
import { itemRecord, validateItem, parseBackup } from "../core/storage.mjs";
const players = [
  { id: "host", name: "Ivory" },
  { id: "guest", name: "Teal" },
];
const options = {
  hostId: "host",
  connected: ["host", "guest"],
  dice: () => [6, 1],
};
function table(
  initial = initialState({ matchLength: 0, rules: defaultPlayRules(0) }),
) {
  return {
    id: "table",
    started: true,
    initial,
    state: clone(initial),
    events: [],
  };
}
function opening() {
  return playAction(table(), { type: "opening", dice: [6, 1] }, 0);
}
function move(t) {
  return playAction(t, {
    type: "move",
    steps: legalTurns(t.state)[0].steps,
  });
}
function passPosition() {
  const s = initialState({ matchLength: 0 });
  s.points.fill(0);
  s.points[5] = 14;
  s.bar = [1, 0];
  for (let i = 18; i < 24; i++) s.points[i] = -2;
  s.points[17] = -3;
  s.phase = "roll";
  return s;
}
test("new local and online money tables default to Jacoby; match and explicit preferences preserved", () => {
  assert.equal(defaultPlayRules(0).jacoby, true);
  assert.equal(
    session(players, { matchLength: 0 }).state.rules.jacoby,
    true,
  );
  assert.equal(
    session(players, { matchLength: 5 }).state.rules.jacoby,
    false,
  );
  assert.equal(
    session(players, { matchLength: 0, rules: { jacoby: false } }).state
      .rules.jacoby,
    false,
  );
  assert.equal(
    session(players, { matchLength: 0, rules: { cube: false } }).state.rules
      .jacoby,
    false,
  );
});
test("a blocked roll passes atomically and cannot be undone", () => {
  const t = playAction(table(passPosition()), {
    type: "roll",
    dice: [2, 1],
  });
  assert.equal(t.state.turn, 1);
  assert.equal(t.state.phase, "roll");
  assert.deepEqual(
    t.events.map((e) => e.action.type),
    ["roll", "move"],
  );
  assert.equal(t.events[1].automatic, true);
  assert.deepEqual(t.events[1].action.steps, []);
  assert.equal(takebackTarget(t), null);
  assert.throws(() => undoTurn(t, 1, 0));
  assert.deepEqual(replay(t.initial, t.events).at(-1), t.state);
});
test("equivalent dice orders count as one outcome, including doubles and a winning turn", () => {
  for (const dice of [
    [1, 2],
    [2, 2],
    [6, 5],
  ]) {
    const s = initialState({ matchLength: 0 });
    s.points.fill(0);
    s.points[0] = 2;
    s.points[23] = -15;
    s.off = [13, 0];
    s.phase = "roll";
    const t = playAction(table(s), { type: "roll", dice });
    assert.equal(t.state.phase, "over");
    assert.equal(t.state.off[0], 15);
    assert.equal(t.events.at(-1).automatic, true);
    assert.equal(takebackTarget(t), null);
  }
  const s = passPosition();
  s.phase = "move";
  s.dice = [1, 2];
  const t = table(s);
  settleForced(t);
  settleForced(t);
  assert.equal(t.events.length, 1, "recovery cannot commit a pass twice");
});
test("undo restores chosen turn and scores, archives its branch, and reuses revealed rolls without RNG", () => {
  let t = opening();
  const source = clone(t.state);
  assert.equal(forcedTurn(source), null);
  t = move(t);
  t = playAction(t, { type: "roll", dice: [4, 2] });
  t = move(t);
  t = playAction(t, { type: "roll", dice: [3, 1] });
  const old = clone(t),
    target = takebackTarget(t, 0);
  t = undoTurn(t, target, 0, 1);
  assert.deepEqual(t.state, source);
  assert.equal(t.events.length, 1);
  assert.deepEqual(old.events.slice(target), t.undoLog[0].events);
  assert.equal(t.undoLog[0].acceptedBy, 1);
  assert.deepEqual(t.replayDice, [
    { actor: 1, dice: [4, 2] },
    { actor: 0, dice: [3, 1] },
  ]);
  t = move(t);
  const dice = tableDice(t, 1, () => {
    throw new Error("must not reroll");
  });
  assert.throws(() => playAction(t, { type: "roll", dice: [6, 6] }));
  t = playAction(t, { type: "roll", dice });
  t = move(t);
  assert.deepEqual(
    tableDice(t, 0, () => {
      throw new Error("must not reroll");
    }),
    [3, 1],
  );
  assert.deepEqual(replay(t.initial, t.events).at(-1), t.state);
  const item = itemRecord("match", {
    id: "archive",
    initial: t.initial,
    events: t.events,
    undoLog: t.undoLog,
  });
  validateItem(item);
  assert.equal(
    parseBackup(
      JSON.stringify({
        format: "backgammon-library",
        version: 1,
        items: [item],
        progress: [],
      }),
    ).items[0].undoLog.length,
    1,
  );
  assert.throws(() =>
    validateTakebacks({ replayDice: [{ actor: 0, dice: [0, 7] }] }),
  );
});
test("takebacks cannot cross cube decisions, new games, or automatic turns", () => {
  let t = move(opening());
  t = playAction(t, { type: "double" });
  assert.equal(takebackTarget(t, 0), null);
  t = playAction(t, { type: "take" });
  assert.equal(takebackTarget(t, 0), null);
  assert.throws(() => undoTurn(t, 1, 0));
});
test("opponent approval is authoritative, revision guarded, recoverable, and replay safe", () => {
  let t = session(players, { matchLength: 0 }, "room"),
    n = 0;
  const send = (who, action, opts = options) =>
    (t = accept(t, who, envelope(t, who, action, "a" + ++n), opts));
  send("host", { type: "start" });
  send("host", { type: "opening" });
  const original = clone(t.state);
  send("host", { type: "move", steps: legalTurns(t.state)[0].steps });
  send("guest", { type: "roll" }, { ...options, dice: () => [4, 2] });
  send("host", { type: "undo-request" });
  let request = t.undoRequest,
    before = clone(t.state);
  assert.throws(() =>
    send("host", { type: "undo-accept", requestId: request.id }),
  );
  assert.throws(() =>
    send("guest", { type: "move", steps: legalTurns(t.state)[0].steps }),
  );
  send("guest", { type: "undo-decline", requestId: request.id });
  assert.deepEqual(t.state, before);
  assert.equal(t.undoRequest, null);
  assert.throws(
    () => send("host", { type: "undo-request" }),
    "no repeated request until play advances",
  );
  send("guest", { type: "move", steps: legalTurns(t.state)[0].steps });
  send("host", { type: "undo-request" });
  request = t.undoRequest;
  const stale = envelope(
    t,
    "guest",
    { type: "undo-accept", requestId: request.id },
    "stale",
  );
  const cp = checkpoint(t);
  t = recover(t, "guest");
  assert.deepEqual(t.undoRequest, request);
  assert.throws(() => accept(t, "guest", stale, options));
  send("host", { type: "recover", checkpoint: cp });
  const approved = envelope(
    t,
    "guest",
    { type: "undo-accept", requestId: request.id },
    "approval",
  );
  t = accept(t, "guest", approved, options);
  assert.deepEqual(t.state, original);
  assert.ok(verifyHistory(t));
  const revision = t.revision;
  t = accept(t, "guest", approved, options);
  assert.equal(t.revision, revision);
  assert.equal(t.undoLog.length, 1);
  send("host", { type: "move", steps: legalTurns(t.state)[0].steps });
  send(
    "guest",
    { type: "roll" },
    {
      ...options,
      dice: () => {
        throw new Error("reroll");
      },
    },
  );
  assert.deepEqual(t.events.at(-1).action.dice, [4, 2]);
  assert.ok(verifyHistory(t));
});
test("host can settle an old forced snapshot, but cannot choose a move for the opponent", () => {
  let t = session(players, {}, "forced");
  t.started = true;
  t.initial = t.state = transition(passPosition(), {
    type: "roll",
    dice: [1, 2],
  });
  const command = (who) => envelope(t, who, { type: "auto" }, who);
  assert.throws(() => accept(t, "guest", command("guest"), options));
  t = accept(t, "host", command("host"), options);
  assert.equal(t.state.turn, 1);
  assert.ok(verifyHistory(t));
  assert.throws(() =>
    accept(
      t,
      "host",
      envelope(t, "host", { type: "auto" }, "second"),
      options,
    ),
  );
});

test("forced continuations distinguish mandatory prefixes, remaining choices and completed user drafts", async () => {
  const { forcedContinuation } = await import("../core/table.mjs");
  const s = initialState({ phase: "move", dice: [1, 2], matchLength: 0 });
  s.points.fill(0);
  s.points[5] = 14;
  s.points[22] = -2;
  s.points[18] = -13;
  s.bar = [1, 0];
  const prefix = forcedContinuation(s);
  assert.deepEqual(prefix, {
    steps: [{ from: "bar", to: 23, die: 1 }],
    complete: false,
  });
  assert.deepEqual(forcedContinuation(s, prefix.steps), {
    steps: [],
    complete: false,
  });
  const race = initialState({
    phase: "move",
    dice: [1, 2],
    matchLength: 0,
  });
  race.points.fill(0);
  race.points[5] = 1;
  race.points[4] = 1;
  race.points[23] = -15;
  race.off = [13, 0];
  assert.deepEqual(forcedContinuation(race), {
    steps: [],
    complete: false,
  });
  const chosen = [{ from: 5, to: 4, die: 1 }];
  assert.deepEqual(forcedContinuation(race, chosen), {
    steps: [{ from: 4, to: 2, die: 2 }],
    complete: true,
  });
  assert.deepEqual(
    forcedContinuation(race, [...chosen, { from: 4, to: 2, die: 2 }]),
    { steps: [], complete: false },
  );
});

test("automatic suffixes preserve complete-turn legality across seeded games and both players", async () => {
  const { forcedContinuation } = await import("../core/table.mjs");
  const { legalPaths, matchingPaths } = await import("../core/rules.mjs");
  let s = initialState({ phase: "move", dice: [3, 1] });
  let seed = 173;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < 120; i++) {
    if (s.phase === "over") break;
    if (s.phase === "roll")
      s = transition(s, {
        type: "roll",
        dice: [(next() % 6) + 1, (next() % 6) + 1],
      });
    const paths = legalPaths(s),
      picked = paths[next() % paths.length];
    for (let n = 0; n <= picked.steps.length; n++) {
      const prefix = picked.steps.slice(0, n),
        auto = forcedContinuation(s, prefix, paths);
      assert.ok(matchingPaths(paths, [...prefix, ...auto.steps]).length);
      if (auto.complete)
        assert.ok(
          matchingPaths(paths, [...prefix, ...auto.steps]).some(
            (p) => p.steps.length === prefix.length + auto.steps.length,
          ),
        );
    }
    s = transition(s, { type: "move", steps: picked.steps });
  }
});
