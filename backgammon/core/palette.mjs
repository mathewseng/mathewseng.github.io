// SPDX-License-Identifier: GPL-3.0-or-later
// Pure colour helpers shared by core/appearance.mjs and skins/index.mjs.
//
// They live apart from appearance.mjs so the module graph has no cycle:
// appearance.mjs builds BOARD_PRESETS from skins/index.mjs (SKIN_PRESETS),
// and skins/index.mjs validates skins with contrastRatio/paletteWarnings. If
// skins/index.mjs imported appearance.mjs, importing the registry first would
// evaluate appearance.mjs before SKIN_PRESETS existed. appearance.mjs
// re-exports everything here, so callers keep importing from it.
export const COLOR_LABELS = {
  frame: "Frame",
  border: "Frame edge & divider",
  surface: "Playing surface",
  bar: "Center bar",
  tray: "Bearoff trays",
  pointA: "Points · first color",
  pointB: "Points · second color",
  numbers: "Point numbers",
  caption: "Board caption",
  checker0: "White · face",
  rim0: "White · edge",
  detail0: "White · inset ring",
  count0: "White · count",
  checker1: "Black · face",
  rim1: "Black · edge",
  detail1: "Black · inset ring",
  count1: "Black · count",
  die0: "White die · face",
  pips0: "White die · pips",
  dieBorder0: "White die · edge",
  die1: "Black die · face",
  pips1: "Black die · pips",
  dieBorder1: "Black die · edge",
  cube: "Cube face",
  cubeText: "Cube number",
  cubeBorder: "Cube edge",
  source: "Movable checker rings",
  selection: "Selected checker",
  destination: "Legal destinations",
  destinationText: "Destination die numbers",
  undo: "Undo destinations",
  undoText: "Undo destination labels",
  hover: "Hover feedback",
  focus: "Keyboard focus",
};
export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  return (
    "#" +
    (hex.length === 3
      ? [...hex].map((c) => c + c).join("")
      : hex
    ).toUpperCase()
  );
}
export function contrastRatio(a, b) {
  const luminance = (hex) => {
    const rgb = normalizeHex(hex)
      .slice(1)
      .match(/../g)
      .map((c) => {
        const s = parseInt(c, 16) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Helpful feedback, not a claim of a complete accessibility audit.
export function paletteWarnings(palette) {
  const pairs = [
    ["numbers", "frame"],
    ["caption", "surface"],
    ["count0", "checker0"],
    ["count1", "checker1"],
    ["pips0", "die0"],
    ["pips1", "die1"],
    ["cubeText", "cube"],
    ["destinationText", "destination"],
  ];
  const warnings = pairs
    .filter(([a, b]) => contrastRatio(palette[a], palette[b]) < 4.5)
    .map(([a]) => `${COLOR_LABELS[a]}: low contrast.`);
  if (contrastRatio(palette.checker0, palette.checker1) < 1.4)
    warnings.push("The two checker colors are difficult to distinguish.");
  if (contrastRatio(palette.pointA, palette.pointB) < 1.2)
    warnings.push("The two point colors are difficult to distinguish.");
  for (const key of ["source", "selection", "destination", "focus"])
    if (contrastRatio(palette[key], palette.surface) < 3)
      warnings.push(
        `${COLOR_LABELS[key]} has low contrast against the board.`,
      );
  return warnings;
}
