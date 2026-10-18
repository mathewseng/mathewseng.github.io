import test from "node:test";
import assert from "node:assert/strict";
import { initialState, transition, replay, clone, legalTurns } from "../core/rules.mjs";
import { historyStates } from "../core/history-states.mjs";
import { decisionHistory } from "../core/decision-history.mjs";
import { takebackTarget } from "../core/table.mjs";

function fixture(id) {
  const initial = initialState({ phase: "roll", matchLength: 0 });
  const model = { id, started: true, initial, state: initial, events: [] };
  function add(action) {
    const actor = model.state.turn;
    model.state = transition(model.state, action, actor);
    model.events.push({ actor, action });
  }
  add({ type: "roll", dice: [3, 1] });
  add({ type: "move", steps: legalTurns(model.state)[0].steps });
  return { model, add };
}
test("review and undo reuse a validated prefix through cloned commits and new grades", () => {
  const { model, add } = fixture("history-prefix");
  const before = historyStates(model), rows = decisionHistory(model);
  assert.deepEqual(before, replay(model.initial, model.events));
  assert.equal(takebackTarget(model), 1);
  const copy = clone(model);
  copy.events[0].evaluation = { result: { positionKey: "stale" } };
  assert.equal(historyStates(copy)[1], before[1], "grade changes do not replay checker moves");
  assert.equal(decisionHistory(copy)[1].source, rows[1].source, "forced-move checks reuse the same state");
  add({ type: "roll", dice: [6, 2] });
  const after = historyStates(clone(model));
  assert.equal(after[2], before[2]);
  assert.deepEqual(after, replay(model.initial, model.events));
  assert.equal(before.length, 3, "existing views do not grow when an event arrives");
  assert.throws(() => { after[1].points[0] = 99; }, TypeError);
  assert.throws(() => after.pop(), TypeError);
});
test("a takeback, branch edit, changed initial state, or malformed action cannot reuse stale states", () => {
  const { model } = fixture("history-branch");
  const before = historyStates(model);
  const branch = clone(model);
  branch.events.length = 1;
  assert.equal(historyStates(branch)[1], before[1]);
  branch.events[0].action.dice = [4, 2];
  const changed = historyStates(branch);
  assert.notEqual(changed[1], before[1]);
  assert.deepEqual(changed, replay(branch.initial, branch.events));
  assert.deepEqual(historyStates(model), replay(model.initial, model.events));
  branch.initial.cube.value = 2;
  assert.equal(historyStates(branch)[1].cube.value, 2);
  branch.events[0].actor = 1;
  assert.throws(() => historyStates(branch));
  branch.events[0].actor = undefined;
  assert.deepEqual(historyStates(branch), replay(branch.initial, branch.events));
  branch.events[0].actor = null;
  assert.throws(() => historyStates(branch), "null actor differs from an omitted actor");
  branch.events = Array(10001).fill(model.events[0]);
  assert.throws(() => historyStates(branch), /too large/);
});
