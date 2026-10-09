import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalPaths,
  matchingPaths,
  applyStep,
  assertState,
} from "../core/rules.mjs";
import { entrySwitchRoutes } from "../core/draft.mjs";

function position(turn = 0, dice = [6, 3]) {
  const points = Array(24).fill(0);
  points[18] = -1;
  points[21] = -1;
  return initialState({
    matchLength: 0,
    phase: "move",
    turn,
    dice,
    points: turn ? points.reverse().map((n) => -n) : points,
    bar: turn ? [0, 1] : [1, 0],
    off: turn ? [13, 14] : [14, 13],
  });
}
const at = (s, steps) => steps.reduce((b, st) => applyStep(b, st), s);
test("alternate bar entry releases the first die and restores/replaces hits for both players and dice orders", () => {
  for (const turn of [0, 1])
    for (const dice of [
      [6, 3],
      [3, 6],
    ]) {
      const s = position(turn, dice),
        paths = legalPaths(s);
      for (const die of dice) {
        const first = paths.find((p) => p.steps[0].die === die).steps[0];
        const routes = entrySwitchRoutes(s, paths, [first]).filter(r => r.remaining.length === 1);
        assert.equal(routes.length, 1);
        const r = routes[0],
          result = at(s, r.remaining);
        assert.equal(r.from, first.to);
        assert.equal(r.die, 9 - die);
        assert.equal(r.replacedDie, die);
        assert.equal(r.remaining.length, 1);
        assert.ok(matchingPaths(paths, r.remaining).length);
        assert.equal(result.points[first.to], turn ? 1 : -1);
        assert.equal(result.points[r.to], turn ? -1 : 1);
        assert.deepEqual(result.bar, turn ? [1, 0] : [0, 1]);
        assertState(result);
        const back = entrySwitchRoutes(s, paths, r.remaining).find(r => r.remaining.length === 1);
        assert.deepEqual(back.remaining, [first]);
        assert.deepEqual(s.dice, dice);
      }
    }
});
test("blocked entries, higher-die restrictions, doubles and consumed dice never offer an illegal switch", () => {
  const s = position();
  s.points[21] = -2;
  s.off[1] = 12;
  const paths = legalPaths(s);
  assert.deepEqual(entrySwitchRoutes(s, paths, [paths[0].steps[0]]), []);
  const higher = position(0, [1, 2]);
  higher.points = Array(24).fill(0);
  higher.points[21] = -2;
  const hp = legalPaths(higher);
  assert.ok(hp.every((p) => p.steps.length === 1 && p.steps[0].die === 2));
  assert.deepEqual(entrySwitchRoutes(higher, hp, hp[0].steps), []);
  for (const dice of [
    [3, 3],
    [6, 3],
  ]) {
    const state = position(0, dice),
      ps = legalPaths(state);
    for (const p of ps) {
      const routes = entrySwitchRoutes(state, ps, p.steps);
      if (dice[0] === dice[1]) assert.equal(routes.length, p.steps.length - 1);
      for (const route of routes) {
        assert.ok(matchingPaths(ps, route.remaining).length);
        assertState(at(state, route.remaining));
        assert.ok(route.remaining.length > 0 && route.remaining.length < p.steps.length, "a completed single-checker chain can use fewer dice");
      }
    }
  }
});
test("seeded entry variations only expose replacements that remain full-turn prefixes", () => {
  let seed = 5879,
    count = 0;
  const random = (n) =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
  for (let i = 0; i < 120; i++) {
    const turn = random(2),
      s = position(turn, [1 + random(6), 1 + random(6)]);
    s.points = Array(24).fill(0);
    s.off[1 - turn] = 5;
    for (let j = 0; j < 10; j++) s.points[random(24)] += turn ? 1 : -1;
    const paths = legalPaths(s);
    for (const path of paths)
      for (let n = 1; n <= path.steps.length; n++) {
        for (const route of entrySwitchRoutes(
          s,
          paths,
          path.steps.slice(0, n),
        )) {
          count++;
          assert.ok(matchingPaths(paths, route.remaining).length);
          assertState(at(s, route.remaining));
          assert.notEqual(route.from, route.to);
          assert.ok(route.remaining.length <= (s.dice[0] === s.dice[1] ? 4 : 2) && route.remaining.length > 0);
          assert.equal(at(s, route.remaining).points[route.to], turn ? -1 : 1);
        }
      }
  }
  assert.ok(count > 50);
});

test("a blocked continuation still permits switching the initial die on a point", async () => {
  const { dieSwitchRoutes, checkerRoutes } =
    await import("../core/draft.mjs");
  for (const turn of [0, 1]) {
    const points = Array(24).fill(0);
    points[12] = 1;
    points[6] = 14;
    points[5] = -2;
    points[23] = -13;
    const s = initialState({
      phase: "move",
      dice: [4, 3],
      turn,
      points: turn ? points.reverse().map((n) => -n) : points,
    });
    const paths = legalPaths(s),
      from = turn ? 11 : 12,
      to = turn ? 15 : 8;
    const first = { from, to, die: 4 };
    assert.ok(matchingPaths(paths, [first]).length);
    assert.equal(checkerRoutes(paths, [first], to).length, 0);
    const switched = dieSwitchRoutes(s, paths, [first]).find(
      (r) => r.from === to,
    );
    assert.equal(switched.origin, from);
    assert.equal(switched.to, turn ? 14 : 9);
    assert.equal(switched.die, 3);
    assert.ok(matchingPaths(paths, switched.remaining).length);
    assertState(at(s, switched.remaining));
    const blocked = structuredClone(s);
    blocked.points[turn ? 14 : 9] = turn ? 2 : -2;
    blocked.points[turn ? 0 : 23] = turn ? 11 : -11;
    assert.equal(
      dieSwitchRoutes(blocked, legalPaths(blocked), [first]).length,
      0,
    );
  }
});
