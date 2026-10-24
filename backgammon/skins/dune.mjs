// SPDX-License-Identifier: GPL-3.0-or-later
// Dune: late-afternoon sand. A pale, warm light skin whose depth language is
// a hard, flat offset shadow cast by one low sun from the left; no blur, no
// glass, no bevels. The board is a shallow dish carved into the dune: baked
// clay frame, rippled sand surface with a hard inset lip, low-relief points
// that each throw a thin shadow off their right flank. Cool teal and indigo
// are reserved for move feedback so they pop against the whole warm field.
export default {
  id: "dune",
  name: "Dune",
  description: "Pale sand, terracotta and one low sun.",
  scheme: "light",
  tokens: {
    page: "#EFE4CF",
    surface: "#F8F1E3",
    surface2: "#E8DCC4",
    surface3: "#E0D2B5",
    glass: "rgba(248,241,227,.9)",
    line: "#D6C5A6",
    lineStrong: "#C2AD86",
    lineOpaque: "#D6C5A6",
    controlBorder: "#8A7558",
    ink: "#3A2A1C",
    muted: "#66523D",
    soft: "#75604A",
    accent: "#A33D1A",
    accent2: "#8A5A36",
    accentSoft: "rgba(180,70,31,.14)",
    onAccent: "#FFF6EA",
    good: "#2F6B3A",
    bad: "#8F2A1A",
    warn: "#7A5200",
    info: "#1F3A6E",
    goodSoft: "rgba(47,107,58,.14)",
    badSoft: "rgba(143,42,26,.14)",
    warnSoft: "rgba(122,82,0,.14)",
    infoSoft: "rgba(31,58,110,.14)",
    radiusSm: "6px",
    radiusMd: "6px",
    radiusLg: "8px",
    radiusPill: "999px",
    shadowTile: "3px 3px 0 rgba(58,42,28,.12)",
    shadowRaised: "6px 6px 0 rgba(58,42,28,.16)",
    shadowSheet: "0 -3px 0 rgba(58,42,28,.12)",
    fontSans:
      '"Avenir Next", Avenir, Seravek, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#96602F",
    border: "#6E4324",
    surface: "#EADBB8",
    bar: "#7A4E2C",
    tray: "#E0CFA6",
    pointA: "#B86A3E",
    pointB: "#C2A06A",
    numbers: "#FFF6EA",
    caption: "#5E4A35",
    checker0: "#FFFAF0",
    rim0: "#7A6549",
    detail0: "#EFE4CF",
    count0: "#2B1D12",
    checker1: "#2B1D12",
    rim1: "#6B4A2F",
    detail1: "#3F2C1C",
    count1: "#FFFAF0",
    die0: "#FFFAF0",
    pips0: "#2B1D12",
    dieBorder0: "#C9B89B",
    die1: "#2B1D12",
    pips1: "#FFFAF0",
    dieBorder1: "#6B4A2F",
    cube: "#2B1D12",
    cubeText: "#FFFAF0",
    cubeBorder: "#6B4A2F",
    source: "#0D4F5C",
    selection: "#0D4F5C",
    destination: "#0D4F5C",
    destinationText: "#FFF6EA",
    undo: "#8F2A1A",
    undoText: "#FFF6EA",
    hover: "#0D4F5C",
    focus: "#1F3A6E",
  },
  patterns: {},
  css: `
/* Type: medium-weight sans, tabular lining numerals, headings one step heavier. */
html[data-skin="dune"] body {
  font-weight: 500;
  line-height: 1.5;
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="dune"] h1 { font-weight: 700; letter-spacing: 0; }
html[data-skin="dune"] h2 { font-weight: 700; letter-spacing: 0; }
html[data-skin="dune"] h3 { font-weight: 700; letter-spacing: 0; }
html[data-skin="dune"] .tool-head h1 { font-weight: 700; letter-spacing: 0; }
html[data-skin="dune"] .hero h1 {
  font-weight: 700;
  letter-spacing: -0.01em;
  background: none;
  color: var(--ink);
  -webkit-text-fill-color: var(--ink);
}
html[data-skin="dune"] .panel-title { font-weight: 700; letter-spacing: 0; }

/* Chrome: flat surfaces, 1px lines, one hard cast shadow at low sun. */
html[data-skin="dune"] .topbar { border-bottom: 1px solid var(--line); }
html[data-skin="dune"] .crumbs a { border-radius: var(--r-sm); }
html[data-skin="dune"] .tool-nav a { border-radius: 0; font-weight: 700; }
html[data-skin="dune"] .tool-nav a[aria-current="page"] {
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--accent);
}
html[data-skin="dune"] .panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-tile);
}
html[data-skin="dune"] .panel--quiet { box-shadow: none; }
html[data-skin="dune"] .inspector { border-radius: var(--r-sm); }
html[data-skin="dune"] .tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-tile);
}
html[data-skin="dune"] .tile::before { display: none; }
html[data-skin="dune"] .tile::after { display: none; }
html[data-skin="dune"] .tile:hover {
  translate: -1px -1px;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-raised);
}
html[data-skin="dune"] .tile:focus-visible {
  translate: -1px -1px;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-raised);
}
html[data-skin="dune"] .hub-board-frame {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-tile);
}
html[data-skin="dune"] .player-strip { border-radius: var(--r-sm); }
html[data-skin="dune"] .player-strip.active {
  background: var(--surface-2);
  box-shadow: inset 3px 0 0 var(--accent);
}
html[data-skin="dune"] .player-strip .badge--accent { color: var(--ink); }
html[data-skin="dune"] .action-area { border-top: 1px solid var(--line); }

/* Buttons: surface with a cast shadow that collapses on press; primary is
   terracotta with cream ink; ghost is an ink keyline; danger is oxblood. */
html[data-skin="dune"] .btn {
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-tile);
  font-weight: 700;
}
html[data-skin="dune"] .btn:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="dune"] .btn:active {
  translate: 2px 2px;
  box-shadow: 1px 1px 0 var(--line-strong);
  background: var(--surface-3);
}
html[data-skin="dune"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
html[data-skin="dune"] .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 88%, var(--ink));
  border-color: color-mix(in oklab, var(--accent) 88%, var(--ink));
}
html[data-skin="dune"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 80%, var(--ink));
}
html[data-skin="dune"] .btn--ghost {
  background: transparent;
  border-color: var(--ink);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="dune"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--ink);
  color: var(--ink);
}
html[data-skin="dune"] .btn--ghost:active { box-shadow: none; }
html[data-skin="dune"] .btn--danger {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="dune"] .btn--danger:hover {
  background: color-mix(in oklab, var(--bad) 85%, var(--ink));
  border-color: color-mix(in oklab, var(--bad) 85%, var(--ink));
  color: var(--on-accent);
}
html[data-skin="dune"] .btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="dune"] #equity-toggle[aria-pressed="true"] { color: var(--ink); }

/* Segmented, tabs, fields: almost square, no pills. */
html[data-skin="dune"] .segmented {
  border-radius: var(--r-sm);
  border-color: var(--line);
  background: var(--surface-3);
}
html[data-skin="dune"] .segmented > label { border-radius: 4px; }
html[data-skin="dune"] .segmented > button { border-radius: 4px; }
html[data-skin="dune"] .segmented > label:has(input:checked) {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--ink);
}
html[data-skin="dune"] .segmented > button[aria-pressed="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--ink);
}
html[data-skin="dune"] .segmented > button[aria-checked="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--ink);
}
html[data-skin="dune"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--ink);
}
html[data-skin="dune"] .tabs > [role="tab"] { border-radius: 0; font-weight: 700; }
html[data-skin="dune"] .tabs--pill { border-radius: var(--r-sm); }
html[data-skin="dune"] .tabs--pill > [role="tab"] { border-radius: 4px; }
html[data-skin="dune"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]) {
  border-radius: var(--r-sm);
  border-color: var(--control-border);
  background: var(--surface);
  box-shadow: inset 2px 2px 0 var(--surface-2);
}
html[data-skin="dune"] .field select {
  border-radius: var(--r-sm);
  border-color: var(--control-border);
  background: var(--surface);
  box-shadow: inset 2px 2px 0 var(--surface-2);
}
html[data-skin="dune"] .field textarea {
  border-radius: var(--r-sm);
  border-color: var(--control-border);
  background: var(--surface);
  box-shadow: inset 2px 2px 0 var(--surface-2);
}

/* Dialogs and toasts: dialog is surface with the 6px cast shadow; toast is an
   ink block with cream text. */
html[data-skin="dune"] .dialog {
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}
html[data-skin="dune"] .toast {
  background: var(--ink);
  border: 1px solid var(--ink);
  border-radius: var(--r-sm);
  color: var(--surface);
  box-shadow: var(--shadow-tile);
}
html[data-skin="dune"] .toast .btn--ghost {
  color: var(--surface);
  border-color: transparent;
}
html[data-skin="dune"] .toast .btn--ghost:hover {
  background: var(--muted);
  color: var(--surface);
  border-color: transparent;
}

/* No glass anywhere: sticky bars go opaque surface instead of blurred. */
html[data-skin="dune"].skin-shader .play-page.setup-table .action-area {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="dune"].skin-shader .play-review .review-header {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="dune"].skin-shader .library-filters {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="dune"].skin-shader .docs-toc--sticky {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="dune"] .equity-meter { border-color: var(--ink); border-radius: 3px; }
html[data-skin="dune"] .equity-meter::after { border-top-color: var(--ink); }

/* Board. Surface: rippled sand with a hard inset lip (the carved dish).
   Trays: sand wells with the same lip. Bar: darker clay, 1px lit left edge. */
html[data-skin="dune"] .bg-board text { font-family: var(--font-sans); font-weight: 500; }
html[data-skin="dune"] .bg-board [data-pattern="surface"] {
  fill: var(--board-surface);
  filter: url(#skin-dune-dish);
}
html[data-skin="dune"] .bg-board [data-pattern="tray"] {
  fill: var(--board-tray);
  filter: url(#skin-dune-well);
}
html[data-skin="dune"] .bg-board [data-pattern="bar"] { fill: url(#skin-dune-bar); }

/* Points: sharp triangles, no outline, a thin shadow band along the right
   flank so they read as low relief under raking light. */
html[data-skin="dune"] .bg-board .point-shape { stroke: none; }
html[data-skin="dune"] .bg-board [data-pattern="pointA"][d*=" 38 L"] { fill: url(#skin-dune-relief-top); }
html[data-skin="dune"] .bg-board [data-pattern="pointB"][d*=" 38 L"] { fill: url(#skin-dune-relief-top); }
html[data-skin="dune"] .bg-board [data-pattern="pointA"][d*=" 622 L"] { fill: url(#skin-dune-relief-bottom); }
html[data-skin="dune"] .bg-board [data-pattern="pointB"][d*=" 622 L"] { fill: url(#skin-dune-relief-bottom); }

/* Checkers: flat face, 2px edge, and a hard offset shadow drawn as a crescent
   by the pattern overlay (enlarged, shifted 2px, transparent over the face). */
html[data-skin="dune"] .bg-board .checker > circle:first-child { stroke-width: 2; }
html[data-skin="dune"] .bg-board .checker > [data-pattern] {
  r: 29px;
  transform: translate(2.5px, 2.5px);
  fill: url(#skin-dune-cast);
}
html[data-skin="dune"] .bg-board .drag-checker .checker > [data-pattern] {
  r: 29px;
  transform: translate(6px, 6px);
  fill: url(#skin-dune-cast-drag);
}
/* Stack count: the inset ring becomes a solid pill in the opposite colour. */
html[data-skin="dune"] .bg-board .checker:not(.draft-undo-checker):has(text) > circle:nth-of-type(3) {
  r: 19px;
  stroke: none;
}
html[data-skin="dune"] .bg-board .checker[data-player="0"]:not(.draft-undo-checker):has(text) > circle:nth-of-type(3) { fill: var(--board-count0); }
html[data-skin="dune"] .bg-board .checker[data-player="0"]:not(.draft-undo-checker):has(text) > text { fill: var(--board-checker0); }
html[data-skin="dune"] .bg-board .checker[data-player="1"]:not(.draft-undo-checker):has(text) > circle:nth-of-type(3) { fill: var(--board-count1); }
html[data-skin="dune"] .bg-board .checker[data-player="1"]:not(.draft-undo-checker):has(text) > text { fill: var(--board-checker1); }

/* Dice and cube: hard shadow along the bottom-right edges, drawn as a dashed
   stroke of the shifted pattern overlay (62px rx 11 die; 52px rx 8 cube). */
html[data-skin="dune"] .bg-board .board-die-face > rect:first-child { stroke-width: 1.5; }
html[data-skin="dune"] .bg-board .board-die-face > [data-pattern] {
  fill: none;
  stroke: rgba(58,42,28,.38);
  stroke-width: 3;
  stroke-dasharray: 0 48.64 114.56 400;
  transform: translate(1.5px, 1.5px);
}
html[data-skin="dune"] .bg-board .board-cube .cube-face { stroke-width: 1.5; }
html[data-skin="dune"] .bg-board .board-cube > [data-pattern="cube"] {
  fill: none;
  stroke: rgba(58,42,28,.38);
  stroke-width: 3;
  stroke-dasharray: 0 42.28 97.13 400;
  transform: translate(1.5px, 1.5px);
}
`,
  defs: `
<filter id="skin-dune-dish" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="7" result="noise"/>
  <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.227 0 0 0 0 0.165 0 0 0 0 0.110 0.12 0 0 0 0" result="grain"/>
  <feOffset in="SourceAlpha" dx="5" dy="5" result="shifted"/>
  <feComposite in="SourceAlpha" in2="shifted" operator="out" result="lip"/>
  <feFlood flood-color="#3A2A1C" flood-opacity="0.22" result="shade"/>
  <feComposite in="shade" in2="lip" operator="in" result="inset"/>
  <feMerge result="art"><feMergeNode in="grain"/><feMergeNode in="inset"/></feMerge>
  <feComposite in="art" in2="SourceAlpha" operator="in"/>
</filter>
<filter id="skin-dune-well" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
  <feOffset in="SourceAlpha" dx="3" dy="3" result="shifted"/>
  <feComposite in="SourceAlpha" in2="shifted" operator="out" result="lip"/>
  <feFlood flood-color="#3A2A1C" flood-opacity="0.24" result="shade"/>
  <feComposite in="shade" in2="lip" operator="in"/>
</filter>
<linearGradient id="skin-dune-bar" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFAF0" stop-opacity="0.45"/>
  <stop offset="0.03" stop-color="#FFFAF0" stop-opacity="0.45"/>
  <stop offset="0.03" stop-color="#FFFAF0" stop-opacity="0"/>
  <stop offset="0.97" stop-color="#3A2A1C" stop-opacity="0"/>
  <stop offset="0.97" stop-color="#3A2A1C" stop-opacity="0.3"/>
  <stop offset="1" stop-color="#3A2A1C" stop-opacity="0.3"/>
</linearGradient>
<linearGradient id="skin-dune-relief-top" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0.5">
  <stop offset="0.772" stop-color="#3A2A1C" stop-opacity="0"/>
  <stop offset="0.772" stop-color="#3A2A1C" stop-opacity="0.3"/>
  <stop offset="1" stop-color="#3A2A1C" stop-opacity="0.3"/>
</linearGradient>
<linearGradient id="skin-dune-relief-bottom" gradientUnits="objectBoundingBox" x1="0" y1="1" x2="1" y2="0.5">
  <stop offset="0.772" stop-color="#3A2A1C" stop-opacity="0"/>
  <stop offset="0.772" stop-color="#3A2A1C" stop-opacity="0.3"/>
  <stop offset="1" stop-color="#3A2A1C" stop-opacity="0.3"/>
</linearGradient>
<radialGradient id="skin-dune-cast" gradientUnits="objectBoundingBox" cx="0.4569" cy="0.4569" r="0.5" spreadMethod="pad">
  <stop offset="0.985" stop-color="#3A2A1C" stop-opacity="0"/>
  <stop offset="1" stop-color="#3A2A1C" stop-opacity="0.38"/>
</radialGradient>
<radialGradient id="skin-dune-cast-drag" gradientUnits="objectBoundingBox" cx="0.3966" cy="0.3966" r="0.5" spreadMethod="pad">
  <stop offset="0.985" stop-color="#3A2A1C" stop-opacity="0"/>
  <stop offset="1" stop-color="#3A2A1C" stop-opacity="0.38"/>
</radialGradient>
`,
  shader: {
    fragment: `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_c1; // page sand
uniform vec3 u_c2; // trough sand
uniform vec3 u_c3; // lee-side shadow
uniform vec3 u_c4; // sunlit crest, pointer warmth
uniform float u_dark;

// Integer-safe hash (no sin, no 10-cell period on lattice inputs).
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}
// Ridged noise: crests where the fbm crosses its midline. The domain is
// sheared so ridges run diagonally, and creeps with time like wind-moved sand.
float height(vec2 p) {
  float n = fbm(rot(0.6) * p * 1.6 + vec2(u_time * 0.01, 0.0));
  return 1.0 - abs(2.0 * n - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = uv * vec2(aspect, 1.0);

  // Finite-difference normal of the dune field.
  float e = 0.006;
  float h = height(p);
  float hx = height(p + vec2(e, 0.0));
  float hy = height(p + vec2(0.0, e));
  float slope = 0.045;
  vec3 n = normalize(vec3((h - hx) / e * slope, (h - hy) / e * slope, 1.0));

  // One low sun from the left.
  vec3 sun = normalize(vec3(-0.7, 0.25, 0.65));
  float lit = clamp(dot(n, sun), 0.0, 1.0);
  float level = sun.z;
  float shade = (lit - level) / level; // 0 on flat sand, +lit, -shadowed

  vec3 col = u_c1;
  col = mix(col, u_c4, clamp(shade, 0.0, 1.0) * 0.55);
  col = mix(col, u_c3, clamp(-shade, 0.0, 1.0) * 0.8);
  col = mix(col, u_c2, (1.0 - h) * 0.3);

  // Settled sand: a fixed fine grain (static so the field never shimmers).
  float grain = hash21(floor(gl_FragCoord.xy)) - 0.5;
  col += grain * 0.015;

  // Pointer: a soft 250px patch warmed toward the sunlit tone.
  float d = length(gl_FragCoord.xy - u_pointer);
  float halo = 1.0 - smoothstep(0.0, 250.0, d);
  col = mix(col, u_c4, halo * halo * 0.25);

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#EFE4CF", "#E6D8BC", "#DCC9A6", "#F7ECD8"],
    speed: 1,
    fps: 30,
    stillAt: 3.5,
  },
  preview: "linear-gradient(135deg, #EFE4CF, #E2D2B4 55%, #A33D1A)",
};
