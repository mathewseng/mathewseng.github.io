import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initialState,
  legalPaths,
  matchingPaths,
  boardKey,
  applyStep,
  assertState,
} from "../core/rules.mjs";
import {
  forcedContinuation,
  forcedTurn,
  draftAutomation,
} from "../core/table.mjs";
const fixture = (n) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)))
    .state;
const mirror = (s) => ({
  ...structuredClone(s),
  turn: 1,
  points: s.points.toReversed().map((n) => -n),
  bar: s.bar.toReversed(),
  off: s.off.toReversed(),
});
const outcomes = (paths) =>
  [...new Set(paths.map((p) => boardKey(p.state)))].sort();
const at = (s, d) => d.reduce((s, st) => applyStep(s, st), s);
for (const [name, step] of [
  ["forced-seven", { from: 6, to: 0, die: 6 }],
  ["forced-six-off", { from: 5, to: "off", die: 6 }],
  ["forced-four", { from: 5, to: 1, die: 4 }],
])
  test(`${name}: compulsory die plays before an optional die in either dice order and side`, () => {
    for (const base of [fixture(name), mirror(fixture(name))])
      for (const dice of [base.dice, [...base.dice].reverse()]) {
        const s = { ...base, dice },
          p = (n) => (typeof n === "number" && s.turn ? 23 - n : n),
          expected = { ...step, from: p(step.from), to: p(step.to) };
        assertState(s);
        const paths = legalPaths(s),
          a = draftAutomation(s, [], paths);
        assert.deepEqual(a, {
          steps: [expected],
          minDraft: 1,
          complete: false,
        });
        assert.deepEqual(
          outcomes(matchingPaths(paths, a.steps)),
          outcomes(paths),
        );
        assert.equal(forcedTurn(s), null);
        assert.deepEqual(draftAutomation(s, a.steps, paths).steps, []);
        // Old saved draft: optional die played first. Recovery adds the compulsory
        // six without erasing the choice, locking that optional die, or committing.
        for (const path of paths.filter((p) => p.steps[0].die !== step.die))
          for (const n of [1, 2]) {
            const old = path.steps.slice(0, n),
              plan = draftAutomation(s, old, paths),
              next = [...(plan.replacement || old), ...plan.steps];
            assert.deepEqual(next[0], expected);
            assert.equal(plan.minDraft, 1);
            assert.deepEqual(
              outcomes(matchingPaths(paths, next)),
              outcomes(matchingPaths(paths, old)),
            );
            if (n === 2)
              assert.equal(boardKey(at(s, next)), boardKey(at(s, old)));
            assert.deepEqual(draftAutomation(s, next, paths), {
              steps: [],
              minDraft: 1,
              complete: false,
            });
          }
      }
  });
test("double fours: auto-play only the common part, never choose exact bearoffs over legal moves", () => {
  for (const s of [
    fixture("double-four-choice"),
    mirror(fixture("double-four-choice")),
  ]) {
    const paths = legalPaths(s),
      a = draftAutomation(s, [], paths);
    assert.equal(outcomes(paths).length, 3);
    assert.equal(a.steps.length, 2);
    assert.equal(a.complete, false);
    assert.equal(forcedTurn(s), null);
    assert.deepEqual(outcomes(matchingPaths(paths, a.steps)), outcomes(paths));
  }
});
test("seeded legal prefixes: automatic actions never discard ANY final position, including hits and bar/off state", () => {
  let seed = 721;
  const random = (n) =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
  const states = [
    fixture("forced-seven"),
    fixture("forced-six-off"),
    fixture("double-four-choice"),
    initialState({ phase: "move", dice: [1, 2] }),
  ];
  let checked = 0;
  for (let i = 0; i < 32; i++) {
    const points = Array(24).fill(0);
    for (let n = 0; n < 15; n++) points[random(12)]++;
    for (let n = 0; n < 15; n++) points[12 + random(12)]--;
    states.push(
      initialState({
        phase: "move",
        points,
        dice: [random(6) + 1, random(6) + 1],
      }),
    );
  }
  for (const base of states)
    for (const s of [base, mirror(base)]) {
      assertState(s);
      const paths = legalPaths(s);
      for (const path of paths.slice(0, 30))
        for (let n = 0; n <= path.steps.length; n++) {
          const d = path.steps.slice(0, n),
            a = forcedContinuation(s, d, paths);
          const plan = draftAutomation(s, d, paths),
            normalized = [...(plan.replacement || d), ...plan.steps];
          assert.deepEqual(
            outcomes(matchingPaths(paths, normalized)),
            outcomes(matchingPaths(paths, d)),
          );
          assert.deepEqual(
            outcomes(matchingPaths(paths, [...d, ...a.steps])),
            outcomes(matchingPaths(paths, d)),
          );
          assert.ok(matchingPaths(paths, [...d, ...a.steps]).length);
          checked++;
        }
    }
  assert.ok(checked > 1000);
});
