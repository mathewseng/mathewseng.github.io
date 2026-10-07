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

test("reported double sixes: both point-4 routes remain drafts with identical final positions", () => {
  for (const s of [fixture, mirror(fixture)]) {
    assertState(s);
    const p = (n) => (s.turn ? 23 - n : n),
      paths = legalPaths(s);
    assert.equal(legalTurns(s).length, 2);
    assert.equal(forcedTurn(s), null);
    const initial = draftAutomation(s, [], paths);
    assert.deepEqual(initial, {
      steps: [{ from: p(21), to: p(15), die: 6 }],
      complete: false,
      minDraft: 1,
    });
    const nearest = nearestRoutes(paths, initial.steps, p(3), s.turn);
    assert.equal(nearest.length, 1);
    assert.equal(nearest[0].from, p(15));
    const draft = [...initial.steps, ...nearest[0].steps],
      fill = draftAutomation(s, draft, paths, true);
    assert.deepEqual(fill.steps, [{ from: p(21), to: p(15), die: 6 }]);
    assert.equal(fill.complete, true);
    const explicit = checkerRoutes(paths, initial.steps, p(21)).find(
      (r) => r.to === p(3),
    );
    assert.equal(
      boardKey(after(s, [...draft, ...fill.steps])),
      boardKey(after(s, [...initial.steps, ...explicit.steps])),
    );
    // Completion of a preview must not mean this original roll was forced.
    assert.equal(forcedTurn(s), null);
    for (const edit of [
      draft,
      [...draft, ...fill.steps].slice(0, -1),
      initial.steps,
    ])
      assert.deepEqual(
        draftAutomation(s, edit, paths).steps,
        [],
        "undo/reset/recovery cannot reapply a suffix",
      );
    const other = [...initial.steps, { from: p(21), to: p(15), die: 6 }];
    const partial = draftAutomation(s, other, paths, true);
    assert.deepEqual(partial.steps, [{ from: p(15), to: p(9), die: 6 }]);
    assert.equal(
      partial.complete,
      false,
      "two outcomes still remain after compulsory intermediate step",
    );
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
