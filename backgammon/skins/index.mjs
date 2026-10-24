// SPDX-License-Identifier: GPL-3.0-or-later
// Skin registry (skin-contract.md §1). DOM-free. Imports only skin modules and
// core/palette.mjs, never core/appearance.mjs: appearance.mjs builds
// BOARD_PRESETS from SKIN_PRESETS below, so an import the other way would be a
// cycle that fails whenever this registry is the first module evaluated.
import {
  COLOR_LABELS,
  contrastRatio,
  normalizeHex,
  paletteWarnings,
} from "../core/palette.mjs";
import classic from "./classic.mjs";
// skins: one import line per module in backgammon/skins/<id>.mjs, and the same
// identifier in the SKINS list right below (classic stays first; the rest in
// picker order: six dark, then six light).
import gloaming from "./gloaming.mjs";
import phosphorTerminal from "./phosphor-terminal.mjs";
import chryslerLacquer from "./chrysler-lacquer.mjs";
import tidal from "./tidal.mjs";
import obsidian from "./obsidian.mjs";
import baizeMahogany from "./baize-mahogany.mjs";
import ukiyoEWoodblock from "./ukiyo-e-woodblock.mjs";
import carraraVerde from "./carrara-verde.mjs";
import oneBitMac from "./one-bit-mac.mjs";
import dessauPrimary from "./dessau-primary.mjs";
import dune from "./dune.mjs";
import nacreShell from "./nacre-shell.mjs";
// modern set: shader-forward themes
import meshGradient from "./mesh-gradient.mjs";
import liquidChrome from "./liquid-chrome.mjs";
import aurora from "./aurora.mjs";
import halftone from "./halftone.mjs";
import frosted from "./frosted.mjs";
import neonGrid from "./neon-grid.mjs";
import inkFlow from "./ink-flow.mjs";
import cells from "./cells.mjs";
import flowField from "./flow-field.mjs";
import prism from "./prism.mjs";
import topography from "./topography.mjs";
import nebula from "./nebula.mjs";

export const SKINS = Object.freeze([
  classic,
  gloaming,
  phosphorTerminal,
  chryslerLacquer,
  tidal,
  obsidian,
  baizeMahogany,
  ukiyoEWoodblock,
  carraraVerde,
  oneBitMac,
  dessauPrimary,
  dune,
  nacreShell,
  meshGradient,
  liquidChrome,
  aurora,
  halftone,
  frosted,
  neonGrid,
  inkFlow,
  cells,
  flowField,
  prism,
  topography,
  nebula,
]);
export const SKIN_IDS = Object.freeze(SKINS.map((skin) => skin.id));
export const DEFAULT_SKIN = "liquid-chrome";
// The board preset a skin carries (classic keeps the house slate palette).
export const skinPreset = (id) => (id === "classic" ? "slate" : id);
export const DEFAULT_SKIN_BOARD_THEME = Object.freeze({
  version: 1,
  preset: "plum",
  colors: Object.freeze({}),
});
export function skinById(id) {
  return SKINS.find((skin) => skin.id === id) || null;
}
// Board palettes shaped like BOARD_PRESETS entries; classic reuses slate.
export const SKIN_PRESETS = Object.freeze(
  SKINS.filter((skin) => skin.id !== "classic").map((skin) =>
    Object.freeze({
      id: skin.id,
      name: skin.name,
      description: skin.description,
      colors: Object.freeze({ ...skin.board }),
    }),
  ),
);

export const BOARD_KEYS = Object.freeze(Object.keys(COLOR_LABELS));
const HEX_TOKENS = [
  "page", "surface", "surface2", "surface3", "lineOpaque", "ink", "muted",
  "soft", "accent", "accent2", "onAccent", "good", "bad", "warn", "info",
];
const ALPHA_TOKENS = [
  "glass", "line", "lineStrong", "controlBorder", "accentSoft",
  "goodSoft", "badSoft", "warnSoft", "infoSoft",
];
const OPTIONAL_TOKENS = [
  "radiusSm", "radiusMd", "radiusLg", "radiusPill",
  "shadowTile", "shadowRaised", "shadowSheet", "fontSans", "fontMono",
];
const HEX = /^#[0-9A-F]{6}$/;
const ANY_HEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0?\.\d+|1|0)\s*)?\)$/;

// Every rule selector in a skin stylesheet (comments, at-rule bodies and
// declaration blocks stripped) for the "starts with html[data-skin]" check.
function selectorsOf(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") {
      const head = stripped.slice(start, i).trim();
      if (head && !head.startsWith("@"))
        for (const part of head.split(","))
          selectors.push(part.trim());
      depth++;
      start = i + 1;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      start = i + 1;
    } else if (ch === ";" && depth > 0) start = i + 1;
  }
  return selectors;
}

// Contract §2 validation. Returns problems (strings); [] means the skin passes.
export function validateSkin(skin) {
  const problems = [];
  const bad = (text) => problems.push(text);
  if (!skin || typeof skin !== "object") return ["skin is not an object"];
  const tag = skin.id || "?";
  if (typeof skin.id !== "string" || !/^[a-z][a-z0-9-]{1,23}$/.test(skin.id))
    bad(`${tag}: id must be kebab-case, 2–24 chars`);
  if (typeof skin.name !== "string" || !/^\S+(?: \S+){0,2}$/.test(skin.name.trim()))
    bad(`${tag}: name must be one to three words`);
  if (typeof skin.description !== "string" || !skin.description.trim())
    bad(`${tag}: description must be a short sentence`);
  if (skin.scheme !== "dark" && skin.scheme !== "light")
    bad(`${tag}: scheme must be "dark" or "light"`);
  const tokens = skin.tokens && typeof skin.tokens === "object" ? skin.tokens : null;
  if (!tokens) bad(`${tag}: tokens missing`);
  else {
    for (const key of HEX_TOKENS)
      if (!ANY_HEX.test(tokens[key] || ""))
        bad(`${tag}: tokens.${key} must be #RRGGBB`);
    for (const key of ALPHA_TOKENS)
      if (!ANY_HEX.test(tokens[key] || "") && !RGBA.test(tokens[key] || ""))
        bad(`${tag}: tokens.${key} must be #RRGGBB or rgba()`);
    for (const key of Object.keys(tokens))
      if (
        !HEX_TOKENS.includes(key) &&
        !ALPHA_TOKENS.includes(key) &&
        !OPTIONAL_TOKENS.includes(key)
      )
        bad(`${tag}: tokens.${key} is not a contract token`);
      else if (typeof tokens[key] !== "string" || /[{};]|url\(|@import/i.test(tokens[key]))
        bad(`${tag}: tokens.${key} must be a plain CSS value`);
    const ratio = (a, b) =>
      ANY_HEX.test(tokens[a] || "") && ANY_HEX.test(tokens[b] || "")
        ? contrastRatio(tokens[a], tokens[b])
        : 0;
    const floors = [
      ["ink", "surface", 7],
      ["muted", "surface", 4.5],
      ["onAccent", "accent", 4.5],
      ["ink", "page", 7],
      ["good", "surface", 3],
      ["bad", "surface", 3],
      ["warn", "surface", 3],
      ["info", "surface", 3],
    ];
    for (const [a, b, floor] of floors)
      if (ratio(a, b) < floor)
        bad(`${tag}: contrast ${a}/${b} is ${ratio(a, b).toFixed(2)}, needs ${floor}`);
  }
  const board = skin.board && typeof skin.board === "object" ? skin.board : null;
  if (!board) bad(`${tag}: board missing`);
  else {
    const keys = Object.keys(board);
    for (const key of BOARD_KEYS)
      if (!HEX.test(board[key] || ""))
        bad(`${tag}: board.${key} must be uppercase #RRGGBB`);
    for (const key of keys)
      if (!BOARD_KEYS.includes(key)) bad(`${tag}: board.${key} is not a board key`);
    if (keys.length === BOARD_KEYS.length && keys.every((k) => normalizeHex(board[k])))
      for (const warning of paletteWarnings(board)) bad(`${tag}: board: ${warning}`);
  }
  if (skin.patterns !== undefined && (!skin.patterns || typeof skin.patterns !== "object"))
    bad(`${tag}: patterns must be an object when present`);
  const css = typeof skin.css === "string" ? skin.css : null;
  if (css === null) bad(`${tag}: css must be a string`);
  else {
    if (/!important/i.test(css)) bad(`${tag}: css uses !important`);
    if (/position\s*:\s*fixed/i.test(css)) bad(`${tag}: css uses position: fixed`);
    if (/@import/i.test(css)) bad(`${tag}: css uses @import`);
    if (/url\(\s*['"]?http/i.test(css)) bad(`${tag}: css loads a remote url()`);
    const prefix = `html[data-skin="${skin.id}"]`;
    for (const selector of selectorsOf(css))
      if (!selector.startsWith(prefix))
        bad(`${tag}: css selector "${selector}" does not start with ${prefix}`);
  }
  const defs = typeof skin.defs === "string" ? skin.defs : null;
  if (defs === null) bad(`${tag}: defs must be a string`);
  else
    for (const [, id] of defs.matchAll(/\sid\s*=\s*["']([^"']*)["']/g))
      if (!id.startsWith(`skin-${skin.id}-`))
        bad(`${tag}: defs id "${id}" must start with skin-${skin.id}-`);
  if (skin.shader !== null) {
    const shader = skin.shader && typeof skin.shader === "object" ? skin.shader : null;
    if (!shader) bad(`${tag}: shader must be null or an object`);
    else {
      const f = typeof shader.fragment === "string" ? shader.fragment : "";
      if (!f) bad(`${tag}: shader.fragment missing`);
      for (const needle of ["gl_FragColor", "u_time", "u_resolution"])
        if (!f.includes(needle)) bad(`${tag}: shader.fragment lacks ${needle}`);
      if (/#extension/.test(f)) bad(`${tag}: shader.fragment uses #extension`);
      if (
        !Array.isArray(shader.colors) ||
        shader.colors.length !== 4 ||
        !shader.colors.every((c) => ANY_HEX.test(c))
      )
        bad(`${tag}: shader.colors must be four #RRGGBB values`);
      if (!(Number.isFinite(shader.speed) && shader.speed > 0))
        bad(`${tag}: shader.speed must be a positive number`);
      if (shader.fps !== 60 && shader.fps !== 30)
        bad(`${tag}: shader.fps must be 60 or 30`);
      if (!(Number.isFinite(shader.stillAt) && shader.stillAt >= 0))
        bad(`${tag}: shader.stillAt must be a non-negative number`);
    }
  }
  if (
    typeof skin.preview !== "string" ||
    !/^(?:linear|radial|conic)-gradient\(/.test(skin.preview.trim()) ||
    /url\(/i.test(skin.preview)
  )
    bad(`${tag}: preview must be a gradient string`);
  return problems;
}
