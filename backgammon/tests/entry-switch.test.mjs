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
        const routes = entrySwitchRoutes(s, paths, [first]);
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
        const back = entrySwitchRoutes(s, paths, r.remaining)[0];
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
    for (const p of ps)
      assert.deepEqual(entrySwitchRoutes(state, ps, p.steps), []);
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
          assert.notEqual(route.die, route.replacedDie);
          assert.equal(route.remaining.length, n);
        }
      }
  }
  assert.ok(count > 50);
});
