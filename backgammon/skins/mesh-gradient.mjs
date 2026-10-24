// SPDX-License-Identifier: GPL-3.0-or-later
// Mesh Gradient: a soft mesh of coral, lavender and mint blobs drifting under
// frosted white glass; the look of a modern product landing page. Flat white
// board with a hairline, lavender against mint points, glossy white discs with
// a slate rim against ink-blue discs with a white rim, one violet cube.
// Shape and rules: docs/redesign/backgammon-themes/skin-contract.md §2.
const SANS = 'Inter, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_c1; // page
uniform vec3 u_c2; // lavender
uniform vec3 u_c3; // coral
uniform vec3 u_c4; // mint
uniform float u_dark;

const float TAU = 6.28318530718;

// Blob i: rest position, swing and the two Lissajous periods (23-61 s). The
// periods are pairwise coprime-ish so the figure never closes within 600 s.
vec2 centre(int i, float t) {
  vec2 base, amp, per, ph;
  if (i == 0) { base = vec2(0.22, 0.74); amp = vec2(0.16, 0.12); per = vec2(41.0, 29.0); ph = vec2(0.0, 1.3); }
  else if (i == 1) { base = vec2(0.72, 0.80); amp = vec2(0.14, 0.11); per = vec2(53.0, 37.0); ph = vec2(2.1, 0.4); }
  else if (i == 2) { base = vec2(0.80, 0.24); amp = vec2(0.13, 0.14); per = vec2(31.0, 47.0); ph = vec2(4.0, 2.6); }
  else if (i == 3) { base = vec2(0.28, 0.20); amp = vec2(0.15, 0.10); per = vec2(61.0, 43.0); ph = vec2(1.0, 5.2); }
  else { base = vec2(0.52, 0.50); amp = vec2(0.12, 0.13); per = vec2(23.0, 59.0); ph = vec2(3.3, 0.9); }
  return base + amp * vec2(sin(TAU * t / per.x + ph.x), cos(TAU * t / per.y + ph.y));
}

// Coral, lavender and mint come from the skin; sky and peach are fixed.
vec3 tint(int i) {
  if (i == 0) return u_c3;
  if (i == 1) return u_c2;
  if (i == 2) return u_c4;
  if (i == 3) return vec3(0.76, 0.87, 1.0);
  return vec3(1.0, 0.86, 0.76);
}

float hash(vec2 p) {
  vec3 q = fract(vec3(p.x, p.y, p.x + p.y) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  // Distances in units of the shorter side so the splats stay round.
  vec2 scale = aspect >= 1.0 ? vec2(aspect, 1.0) : vec2(1.0, 1.0 / aspect);
  float t = u_time;

  // The pointer is idle at (0,0) until it moves.
  float live = step(0.5, u_pointer.x + u_pointer.y);
  vec2 ptr = u_pointer / u_resolution;

  // Pass 1: which blob is nearest the pointer.
  int near = 0;
  float best = 1e9;
  for (int i = 0; i < 5; i++) {
    float d = length((centre(i, t) - ptr) * scale);
    if (d < best) { best = d; near = i; }
  }

  // Pass 2: Gaussian splats, summed and normalised. A faint page splat keeps
  // the far field on the page colour and the division finite in mediump.
  vec3 sum = u_c1 * 0.02;
  float wsum = 0.02;
  for (int i = 0; i < 5; i++) {
    vec2 c = centre(i, t);
    // The nearest blob leans gently toward the pointer.
    if (i == near) c = mix(c, ptr, 0.22 * live);
    vec2 d = (uv - c) * scale;
    float w = exp(-dot(d, d) * 4.2);
    sum += tint(i) * w;
    wsum += w;
  }
  vec3 mesh = sum / wsum;

  // 55% toward the page: pastel, not poster.
  vec3 col = mix(mesh, u_c1, 0.55);

  // Legibility floor: nothing under the chrome drops below ~0.86 luminance,
  // so muted text set straight on the shader keeps 4.5:1.
  float l = luma(col);
  float floorL = 0.86 - 0.5 * u_dark;
  if (l < floorL) col = mix(col, u_c1, (floorL - l) / max(luma(u_c1) - l, 1e-4));

  // Static film grain, 1%.
  col += (hash(gl_FragCoord.xy) - 0.5) * 0.02;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const CSS = `
/* ---- type: geometric grotesk, 600 headings, tabular numerals ---- */
html[data-skin="mesh-gradient"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="mesh-gradient"] .tool-head h1,
html[data-skin="mesh-gradient"] .hero h1,
html[data-skin="mesh-gradient"] .panel-head h2,
html[data-skin="mesh-gradient"] .panel-head h3,
html[data-skin="mesh-gradient"] .panel-title,
html[data-skin="mesh-gradient"] .dialog-head h2,
html[data-skin="mesh-gradient"] .tile h3,
html[data-skin="mesh-gradient"] .tile--featured h3 {
  font-weight: 600;
  letter-spacing: -0.015em;
  text-transform: none;
}
html[data-skin="mesh-gradient"] .hero h1 {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: var(--ink);
  -webkit-text-fill-color: var(--ink);
  letter-spacing: -0.03em;
}
html[data-skin="mesh-gradient"] .crumb-current,
html[data-skin="mesh-gradient"] .player-name strong {
  font-weight: 600;
}

/* ---- chrome: glass panels, pill nav, hairlines ---- */
/* Topbar: crumbs and nav are two glass pills of the same height. */
html[data-skin="mesh-gradient"] .crumbs {
  min-height: 52px;
  padding: 3px 16px 3px 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .mark {
  width: 44px;
  height: 44px;
  background: var(--surface);
  border-color: var(--line);
  border-radius: var(--r-pill);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent);
  font-weight: 600;
  letter-spacing: 0;
}
html[data-skin="mesh-gradient"] .tool-nav {
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  background: var(--glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
/* The pill hugs its links on wide topbars; phones keep the kit's full row. */
html[data-skin="mesh-gradient"] .app .tool-nav {
  flex: 0 1 auto;
}
html[data-skin="mesh-gradient"] .tool-nav a {
  border-radius: var(--r-pill);
  font-weight: 500;
}
html[data-skin="mesh-gradient"] .tool-nav a[aria-current="page"] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line), 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent);
}
html[data-skin="mesh-gradient"] .crumbs a {
  border-radius: var(--r-pill);
}
html[data-skin="mesh-gradient"] .panel,
html[data-skin="mesh-gradient"] .inspector,
html[data-skin="mesh-gradient"] .tile {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .panel--quiet {
  background: var(--glass);
  box-shadow: none;
}
html[data-skin="mesh-gradient"] .panel-head,
html[data-skin="mesh-gradient"] .panel-foot {
  border-color: var(--line);
}
html[data-skin="mesh-gradient"] .tile::before {
  background: radial-gradient(460px circle at var(--mx) var(--my), color-mix(in srgb, var(--accent) 9%, transparent), transparent 45%);
}
html[data-skin="mesh-gradient"] .tile:hover,
html[data-skin="mesh-gradient"] .tile:focus-visible {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-raised);
}
html[data-skin="mesh-gradient"] .stage {
  min-width: 0;
}

/* Text that sits straight on the shader gets a glass pill behind it. */
html[data-skin="mesh-gradient"] .player-strip {
  min-height: 36px;
  padding: 4px 14px;
  border-radius: var(--r-pill);
  background: var(--glass);
  box-shadow: inset 0 0 0 1px var(--line);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .player-strip.active {
  background: var(--surface);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent);
}
html[data-skin="mesh-gradient"] .checker-dot {
  box-shadow: 0 0 0 1px var(--control-border);
}

/* ---- controls: 12px radii, solid violet primary, white-glass ghost ---- */
html[data-skin="mesh-gradient"] .btn {
  border-radius: var(--r-md);
  background: var(--surface);
  border-color: var(--line-strong);
  color: var(--ink);
  font-weight: 500;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 5%, transparent);
}
html[data-skin="mesh-gradient"] .btn:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="mesh-gradient"] .btn:active {
  background: var(--surface-3);
  color: var(--ink);
}
html[data-skin="mesh-gradient"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--accent) 55%, transparent);
}
html[data-skin="mesh-gradient"] .btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 90%, white);
  border-color: color-mix(in srgb, var(--accent) 90%, white);
  color: var(--on-accent);
}
html[data-skin="mesh-gradient"] .btn--primary:active {
  background: color-mix(in srgb, var(--accent) 88%, black);
  border-color: color-mix(in srgb, var(--accent) 88%, black);
  color: var(--on-accent);
}
html[data-skin="mesh-gradient"] .btn--ghost {
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  border-color: var(--line);
  color: var(--ink);
  box-shadow: none;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .btn--ghost:hover {
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  border-color: var(--line-strong);
  color: var(--ink);
}
html[data-skin="mesh-gradient"] .btn--ghost:active {
  background: var(--surface-2);
  color: var(--ink);
}
html[data-skin="mesh-gradient"] .btn--danger {
  background: var(--surface);
  border-color: color-mix(in srgb, var(--bad) 45%, transparent);
  color: var(--bad);
  box-shadow: none;
}
html[data-skin="mesh-gradient"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="mesh-gradient"] .btn[aria-pressed="true"],
html[data-skin="mesh-gradient"] .btn--ghost[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="mesh-gradient"] .btn[aria-pressed="true"]:hover {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  color: var(--ink);
}
html[data-skin="mesh-gradient"] .segmented {
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  border-color: var(--line);
}
html[data-skin="mesh-gradient"] .segmented > label,
html[data-skin="mesh-gradient"] .segmented > button {
  font-weight: 500;
}
html[data-skin="mesh-gradient"] .segmented > label:has(input:checked),
html[data-skin="mesh-gradient"] .segmented > button[aria-pressed="true"],
html[data-skin="mesh-gradient"] .segmented > button[aria-checked="true"],
html[data-skin="mesh-gradient"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line), 0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent);
}
html[data-skin="mesh-gradient"] .tabs {
  border-bottom-color: var(--line);
}
html[data-skin="mesh-gradient"] .tabs > [role="tab"] {
  font-weight: 500;
}
html[data-skin="mesh-gradient"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="mesh-gradient"] .field select,
html[data-skin="mesh-gradient"] .field textarea {
  background: var(--surface);
  border-color: var(--line-strong);
  border-radius: var(--r-md);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent);
}
html[data-skin="mesh-gradient"] .field input:hover,
html[data-skin="mesh-gradient"] .field select:hover,
html[data-skin="mesh-gradient"] .field textarea:hover {
  border-color: var(--control-border);
}
html[data-skin="mesh-gradient"] .field > label,
html[data-skin="mesh-gradient"] .field-label {
  font-weight: 500;
}
html[data-skin="mesh-gradient"] .dialog {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sheet);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .dialog::backdrop {
  background: color-mix(in srgb, var(--ink) 24%, transparent);
}
html[data-skin="mesh-gradient"] .dialog-foot {
  background: transparent;
}
html[data-skin="mesh-gradient"] .toast {
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-raised);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
html[data-skin="mesh-gradient"] .toast--alert {
  background: color-mix(in srgb, var(--bad) 10%, var(--glass));
  border-color: color-mix(in srgb, var(--bad) 35%, transparent);
}
html[data-skin="mesh-gradient"] .toast--good {
  background: color-mix(in srgb, var(--good) 10%, var(--glass));
  border-color: color-mix(in srgb, var(--good) 35%, transparent);
}
html[data-skin="mesh-gradient"] .docs-section {
  border-top-color: var(--line);
}
html[data-skin="mesh-gradient"] .docs-toc a {
  border-radius: var(--r-pill);
}
html[data-skin="mesh-gradient"].skin-shader .play-page.setup-table .action-area,
html[data-skin="mesh-gradient"].skin-shader .play-review .review-header,
html[data-skin="mesh-gradient"].skin-shader .library-filters,
html[data-skin="mesh-gradient"].skin-shader .docs-toc--sticky {
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* ---- board: flat white frame, hairline, soft inner shadow ---- */
html[data-skin="mesh-gradient"] .bg-board text {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-mesh-gradient-frame);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-mesh-gradient-surface);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-mesh-gradient-bar);
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-mesh-gradient-tray);
  stroke: var(--board-border);
  stroke-width: 1;
}
/* Smooth flat triangles with a 1px lighter edge. */
html[data-skin="mesh-gradient"] .bg-board .point-shape {
  stroke: none;
  stroke-linejoin: round;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="pointA"],
html[data-skin="mesh-gradient"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-mesh-gradient-point);
  stroke: var(--board-checker0);
  stroke-width: 1;
  stroke-opacity: 0.8;
  stroke-linejoin: round;
}
/* The white disc is within 1.8:1 of both points, so the slate rim carries
   it: 3 units is about 1.3 px on a phone board. */
html[data-skin="mesh-gradient"] .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
html[data-skin="mesh-gradient"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-mesh-gradient-gloss);
}
html[data-skin="mesh-gradient"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-mesh-gradient-ink);
}
html[data-skin="mesh-gradient"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-mesh-gradient-die);
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-mesh-gradient-die-ink);
}
html[data-skin="mesh-gradient"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
html[data-skin="mesh-gradient"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-mesh-gradient-cube);
}
html[data-skin="mesh-gradient"] .bg-board .board-cube text {
  font-weight: 600;
}
`;

const DEFS = `
<linearGradient id="skin-mesh-gradient-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#141622" stop-opacity="0.025"/>
</linearGradient>
<radialGradient id="skin-mesh-gradient-surface" cx="0.5" cy="0.5" r="0.75">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/>
  <stop offset="0.7" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#141622" stop-opacity="0.045"/>
</radialGradient>
<linearGradient id="skin-mesh-gradient-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#141622" stop-opacity="0.05"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.2"/>
  <stop offset="1" stop-color="#141622" stop-opacity="0.05"/>
</linearGradient>
<linearGradient id="skin-mesh-gradient-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#141622" stop-opacity="0.04"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="1" stop-color="#141622" stop-opacity="0.04"/>
</linearGradient>
<linearGradient id="skin-mesh-gradient-point" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<radialGradient id="skin-mesh-gradient-gloss" cx="0.32" cy="0.28" r="0.85">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#2A2F45" stop-opacity="0.16"/>
</radialGradient>
<radialGradient id="skin-mesh-gradient-ink" cx="0.32" cy="0.28" r="0.85">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.3"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
</radialGradient>
<linearGradient id="skin-mesh-gradient-die" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.6"/>
  <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#2A2F45" stop-opacity="0.1"/>
</linearGradient>
<linearGradient id="skin-mesh-gradient-die-ink" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
  <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
</linearGradient>
<linearGradient id="skin-mesh-gradient-cube" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.28"/>
  <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
</linearGradient>
`;

export default {
  id: "mesh-gradient",
  name: "Mesh Gradient",
  description: "Coral, lavender and mint blobs under frosted white glass.",
  scheme: "light",
  tokens: {
    page: "#F7F7FB",
    surface: "#FFFFFF",
    surface2: "#F3F2F8",
    surface3: "#ECEAF4",
    glass: "rgba(255,255,255,.72)",
    line: "rgba(20,22,34,.08)",
    lineStrong: "rgba(20,22,34,.14)",
    lineOpaque: "#E3E1EC",
    controlBorder: "rgba(20,22,34,.26)",
    ink: "#141622",
    muted: "#5B6070",
    soft: "#6F748A",
    accent: "#6D5DFC",
    accent2: "#FF7A8A",
    accentSoft: "rgba(109,93,252,.12)",
    onAccent: "#FFFFFF",
    good: "#1A8A4A",
    bad: "#CC3550",
    warn: "#A86400",
    info: "#2563EB",
    goodSoft: "rgba(26,138,74,.12)",
    badSoft: "rgba(204,53,80,.12)",
    warnSoft: "rgba(168,100,0,.12)",
    infoSoft: "rgba(37,99,235,.12)",
    radiusSm: "12px",
    radiusMd: "12px",
    radiusLg: "16px",
    radiusPill: "999px",
    shadowTile: "0 0 0 1px rgba(20,22,34,.02), 0 24px 48px -28px rgba(20,22,34,.18)",
    shadowRaised: "0 0 0 1px rgba(20,22,34,.02), 0 32px 64px -32px rgba(20,22,34,.28)",
    shadowSheet: "0 0 0 1px rgba(20,22,34,.02), 0 40px 90px -40px rgba(20,22,34,.36)",
    fontSans: SANS,
    fontMono: MONO,
  },
  board: {
    frame: "#FFFFFF",
    border: "#E3E1EC",
    surface: "#F3F2F8",
    bar: "#E6E4F0",
    tray: "#ECEAF4",
    pointA: "#C4BDF5",
    pointB: "#BDEBDD",
    numbers: "#5B6070",
    caption: "#5B6070",
    checker0: "#FFFFFF",
    rim0: "#2A2F45",
    detail0: "#E3E1EC",
    count0: "#141622",
    checker1: "#1E2240",
    rim1: "#FFFFFF",
    detail1: "#3B4164",
    count1: "#FFFFFF",
    die0: "#FFFFFF",
    pips0: "#141622",
    dieBorder0: "#2A2F45",
    die1: "#1E2240",
    pips1: "#FFFFFF",
    dieBorder1: "#FFFFFF",
    cube: "#5B4BE8",
    cubeText: "#FFFFFF",
    cubeBorder: "#4A3BD1",
    source: "#5B4BE8",
    selection: "#5B4BE8",
    destination: "#5B4BE8",
    destinationText: "#FFFFFF",
    undo: "#CC3550",
    undoText: "#FFFFFF",
    hover: "#6D5DFC",
    focus: "#141622",
  },
  patterns: {},
  css: CSS,
  defs: DEFS,
  shader: {
    fragment: FRAGMENT,
    colors: ["#F7F7FB", "#C9BEFF", "#FFA6B2", "#B6EEDC"],
    speed: 1,
    fps: 30,
    stillAt: 30,
  },
  preview: "linear-gradient(135deg, #FFD9DE, #DDD6FF 45%, #D2F3E8 100%)",
};
