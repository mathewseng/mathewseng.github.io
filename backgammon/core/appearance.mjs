// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only. Keys are an allowlist: stored colors never become CSS text.
export const COLOR_GROUPS = [
  {
    name: "Board surfaces",
    keys: ["frame", "border", "surface", "bar", "tray"],
  },
  {
    name: "Points & labels",
    keys: ["pointA", "pointB", "numbers", "barLabel", "trayLabel", "caption"],
  },
  { name: "Ivory checkers", keys: ["checker0", "rim0", "detail0", "count0"] },
  { name: "Teal checkers", keys: ["checker1", "rim1", "detail1", "count1"] },
  {
    name: "Dice",
    keys: ["die0", "pips0", "dieBorder0", "die1", "pips1", "dieBorder1"],
  },
  { name: "Doubling cube", keys: ["cube", "cubeText", "cubeBorder"] },
  {
    name: "Move highlights",
    keys: [
      "source",
      "selection",
      "destination",
      "destinationText",
      "hover",
      "focus",
    ],
  },
];
export const COLOR_LABELS = {
  frame: "Frame",
  border: "Frame edge & divider",
  surface: "Playing surface",
  bar: "Center bar",
  tray: "Bearoff trays",
  pointA: "Points · first color",
  pointB: "Points · second color",
  numbers: "Point numbers",
  barLabel: "Bar labels",
  trayLabel: "Bearoff labels & counts",
  caption: "Board caption",
  checker0: "Ivory · face",
  rim0: "Ivory · edge",
  detail0: "Ivory · inset ring",
  count0: "Ivory · count",
  checker1: "Teal · face",
  rim1: "Teal · edge",
  detail1: "Teal · inset ring",
  count1: "Teal · count",
  die0: "Ivory die · face",
  pips0: "Ivory die · pips",
  dieBorder0: "Ivory die · edge",
  die1: "Teal die · face",
  pips1: "Teal die · pips",
  dieBorder1: "Teal die · edge",
  cube: "Cube face",
  cubeText: "Cube number",
  cubeBorder: "Cube edge",
  source: "Movable checker rings",
  selection: "Selected checker",
  destination: "Legal destinations",
  destinationText: "Destination die numbers",
  hover: "Hover feedback",
  focus: "Keyboard focus",
};
const slate = {
  frame: "#202B30",
  border: "#435158",
  surface: "#172126",
  bar: "#38474C",
  tray: "#28373B",
  pointA: "#AA967C",
  pointB: "#536B70",
  numbers: "#C8D4D5",
  barLabel: "#C3D0D0",
  trayLabel: "#D6DFDB",
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
  hover: "#A8D7CC",
  focus: "#E1FBA7",
};
function preset(id, name, description, colors = {}) {
  return Object.freeze({
    id,
    name,
    description,
    colors: Object.freeze({ ...slate, ...colors }),
  });
}
// Additional palettes use the same tested hierarchy, with distinct surfaces and sides.
function cleanPreset(id, name, light, frame, surface, pointA, pointB, accent) {
  const text = light ? "#25322E" : "#EEEFE7",
    ink = light ? "#FFFFFF" : "#13221D";
  const highlight = light ? "#163E79" : "#F5D47E";
  return preset(
    id,
    name,
    light
      ? "Light surface · strong checker contrast"
      : "Dark surface · clear, quiet contrast",
    {
      frame,
      surface,
      bar: frame,
      tray: frame,
      border: light ? "#77867B" : "#738781",
      pointA,
      pointB,
      numbers: text,
      barLabel: text,
      trayLabel: text,
      caption: text,
      checker0: "#FFF9E9",
      rim0: "#867861",
      detail0: "#B9AA8F",
      count0: "#202A25",
      checker1: accent,
      rim1: light ? "#1B302C" : "#30443D",
      detail1: light ? "#819C95" : "#4B685E",
      count1: ink,
      die0: "#FFF9E9",
      pips0: "#202A25",
      dieBorder0: "#867861",
      die1: accent,
      pips1: ink,
      dieBorder1: "#30443D",
      cube: "#FFF9E9",
      cubeText: "#202A25",
      cubeBorder: "#867861",
      source: highlight,
      selection: highlight,
      destination: highlight,
      destinationText: light ? "#FFFFFF" : "#172126",
      hover: highlight,
      focus: light ? "#651870" : "#B5E6FF",
    },
  );
}
export const BOARD_PRESETS = Object.freeze([
  preset("slate", "Slate", "Ivory & sea glass"),
  preset("midnight", "Midnight", "Ink & warm coral", {
    frame: "#151F33",
    border: "#4F6381",
    surface: "#0D1629",
    bar: "#24344D",
    tray: "#1C2B43",
    pointA: "#AC846C",
    pointB: "#395577",
    numbers: "#CCD7E8",
    barLabel: "#BACBE0",
    trayLabel: "#CCD7E8",
    caption: "#AFC2DD",
    checker0: "#E8E6DD",
    rim0: "#AAA994",
    detail0: "#C9C6B6",
    count0: "#17202E",
    checker1: "#DD9076",
    rim1: "#693B35",
    detail1: "#B56A56",
    count1: "#291912",
    die0: "#E8E6DD",
    pips0: "#17202E",
    dieBorder0: "#AAA994",
    die1: "#DD9076",
    pips1: "#291912",
    dieBorder1: "#B56A56",
    cube: "#E8E6DD",
    cubeText: "#17202E",
    cubeBorder: "#AAA994",
    source: "#A9CDFB",
    selection: "#A9CDFB",
    destination: "#A9CDFB",
    destinationText: "#0D1629",
    hover: "#A9CDFB",
    focus: "#FFE5A0",
  }),
  preset("forest", "Forest", "Moss & terracotta", {
    frame: "#283D36",
    border: "#5E7969",
    surface: "#152C24",
    bar: "#375346",
    tray: "#243E32",
    pointA: "#B39D74",
    pointB: "#567960",
    numbers: "#DDDCC5",
    barLabel: "#DEDCC5",
    trayLabel: "#DDDCC5",
    caption: "#C5D1BD",
    checker0: "#F0E8D2",
    rim0: "#B5A886",
    detail0: "#D3C5A5",
    count0: "#202B20",
    checker1: "#D18C70",
    rim1: "#653E2D",
    detail1: "#A66650",
    count1: "#241713",
    die0: "#F0E8D2",
    pips0: "#202B20",
    dieBorder0: "#B5A886",
    die1: "#D18C70",
    pips1: "#241713",
    dieBorder1: "#A66650",
    cube: "#F0E8D2",
    cubeText: "#202B20",
    cubeBorder: "#B5A886",
    source: "#D4E9AB",
    selection: "#D4E9AB",
    destination: "#D4E9AB",
    destinationText: "#152C24",
    hover: "#D4E9AB",
    focus: "#A8DDF9",
  }),
  preset("linen", "Linen", "Parchment & deep teal", {
    frame: "#D2C7B3",
    border: "#8A7A62",
    surface: "#F0E9DC",
    bar: "#C0AE93",
    tray: "#DFD3BE",
    pointA: "#B8906C",
    pointB: "#5E7E7F",
    numbers: "#40382E",
    barLabel: "#40382E",
    trayLabel: "#40382E",
    caption: "#635548",
    checker0: "#FFFDF5",
    rim0: "#786B52",
    detail0: "#BAAA8E",
    count0: "#282C27",
    checker1: "#31585A",
    rim1: "#182F30",
    detail1: "#729798",
    count1: "#FFFFFF",
    die0: "#FFFDF5",
    pips0: "#282C27",
    dieBorder0: "#786B52",
    die1: "#31585A",
    pips1: "#FFFFFF",
    dieBorder1: "#182F30",
    cube: "#FFFDF5",
    cubeText: "#282C27",
    cubeBorder: "#786B52",
    source: "#123F75",
    selection: "#123F75",
    destination: "#123F75",
    destinationText: "#FFFFFF",
    hover: "#123F75",
    focus: "#631B80",
  }),
  preset("plum", "Plum", "Aubergine & lavender", {
    frame: "#352B3E",
    border: "#76617E",
    surface: "#211C2C",
    bar: "#4D3C56",
    tray: "#3E3048",
    pointA: "#B29191",
    pointB: "#75617D",
    numbers: "#E4D7E5",
    barLabel: "#E4D7E5",
    trayLabel: "#E4D7E5",
    caption: "#CABBD2",
    checker0: "#F4E7D6",
    rim0: "#B6A08F",
    detail0: "#D5C5AE",
    count0: "#2E2130",
    checker1: "#C49EC6",
    rim1: "#513C59",
    detail1: "#946E9B",
    count1: "#2E2130",
    die0: "#F4E7D6",
    pips0: "#2E2130",
    dieBorder0: "#B6A08F",
    die1: "#C49EC6",
    pips1: "#2E2130",
    dieBorder1: "#946E9B",
    cube: "#F4E7D6",
    cubeText: "#2E2130",
    cubeBorder: "#B6A08F",
    source: "#AEDCCC",
    selection: "#AEDCCC",
    destination: "#AEDCCC",
    destinationText: "#211C2C",
    hover: "#AEDCCC",
    focus: "#FFDBA0",
  }),
  preset("graphite", "Graphite", "Stone & powder blue", {
    frame: "#272B2E",
    border: "#656E75",
    surface: "#141719",
    bar: "#3E454A",
    tray: "#2B3237",
    pointA: "#B9B5A9",
    pointB: "#646B70",
    numbers: "#E3E5E6",
    barLabel: "#D2D8DC",
    trayLabel: "#E3E5E6",
    caption: "#BBC4CA",
    checker0: "#FFFDF3",
    rim0: "#BCB9AD",
    detail0: "#D8D4C8",
    count0: "#171D22",
    checker1: "#729DC7",
    rim1: "#284561",
    detail1: "#4A749C",
    count1: "#101D2A",
    die0: "#FFFDF3",
    pips0: "#171D22",
    dieBorder0: "#BCB9AD",
    die1: "#729DC7",
    pips1: "#101D2A",
    dieBorder1: "#4A749C",
    cube: "#FFFDF3",
    cubeText: "#171D22",
    cubeBorder: "#BCB9AD",
    source: "#FFD78C",
    selection: "#FFD78C",
    destination: "#FFD78C",
    destinationText: "#141719",
    hover: "#FFD78C",
    focus: "#A8E5FA",
  }),
  cleanPreset(
    "ocean",
    "Ocean",
    false,
    "#203A48",
    "#132C38",
    "#C0AA87",
    "#52778A",
    "#8EB9D1",
  ),
  cleanPreset(
    "navy",
    "Navy",
    false,
    "#202C43",
    "#101C30",
    "#BCAA91",
    "#4B668B",
    "#E3A67A",
  ),
  cleanPreset(
    "spruce",
    "Spruce",
    false,
    "#263B34",
    "#142921",
    "#BEAD84",
    "#526F59",
    "#8DBFA2",
  ),
  cleanPreset(
    "olive",
    "Olive",
    false,
    "#363B29",
    "#252A1B",
    "#C0AC79",
    "#67734F",
    "#C2B66F",
  ),
  cleanPreset(
    "walnut",
    "Walnut",
    false,
    "#40322B",
    "#2A201B",
    "#B69874",
    "#695347",
    "#87BBAA",
  ),
  cleanPreset(
    "copper",
    "Copper",
    false,
    "#3D302C",
    "#281F1D",
    "#BEA082",
    "#795848",
    "#DB9A73",
  ),
  cleanPreset(
    "claret",
    "Claret",
    false,
    "#402C35",
    "#2B1C25",
    "#C1A294",
    "#795767",
    "#C58EAA",
  ),
  cleanPreset(
    "indigo",
    "Indigo",
    false,
    "#302E4A",
    "#201E33",
    "#BBA791",
    "#67628A",
    "#A8A2DB",
  ),
  cleanPreset(
    "steel",
    "Steel",
    false,
    "#2D3840",
    "#1B252D",
    "#B5B1A0",
    "#5C7382",
    "#8CC5C8",
  ),
  cleanPreset(
    "carbon",
    "Carbon",
    false,
    "#282828",
    "#101010",
    "#B3B3AB",
    "#565A5B",
    "#E1B755",
  ),
  cleanPreset(
    "paper",
    "Paper",
    true,
    "#D7DED9",
    "#F4F5EC",
    "#B9A884",
    "#667C72",
    "#2D594B",
  ),
  cleanPreset(
    "sand",
    "Sand",
    true,
    "#DDCDB1",
    "#F4EAD6",
    "#B69C74",
    "#756E57",
    "#514D32",
  ),
  cleanPreset(
    "glacier",
    "Glacier",
    true,
    "#C6D9E0",
    "#EDF5F7",
    "#B4BAC0",
    "#63869B",
    "#245578",
  ),
  cleanPreset(
    "mist",
    "Mist",
    true,
    "#CBDAD6",
    "#EDF3EF",
    "#ADBDB0",
    "#66877C",
    "#315E53",
  ),
  cleanPreset(
    "sage",
    "Sage",
    true,
    "#CFD9BF",
    "#EFF2E3",
    "#B5BD9F",
    "#788565",
    "#3A583D",
  ),
  cleanPreset(
    "rose",
    "Rose",
    true,
    "#DFCBCD",
    "#F8EFEB",
    "#C0ABAD",
    "#95737E",
    "#703D55",
  ),
  cleanPreset(
    "chalk",
    "Chalk",
    true,
    "#D4D4CF",
    "#FAFAF2",
    "#BDBCB1",
    "#737873",
    "#333F3B",
  ),
  cleanPreset(
    "amber",
    "Amber",
    true,
    "#DFC99D",
    "#F7EDDA",
    "#C3A773",
    "#93784D",
    "#654A23",
  ),
]);
export const DEFAULT_BOARD_THEME = Object.freeze({
  version: 1,
  preset: "slate",
  colors: Object.freeze({}),
});
export const PATTERN_ELEMENTS = Object.freeze({
  frame: "Frame",
  surface: "Playing surface",
  bar: "Center bar",
  tray: "Bearoff trays",
  pointA: "Points · first color",
  pointB: "Points · second color",
  checker0: "Ivory checkers",
  checker1: "Teal checkers",
  die0: "Ivory dice",
  die1: "Teal dice",
  cube: "Doubling cube",
});
export const PATTERN_KINDS = Object.freeze([
  "solid",
  "lines",
  "dots",
  "crosshatch",
  "waves",
]);
export function elementPattern(theme, key) {
  const palette = boardPalette(theme);
  return {
    kind: "solid",
    ink: contrastRatio(palette[key], "#FFFFFF") > 3 ? "#FFFFFF" : "#000000",
    size: 18,
    opacity: 0.16,
    angle: 45,
    ...theme?.patterns?.[key],
  };
}
export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return null;
  return (
    "#" +
    (hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex).toUpperCase()
  );
}
export function normalizeBoardTheme(value) {
  const base =
    BOARD_PRESETS.find((p) => p.id === value?.preset) || BOARD_PRESETS[0];
  const colors = {};
  if (value?.version === 1 && value.colors && typeof value.colors === "object")
    for (const key of Object.keys(COLOR_LABELS)) {
      const color = normalizeHex(value.colors[key]);
      if (color && color !== base.colors[key]) colors[key] = color;
    }
  const patterns = {};
  if (
    value?.version === 1 &&
    value.patterns &&
    typeof value.patterns === "object"
  )
    for (const key of Object.keys(PATTERN_ELEMENTS)) {
      const p = value.patterns[key];
      if (
        !p ||
        !PATTERN_KINDS.includes(p.kind) ||
        p.kind === "solid" ||
        !normalizeHex(p.ink)
      )
        continue;
      if (
        ![p.size, p.opacity, p.angle].every(Number.isFinite) ||
        p.size < 8 ||
        p.size > 40 ||
        p.opacity < 0.05 ||
        p.opacity > 0.35 ||
        ![0, 45, 90, 135].includes(p.angle)
      )
        continue;
      patterns[key] = {
        kind: p.kind,
        ink: normalizeHex(p.ink),
        size: p.size,
        opacity: p.opacity,
        angle: p.angle,
      };
    }
  return {
    version: 1,
    preset: base.id,
    colors,
    ...(Object.keys(patterns).length ? { patterns } : {}),
  };
}
export function boardPalette(value) {
  const theme = normalizeBoardTheme(value);
  return {
    ...BOARD_PRESETS.find((p) => p.id === theme.preset).colors,
    ...theme.colors,
  };
}
export const colorProperty = (key) =>
  "--board-" + key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
export const boardColor = (key) => `var(${colorProperty(key)}, ${slate[key]})`;
export function applyBoardTheme(value, node = document.documentElement) {
  const theme = normalizeBoardTheme(value),
    palette = boardPalette(theme);
  for (const [key, color] of Object.entries(palette))
    node.style.setProperty(colorProperty(key), color);
  const namespace = "http://www.w3.org/2000/svg";
  const make = (name, attrs) => {
    const n = document.createElementNS(namespace, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  let root;
  if (node === document.documentElement) {
    root = document.getElementById("board-pattern-definitions");
    if (!root) {
      root = make("svg", {
        id: "board-pattern-definitions",
        width: 0,
        height: 0,
        "aria-hidden": true,
        focusable: false,
        style: "position:absolute;pointer-events:none",
      });
      document.body.append(root);
    }
    root.replaceChildren();
  }
  for (const key of Object.keys(PATTERN_ELEMENTS)) {
    const p = elementPattern(theme, key),
      id = `bg-pattern-${key}`;
    node.style.setProperty(
      `--pattern-${key}`,
      p.kind === "solid" ? "transparent" : `url(#${id})`,
    );
    if (p.kind === "solid") {
      node.style.setProperty(`--pattern-css-${key}`, "none");
      continue;
    }
    const pattern = make("pattern", {
      id,
      width: p.size,
      height: p.size,
      patternUnits: "userSpaceOnUse",
      patternTransform: `rotate(${p.angle})`,
    });
    const group = make("g", {
      stroke: p.ink,
      fill: "none",
      "stroke-width": 1.5,
      opacity: p.opacity,
    });
    if (p.kind === "dots")
      group.append(
        make("circle", {
          cx: p.size / 2,
          cy: p.size / 2,
          r: 1.8,
          fill: p.ink,
          stroke: "none",
        }),
      );
    else
      group.append(
        make("path", {
          d:
            p.kind === "waves"
              ? `M0 ${p.size / 2} Q${p.size / 4} 0 ${p.size / 2} ${p.size / 2} T${p.size} ${p.size / 2}`
              : p.kind === "crosshatch"
                ? `M0 0H${p.size}M0 0V${p.size}`
                : `M0 0H${p.size}`,
        }),
      );
    pattern.append(group);
    // Reuse the very same tile for HTML opening dice and SVG board elements.
    const tile = make("svg", {
      xmlns: namespace,
      width: p.size / 2,
      height: p.size / 2,
      viewBox: `0 0 ${p.size} ${p.size}`,
    });
    tile.append(
      pattern.cloneNode(true),
      make("rect", { width: p.size, height: p.size, fill: `url(#${id})` }),
    );
    const image = encodeURIComponent(
      new XMLSerializer().serializeToString(tile),
    );
    node.style.setProperty(
      `--pattern-css-${key}`,
      `url("data:image/svg+xml,${image}")`,
    );
    if (root) root.append(pattern);
  }
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
    ["barLabel", "bar"],
    ["trayLabel", "tray"],
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
      warnings.push(`${COLOR_LABELS[key]} has low contrast against the board.`);
  return warnings;
}
