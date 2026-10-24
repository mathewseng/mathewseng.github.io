// SPDX-License-Identifier: GPL-3.0-or-later
// Topography: a survey map of a landscape that never quite settles. Warm
// sand paper, contour lines drawn thin in ink, every fourth line heavier, the
// terrain rising a little under the pointer. Chrome is flat paper with
// hairline rules and 4px corners; pine is the only colour the map allows
// itself, orange is reserved for the move the player is about to make.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
export default {
  id: "topography",
  name: "Topography",
  description: "Contour lines in ink on warm sand.",
  scheme: "light",
  tokens: {
    page: "#F3EFE6",
    surface: "#FBF9F4",
    surface2: "#F1ECE1",
    surface3: "#E7E1D3",
    glass: "rgba(251,249,244,.9)",
    line: "rgba(34,34,31,.12)",
    lineStrong: "rgba(34,34,31,.24)",
    lineOpaque: "#E1DDD2",
    controlBorder: "rgba(34,34,31,.42)",
    ink: "#22221F",
    muted: "#6B6960",
    soft: "#8A877C",
    accent: "#1F6F5A",
    accent2: "#D97A2B",
    accentSoft: "rgba(31,111,90,.12)",
    onAccent: "#FFFFFF",
    good: "#2F7A4A",
    bad: "#B33A2B",
    warn: "#8A5A00",
    info: "#2B5F9E",
    goodSoft: "rgba(47,122,74,.12)",
    badSoft: "rgba(179,58,43,.12)",
    warnSoft: "rgba(138,90,0,.12)",
    infoSoft: "rgba(43,95,158,.12)",
    radiusSm: "4px",
    radiusMd: "4px",
    radiusLg: "4px",
    radiusPill: "4px",
    shadowTile: "none",
    shadowRaised: "0 16px 40px -20px rgba(34,34,31,.3)",
    shadowSheet: "0 -1px 0 rgba(34,34,31,.08)",
    fontSans:
      '"Avenir Next", Avenir, Seravek, "Gill Sans", "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#E6DFD0",
    border: "#CFC7B6",
    surface: "#F6F2E9",
    bar: "#22221F",
    tray: "#EEE8DB",
    pointA: "#1F6F5A",
    pointB: "#CDB996",
    numbers: "#3D3C36",
    caption: "#5E5C53",
    checker0: "#FFFFFF",
    rim0: "#22221F",
    detail0: "#DAD5CA",
    count0: "#22221F",
    checker1: "#2A2A26",
    rim1: "#FFFFFF",
    detail1: "#4A4A44",
    count1: "#FFFFFF",
    die0: "#FFFFFF",
    pips0: "#22221F",
    dieBorder0: "#22221F",
    die1: "#FFFFFF",
    pips1: "#22221F",
    dieBorder1: "#1F6F5A",
    cube: "#1F6F5A",
    cubeText: "#FFFFFF",
    cubeBorder: "#174F41",
    source: "#22221F",
    selection: "#CB6A1C",
    destination: "#CB6A1C",
    destinationText: "#131310",
    undo: "#22221F",
    undoText: "#FFFFFF",
    hover: "#CB6A1C",
    focus: "#22221F",
  },
  patterns: {},
  css: `
/* Type: humanist sans at 500, headings one step heavier, mono numerals. */
html[data-skin="topography"] body {
  font-weight: 500;
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="topography"] h1,
html[data-skin="topography"] h2,
html[data-skin="topography"] h3,
html[data-skin="topography"] .tool-head h1,
html[data-skin="topography"] .panel-head h2,
html[data-skin="topography"] .panel-head h3,
html[data-skin="topography"] .panel-title,
html[data-skin="topography"] .dialog-head h2 {
  font-weight: 600;
  letter-spacing: 0;
}
html[data-skin="topography"] .hero h1 {
  font-weight: 600;
  letter-spacing: -0.02em;
  background: none;
  color: var(--ink);
  -webkit-text-fill-color: var(--ink);
}

/* Chrome: flat paper, 1px ink rules at 12%, 4px corners, no shadows. */
html[data-skin="topography"] .topbar {
  border-bottom: 1px solid var(--line);
}
/* Text that sits straight on the map is full ink: ink keeps 7:1 even where
   an index contour crosses it; muted and pine would drop under 4.5:1 there.
   Pine survives on paper only, so links on the map are ink with a pine rule. */
html[data-skin="topography"] .crumbs a,
html[data-skin="topography"] .crumbs .brand,
html[data-skin="topography"] .crumb-sep,
html[data-skin="topography"] .tool-nav a,
html[data-skin="topography"] .group-head span,
html[data-skin="topography"] .hub-update,
html[data-skin="topography"] .docs-release,
html[data-skin="topography"] .docs-flow-caption,
html[data-skin="topography"] .flow-next,
html[data-skin="topography"] .flow-end {
  color: var(--ink);
}
html[data-skin="topography"] .crumbs a,
html[data-skin="topography"] .tool-nav a {
  border-radius: var(--r-sm);
  font-weight: 600;
}
html[data-skin="topography"] .tool-nav a:hover,
html[data-skin="topography"] .crumbs a:hover {
  color: var(--accent);
}
html[data-skin="topography"] .tool-nav a[aria-current="page"] {
  background: transparent;
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--accent);
}
html[data-skin="topography"] .hub-recent a,
html[data-skin="topography"] .hub-update a,
html[data-skin="topography"] .opening-jump,
html[data-skin="topography"] .docs-section a,
html[data-skin="topography"] .flow-yes {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}
html[data-skin="topography"] .docs-toc a {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  color: var(--ink);
}
html[data-skin="topography"] .docs-toc a:hover {
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="topography"] .docs-toc a[aria-current] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="topography"] .docs-flow {
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}
html[data-skin="topography"] .panel,
html[data-skin="topography"] .inspector,
html[data-skin="topography"] .tile,
html[data-skin="topography"] .hub-board-frame {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="topography"] .panel--quiet {
  background: var(--surface);
}
html[data-skin="topography"] .tile::before,
html[data-skin="topography"] .tile::after {
  display: none;
}
html[data-skin="topography"] .tile:hover,
html[data-skin="topography"] .tile:focus-visible {
  translate: none;
  border-color: var(--control-border);
  box-shadow: none;
}
html[data-skin="topography"] .panel-head,
html[data-skin="topography"] .panel-foot,
html[data-skin="topography"] .tabs,
html[data-skin="topography"] .docs-section {
  border-color: var(--line);
}

/* Play stage: the strips and the action area sit on the map, so they get
   their own sheet of paper, like a legend box. */
html[data-skin="topography"] .player-strip {
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  padding-inline: 10px;
  color: var(--muted);
}
html[data-skin="topography"] .player-strip.active {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--control-border);
  box-shadow: inset 3px 0 0 var(--accent);
}
html[data-skin="topography"] .action-area {
  padding: 10px 12px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
}

/* Buttons: pine primary, outlined ghost, surface default; pressed is a pine
   outline on the pale accent wash. Labels stay ink in every state. */
html[data-skin="topography"] .btn {
  border-radius: var(--r-sm);
  background: var(--surface);
  border-color: var(--line-strong);
  color: var(--ink);
}
html[data-skin="topography"] .btn:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="topography"] .btn:active {
  background: var(--surface-3);
}
html[data-skin="topography"] .btn--primary,
html[data-skin="topography"] .btn--primary:hover,
html[data-skin="topography"] .btn--primary:active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
html[data-skin="topography"] .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 88%, white);
  border-color: color-mix(in oklab, var(--accent) 88%, white);
}
html[data-skin="topography"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, black);
  border-color: color-mix(in oklab, var(--accent) 86%, black);
}
html[data-skin="topography"] .btn--ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
html[data-skin="topography"] .btn--ghost:hover {
  background: var(--surface);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="topography"] .btn--ghost:active {
  background: var(--surface-2);
  color: var(--ink);
}
html[data-skin="topography"] .btn--danger {
  background: var(--surface);
  border-color: var(--bad);
  color: var(--bad);
}
html[data-skin="topography"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="topography"] .btn[aria-pressed="true"],
html[data-skin="topography"] .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="topography"] #equity-toggle[aria-pressed="true"] {
  color: var(--ink);
}

/* Segmented, tabs, fields: square, hairline, the chosen item is paper with
   an ink outline. */
html[data-skin="topography"] .segmented {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: var(--surface-2);
  padding: 2px;
}
html[data-skin="topography"] .segmented > label,
html[data-skin="topography"] .segmented > button {
  border-radius: 3px;
  color: var(--muted);
}
html[data-skin="topography"] .segmented > label:has(input:checked),
html[data-skin="topography"] .segmented > button[aria-pressed="true"],
html[data-skin="topography"] .segmented > button[aria-checked="true"],
html[data-skin="topography"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--control-border);
}
html[data-skin="topography"] .tabs > [role="tab"] {
  border-radius: 0;
  font-weight: 600;
}
html[data-skin="topography"] .tabs > [role="tab"][aria-selected="true"] {
  color: var(--accent);
}
html[data-skin="topography"] .tabs.has-indicator::after {
  background: var(--accent);
}
html[data-skin="topography"] .tabs--pill {
  border-radius: var(--r-sm);
}
html[data-skin="topography"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="topography"] .field select,
html[data-skin="topography"] .field textarea {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: var(--surface);
  box-shadow: none;
}
html[data-skin="topography"] .field input:hover,
html[data-skin="topography"] .field select:hover,
html[data-skin="topography"] .field textarea:hover {
  border-color: var(--control-border);
}

/* Dialogs, toasts and sticky bars: paper, a hairline, one soft lift for the
   dialog only. No glass anywhere; sticky bars go opaque. */
html[data-skin="topography"] .dialog {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-raised);
}
html[data-skin="topography"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="topography"] .toast {
  background: var(--ink);
  border: 1px solid var(--ink);
  border-radius: var(--r-sm);
  color: var(--surface);
  box-shadow: none;
}
html[data-skin="topography"] .toast--alert {
  border-left: 3px solid var(--accent-2);
}
html[data-skin="topography"] .toast--good {
  border-left: 3px solid var(--accent);
}
html[data-skin="topography"] .toast .btn--ghost {
  color: var(--surface);
  border-color: transparent;
}
html[data-skin="topography"] .toast .btn--ghost:hover {
  background: var(--muted);
  color: var(--surface);
}
html[data-skin="topography"].skin-shader .play-page.setup-table .action-area,
html[data-skin="topography"].skin-shader .play-review .review-header,
html[data-skin="topography"].skin-shader .library-filters,
html[data-skin="topography"].skin-shader .docs-toc--sticky {
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: 1px solid var(--line);
}
html[data-skin="topography"] .equity-meter {
  border-color: var(--ink);
  border-radius: 2px;
}

/* Board: the map itself. Numerals in mono; a contour pattern at 6% drawn
   over the playing surface; flat points with a hairline; flat pieces. */
html[data-skin="topography"] .bg-board text {
  font-family: var(--font-mono);
  font-weight: 600;
}
html[data-skin="topography"] .bg-board [data-pattern="frame"] {
  fill: none;
  stroke: rgba(34, 34, 31, 0.1);
  stroke-width: 1;
}
html[data-skin="topography"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-topography-contours);
  stroke: rgba(34, 34, 31, 0.22);
  stroke-width: 1;
}
html[data-skin="topography"] .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: rgba(34, 34, 31, 0.22);
  stroke-width: 1;
}
html[data-skin="topography"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-topography-bar);
}
html[data-skin="topography"] .bg-board .point-shape {
  stroke: rgba(34, 34, 31, 0.3);
  stroke-width: 1;
  stroke-linejoin: round;
}
/* Checkers: flat discs, the rim carries them. The dark disc on the ink bar
   lives on its white rim, so the rim is a touch wider. */
html[data-skin="topography"] .bg-board .checker > circle:first-child {
  stroke-width: 2.5;
}
html[data-skin="topography"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 3;
}
html[data-skin="topography"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="topography"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
`,
  defs: `
<pattern id="skin-topography-contours" patternUnits="userSpaceOnUse" width="260" height="260">
  <g fill="none" stroke="#22221F" stroke-opacity="0.06" stroke-width="1" stroke-linejoin="round">
    <path d="M30 70C40 40 90 20 130 30s60 50 45 85-65 45-100 35S20 100 30 70z"/>
    <path d="M50 75c8-23 45-35 75-27s43 37 31 62-48 32-76 24S42 98 50 75z"/>
    <path d="M70 80c6-16 30-22 50-16s28 26 20 42-32 20-48 14S64 96 70 80z"/>
    <path d="M88 86c4-8 16-12 26-8s14 14 10 22-16 10-24 6S84 94 88 86z"/>
    <path d="M150 140c36-24 88-18 108 20s2 90-40 108-96 10-110-28 6-76 42-100z"/>
    <path d="M160 160c26-18 68-14 84 14s0 70-32 84-74 8-86-20 8-60 34-78z"/>
    <path d="M172 180c16-12 46-10 58 10s-2 48-22 58-50 6-60-14 8-42 24-54z"/>
    <path d="M186 200c8-6 24-6 30 6s-2 26-12 32-26 4-32-8 6-24 14-30z"/>
    <path d="M18 212c10-14 36-12 46 2s4 36-8 46-36 8-44-6-4-28 6-42z"/>
    <path d="M30 222c6-8 20-8 26 0s2 20-4 26-20 6-26-2-2-16 4-24z"/>
    <path d="M208 20c12-6 30 0 32 14s-8 28-22 28-28-10-26-22 4-14 16-20z"/>
  </g>
  <g fill="none" stroke="#22221F" stroke-opacity="0.09" stroke-width="1.4" stroke-linejoin="round">
    <path d="M14 66C26 26 90 0 140 14s70 60 54 100-76 60-120 46S2 106 14 66z"/>
    <path d="M136 132c44-30 108-24 134 24s-2 110-54 132-120 12-136-36 12-90 56-120z"/>
  </g>
</pattern>
<linearGradient id="skin-topography-bar" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.08"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
</linearGradient>
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
uniform vec3 u_c1; // page sand: the paper
uniform vec3 u_c2; // high ground: a shade lighter
uniform vec3 u_c3; // ink: the contour lines
uniform vec3 u_c4; // low ground: a shade darker
uniform float u_dark;

// Lattice hash on a 256-cell torus so the slowly drifting domain never
// reaches large coordinates where float precision would jitter the lines.
float hash(vec2 i) {
  i = mod(i, 256.0);
  vec3 q = fract(vec3(i.x, i.y, i.x + i.y) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = m * p + vec2(3.7, 1.9);
    a *= 0.45;
  }
  return v;
}

// Terrain height in 0..1: a slow drift across the map and an even slower
// second field that reshapes the hills so the lines morph rather than slide.
float terrain(vec2 p, float t) {
  float h = fbm(p * 2.2 + vec2(t * 0.015, t * 0.006));
  h += 0.18 * fbm(p * 1.3 - vec2(t * 0.01, 0.0));
  // fbm sits in a narrow band around its mean; stretch it so the twelve
  // levels all appear on the map.
  return (h / 1.18 - 0.5) * 1.7 + 0.5;
}

// The pointer lifts the land under it: a soft 220px bump that bends the
// contours into rings. Zero until the pointer has moved.
float bump(vec2 frag) {
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float d = length(frag - u_pointer) / 220.0;
  return live * 0.11 * exp(-d * d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;

  // Height at this pixel and one pixel to each side: the gradient keeps the
  // line width constant in pixels wherever the slope changes.
  float px = 1.0 / u_resolution.y;
  float h = terrain(p, t) + bump(gl_FragCoord.xy);
  float hx = terrain(p + vec2(px, 0.0), t) + bump(gl_FragCoord.xy + vec2(1.0, 0.0));
  float hy = terrain(p + vec2(0.0, px), t) + bump(gl_FragCoord.xy + vec2(0.0, 1.0));
  float slope = length(vec2(hx - h, hy - h)) * 12.0; // bands per pixel

  // Twelve contour levels. Distance to the nearest level, in band units, and
  // in pixels.
  float band = h * 12.0;
  float dist = abs(fract(band) - 0.5);
  float distPx = dist / max(slope, 1e-4);

  // Thin lines a constant 1.1px wide (0.04 of a band at the map's typical
  // slope), so plateaus do not swell into blobs and steep ground does not
  // alias. Every fourth level is the index contour, 2px.
  float level = floor(band + 0.5);
  float heavy = step(mod(level, 4.0), 0.5);
  float halfPx = 0.55 + 0.45 * heavy;
  float line = 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, distPx);

  // Paper: low ground a shade darker, high ground a shade lighter, by a few
  // percent only so panels and text sit on it as on plain sand.
  vec3 col = mix(u_c4, u_c2, smoothstep(0.2, 0.8, h));
  col = mix(u_c1, col, 0.55);

  // Ink: 18% on thin lines, 28% on index lines.
  float ink = line * (0.18 + 0.1 * heavy);
  col = mix(col, u_c3, ink);

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#F3EFE6", "#FAF7F0", "#22221F", "#EAE4D6"],
    speed: 1,
    fps: 30,
    stillAt: 12,
  },
  preview: "linear-gradient(135deg, #F3EFE6, #E7E1D3 55%, #1F6F5A)",
};
