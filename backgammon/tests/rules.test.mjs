import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  legalTurns,
  legalPaths,
  stepsForDie,
  assertState,
  boardKey,
  canDouble,
  winLevel,
  seededDice,
  commitTurn,
  cryptoDice,
  replay,
} from "../core/rules.mjs";
import { fromXGID, toXGID } from "../core/xgid.mjs";
const rolled = (dice = [3, 1]) =>
  initialState({ phase: "move", dice, matchLength: 0, crawford: false });
function position(points, bar = [0, 0], extras = {}) {
  const board = Array(24).fill(0);
  for (const [i, v] of points) board[i] = v;
  return initialState({
    points: board,
    bar,
    off: [0, 1].map(
      (p) =>
        15 -
        bar[p] -
        board.reduce((a, n) => a + (n * (p ? -1 : 1) > 0 ? Math.abs(n) : 0), 0),
    ),
    phase: "move",
    dice: [3, 1],
    matchLength: 0,
    crawford: false,
    ...extras,
  });
}
test("opening ties remain opening; winner plays both dice", () => {
  let s = initialState();
  s = transition(s, { type: "opening", dice: [4, 4] });
  assert.equal(s.phase, "opening");
  assert.equal(s.sequence, 1);
  s = transition(s, { type: "opening", dice: [2, 5] });
  assert.equal(s.turn, 1);
  assert.deepEqual(s.dice, [2, 5]);
  assert.equal(s.phase, "move");
});
test("bar priority, blocked entry and forced pass", () => {
  const s = position(
    [
      [23, -2],
      [22, -2],
      [10, 14],
    ],
    [1, 0],
    { dice: [1, 2] },
  );
  assert.deepEqual(legalTurns(s)[0].steps, []);
  assert.equal(stepsForDie(s, 3)[0].from, "bar");
  const t = position(
    [
      [23, -1],
      [10, 14],
    ],
    [1, 0],
    { dice: [1, 2] },
  );
  const b = legalPaths(t).find((x) => x.steps[0].to === 23);
  assert.ok(b);
  assert.equal(b.state.bar[1], 1);
});
test("higher die and maximum dice cannot be bypassed", () => {
  const s = position(
    [
      [0, 1],
      [23, -15],
    ],
    [],
    { bar: [0, 0], off: [14, 0], dice: [1, 6] },
  );
  assert.equal(legalTurns(s)[0].steps[0].die, 6);
  assert.throws(() => commitTurn(s, [{ from: 0, to: "off", die: 1 }]));
  const q = rolled();
  assert.ok(legalPaths(q).every((x) => x.steps.length === 2));
  assert.throws(() => commitTurn(q, legalPaths(q)[0].steps.slice(0, 1)));
});
test("doubles, oversized bearing off, exact bearoff and winning early", () => {
  const s = rolled([3, 3]);
  assert.ok(legalPaths(s).every((p) => p.steps.length === 4));
  const b = position(
    [
      [4, 1],
      [1, 1],
      [23, -15],
    ],
    undefined,
    { dice: [6, 1] },
  );
  assert.equal(
    stepsForDie(b, 6).some((s) => s.from === 1 && s.to === "off"),
    false,
  );
  assert.equal(
    stepsForDie(b, 5).some((s) => s.to === "off"),
    true,
  );
  const win = position(
    [
      [0, 1],
      [23, -15],
    ],
    undefined,
    { dice: [6, 6] },
  );
  assert.equal(legalPaths(win)[0].steps.length, 1);
  assert.equal(
    transition(win, { type: "move", steps: legalPaths(win)[0].steps }).phase,
    "over",
  );
});
test("equivalent legal paths deduplicate only resulting positions", () => {
  const s = rolled([3, 1]);
  assert.ok(legalPaths(s).length > legalTurns(s).length);
  assert.equal(
    new Set(legalTurns(s).map((x) => x.key)).size,
    legalTurns(s).length,
  );
  for (const p of legalPaths(s))
    assert.equal(boardKey(commitTurn(s, p.steps)), boardKey(p.state));
});
test("gammon, backgammon, single and cube ownership/redouble/pass", () => {
  let s = position([[23, -15]], undefined, {
    off: [15, 0],
    phase: "roll",
    dice: [],
  });
  assert.equal(winLevel(s, 0), 2);
  s.points[23] = -14;
  s.points[0] = -1;
  assert.equal(winLevel(s, 0), 3);
  s.off[1] = 1;
  s.points[23] = -13;
  assert.equal(winLevel(s, 0), 1);
  let game = initialState({ phase: "roll", matchLength: 0 });
  game = transition(game, { type: "double" });
  assert.throws(() => transition(game, { type: "take" }, 0));
  game = transition(game, { type: "take" }, 1);
  assert.equal(game.cube.owner, 1);
  assert.equal(game.cube.value, 2);
  assert.equal(canDouble(game), false);
  game.turn = 1;
  assert.ok(canDouble(game));
  game = transition(game, { type: "double" });
  game = transition(game, { type: "pass" }, 0);
  assert.deepEqual(game.scores, [0, 2]);
});
test("Crawford is one game; post-Crawford cube enabled; resignation acceptance", () => {
  let s = initialState({ phase: "roll", scores: [3, 0], matchLength: 5 });
  s = transition(s, { type: "resign", level: 1 }, 0);
  s = transition(s, { type: "accept" }, 1);
  s.scores = [4, 1];
  s = transition(s, { type: "next" }, 0);
  assert.equal(s.crawford, true);
  s = transition(s, { type: "opening", dice: [1, 2] });
  assert.equal(canDouble({ ...s, phase: "roll", dice: [] }), false);
  s = transition(s, { type: "resign", level: 1 }, 1);
  s = transition(s, { type: "accept" }, 0);
  assert.equal(s.result.matchOver, true);
  let p = initialState({
    phase: "over",
    scores: [4, 2],
    matchLength: 5,
    crawford: true,
    result: { matchOver: false },
  });
  p = transition(p, { type: "next" });
  assert.equal(p.crawford, false);
  assert.equal(p.crawfordPlayed, true);
});
test("XGID known upstream fixtures roundtrip board/context; unsafe flags rejected", () => {
  for (const x of [
    "XGID=-b----E-C---eE---c-e----B-:0:0:1:35:3:7:0:0:10",
    "XGID=aBaB--C-A---dE--ac-e----B-:0:0:1:42:0:0:0:0:10",
    "XGID=aa--BBBB----dE---d-e----B-:0:0:1:D:0:0:0:0:10",
    "XGID=-b----E-C---eE---c-e----B-:2:-1:-1:66:2:4:0:5:10",
  ])
    assert.equal(toXGID(fromXGID(x)), x);
  assert.throws(() =>
    fromXGID("XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:1:0:10"),
  );
  assert.throws(() =>
    fromXGID("XGID=A------------------------A:0:0:1:00:0:0:0:0:10"),
  );
});
test("cryptographic dice rejection sampling discards biased tail", () => {
  let i = 0;
  const bytes = [255, 252, 251, 0];
  assert.deepEqual(
    cryptoDice({ getRandomValues: (a) => (a[0] = bytes[i++]) }),
    [6, 1],
  );
});
test("seeded games preserve invariants, finish, and replay without rerolls", () => {
  for (let seed = 1; seed <= 12; seed++) {
    let s = initialState({ matchLength: 0 }),
      initial = structuredClone(s),
      events = [],
      dice = seededDice(seed);
    let n = 0;
    while (s.phase !== "over" && n++ < 1200) {
      const action =
        s.phase === "move"
          ? {
              type: "move",
              steps: legalTurns(s)[seed % legalTurns(s).length].steps,
            }
          : { type: s.phase === "opening" ? "opening" : "roll", dice: dice() };
      events.push({ actor: s.turn, action });
      s = transition(s, action);
      assertState(s);
    }
    assert.equal(s.phase, "over");
    assert.deepEqual(replay(initial, events).at(-1), s);
  }
});

test("malformed structures and unknown optional rules produce useful validation errors", () => {
  const s = initialState();
  assert.throws(
    () => assertState({ ...s, points: {}, bar: [1, 1] }),
    /Points must/,
  );
  assert.throws(() => assertState({ ...s, scores: {} }), /scores must/);
  assert.throws(
    () =>
      assertState({
        ...s,
        rules: { cube: true, jacoby: false, beavers: true },
      }),
    /Supported rules/,
  );
});

test("match score caps at target while preserving the full game award", () => {
  let s = initialState({
    matchLength: 5,
    scores: [4, 1],
    phase: "roll",
    crawfordPlayed: true,
    cube: { owner: 0, value: 4 },
  });
  s = transition(s, { type: "resign", level: 3 }, 0);
  s = transition(s, { type: "accept" }, 1);
  assert.equal(s.result.points, 12);
  assert.equal(s.scores[1], 5);
  assert.equal(s.result.matchOver, true);
});
