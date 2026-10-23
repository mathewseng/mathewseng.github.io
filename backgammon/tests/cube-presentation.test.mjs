import test from "node:test";
import assert from "node:assert/strict";
import { initialState, transition, decisionPlayer, MAX_CUBE } from "../core/rules.mjs";
import { presentCubeAction } from "../core/cube-presentation.mjs";

function check(source, type, expected) {
  const before = structuredClone(source);
  const view = presentCubeAction(source, type);
  assert.deepEqual(view, { ...view, ...expected });
  const action = type === "roll" ? { type, dice: [3, 1] } : { type };
  const next = transition(source, action, decisionPlayer(source));
  assert.equal(view.cubeValue, next.cube.value, "badge matches the committed cube, not a pending offer");
  assert.deepEqual(source, before, "presentation never changes the position");
  return next;
}

test("normal cube actions show real values and distinct icons", () => {
  for (const value of [1, 2, 8, 64, MAX_CUBE / 2]) {
    const source = initialState({ phase: "roll", matchLength: 0 });
    source.cube.value = value;
    check(source, "roll", { cubeValue: value, icon: null, label: "No double", displayLabel: "" });
    const pending = check(source, "double", { cubeValue: value, icon: "double",
      label: `Double ${value} → ${value * 2}`, displayLabel: `${value} → ${value * 2}` });
    check(pending, "take", { cubeValue: value * 2, icon: "take", label: `Take ${value * 2}` });
    const dropped = check(pending, "pass", { cubeValue: value, icon: "drop", label: `Drop ${value * 2} · concede ${value}` });
    assert.equal(dropped.scores[0], value, "drop label shows the actual points paid");
  }
});

test("beavers and raccoons accept one cube and offer the next", () => {
  let source = initialState({ phase: "roll", matchLength: 0, rules: { immediateRedoubles: 2 } });
  source.cube.value = 2;
  source = check(source, "double", { cubeValue: 2, label: "Double 2 → 4" });
  source = check(source, "beaver", { cubeValue: 4, icon: "redouble", label: "Beaver 4 → 8" });
  const beaverDrop = check(source, "pass", { cubeValue: 4, label: "Drop 8 · concede 4" });
  assert.equal(beaverDrop.scores[1], 4);
  source = check(source, "raccoon", { cubeValue: 8, icon: "redouble", label: "Raccoon 8 → 16" });
  check(source, "take", { cubeValue: 16, label: "Take 16" });
  const raccoonDrop = check(source, "pass", { cubeValue: 8, label: "Drop 16 · concede 8" });
  assert.equal(raccoonDrop.scores[0], 8);
});

test("redoubles by either player keep values independent of ownership and match length", () => {
  for (const turn of [0, 1]) {
    const source = initialState({ phase: "roll", turn, matchLength: 7 });
    source.cube = { value: 4, owner: turn };
    const pending = check(source, "double", { cubeValue: 4, label: "Double 4 → 8" });
    const dropped = check(pending, "pass", { cubeValue: 4, label: "Drop 8 · concede 4" });
    assert.equal(dropped.scores[turn], 4);
  }
  assert.throws(() => presentCubeAction(initialState(), "move"), /Unknown cube action/);
});
