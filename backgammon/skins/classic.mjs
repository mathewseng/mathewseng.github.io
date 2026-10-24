// SPDX-License-Identifier: GPL-3.0-or-later
// The pre-skin look as a skin, and the reference shape for every other skin
// (docs/redesign/backgammon-themes/skin-contract.md §2). Tokens are the dark
// values from shared/tokens.css with the Backgammon family accent; the board
// is the slate preset; no page CSS, no defs, no shader.
//
// Shape (validated by skins/index.mjs validateSkin):
//   id          kebab-case, equals the file name, 2–24 chars
//   name        one or two words; the only user-visible text
//   description one short sentence (aria-label/title only)
//   scheme      "dark" | "light" → color-scheme and <meta theme-color>
//   tokens      page chrome; "#RRGGBB" except glass/line/lineStrong/
//               controlBorder/accentSoft/goodSoft/badSoft/warnSoft/infoSoft,
//               which may be rgba(); radius/shadow/font keys are optional
//   board       all 34 board keys, uppercase hex, zero paletteWarnings()
//   patterns    optional, same shape as boardTheme.patterns
//   css         rules whose every selector starts with html[data-skin="<id>"]
//   defs        SVG <defs> children whose ids start with skin-<id>-
//   shader      null, or { fragment, colors: [4 hex], speed, fps, stillAt }
//   preview     a CSS gradient string for the picker thumbnail
export default {
  id: "classic",
  name: "Classic",
  description: "The site's own dark chrome and the slate board.",
  scheme: "dark",
  tokens: {
    page: "#08090D",
    surface: "#10141C",
    surface2: "#151A24",
    surface3: "#1B2130",
    glass: "rgba(16,20,28,.66)",
    line: "rgba(148,163,184,.13)",
    lineStrong: "rgba(148,163,184,.24)",
    lineOpaque: "#262C36",
    controlBorder: "#5C6879",
    ink: "#EEF4FF",
    muted: "#9AA7B7",
    soft: "#6F7B8B",
    accent: "#9BD6C9",
    accent2: "#7CC8FF",
    accentSoft: "rgba(155,214,201,.14)",
    onAccent: "#0B0D12",
    good: "#8FD9B6",
    bad: "#E5655F",
    warn: "#F4C95D",
    info: "#7CC8FF",
    goodSoft: "rgba(143,217,182,.14)",
    badSoft: "rgba(229,101,95,.14)",
    warnSoft: "rgba(244,201,93,.14)",
    infoSoft: "rgba(124,200,255,.14)",
  },
  board: {
    frame: "#202B30",
    border: "#435158",
    surface: "#172126",
    bar: "#38474C",
    tray: "#28373B",
    pointA: "#AA967C",
    pointB: "#536B70",
    numbers: "#C8D4D5",
    caption: "#B9C6C4",
    checker0: "#F0EADB",
    rim0: "#B5AC97",
    detail0: "#CEC4AE",
    count0: "#18272A",
    checker1: "#72B8AD",
    rim1: "#234D49",
    detail1: "#52978C",
    count1: "#18272A",
    die0: "#EEEADE",
    pips0: "#1A2B2B",
    dieBorder0: "#B7B09F",
    die1: "#72B8AD",
    pips1: "#1A2B2B",
    dieBorder1: "#52978C",
    cube: "#F0EADB",
    cubeText: "#172126",
    cubeBorder: "#B5AC97",
    source: "#B6EEE0",
    selection: "#B6EEE0",
    destination: "#B6EEE0",
    destinationText: "#172126",
    undo: "#E9AD67",
    undoText: "#21180E",
    hover: "#A8D7CC",
    focus: "#E1FBA7",
  },
  patterns: {},
  css: "",
  defs: "",
  shader: null,
  preview: "linear-gradient(135deg, #08090D, #151A24 60%, #202B30)",
};
