import test from "node:test";
import assert from "node:assert/strict";
import {
  session,
  envelope,
  accept,
  recover,
  checkpoint,
  verifyHistory,
} from "../core/protocol.mjs";
import {
  initialState,
  legalTurns,
  transition,
  replay,
  decisionPlayer,
} from "../core/rules.mjs";
import { validateItem, parseBackup } from "../core/storage.mjs";
import { parseMAT } from "../core/mat.mjs";
const players = [
  { id: "host", name: "Host" },
  { id: "guest", name: "Guest" },
];
const options = {
  hostId: "host",
  connected: ["host", "guest"],
  dice: () => [6, 1],
};
test("protocol validates identity, revision, session, epoch and duplicate IDs", () => {
  let s = session(players, {}, "room");
  const c = envelope(s, "host", { type: "start" }, "a");
  assert.throws(() => accept(s, "intruder", c, options));
  s = accept(s, "host", c, options);
  assert.deepEqual(accept(s, "host", c, options), s);
  assert.throws(() => accept(s, "host", { ...c, actionId: "b" }, options));
  assert.throws(() =>
    accept(
      s,
      "guest",
      envelope(s, "guest", { type: "opening" }, "wrong"),
      options,
    ),
  );
  s = accept(
    s,
    "host",
    envelope(s, "host", { type: "opening" }, "roll"),
    options,
  );
  assert.deepEqual(s.state.dice, [6, 1]);
  assert.throws(() =>
    accept(
      s,
      "host",
      envelope(s, "host", { type: "roll", dice: [6, 6] }, "bad"),
      options,
    ),
  );
  assert.ok(verifyHistory(s));
});
test("recovery retains dice, pauses, rejects divergent checkpoints, then resumes same match", () => {
  let s = session(players, {}, "room");
  s.started = true;
  s = accept(
    s,
    "host",
    envelope(s, "host", { type: "opening" }, "roll"),
    options,
  );
  const before = checkpoint(s);
  let r = recover(s, "guest");
  assert.deepEqual(r.state.dice, s.state.dice);
  assert.throws(() =>
    accept(
      r,
      "host",
      envelope(
        r,
        "host",
        { type: "move", steps: legalTurns(r.state)[0].steps },
        "move",
      ),
      options,
    ),
  );
  assert.throws(() =>
    accept(
      r,
      "host",
      envelope(
        r,
        "host",
        { type: "recover", checkpoint: { revision: 0, hash: "bad" } },
        "recovery",
      ),
      options,
    ),
  );
  r = accept(
    r,
    "host",
    envelope(r, "host", { type: "recover", checkpoint: before }, "confirm"),
    options,
  );
  assert.equal(r.recovery, null);
  assert.deepEqual(r.state, s.state);
  assert.ok(verifyHistory(r));
});
test("backup rejects malformed schema, illegal positions, duplicates and oversized data", () => {
  const item = {
    version: 1,
    id: "a",
    kind: "position",
    title: "Example",
    notes: "",
    collection: "",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    state: initialState(),
  };
  assert.equal(validateItem(item), item);
  const b = {
    format: "backgammon-library",
    version: 1,
    items: [item],
    progress: [],
  };
  assert.equal(parseBackup(JSON.stringify(b)).items.length, 1);
  assert.throws(() =>
    parseBackup(JSON.stringify({ ...b, items: [item, item] })),
  );
  assert.throws(() =>
    validateItem({
      ...item,
      state: { ...item.state, points: Array(24).fill(0) },
    }),
  );
  assert.throws(() => parseBackup("x".repeat(8 * 1024 * 1024 + 1)));
});
test("strict MAT reads public two-column syntax; unsupported and illegal moves rejected", () => {
  const line = (n, a, b = "") =>
    `${String(n).padStart(3)}) ${a.padEnd(27)} ${b}`;
  const text = [
    " 5 point match",
    "",
    " Game 1",
    " Ivory : 0                      Teal : 0",
    line(1, "31: 8/5 6/5", "61: 13/7 8/7"),
    line(2, " Doubles => 2", " Takes"),
  ].join("\n");
  const m = parseMAT(text);
  const s = replay(m.initial, m.events).at(-1);
  assert.equal(s.cube.value, 2);
  assert.equal(s.cube.owner, 1);
  assert.equal(m.events.length, 6);
  assert.throws(() => parseMAT(text.replace("8/5 6/5", "24/1")));
  assert.throws(() => parseMAT("binary\0data"));
});

test("optional rules, tied-opening dice and immediate cube offers survive protocol recovery", () => {
  let s = session(
    players,
    {
      matchLength: 0,
      rules: { jacoby: true, automaticDoubles: 1, immediateRedoubles: 2 },
    },
    "optional-room",
  );
  let id = 0;
  const send = (type, extra = {}, dice = options.dice) => {
    const actor = players[decisionPlayer(s.state)].id;
    s = accept(
      s,
      actor,
      envelope(s, actor, { type, ...extra }, "optional-" + ++id),
      { ...options, dice },
    );
  };
  send("start");
  send("opening", {}, () => [4, 4]);
  assert.equal(s.state.cube.value, 2);
  send("opening");
  send("move", { steps: legalTurns(s.state)[0].steps });
  send("double");
  send("beaver");
  assert.equal(s.state.pending.depth, 1);
  const original = s.state,
    cp = checkpoint(s);
  s = recover(s, "guest");
  s = accept(
    s,
    "host",
    envelope(
      s,
      "host",
      { type: "recover", checkpoint: cp },
      "confirm-optional",
    ),
    options,
  );
  assert.deepEqual(s.state, original);
  assert.ok(verifyHistory(s));
  send("raccoon");
  send("take");
  assert.equal(s.state.cube.value, 16);
  assert.equal(s.state.cube.owner, 0);
  send("roll", {}, () => [2, 2]);
  const before = s;
  assert.ok(verifyHistory(s));
  assert.deepEqual(s.state.dice, [2, 2]);
  const stale = envelope(
    s,
    "guest",
    { type: "move", steps: legalTurns(s.state)[0].steps },
    "stale",
  );
  send("move", { steps: legalTurns(s.state)[0].steps });
  assert.throws(() => accept(s, "guest", stale, options));
  assert.deepEqual(before.state.dice, [2, 2]);
});
