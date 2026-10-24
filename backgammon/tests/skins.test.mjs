import test from "node:test";
import assert from "node:assert/strict";
import {
  SKINS,
  SKIN_IDS,
  SKIN_PRESETS,
  DEFAULT_SKIN,
  skinById,
  validateSkin,
} from "../skins/index.mjs";
import { BOARD_PRESETS, COLOR_LABELS, paletteWarnings } from "../core/appearance.mjs";
import classic from "../skins/classic.mjs";

test("every registered skin satisfies the contract", () => {
  for (const skin of SKINS)
    assert.deepEqual(validateSkin(skin), [], skin.id);
});
test("classic comes first, ids and names are unique, and the registry resolves them", () => {
  assert.equal(SKINS[0], classic);
  assert.equal(DEFAULT_SKIN, "liquid-chrome");
  assert.ok(SKIN_IDS.includes(DEFAULT_SKIN));
  assert.equal(new Set(SKIN_IDS).size, SKINS.length);
  assert.equal(new Set(SKINS.map((s) => s.name.toLowerCase())).size, SKINS.length);
  for (const skin of SKINS) assert.equal(skinById(skin.id), skin);
  assert.equal(skinById("missing"), null);
  assert.equal(classic.shader, null);
  assert.equal(classic.css, "");
});
test("skin palettes are board presets: 34 keys, zero warnings, present in BOARD_PRESETS", () => {
  assert.equal(SKIN_PRESETS.length, SKINS.length - 1);
  for (const preset of SKIN_PRESETS) {
    assert.deepEqual(Object.keys(preset.colors).sort(), Object.keys(COLOR_LABELS).sort(), preset.id);
    assert.equal(Object.keys(preset.colors).length, 34);
    assert.deepEqual(paletteWarnings(preset.colors), [], preset.id);
    assert.equal(typeof preset.name, "string");
    assert.equal(typeof preset.description, "string");
    assert.equal(BOARD_PRESETS.find((p) => p.id === preset.id)?.colors, preset.colors);
    assert.ok(!["slate", "midnight", "forest", "linen", "plum", "graphite"].includes(preset.id));
  }
  assert.equal(BOARD_PRESETS.length, 24 + SKIN_PRESETS.length);
  assert.equal(BOARD_PRESETS[0].id, "slate");
  assert.deepEqual(classic.board, BOARD_PRESETS[0].colors);
});
test("validateSkin reports every contract breach", () => {
  const broken = {
    ...classic,
    id: "Bad Id",
    name: "A four word name",
    tokens: { ...classic.tokens, ink: "#111111", page: "red" },
    board: { ...classic.board, frame: "#abc", numbers: "#AABBCC" },
    css: ".topbar { position: fixed; color: red !important }",
    defs: '<linearGradient id="ember-sky"></linearGradient>',
    shader: { fragment: "#extension x\nvoid main(){}", colors: ["#fff"], speed: 0, fps: 24, stillAt: -1 },
    preview: "url(http://x)",
  };
  const problems = validateSkin(broken);
  for (const needle of [
    "id must be", "name must be", "tokens.page", "contrast ink/surface", "board.frame",
    "Point numbers", "!important", "position: fixed", 'selector ".topbar"', 'defs id "ember-sky"',
    "gl_FragColor", "#extension", "shader.colors", "shader.speed", "shader.fps", "shader.stillAt", "preview",
  ])
    assert.ok(problems.some((p) => p.includes(needle)), `${needle}: ${problems.join(" | ")}`);
  assert.deepEqual(validateSkin(null), ["skin is not an object"]);
  assert.deepEqual(validateSkin({ ...classic, css: 'html[data-skin="classic"] .panel { border-radius: 0 }\n@media (min-width: 600px) { html[data-skin="classic"] .btn, html[data-skin="classic"] .tile { padding: 0 } }' }), []);
  assert.ok(validateSkin({ ...classic, css: '@media (min-width: 600px) { .btn { padding: 0 } }' }).length);
});
test("the skin setting is allow-listed and the boot cache falls back to the default", async () => {
  const previous = globalThis.localStorage;
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
  };
  try {
    const { settings, saveSettings, normalizeSkin, PREFIX } = await import("../core/storage.mjs");
    assert.equal(settings().skin, DEFAULT_SKIN);
    assert.equal(settings().boardTheme.preset, "plum");
    for (const junk of [null, 42, "", "nope", "Classic", "../classic", { id: "classic" }])
      assert.equal(normalizeSkin(junk), DEFAULT_SKIN, String(junk));
    for (const id of SKIN_IDS) assert.equal(normalizeSkin(id), id);
    saveSettings({ skin: "not-a-skin", orientation: 1 });
    assert.equal(settings().skin, DEFAULT_SKIN);
    assert.equal(settings().orientation, 1);
    assert.equal(JSON.parse(memory.get(PREFIX + "settings")).skin, DEFAULT_SKIN);
    memory.set(PREFIX + "settings", JSON.stringify({ skin: SKIN_IDS.at(-1), extra: true }));
    assert.equal(settings().skin, SKIN_IDS.at(-1));
    assert.equal(settings().extra, true, "unknown keys still pass through");
    saveSettings({skin:"tidal",boardTheme:{version:1,preset:"linen",colors:{frame:"#123456"}}});
    assert.equal(settings().skin,"tidal","a chosen skin survives the new default");
    assert.equal(settings().boardTheme.preset,"linen");
    assert.equal(settings().boardTheme.colors.frame,"#123456");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
