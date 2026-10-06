import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalPaths,
  matchingPaths,
  applyStep,
} from "../core/rules.mjs";
import { availableRoutes, nearestRoutes } from "../core/draft.mjs";
test("quick play selects the closest legal checker, including combined dice, doubles and either side", () => {
  for (const turn of [0, 1])
    for (const dice of [
      [4, 3],
      [2, 2],
    ]) {
      const s = initialState({ phase: "move", dice, turn }),
        paths = legalPaths(s);
      const routes = availableRoutes(paths, []);
      assert.ok(routes.some((r) => r.steps.length > 1));
      for (const to of new Set(routes.map((r) => r.to))) {
        const nearest = nearestRoutes(paths, [], to, turn);
        assert.ok(nearest.length);
        const distance = (r) => Math.abs(r.from - r.to);
        assert.equal(
          distance(nearest[0]),
          Math.min(...routes.filter((r) => r.to === to).map(distance)),
        );
        for (const route of nearest)
          assert.ok(matchingPaths(paths, route.steps).length);
      }
      const first = routes.find((r) => r.steps.length === 1).steps;
      for (const route of availableRoutes(paths, first)) {
        assert.ok(matchingPaths(paths, [...first, ...route.steps]).length);
        assert.ok(route.steps.length <= (dice[0] === dice[1] ? 3 : 1));
      }
    }
});
test("reachable points honor bar priority, blocks, higher die, and complete-turn limits", () => {
  const points = Array(24).fill(0);
  points[18] = -2;
  points[21] = -2;
  points[0] = 14;
  const s = initialState({
    phase: "move",
    dice: [6, 3],
    points,
    bar: [1, 0],
    off: [0, 11],
  });
  const paths = legalPaths(s),
    routes = availableRoutes(paths, []);
  assert.deepEqual(routes, []);
  points[18] = 0;
  const t = initialState({
    phase: "move",
    dice: [6, 3],
    points,
    bar: [1, 0],
    off: [0, 13],
  });
  for (const r of availableRoutes(legalPaths(t), []))
    assert.equal(r.from, "bar");
  assert.deepEqual(nearestRoutes(paths, [], 18, 0), []);
});
