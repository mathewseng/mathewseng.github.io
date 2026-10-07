import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  decisionPlayer,
  canDouble,
  canImmediateRedouble,
  legalPaths,
  assertState,
  replay,
  boardKey,
  matchingPaths,
  applyStep,
} from "../core/rules.mjs";
import { checkerRoutes, reverseRoutes } from "../core/draft.mjs";
import { fromXGID, toXGID, shareURL, sharedPosition } from "../core/xgid.mjs";
import {
  BOARD_PRESETS,
  normalizeBoardTheme,
  elementPattern,
} from "../core/appearance.mjs";
const money = (options) =>
  initialState({ matchLength: 0, phase: "roll", ...options });
const act = (s, type, rest = {}) =>
  transition(s, { type, ...rest }, decisionPlayer(s));
test("opening doubles only raise tied money openings, with the chosen cap and a centered cube", () => {
  for (const cap of [0, 1, 2, 3, 10]) {
    let s = money({ phase: "opening", rules: { automaticDoubles: cap } });
    const events = [];
    for (let i = 1; i <= 12; i++) {
      const action = { type: "opening", dice: [4, 4] };
      events.push({ action, actor: 0 });
      s = transition(s, action);
      assert.equal(s.cube.value, 2 ** Math.min(i, cap));
      assert.equal(s.cube.owner, null);
      assert.deepEqual(s.dice, []);
    }
    const action = { type: "opening", dice: [2, 5] };
    events.push({ action, actor: 0 });
    s = transition(s, action);
    assert.equal(s.turn, 1);
    assert.deepEqual(s.dice, [2, 5]);
    assert.equal(s.phase, "move");
    assert.deepEqual(
      replay(
        money({ phase: "opening", rules: { automaticDoubles: cap } }),
        events,
      ).at(-1),
      s,
    );
  }
  for (const rules of [
    { jacoby: true },
    { immediateRedoubles: 1 },
    { automaticDoubles: 1 },
  ])
    assert.throws(() => initialState({ rules }), /unlimited/);
});
test("Jacoby suppresses gammons on centered automatic doubles, and turns off after an accepted double", () => {
  const points = Array(24).fill(0);
  points[0] = 1;
  points[18] = -15;
  for (const [owner, jacoby, expected] of [
    [null, true, 2],
    [0, true, 4],
    [null, false, 4],
  ]) {
    const s = money({
      points,
      off: [14, 0],
      dice: [1, 2],
      phase: "move",
      cube: { value: 2, owner },
      rules: { jacoby },
    });
    const over = act(s, "move", { steps: legalPaths(s)[0].steps });
    assert.equal(over.result.points, expected);
    assert.equal(over.result.level, expected / 2);
  }
  const s = money({ rules: { jacoby: true } });
  assert.throws(() => act(s, "resign", { level: 2 }), /Jacoby/);
  assert.equal(act(act(s, "resign", { level: 1 }), "accept").result.points, 1);
});
test("beaver and raccoon responses retain beaverer's ownership and original roller", () => {
  for (const turn of [0, 1]) {
    let s = money({ turn, rules: { immediateRedoubles: 2, jacoby: true } });
    s = act(s, "double");
    assert.equal(decisionPlayer(s), 1 - turn);
    s = act(s, "beaver");
    assert.deepEqual(s.cube, { value: 2, owner: 1 - turn });
    assert.equal(decisionPlayer(s), turn);
    s = act(s, "raccoon");
    assert.deepEqual(s.cube, { value: 4, owner: 1 - turn });
    assert.equal(decisionPlayer(s), 1 - turn);
    assert.equal(canImmediateRedouble(s), false);
    s = act(s, "take");
    assert.deepEqual(s.cube, { value: 8, owner: 1 - turn });
    assert.equal(s.turn, turn);
    assert.equal(s.phase, "roll");
    assert.equal(canDouble(s), false);
  }
});
test("passing an immediate redouble loses the accepted stake, not the proposed stake", () => {
  for (const [chain, winner, stake] of [
    [["double"], 0, 1],
    [["double", "beaver"], 1, 2],
    [["double", "beaver", "raccoon"], 0, 4],
  ]) {
    let s = money({ rules: { immediateRedoubles: 2 } });
    for (const type of chain) s = act(s, type);
    const over = act(s, "pass");
    assert.equal(over.result.winner, winner);
    assert.equal(over.result.points, stake);
    const next = act(over, "next");
    assert.deepEqual(next.rules, s.rules);
    assert.equal(next.cube.value, 1);
  }
});
test("cube options enforce actor, rule, chain depth and maximum stake", () => {
  const ordinary = act(money(), "double");
  assert.throws(() => act(ordinary, "beaver"));
  let s = act(money({ rules: { immediateRedoubles: 1 } }), "double");
  assert.throws(() => transition(s, { type: "beaver" }, 0), /turn/);
  s = act(s, "beaver");
  assert.throws(() => act(s, "raccoon"));
  assert.throws(() => act(s, "double"));
  s = act(
    money({ cube: { value: 512, owner: 0 }, rules: { immediateRedoubles: 2 } }),
    "double",
  );
  assert.equal(canImmediateRedouble(s), false);
  assert.equal(act(s, "take").cube.value, 1024);
  assert.throws(
    () => money({ rules: { cube: false, jacoby: true } }),
    /cube enabled/,
  );
});
test("XGID Jacoby/beaver flags match the public XG example; full links retain all optional context", () => {
  const x = "XGID=-b---AD-D---eD---c-e----B-:0:0:-1:22:0:0:3:0:10"; // extremegammon.com/OB/Replies_to_51%24.html
  const s = fromXGID(x);
  assert.equal(s.rules.jacoby, true);
  assert.equal(s.rules.immediateRedoubles, 1);
  assert.equal(toXGID(s), x);
  const pending = act(
    act(
      money({
        rules: { jacoby: true, automaticDoubles: 2, immediateRedoubles: 2 },
      }),
      "double",
    ),
    "beaver",
  );
  assert.deepEqual(
    sharedPosition(
      new URLSearchParams(new URL(shareURL(pending)).hash.slice(1)),
    ),
    pending,
  );
  assert.throws(() => toXGID(pending), /position link/);
  assert.throws(
    () => sharedPosition(new URLSearchParams({ state: '{"version":99}' })),
    /version/,
  );
});
test("combined shortcuts are legal prefixes in both dice orders; doubles include every reachable multiple", () => {
  for (const dice of [
    [3, 1],
    [1, 3],
    [2, 2],
    [6, 6],
  ]) {
    const s = money({ phase: "move", dice }),
      paths = legalPaths(s);
    for (const from of new Set(paths.map((p) => p.steps[0]?.from))) {
      for (const route of checkerRoutes(paths, [], from)) {
        assert.ok(matchingPaths(paths, route.steps).length);
        assert.equal(route.steps[0].from, from);
        for (let i = 1; i < route.steps.length; i++)
          assert.equal(route.steps[i].from, route.steps[i - 1].to);
      }
    }
  }
  const s = money({
    phase: "move",
    dice: [2, 2],
    points: [...Array(18).fill(0), -15, 0, 0, 0, 0, 1],
    off: [14, 0],
  });
  const routes = checkerRoutes(legalPaths(s), [], 23);
  assert.deepEqual([...new Set(routes.map((r) => r.die))], [2, 4, 6, 8]);
});
test("moving a checker back preserves unrelated legal moves and restores hits and dice", () => {
  const s = money({ phase: "move", dice: [3, 1] });
  const draft = [
      { from: 12, to: 9, die: 3 },
      { from: 7, to: 6, die: 1 },
    ],
    paths = legalPaths(s);
  assert.ok(matchingPaths(paths, draft).length);
  const undo = reverseRoutes(s, paths, draft).find(
    (r) => r.from === 9 && r.to === 12,
  );
  assert.deepEqual(undo.remaining, [draft[1]]);
  for (const path of paths.slice(0, 30))
    for (let length = 1; length <= path.steps.length; length++) {
      const current = path.steps.slice(0, length);
      for (const r of reverseRoutes(s, paths, current)) {
        assert.ok(matchingPaths(paths, r.remaining).length);
        assertState(r.remaining.reduce((b, st) => applyStep(b, st), s));
      }
    }
  const points = Array(24).fill(0);
  points[5] = 1;
  points[2] = -1;
  const hit = money({ phase: "move", dice: [3, 1], points, off: [14, 14] });
  const hp = legalPaths(hit),
    h = [{ from: 5, to: 2, die: 3 }];
  const restore = reverseRoutes(hit, hp, h).find(
    (r) => r.from === 2 && r.to === 5,
  );
  assert.ok(restore);
  assert.equal(
    boardKey(restore.remaining.reduce((b, st) => applyStep(b, st), hit)),
    boardKey(hit),
  );
});
test("24 coordinated themes and bounded patterns reject unsafe stored values", () => {
  assert.equal(BOARD_PRESETS.length, 24);
  assert.equal(new Set(BOARD_PRESETS.map((p) => p.id)).size, 24);
  const value = {
    version: 1,
    preset: "linen",
    colors: {},
    patterns: {
      surface: { kind: "lines", ink: "abc", size: 18, opacity: 0.2, angle: 45 },
      frame: { kind: "url(x)", ink: "red" },
      die0: { kind: "dots", ink: "#000", size: 100, opacity: 1, angle: 12 },
    },
  };
  const normalized = normalizeBoardTheme(value);
  assert.deepEqual(Object.keys(normalized.patterns), ["surface"]);
  assert.equal(normalized.patterns.surface.ink, "#AABBCC");
  assert.equal(elementPattern(normalized, "checker0").kind, "solid");
});
