import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHORTCUTS,
  shortcutAction,
  shortcutErrors,
  normalizeShortcuts,
  keyForEvent,
  visiblePoint,
} from "../core/shortcuts.mjs";
test("default keys cover visible points and context-dependent cube actions without conflicts", () => {
  assert.deepEqual(shortcutErrors(DEFAULT_SHORTCUTS), []);
  for (const [i, key] of [..."1234567890-="].entries())
    assert.equal(shortcutAction(DEFAULT_SHORTCUTS, key, "move"), `top${i}`);
  for (const [i, key] of [..."qwertyuiop[]"].entries())
    assert.equal(
      shortcutAction(DEFAULT_SHORTCUTS, key, "move"),
      `bottom${i}`,
    );
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, "d", "roll"), null);
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, "d", "double"), "drop");
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, "t", "double"), "take");
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, "t", "move"), "bottom4");
  for (const orientation of [0, 1])
    assert.equal(
      new Set(
        [...Array(12).keys()].flatMap((i) => [
          visiblePoint("top" + i, orientation),
          visiblePoint("bottom" + i, orientation),
        ]),
      ).size,
      24,
    );
  assert.equal(visiblePoint("top0", 0), 12);
  assert.equal(visiblePoint("top0", 1), 11);
});
test("editable bindings reject active collisions and corrupt storage, allow disabling a binding", () => {
  const b = structuredClone(DEFAULT_SHORTCUTS);
  b.hint = ["q"];
  assert.match(shortcutErrors(b).join(), /conflicts/);
  assert.deepEqual(normalizeShortcuts(b), DEFAULT_SHORTCUTS);
  b.hint = [];
  assert.deepEqual(shortcutErrors(b), []);
  b.undo = ["j"];
  assert.equal(shortcutAction(b, "j", "move"), "undo");
  b.top0 = ["bogus"];
  assert.ok(shortcutErrors(b).length);
});
test("shifted point keys retain quick-play mapping and preserve help, named keys and letters", () => {
  for (const [key, want] of [
    ["!", "1"],
    ["+", "="],
    ["{", "["],
    ["Q", "q"],
    ["?", "?"],
    [" ", "Space"],
    ["Enter", "Enter"],
  ])
    assert.equal(keyForEvent({ key, shiftKey: true }), want);
});

test("revised defaults migrate untouched bindings and retain user customizations", () => {
  assert.equal(
    shortcutAction(DEFAULT_SHORTCUTS, "c", "double"),
    "redouble",
  );
  assert.equal(shortcutAction(DEFAULT_SHORTCUTS, "Enter", "roll"), "roll");
  assert.equal(
    shortcutAction(DEFAULT_SHORTCUTS, "Enter", "opening"),
    "roll",
  );
  const old = {
    ...structuredClone(DEFAULT_SHORTCUTS),
    double: ["c", "d"],
    redouble: ["v"],
    roll: ["Space"],
  };
  assert.deepEqual(normalizeShortcuts(old), DEFAULT_SHORTCUTS);
  old.top0 = ["j"];
  assert.deepEqual(normalizeShortcuts(old), old);
});

test("undo shortcut is draft-only, including remapped keys", () => {
  for (const key of ["z", "j"]) {
    const bindings = {...DEFAULT_SHORTCUTS, undo:[key]};
    assert.equal(shortcutAction(bindings,key,"move"),"undo");
    for (const phase of ["roll","over","double","opening","setup"])
      assert.notEqual(shortcutAction(bindings,key,phase),"undo");
  }
});
