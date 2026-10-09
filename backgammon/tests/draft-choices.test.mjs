import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialState,
  assertState,
  legalPaths,
  legalTurns,
  applyStep,
  boardKey,
  matchingPaths,
  transition,
} from "../core/rules.mjs";
import { draftAutomation, forcedTurn } from "../core/table.mjs";
import { checkerRoutes, nearestRoutes } from "../core/draft.mjs";
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/doubles-choice.json", import.meta.url)),
).state;
const mirror = (s) => ({
  ...structuredClone(s),
  turn: 1,
  points: [...s.points].reverse().map((n) => -n),
  bar: [...s.bar].reverse(),
  off: [...s.off].reverse(),
});
const after = (s, d) => d.reduce((s, step) => applyStep(s, step), s);

test("reported double sixes: three common steps play automatically, preserving both final choices", () => {
  for (const s of [fixture, mirror(fixture)]) {
    const p = (n) => (s.turn ? 23 - n : n),
      paths = legalPaths(s);
    const initial = draftAutomation(s, [], paths);
    assert.equal(legalTurns(s).length, 2);
    assert.equal(initial.steps.length, 3);
    assert.equal(initial.minDraft, 3);
    assert.equal(initial.complete, false);
    assert.equal(forcedTurn(s), null);
    const keys = new Set();
    for (const target of [p(3), p(9)]) {
      const route = nearestRoutes(paths, initial.steps, target, s.turn)[0];
      assert.ok(route);
      const draft = [...initial.steps, ...route.steps];
      assert.equal(draft.length, 4);
      assert.deepEqual(draftAutomation(s, draft, paths).steps, []);
      keys.add(boardKey(after(s, draft)));
    }
    assert.equal(keys.size, 2);
    assert.deepEqual(draftAutomation(s, initial.steps, paths).steps, []);
  }
});

test("all legal prefixes, both players, doubles and ordinary rolls preserve choices and editability", () => {
  const fixtures = [fixture, initialState({ phase: "move", dice: [3, 1] })];
  const race = initialState({ phase: "move", dice: [1, 2] });
  race.off = [13, 0];
  race.points.fill(0);
  race.points[5] = 1;
  race.points[4] = 1;
  race.points[23] = -15;
  fixtures.push(race);
  const bar = initialState({ phase: "move", dice: [1, 2] });
  bar.bar = [1, 0];
  bar.points.fill(0);
  bar.points[5] = 14;
  bar.points[22] = -2;
  bar.points[18] = -13;
  fixtures.push(bar);
  for (const base of fixtures)
    for (const s of [base, mirror(base)]) {
      assertState(s);
      const paths = legalPaths(s),
        before = JSON.stringify(s),
        min = draftAutomation(s, [], paths).minDraft;
      for (const path of paths)
        for (let n = min; n <= path.steps.length; n++) {
          const draft = path.steps.slice(0, n),
            plan = draftAutomation(s, draft, paths, true);
          assert.ok(matchingPaths(paths, [...draft, ...plan.steps]).length);
          assert.deepEqual(
            draftAutomation(s, draft, paths).steps,
            [],
            "a restore or undo is never a forward choice",
          );
          if (n === path.steps.length)
            assert.deepEqual(
              plan.steps,
              [],
              "already complete drafts are left alone",
            );
          if (plan.complete)
            assert.ok(
              matchingPaths(paths, [...draft, ...plan.steps]).some(
                (p) => p.steps.length === draft.length + plan.steps.length,
              ),
            );
          for (const from of new Set(paths.map((p) => p.steps[n]?.from))) {
            if (from === undefined) continue;
            for (const route of checkerRoutes(paths, draft, from))
              assert.ok(
                matchingPaths(paths, [...draft, ...route.steps]).length,
              );
          }
        }
      assert.equal(JSON.stringify(s), before);
    }
});

test("true forced passes and bearoffs remain automatic table actions", () => {
  const pass = initialState({ phase: "move", dice: [6, 6] });
  pass.bar = [1, 0];
  pass.points.fill(0);
  pass.points[5] = 14;
  pass.points[18] = -2;
  pass.points[23] = -13;
  const off = initialState({ phase: "move", dice: [6, 6] });
  off.off = [13, 0];
  off.points.fill(0);
  off.points[0] = 2;
  off.points[23] = -15;
  for (const original of [pass, off])
    for (const s of [original, mirror(original)]) {
      assertState(s);
      const move = forcedTurn(s);
      assert.ok(move);
      const next = transition(s, { type: "move", steps: move.steps });
      assert.notEqual(next.phase, "move");
    }
});
