import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  positionKey,
  clone,
  legalTurns,
} from "../core/rules.mjs";
import {
  decisionHistory,
  decisionTotals,
  compactEvaluation,
  mergeEvaluations,
  sameDecisionPrefix,
} from "../core/decision-history.mjs";
import { gradeCube } from "../engine/cube-grade.mjs";
function fixture() {
  const initial = initialState({ phase: "roll", matchLength: 0 });
  let state = initial;
  const events = [];
  for (const [actor, action] of [
    [0, { type: "double" }],
    [1, { type: "pass" }],
    [0, { type: "next" }],
    [0, { type: "opening", dice: [6, 1] }],
  ]) {
    const before = state;
    state = transition(state, action, actor);
    const event = { actor, action };
    if (action.type === "double")
      event.evaluation = compactEvaluation(
        before,
        gradeCube(
          before,
          {
            type: "cube",
            status: "complete",
            units: "current-cube-points",
            positionKey: positionKey(before),
            outcomes: [0.2, 0.1, 1],
            settings: { name: "Quick", plies: 0 },
          },
          "double",
        ),
      );
    events.push(event);
  }
  const steps = legalTurns(state)[0].steps;
  events.push({ actor: 0, action: { type: "move", steps } });
  return { initial, events };
}
test("session decisions span games, count missing grades separately and preserve original cube units", () => {
  const m = fixture(),
    rows = decisionHistory(m);
  assert.deepEqual(
    rows.map((r) => r.game),
    [1, 1, 2],
  );
  assert.deepEqual(
    rows.map((r) => r.status),
    ["evaluated", "pending", "pending"],
  );
  const t = decisionTotals(rows, 0);
  assert.equal(t.evaluated, 1);
  assert.equal(t.pending, 1);
  assert.equal(t.loss, 0.1);
  assert.equal(decisionTotals(rows, 1).evaluated, 0);
  m.events[0].evaluation.result.positionKey = "stale";
  assert.equal(decisionHistory(m)[0].status, "pending");
});
test("saved analysis follows only an identical replay prefix, preserving fresh grades and annotations", () => {
  const saved = fixture(),
    current = clone(saved);
  delete current.events[0].evaluation;
  mergeEvaluations(current, saved);
  assert.deepEqual(current.events[0].evaluation, saved.events[0].evaluation);
  current.events[0].evaluation.result.requestId = "new";
  mergeEvaluations(current, saved);
  assert.equal(current.events[0].evaluation.result.requestId, "new");
  assert.ok(sameDecisionPrefix(saved, current, 3));
  current.events[0].action = { type: "roll", dice: [6, 2] };
  delete current.events[0].evaluation;
  assert.equal(sameDecisionPrefix(saved, current, 3), false);
  mergeEvaluations(current, saved);
  assert.equal(current.events[0].evaluation, undefined);
});

test("saved checker reviews retain ten ranked candidates and the actual submitted move", () => {
  const candidates = Array.from({ length: 18 }, (_, i) => ({
    equity: 1 - i / 100,
    steps: [{ from: 5, to: 4, die: 1 }],
  }));
  const original = { type: "checker", candidates, actual: candidates[17] };
  const saved = compactEvaluation(null, original).result;
  assert.equal(saved.candidates.length, 10);
  assert.equal(saved.evaluatedCount, 18);
  assert.deepEqual(saved.actual, candidates[17]);
  assert.equal(original.candidates.length, 18);
  saved.candidates[0].steps[0].to = 3;
  assert.equal(original.candidates[0].steps[0].to, 4);
});
