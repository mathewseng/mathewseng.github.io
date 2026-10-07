import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  legalPaths,
  matchingPaths,
  applyStep,
  assertState,
} from "../core/rules.mjs";
import { originalReturnRoutes, dieSwitchRoutes } from "../core/draft.mjs";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/origin-return.json", import.meta.url)),
);
const at = (s, d) => d.reduce((s, step) => applyStep(s, step), s);
const mirror = (s) => ({
  ...structuredClone(s),
  turn: 1,
  points: [...s.points].reverse().map((n) => -n),
  bar: [...s.bar].reverse(),
  off: [...s.off].reverse(),
});

test("16/11/8 returns only to 16, and can revise to 16/13 after both dice were used", () => {
  for (const turn of [0, 1]) {
    const s = turn ? mirror(fixture.state) : fixture.state,
      p = (n) => (turn ? 23 - n : n);
    const draft = fixture.draft.map((m) => ({
        ...m,
        from: p(m.from),
        to: p(m.to),
      })),
      paths = legalPaths(s);
    assertState(s);
    assert.ok(matchingPaths(paths, draft).length);
    const backs = originalReturnRoutes(s, paths, draft);
    assert.deepEqual(
      backs.map((r) => [r.from, r.to, r.remaining]),
      [[p(7), p(15), []]],
    );
    const route = dieSwitchRoutes(s, paths, draft).find((r) => r.to === p(12));
    assert.ok(route);
    assert.equal(route.from, p(7));
    assert.deepEqual(route.remaining, [{ from: p(15), to: p(12), die: 3 }]);
    assert.ok(matchingPaths(paths, route.remaining).length);
    assertState(at(s, route.remaining));
    assert.deepEqual(
      originalReturnRoutes(s, paths, draft, 1),
      [],
      "a forced origin step cannot be returned",
    );
  }
});

test("an occupied intermediate stop is not the moved checker’s original position", () => {
  const s = structuredClone(fixture.state);
  s.points[12]--;
  s.points[10]++;
  const paths = legalPaths(s),
    draft = fixture.draft;
  assert.ok(matchingPaths(paths, draft).length);
  assert.deepEqual(
    originalReturnRoutes(s, paths, draft).map((r) => r.to),
    [15],
  );
});

test("origin returns preserve independent moves, hits, bar entry, bearoff and locked prefixes", () => {
  const fixtures = [
    fixture.state,
    initialState({ phase: "move", dice: [3, 1] }),
    initialState({ phase: "move", dice: [2, 2] }),
  ];
  const bar = initialState({ phase: "move", dice: [6, 3] });
  bar.points[23]--;
  bar.bar[0] = 1;
  fixtures.push(bar);
  const off = initialState({ phase: "move", dice: [1, 2] });
  off.points.fill(0);
  off.points[0] = 7;
  off.points[2] = 8;
  off.points[23] = -15;
  fixtures.push(off);
  let count = 0;
  for (const base of fixtures)
    for (const s of [base, mirror(base)]) {
      assertState(s);
      const paths = legalPaths(s),
        snapshot = JSON.stringify(s);
      for (const path of paths)
        for (let n = 1; n <= path.steps.length; n++)
          for (let min = 0; min <= n; min++) {
            const draft = path.steps.slice(0, n);
            for (const route of originalReturnRoutes(s, paths, draft, min)) {
              count++;
              assert.ok(matchingPaths(paths, route.remaining).length);
              assert.deepEqual(
                route.remaining.slice(0, min),
                draft.slice(0, min),
              );
              assert.ok(
                route.to === "bar"
                  ? s.bar[s.turn] > 0
                  : s.points[route.to] * (s.turn ? -1 : 1) > 0,
              );
              assertState(at(s, route.remaining));
            }
          }
      assert.equal(JSON.stringify(s), snapshot);
    }
  assert.ok(count > 100);
});
