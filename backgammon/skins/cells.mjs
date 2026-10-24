// SPDX-License-Identifier: GPL-3.0-or-later
// Cells: a living membrane. Voronoi cells breathe slowly on deep teal, lit
// only along their shared walls; the chrome is a set of opaque cells with a
// faint mint wall of its own, and the pieces are membranes too: a bright
// centre, a translucent body and a lit rim. Shape per
// docs/redesign/backgammon-themes/skin-contract.md §2.
const S = 'html[data-skin="cells"]';
const PAGE = "#041417";
const SURFACE = "#0B2226";
const MINT = "#39E6C4";
const AMBER = "#FFB454";
const INK_TEAL = "#04201B";

export default {
  id: "cells",
  name: "Cells",
  description: "Breathing Voronoi cells with mint-lit walls on deep teal.",
  scheme: "dark",
  tokens: {
    page: PAGE,
    surface: SURFACE,
    surface2: "#0F2C31",
    surface3: "#15383C",
    glass: "rgba(11,34,38,.9)",
    line: "rgba(57,230,196,.2)",
    lineStrong: "rgba(57,230,196,.34)",
    lineOpaque: "#144946",
    controlBorder: "#2C7E74",
    ink: "#EAF7F5",
    muted: "#93B5B2",
    soft: "#6B938F",
    accent: MINT,
    accent2: AMBER,
    accentSoft: "rgba(57,230,196,.16)",
    onAccent: INK_TEAL,
    good: "#7FE3A6",
    bad: "#FF7B7B",
    warn: AMBER,
    info: "#7CC8FF",
    goodSoft: "rgba(127,227,166,.16)",
    badSoft: "rgba(255,123,123,.16)",
    warnSoft: "rgba(255,180,84,.16)",
    infoSoft: "rgba(124,200,255,.16)",
    radiusSm: "14px",
    radiusMd: "18px",
    radiusLg: "24px",
    radiusPill: "999px",
    // A cell has no cast shadow: a hairline of inner light at the top and the
    // page colour underneath keep it sitting on the membrane.
    shadowTile: "inset 0 1px 0 rgba(234,247,245,.05), 0 1px 0 #041417",
    shadowRaised: "inset 0 1px 0 rgba(234,247,245,.06), 0 30px 70px -36px rgba(0,0,0,.95)",
    shadowSheet: "inset 0 1px 0 rgba(234,247,245,.06)",
    fontSans: 'ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", Roboto, system-ui, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#0A2A2E",
    border: "#1A5451",
    surface: "#082024",
    bar: "#031012",
    tray: "#041417",
    pointA: "#1F6F66", // teal cell
    pointB: "#35414F", // slate cell
    numbers: "#93B5B2",
    caption: "#93B5B2",
    checker0: "#F0FBF8",
    rim0: "#2E9C8F",
    detail0: "#B9DDD6",
    count0: INK_TEAL,
    checker1: "#0B1C1F",
    rim1: MINT,
    detail1: "#1F7A6B",
    count1: "#F0FBF8",
    die0: "#F0FBF8",
    pips0: INK_TEAL,
    dieBorder0: "#2E9C8F",
    die1: "#0B1C1F",
    pips1: "#F0FBF8",
    dieBorder1: MINT,
    cube: MINT,
    cubeText: INK_TEAL,
    cubeBorder: "#9DF5E3",
    source: AMBER,
    selection: "#FFD38A",
    destination: AMBER,
    destinationText: "#1A1206",
    undo: "#FFE3B8",
    undoText: "#1A1206",
    hover: MINT,
    focus: "#FFFFFF",
  },
  patterns: {},
  css: `
${S} body {
  font-variant-numeric: tabular-nums lining-nums;
}
${S} .tool-head h1,
${S} .hero h1,
${S} .panel-head h2,
${S} .panel-head h3,
${S} .panel-title,
${S} .dialog-head h2,
${S} .tile h3,
${S} .docs-toc-title,
${S} .docs-body h1,
${S} .docs-body h2,
${S} .docs-body h3 {
  font-weight: 600;
  letter-spacing: -0.01em;
  text-transform: none;
}
${S} .tool-nav a,
${S} .crumbs a,
${S} .docs-toc a {
  border-radius: var(--r-pill);
}
/* Opaque cells: deep teal body, one mint wall at 20%, no cast shadow. */
${S} .panel,
${S} .inspector,
${S} .tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
${S} .tile:hover,
${S} .tile:focus-visible {
  translate: none;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-tile);
}
${S} .hub-feature > .tile {
  background: none;
  border: 0;
  box-shadow: none;
}
${S} .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
}
${S} .panel-head,
${S} .panel-foot {
  border-color: var(--line);
}
${S} .dialog {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-raised);
}
${S} .dialog-foot {
  background: var(--surface);
}
${S} .toast {
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-raised);
}
${S} .toast--alert {
  border-color: color-mix(in oklab, var(--bad) 50%, transparent);
}
${S} .toast--good {
  border-color: color-mix(in oklab, var(--good) 50%, transparent);
}
/* Pill buttons. Every state names its own label colour so no variant can
   fall back to an unreadable fill. */
${S} .btn {
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border-color: var(--line-strong);
  color: var(--ink);
}
${S} .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
${S} .btn:active {
  background: color-mix(in oklab, var(--surface-3) 85%, var(--ink));
}
${S} .btn[aria-pressed="true"],
${S} .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
  color: var(--ink);
}
${S} .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
${S} .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 86%, white);
  border-color: color-mix(in oklab, var(--accent) 86%, white);
  color: var(--on-accent);
}
${S} .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 85%, black);
  border-color: color-mix(in oklab, var(--accent) 85%, black);
  color: var(--on-accent);
}
${S} .btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--muted);
}
${S} .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--line);
  color: var(--ink);
}
${S} .btn--ghost:active {
  background: var(--surface-3);
  color: var(--ink);
}
${S} .btn--ghost[aria-pressed="true"],
${S} .btn--ghost[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
  color: var(--ink);
}
${S} .btn--danger {
  background: var(--bad-soft);
  border-color: color-mix(in oklab, var(--bad) 50%, transparent);
  color: var(--bad);
}
${S} .btn--danger:hover,
${S} .btn--danger:active {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
${S} .segmented {
  background: var(--page);
  border-color: var(--line);
  border-radius: var(--r-pill);
}
${S} .segmented > label,
${S} .segmented > button {
  border-radius: var(--r-pill);
}
${S} .segmented > label:has(input:checked),
${S} .segmented > button[aria-pressed="true"],
${S} .segmented > button[aria-checked="true"],
${S} .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
${S} .tabs {
  border-bottom-color: var(--line);
}
${S} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${S} .field select,
${S} .field textarea {
  background: var(--page);
  border-color: var(--control-border);
  border-radius: var(--r-sm);
}
/* Player strips are cells of their own, so their names never sit on the
   shader. */
${S} .player-strip {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding-inline: 12px;
}
${S} .player-strip.active {
  background: color-mix(in oklab, var(--surface) 78%, var(--accent));
  border-color: color-mix(in oklab, var(--accent) 45%, transparent);
}
${S} .action-area {
  padding-top: 12px;
}
/* The footer sits straight on the membrane, so its small text uses muted
   rather than soft (worst case over a lit wall stays above 4.5:1). */
${S} .foot {
  border-top-color: var(--line);
  color: var(--muted);
}
${S} .docs-section {
  border-top-color: var(--line);
}
/* Board: the frame carries the cell walls, the surface is one soft cell. */
${S} .bg-board text {
  font-family: var(--font-sans);
  font-weight: 600;
}
${S} .bg-board [data-pattern="frame"] {
  fill: url(#skin-cells-membrane);
}
${S} .bg-board [data-pattern="surface"] {
  fill: url(#skin-cells-surface);
  stroke: var(--board-border);
  stroke-width: 1.5;
}
${S} .bg-board [data-pattern="bar"] {
  fill: url(#skin-cells-bar);
}
${S} .bg-board [data-pattern="tray"] {
  fill: url(#skin-cells-tray);
  stroke: var(--board-border);
  stroke-width: 1;
}
${S} .bg-board .point-shape {
  stroke: rgba(0, 0, 0, 0.32);
  stroke-width: 1.5;
  stroke-linejoin: round;
}
${S} .bg-board [data-pattern="pointA"],
${S} .bg-board [data-pattern="pointB"] {
  fill: url(#skin-cells-point);
}
/* Checkers are membranes: a bright nucleus, a translucent body and a lit rim.
   The overlay clones the face radius and would cover the inner half of the
   rim stroke, so the stroke widens and the overlay pulls in to its inner
   edge; the gradient's own outer band glows just inside the rim. */
${S} .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
${S} .bg-board .checker > [data-pattern="checker0"],
${S} .bg-board .checker > [data-pattern="checker1"] {
  r: 20.5px;
}
${S} .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-cells-ivory);
}
${S} .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-cells-dark);
}
${S} .bg-board [data-pattern="die0"] {
  fill: url(#skin-cells-die-ivory);
}
${S} .bg-board [data-pattern="die1"] {
  fill: url(#skin-cells-die-dark);
}
${S} .bg-board [data-pattern="cube"] {
  fill: url(#skin-cells-cube);
}
${S} .bg-board .board-die-face > rect:first-child,
${S} .bg-board .board-cube .cube-face {
  stroke-width: 1.5;
}
`,
  defs: `
<pattern id="skin-cells-membrane" patternUnits="userSpaceOnUse" width="132" height="132">
  <path d="M0 42 L34 24 L62 0 M34 24 L48 70 L22 96 L0 90 M48 70 L92 60 L110 28 L132 20 M110 28 L94 0 M92 60 L104 100 L132 110 M104 100 L72 132 M22 96 L36 132 M-6 90 L0 90"
        fill="none" stroke="${MINT}" stroke-opacity=".11" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M34 24 L48 70 L92 60 L110 28 L94 0 L62 0 Z" fill="${MINT}" fill-opacity=".035"/>
  <path d="M48 70 L104 100 L72 132 L36 132 L22 96 Z" fill="#000000" fill-opacity=".12"/>
</pattern>
<radialGradient id="skin-cells-surface" cx=".5" cy=".5" r=".72">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".06"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity=".01"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".2"/>
</radialGradient>
<linearGradient id="skin-cells-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".42"/>
  <stop offset=".3" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".7" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".42"/>
</linearGradient>
<linearGradient id="skin-cells-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".4"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="${MINT}" stop-opacity=".05"/>
</linearGradient>
<radialGradient id="skin-cells-point" cx=".5" cy=".5" r=".6">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".1"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".3"/>
</radialGradient>
<radialGradient id="skin-cells-ivory" cx=".4" cy=".36" r=".72">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".5"/>
  <stop offset=".42" stop-color="#FFFFFF" stop-opacity=".04"/>
  <stop offset=".8" stop-color="#1F6F66" stop-opacity=".02"/>
  <stop offset="1" stop-color="#1F6F66" stop-opacity=".42"/>
</radialGradient>
<radialGradient id="skin-cells-dark" cx=".4" cy=".36" r=".74">
  <stop offset="0" stop-color="${MINT}" stop-opacity=".2"/>
  <stop offset=".45" stop-color="${MINT}" stop-opacity=".02"/>
  <stop offset=".82" stop-color="${MINT}" stop-opacity=".02"/>
  <stop offset="1" stop-color="${MINT}" stop-opacity=".42"/>
</radialGradient>
<radialGradient id="skin-cells-die-ivory" cx=".32" cy=".26" r=".9">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".5"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity=".04"/>
  <stop offset="1" stop-color="#1F6F66" stop-opacity=".22"/>
</radialGradient>
<radialGradient id="skin-cells-die-dark" cx=".32" cy=".26" r=".9">
  <stop offset="0" stop-color="${MINT}" stop-opacity=".18"/>
  <stop offset=".6" stop-color="${MINT}" stop-opacity=".02"/>
  <stop offset="1" stop-color="${MINT}" stop-opacity=".26"/>
</radialGradient>
<radialGradient id="skin-cells-cube" cx=".32" cy=".26" r=".9">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".3"/>
  <stop offset=".65" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".18"/>
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
uniform vec3 u_c1; // page: the fluid between cells
uniform vec3 u_c2; // surface: a cell body
uniform vec3 u_c3; // accent: the lit membrane
uniform vec3 u_c4; // surface-3: a cell woken by the pointer
uniform float u_dark;

// Lattice hash on a 64-cell torus; the drift never leaves the lattice cell.
vec2 hash2(vec2 i) {
  i = mod(i, 64.0);
  vec3 q = fract(vec3(i.x, i.y, i.x) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// A cell's site: its lattice centre plus a slow orbit. Every frequency is a
// multiple of 0.1, so the field repeats exactly every 20 pi seconds and
// mod(u_time) below hides nothing. Amplitude 0.3 keeps a 3x3 search exact.
vec2 site(vec2 cell, float t) {
  vec2 ph = hash2(cell) * 6.2831853;
  return cell + 0.5 + 0.3 * vec2(sin(t * 0.2 + ph.x), cos(t * 0.3 + ph.y));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = mod(u_time, 62.831853);
  float scale = 5.0;
  vec2 p = vec2(uv.x * aspect, uv.y) * scale;
  vec2 g = floor(p);

  // Nearest and second-nearest sites over the 3x3 neighbourhood.
  float d1 = 9.0, d2 = 9.0;
  vec2 c1 = g, c2 = g, s1 = p;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = g + vec2(float(x), float(y));
      vec2 s = site(cell, t);
      float d = length(p - s);
      if (d < d1) { d2 = d1; c2 = c1; d1 = d; c1 = cell; s1 = s; }
      else if (d < d2) { d2 = d; c2 = cell; }
    }
  }
  float edge = d2 - d1;

  // Cell body: each cell its own shade between the fluid and surface, lit at
  // the nucleus and settling to the fluid colour toward its walls.
  vec2 h = hash2(c1);
  vec3 body = mix(u_c1, u_c2, 0.3 + 0.4 * h.x);
  body = mix(body, u_c1, smoothstep(0.1, 0.75, d1));
  body += u_c2 * 0.08 * (1.0 - smoothstep(0.0, 0.35, d1));

  // The wall glow belongs to the pair of cells, so it breathes as one line.
  float breath = 0.5 + 0.5 * sin(t * 0.5 + hash2(c1 + c2).x * 6.2831853);
  float glow = smoothstep(0.08, 0.0, edge) * (0.4 + 0.6 * breath);
  float core = smoothstep(0.018, 0.0, edge);
  vec3 col = body + u_c3 * glow * mix(0.09, 0.18, u_dark) + u_c3 * core * 0.05;

  // A slow tide across the whole membrane, 3% either way.
  col *= 1.0 + 0.03 * sin(uv.y * 2.4 - t * 0.1) * sin(uv.x * 1.7 + t * 0.2);

  // Pointer: the cell under it (and its near neighbours) wakes toward
  // surface-3 and its walls brighten a little. Idle until the pointer moves.
  vec2 pp = vec2(u_pointer.x / u_resolution.x * aspect, u_pointer.y / u_resolution.y) * scale;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float wake = live * smoothstep(1.4, 0.0, length(s1 - pp));
  col = mix(col, u_c4, 0.45 * wake * (1.0 - smoothstep(0.2, 0.8, d1)));
  col += u_c3 * glow * 0.08 * wake;

  // Legibility: nothing brighter than surface-3 by more than a tenth.
  float lmax = luma(u_c4) * 1.1;
  float l = luma(col);
  if (l > lmax) col *= lmax / l;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: [PAGE, SURFACE, MINT, "#15383C"],
    speed: 1,
    fps: 60,
    stillAt: 4,
  },
  preview: "radial-gradient(circle at 34% 38%, #15383C 0, #0B2226 26%, #041417 64%)",
};
