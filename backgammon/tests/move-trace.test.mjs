import test from "node:test";
import assert from "node:assert/strict";
import { initialState, legalPaths, applyStep } from "../core/rules.mjs";
import { moveTrace } from "../core/move-trace.mjs";
import { lastMoveArrows, lastMoveGhosts } from "../ui/board.mjs";
import { routeArrow, segmentClear } from "../ui/move-arrow-route.mjs";

const after = (s, steps) =>
  steps.reduce((state, step) => applyStep(state, step), s);
test("move traces join a checker’s dice, retain separate stack departures, and do not mutate inputs", () => {
  const s = initialState({ phase: "move", dice: [3, 1] });
  const steps = [
    { from: 12, to: 9, die: 3 },
    { from: 9, to: 8, die: 1 },
  ];
  const end = after(s, steps),
    original = structuredClone({ end, steps });
  const trace = moveTrace(end, 0, steps, s.dice);
  assert.deepEqual(trace.checkers, [
    { from: 12, to: 8, path: [12, 9, 8], fromIndex: 4, toIndex: 0 },
  ]);
  assert.deepEqual(trace.origins, { 12: { count: 1, before: 5 } });
  assert.deepEqual({ end, steps }, original);
  trace.steps[0].from = 99;
  assert.deepEqual(steps, original.steps);
  const separate = Array.from({ length: 4 }, () => ({
    from: 5,
    to: 4,
    die: 1,
  }));
  const t = moveTrace(after(s, separate), 0, separate);
  assert.deepEqual(
    t.checkers.map((c) => c.fromIndex),
    [4, 3, 2, 1],
  );
  assert.deepEqual(
    t.checkers.map((c) => c.toIndex),
    [0, 1, 2, 3],
  );
  const arrows = lastMoveArrows(after(s, separate), t);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].count, 4);
});
test("trace geometry connects the corresponding ghost and landing slot in both orientations", () => {
  for (const turn of [0, 1])
    for (const orientation of [0, 1])
      for (const dice of [
        [3, 1],
        [6, 6],
        [2, 5],
      ]) {
        const s = initialState({ phase: "move", turn, dice });
        const paths = legalPaths(s);
        for (const index of [
          0,
          Math.floor(paths.length / 2),
          paths.length - 1,
        ]) {
          const steps = paths[index].steps,
            end = after(s, steps);
          const trace = moveTrace(end, turn, steps, dice);
          const ghosts = lastMoveGhosts(trace, orientation);
          for (const arrow of lastMoveArrows(end, trace, orientation)) {
            assert.ok(
              ghosts.some((g) => g.x === arrow.from.x && g.y === arrow.from.y),
            );
            assert.ok(!/NaN|Infinity/.test(arrow.d));
            for (const p of arrow.points)
              assert.ok(p.x >= 0 && p.x <= 876 && p.y >= 0 && p.y <= 660);
            assert.ok(
              Math.hypot(arrow.tip.x - arrow.to.x, arrow.tip.y - arrow.to.y) >=
                27.9,
            );
          }
        }
      }
});
test("bar entry, hits, bearing off, tall stacks and passes produce honest display traces", () => {
  const s = initialState({ phase: "move", dice: [1, 2] });
  s.points = Array(24).fill(0);
  s.points[5] = 14;
  s.points[23] = -1;
  s.points[18] = -14;
  s.bar = [1, 0];
  const steps = [
    { from: "bar", to: 23, die: 1 },
    { from: 23, to: 21, die: 2 },
  ];
  const end = after(s, steps),
    t = moveTrace(end, 0, steps, s.dice);
  assert.equal(t.checkers.length, 1);
  assert.equal(t.checkers[0].from, "bar");
  assert.equal(t.checkers[0].to, 21);
  assert.equal(end.bar[1], 1);
  for (const o of [0, 1])
    assert.equal(lastMoveArrows(end, t, o)[0].from.x, 408);
  s.points = Array(24).fill(0);
  s.points[0] = 3;
  s.points[23] = -15;
  s.bar = [0, 0];
  s.off = [12, 0];
  const bear = legalPaths(s)[0].steps,
    borne = after(s, bear),
    bt = moveTrace(borne, 0, bear, s.dice);
  for (const o of [0, 1])
    for (const a of lastMoveArrows(borne, bt, o)) {
      assert.equal(a.to.x, 843);
      assert.equal(a.to.y, o ? 250 : 410);
    }
  s.points = Array(24).fill(0);
  s.points[12] = 15;
  s.points[23] = -15;
  s.off = [0, 0];
  const many = Array.from({ length: 4 }, () => ({ from: 12, to: 11, die: 1 })),
    tall = after(s, many);
  assert.equal(lastMoveGhosts(moveTrace(tall, 0, many)).length, 1);
  assert.equal(moveTrace(s, 0, []).checkers.length, 0);
  assert.deepEqual(lastMoveArrows(s, moveTrace(s, 0, [])), []);
});
test("arrow routing clears intervening checker and dice obstacles with finite, deterministic rounded paths", () => {
  const a = { x: 54, y: 54 },
    b = { x: 354, y: 54 };
  const obstacles = [
    { x: 174, y: 54, r: 28 },
    { x: 234, y: 54, r: 28 },
    { x: 144, y: 90, width: 90, height: 55 },
  ];
  const route = routeArrow(a, b, obstacles);
  assert.ok(route.routed);
  assert.match(route.d, /C/);
  assert.deepEqual(route, routeArrow(a, b, obstacles));
  for (let i = 1; i < route.points.length; i++)
    assert.ok(segmentClear(route.points[i - 1], route.points[i], obstacles));
  assert.equal(routeArrow(a, a, []), null);
  assert.match(
    routeArrow(a, { x: 114, y: 54 }, []).d,
    /C/,
    "adjacent transfers stay finite",
  );
  const sealed = routeArrow(a, b, [{ x: 100, y: 0, width: 200, height: 660 }]);
  assert.equal(
    sealed.routed,
    false,
    "sealed clusters use the renderer’s masking fallback",
  );
  assert.ok(!/NaN|Infinity/.test(sealed.d));
});

test("two-radius clearance wraps smoothly around a checker and a touching stack", () => {
  for (const stack of [1, 2, 5]) {
    const obstacles = Array.from({ length: stack }, (_, i) => ({
      x: 300,
      y: 180 + i * 44,
      r: 22,
    }));
    const route = routeArrow({ x: 100, y: 200 }, { x: 500, y: 200 }, obstacles);
    assert.ok(route.routed);
    for (const point of route.points)
      for (const obstacle of obstacles)
        assert.ok(
          Math.hypot(point.x - obstacle.x, point.y - obstacle.y) >= 43.98,
          "full checker-radius clearance, allowing <0.02px transition interpolation",
        );
    for (let i = 2; i < route.points.length; i++) {
      const a = route.points[i - 2],
        b = route.points[i - 1],
        c = route.points[i];
      const turn = Math.abs(
        Math.atan2(
          (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x),
          (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y),
        ),
      );
      assert.ok(
        turn < 0.07,
        "no visible corner between straight, blended and circular spans",
      );
    }
  }
});

test("transition polynomial matches position and first three derivatives at both joins", async () => {
  const { smoothJoin } = await import("../ui/move-arrow-route.mjs");
  const radius = 44,
    length = 10,
    angle = 0.2;
  const left = [
    { x: 10, y: 10 },
    { x: 1, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const right = [
    { x: 20, y: 12 },
    { x: Math.cos(angle), y: Math.sin(angle) },
    { x: -Math.sin(angle) / radius, y: Math.cos(angle) / radius },
    { x: -Math.cos(angle) / radius ** 2, y: -Math.sin(angle) / radius ** 2 },
  ];
  const coefficients = smoothJoin(left, right, length);
  for (const [axis, k] of ["x", "y"].entries())
    for (let d = 0; d <= 3; d++)
      for (const t of [0, 1]) {
        const value = coefficients[axis].reduce((sum, v, i) => {
          if (i < d) return sum;
          let factor = 1;
          for (let j = 0; j < d; j++) factor *= i - j;
          return sum + (v * factor * t ** (i - d)) / length ** d;
        }, 0);
        assert.ok(Math.abs(value - (t ? right : left)[d][k]) < 1e-9);
      }
});
