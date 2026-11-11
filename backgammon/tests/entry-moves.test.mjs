import test from "node:test";
import assert from "node:assert/strict";
import { initialState, legalPaths, matchingPaths, applyStep } from "../core/rules.mjs";
import { entryRoutes } from "../core/draft.mjs";

// One checker on the bar; both dice can enter, and two other checkers can move.
function position(turn = 0, dice = [4, 2], bar = 1) {
  const points = Array(24).fill(0);
  points[12] = 2; points[7] = 2; points[5] = 2;
  points[0] = -2; points[23] = -2;
  const mirrored = points.toReversed().map((n) => -n);
  return initialState({ matchLength: 0, phase: "move", turn, dice,
    points: turn ? mirrored : points,
    bar: turn ? [0, bar] : [bar, 0],
    off: turn ? [11, 9 - bar] : [9 - bar, 11] });
}
const at = (s, steps) => steps.reduce((b, st) => applyStep(b, st), s);
const own = (s, p) => s.points[p] * (s.turn ? -1 : 1);

test("a move elsewhere enters the bar checker with the other die, for both players and dice orders", () => {
  for (const turn of [0, 1]) for (const dice of [[4, 2], [2, 4]]) {
    const s = position(turn, dice), paths = legalPaths(s);
    const routes = entryRoutes(paths, [], s);
    assert.ok(routes.length >= 6, "each board checker offers each die");
    for (const route of routes) {
      assert.equal(route.entry, 1);
      assert.equal(route.steps[0].from, "bar");
      assert.equal(route.steps.length, 2, "one die enters, the other moves");
      assert.notEqual(route.steps[0].die, route.steps[1].die);
      assert.equal(route.steps[1].from, route.from);
      assert.equal(route.steps[1].to, route.to);
      assert.equal(route.die, route.steps[1].die, "the route's die is the chosen checker's");
      assert.ok(matchingPaths(paths, route.steps).length, "the pair is a legal turn prefix");
      const after = at(s, route.steps);
      assert.equal(after.bar[turn], 0);
      assert.equal(own(after, route.from), own(s, route.from) - 1);
    }
    // The same checker moved with the other die enters on the other point.
    const from = routes[0].from, pair = routes.filter((r) => r.from === from);
    assert.equal(new Set(pair.map((r) => r.steps[0].to)).size, 2);
    assert.equal(new Set(pair.map((r) => r.to)).size, 2);
  }
});

test("entry pairs exist only while the bar is waiting and never duplicate the entering checker's own journey", () => {
  const s = position(), paths = legalPaths(s);
  const entry = paths[0].steps[0];
  assert.deepEqual(entryRoutes(paths, [entry], at(s, [entry])), [], "after entering, ordinary routes apply");
  const clear = initialState({ matchLength: 0, phase: "move", dice: [4, 2] });
  assert.deepEqual(entryRoutes(legalPaths(clear), [], clear), []);
  for (const route of entryRoutes(paths, [], s))
    assert.ok(own(s, route.from) > 0, "only checkers already on the board are offered");
  const two = position(0, [4, 2], 2);
  assert.deepEqual(entryRoutes(legalPaths(two), [], two), [], "two bar checkers use both dice to enter");
  // Doubles enter every bar checker first, then move the chosen checker.
  const doubles = position(0, [2, 2], 2), routes = entryRoutes(legalPaths(doubles), [], doubles);
  assert.ok(routes.length);
  for (const route of routes) {
    assert.equal(route.entry, 2);
    assert.ok(route.steps.slice(0, 2).every((step) => step.from === "bar"));
    assert.ok(route.steps.length <= 4 && route.steps.slice(2).every((step) => step.die === 2));
  }
});
