import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_PRESETS,
  COLOR_LABELS,
  normalizeHex,
  normalizeBoardTheme,
  boardPalette,
  contrastRatio,
  paletteWarnings,
} from "../core/appearance.mjs";

test("hex colors accept ordinary shorthand and reject CSS, alpha, objects and malformed input", () => {
  assert.equal(normalizeHex(" #abc "), "#AABBCC");
  assert.equal(normalizeHex("b3A05f"), "#B3A05F");
  for (const value of [
    null,
    {},
    123456,
    "",
    "#",
    "#12345",
    "#12345678",
    "red",
    "url(x)",
    "#fff;--bg:red",
    "#G12345",
  ])
    assert.equal(normalizeHex(value), null);
});
test("saved themes validate every key and fall back without changing a preset", () => {
  const normalized = normalizeBoardTheme({
    version: 1,
    preset: "forest",
    colors: {
      frame: "abc",
      surface: "url(javascript:x)",
      background: "#ffffff",
      checker0: null,
    },
  });
  assert.deepEqual(normalized, {
    version: 1,
    preset: "forest",
    colors: { frame: "#AABBCC" },
  });
  assert.equal(
    boardPalette(normalized).surface,
    BOARD_PRESETS.find((p) => p.id === "forest").colors.surface,
  );
  for (const value of [
    undefined,
    null,
    [],
    "bad",
    { version: 42, preset: "missing", colors: { frame: "#000000" } },
  ])
    assert.deepEqual(boardPalette(value), BOARD_PRESETS[0].colors);
  assert.deepEqual(
    normalizeBoardTheme({
      version: 1,
      preset: "slate",
      colors: { frame: "#202b30" },
    }).colors,
    {},
  );
});
test("presets cover every color and retain readable labels, dice and checker counts", () => {
  for (const preset of BOARD_PRESETS) {
    assert.deepEqual(
      Object.keys(preset.colors).sort(),
      Object.keys(COLOR_LABELS).sort(),
    );
    for (const color of Object.values(preset.colors))
      assert.equal(normalizeHex(color), color);
    assert.deepEqual(paletteWarnings(preset.colors), [], preset.name);
  }
  assert.equal(contrastRatio("#000", "#fff"), 21);
  const unreadable = {
    ...BOARD_PRESETS[0].colors,
    checker1: "#F0EADB",
    numbers: "#202B30",
    cubeText: "#F0EADB",
  };
  assert.deepEqual(paletteWarnings(unreadable), [
    "Point numbers: low contrast.",
    "Cube number: low contrast.",
    "The two checker colors are difficult to distinguish.",
  ]);
});
test("legacy settings, invalid persisted colors and a storage failure do not corrupt game data", async () => {
  const previous = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  };
  try {
    const { settings, saveSettings, PREFIX } =
      await import("../core/storage.mjs");
    memory.set(
      PREFIX + "settings",
      JSON.stringify({
        orientation: 1,
        motion: "reduce",
        numbers: false,
        preset: "standard",
      }),
    );
    assert.equal(settings().boardTheme.preset, "slate");
    saveSettings({
      boardTheme: {
        version: 1,
        preset: "linen",
        colors: { frame: "abc", bar: "bad CSS" },
      },
    });
    assert.equal(settings().orientation, 1);
    assert.equal(settings().preset, "standard");
    assert.equal(settings().numbers, false);
    assert.deepEqual(settings().boardTheme.colors, { frame: "#AABBCC" });
    memory.set(PREFIX + "settings", "malformed json");
    assert.equal(settings().boardTheme.preset, "slate");
    globalThis.localStorage.getItem = () => {
      throw new Error("Denied");
    };
    assert.equal(settings().boardTheme.preset, "slate");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
