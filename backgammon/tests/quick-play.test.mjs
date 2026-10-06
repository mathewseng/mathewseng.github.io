import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalPaths,
  matchingPaths,
  applyStep,
} from "../core/rules.mjs";
import {
  availableRoutes,
  nearestRoutes,
  checkerRoutes,
  preferHittingRoutes,
} from "../core/draft.mjs";
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

test("combined shortcuts prefer the only hitting path, retaining genuine choices for both players", () => {
  for (const turn of [0, 1])
    for (const blots of [[], [7], [10], [7, 10], [5], [5, 7]]) {
      const points = Array(24).fill(0);
      points[12] = 15;
      for (const p of blots) points[p] = -1;
      points[23] = -(15 - blots.length);
      const s = initialState({
        phase: "move",
        dice: [5, 2],
        turn,
        points: turn ? points.reverse().map((n) => -n) : points,
      });
      const paths = legalPaths(s),
        from = turn ? 11 : 12,
        to = turn ? 18 : 5;
      const routes = checkerRoutes(paths, [], from).filter(
        (r) => r.to === to,
      );
      assert.equal(routes.length, 2);
      const before = JSON.stringify({ s, routes });
      const choices = preferHittingRoutes(s, routes);
      assert.equal(
        choices.length,
        blots.includes(5) || blots.length === 2 ? 2 : 1,
      );
      for (const choice of choices) {
        assert.ok(matchingPaths(paths, choice.steps).length);
        const after = choice.steps.reduce(
          (s, step) => applyStep(s, step),
          s,
        );
        if (blots.length) assert.ok(after.bar[1 - turn] > 0);
      }
      assert.equal(JSON.stringify({ s, routes }), before);
    }
});
test("hit preference uses only this shortcut's new hits and leaves explicit die/revision choices alone", () => {
  const points = Array(24).fill(0);
  points[12] = 15;
  points[7] = -1;
  points[23] = -12;
  const s = initialState({
    phase: "move",
    dice: [5, 2],
    points,
    bar: [0, 2],
  });
  const routes = checkerRoutes(legalPaths(s), [], 12).filter(
    (r) => r.to === 5,
  );
  const chosen = preferHittingRoutes(s, routes);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0].steps[0].to, 7);
  const bearoff = initialState({
    phase: "move",
    dice: [5, 2],
    points: Array.from({ length: 24 }, (_, p) =>
      p === 1 ? 2 : p === 23 ? -15 : 0,
    ),
    off: [13, 0],
  });
  const single = checkerRoutes(legalPaths(bearoff), [], 1).filter(
    (r) => r.to === "off",
  );
  assert.equal(single.length, 2);
  assert.deepEqual(preferHittingRoutes(bearoff, single), single);
  for (const flag of ["undo", "switchDie"]) {
    const revisions = routes.map((r) => ({ ...r, [flag]: true }));
    assert.deepEqual(preferHittingRoutes(s, revisions), revisions);
  }
});
