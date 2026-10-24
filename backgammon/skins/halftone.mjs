// SPDX-License-Identifier: GPL-3.0-or-later
// Halftone: a monochrome dot-grid poster. Near-black paper, graphite dots
// whose sizes swell and shrink in slow waves, paper-white and graphite points
// screened like print, flat pieces with a crisp rim, and one electric lime
// accent. No light model: everything is ink on paper.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.

// One column of halftone dots for the point triangles: large at the base of
// a point (y 38 and y 622), vanishing at the tips (y 262 and y 398), so the
// screen fades toward the centre of the board like a printed gradient.
function pointDots() {
  const rows = [];
  for (let y = 42; y <= 618; y += 8) {
    const toward = Math.min(1, Math.abs(y - 330) / 292); // 0 at mid-board, 1 at the bases
    const k = Math.max(0, (toward - 0.23) / 0.77); // tips stay clear
    const r = (0.35 + 2.55 * k * k).toFixed(2);
    rows.push(`<circle cx="4" cy="${y}" r="${r}"/>`);
  }
  return rows.join("");
}

export default {
  id: "halftone",
  name: "Halftone",
  description: "Black paper, screened grey dots and electric lime.",
  scheme: "dark",
  tokens: {
    page: "#0B0B0D",
    surface: "#151518",
    surface2: "#1C1C21",
    surface3: "#24242A",
    glass: "rgba(21,21,24,.94)",
    line: "rgba(245,245,245,.1)",
    lineStrong: "rgba(245,245,245,.22)",
    lineOpaque: "#2E2E34",
    controlBorder: "#62626C",
    ink: "#F5F5F5",
    muted: "#B6B6BD",
    soft: "#76767E",
    accent: "#D7FF3A",
    accent2: "#EDFF8A",
    accentSoft: "rgba(215,255,58,.14)",
    onAccent: "#10140A",
    good: "#7EE08C",
    bad: "#FF7A6B",
    warn: "#FFAD3B",
    info: "#7CC8FF",
    goodSoft: "rgba(126,224,140,.14)",
    badSoft: "rgba(255,122,107,.14)",
    warnSoft: "rgba(255,173,59,.14)",
    infoSoft: "rgba(124,200,255,.14)",
    radiusSm: "2px",
    radiusMd: "2px",
    radiusLg: "2px",
    radiusPill: "2px",
    shadowTile: "none",
    shadowRaised: "0 24px 60px -30px rgba(0,0,0,.9)",
    shadowSheet: "none",
    fontSans: '"Inter", "Helvetica Neue", Helvetica, Arial, -apple-system, "Segoe UI", sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#1C1C20",
    border: "#34343B",
    surface: "#0F0F12",
    bar: "#050506",
    tray: "#050506",
    pointA: "#E8E8EA",
    pointB: "#3A3A42",
    numbers: "#A3A3AA",
    caption: "#A3A3AA",
    checker0: "#FAFAFA",
    rim0: "#0A0A0C",
    detail0: "#BDBDC3",
    count0: "#0A0A0C",
    checker1: "#0A0A0C",
    rim1: "#FAFAFA",
    detail1: "#4A4A54",
    count1: "#FAFAFA",
    die0: "#FAFAFA",
    pips0: "#0A0A0C",
    dieBorder0: "#0A0A0C",
    die1: "#FAFAFA",
    pips1: "#0A0A0C",
    dieBorder1: "#D7FF3A",
    cube: "#D7FF3A",
    cubeText: "#10140A",
    cubeBorder: "#10140A",
    source: "#D7FF3A",
    selection: "#D7FF3A",
    destination: "#D7FF3A",
    destinationText: "#10140A",
    undo: "#FF8A1F",
    undoText: "#1A0E02",
    hover: "#B9E12C",
    focus: "#EDFF8A",
  },
  patterns: {},
  css: `
/* Type: a grotesk, heavy display headings, tabular figures, sentence case. */
html[data-skin="halftone"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="halftone"] .tool-head h1,
html[data-skin="halftone"] .hero h1,
html[data-skin="halftone"] .panel-head h2,
html[data-skin="halftone"] .panel-head h3,
html[data-skin="halftone"] .panel-title,
html[data-skin="halftone"] .dialog-head h2,
html[data-skin="halftone"] .tile h3 {
  font-weight: 800;
  letter-spacing: -0.03em;
  text-transform: none;
}
html[data-skin="halftone"] .hero h1 {
  background: var(--ink);
  -webkit-background-clip: text;
  background-clip: text;
}
html[data-skin="halftone"] .mark {
  border-radius: 2px;
  border-color: var(--line-strong);
  background: var(--surface);
}

/* Chrome: 2px radii, 1px solid borders, flat fills, no shadows, no lift. */
html[data-skin="halftone"] .tool-nav a,
html[data-skin="halftone"] .crumbs a {
  border-radius: 2px;
}
html[data-skin="halftone"] .tool-nav a[aria-current="page"] {
  background: transparent;
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--accent);
}
html[data-skin="halftone"] .panel,
html[data-skin="halftone"] .inspector,
html[data-skin="halftone"] .tile,
html[data-skin="halftone"] .docs-toc--sticky {
  border: 1px solid var(--line-opaque);
  border-radius: 2px;
  background: var(--surface);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="halftone"] .tile::before,
html[data-skin="halftone"] .tile::after {
  display: none;
}
html[data-skin="halftone"] .tile:hover,
html[data-skin="halftone"] .tile:focus-visible,
html[data-skin="halftone"] .tile:active {
  translate: 0 0;
  border-color: var(--control-border);
  box-shadow: none;
}
html[data-skin="halftone"] .panel--quiet {
  background: var(--surface);
  border-color: var(--line-opaque);
}
html[data-skin="halftone"] .panel-head,
html[data-skin="halftone"] .panel-foot {
  border-color: var(--line-opaque);
}
html[data-skin="halftone"] .hub-board-frame {
  border: 1px solid var(--line-opaque);
  border-radius: 2px;
  background: var(--surface);
  box-shadow: none;
}
html[data-skin="halftone"] .stage,
html[data-skin="halftone"] .board-slot,
html[data-skin="halftone"] .board-frame {
  border-radius: 2px;
}

/* Text that sits straight on the shader gets a flat paper-black card. */
html[data-skin="halftone"] .player-strip {
  border: 1px solid var(--line-opaque);
  border-radius: 2px;
  background: var(--surface);
  padding-inline: 10px;
}
html[data-skin="halftone"] .player-strip.active {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent);
}
html[data-skin="halftone"] .action-area {
  padding: 10px 12px;
  border: 1px solid var(--line-opaque);
  border-radius: 2px;
  background: var(--surface);
}
html[data-skin="halftone"] .foot {
  padding: 10px 12px;
  border: 1px solid var(--line-opaque);
  border-radius: 2px;
  background: var(--surface);
}

/* Buttons: flat, outlined, lime primary. Every state keeps its own label colour. */
html[data-skin="halftone"] .btn {
  border-radius: 2px;
  border-color: var(--line-strong);
  background: var(--surface-2);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="halftone"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="halftone"] .btn:active {
  background: var(--surface-3);
  border-color: var(--ink);
}
html[data-skin="halftone"] .btn--primary,
html[data-skin="halftone"] .btn--primary:hover,
html[data-skin="halftone"] .btn--primary:active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
html[data-skin="halftone"] .btn--primary:hover {
  background: var(--accent-2);
  border-color: var(--accent-2);
}
html[data-skin="halftone"] .btn--primary:active {
  border-color: var(--ink);
}
html[data-skin="halftone"] .btn--ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
html[data-skin="halftone"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="halftone"] .btn--ghost:active {
  background: var(--surface-3);
  border-color: var(--ink);
  color: var(--ink);
}
html[data-skin="halftone"] .btn--danger {
  background: transparent;
  border-color: var(--bad);
  color: var(--bad);
}
html[data-skin="halftone"] .btn--danger:hover,
html[data-skin="halftone"] .btn--danger:active {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="halftone"] .btn[aria-pressed="true"],
html[data-skin="halftone"] .btn[aria-pressed="true"]:hover,
html[data-skin="halftone"] .btn[aria-pressed="true"]:active {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--accent);
}

/* Segmented controls and tabs: an outlined track, the chosen segment in lime. */
html[data-skin="halftone"] .segmented {
  padding: 2px;
  border-radius: 2px;
  border-color: var(--line-opaque);
  background: var(--page);
}
html[data-skin="halftone"] .segmented > label,
html[data-skin="halftone"] .segmented > button {
  border-radius: 2px;
}
html[data-skin="halftone"] .segmented > label:has(input:checked),
html[data-skin="halftone"] .segmented > button[aria-pressed="true"],
html[data-skin="halftone"] .segmented > button[aria-checked="true"],
html[data-skin="halftone"] .segmented > [aria-selected="true"] {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: none;
}
html[data-skin="halftone"] .segmented > label:has(input:checked):hover,
html[data-skin="halftone"] .segmented > button[aria-pressed="true"]:hover,
html[data-skin="halftone"] .segmented > button[aria-checked="true"]:hover,
html[data-skin="halftone"] .segmented > [aria-selected="true"]:hover {
  color: var(--on-accent);
}
html[data-skin="halftone"] .tabs {
  border-bottom-color: var(--line-opaque);
}
html[data-skin="halftone"] .tabs > [role="tab"] {
  border-radius: 0;
}
html[data-skin="halftone"] .tabs--pill > [role="tab"] {
  border-radius: 2px;
}
html[data-skin="halftone"] .tabs.has-indicator::after {
  border-radius: 0;
  background: var(--accent);
}

/* Fields, dialogs, toasts. */
html[data-skin="halftone"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="halftone"] .field select,
html[data-skin="halftone"] .field textarea {
  border-radius: 2px;
  border-color: var(--control-border);
  background: var(--page);
  box-shadow: none;
}
html[data-skin="halftone"] .field input:focus-visible,
html[data-skin="halftone"] .field select:focus-visible,
html[data-skin="halftone"] .field textarea:focus-visible {
  border-color: var(--accent);
}
html[data-skin="halftone"] .dialog {
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}
html[data-skin="halftone"] .dialog::backdrop {
  background: rgba(11,11,13,.78);
  backdrop-filter: none;
}
html[data-skin="halftone"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="halftone"] .toast {
  border: 1px solid var(--line-opaque);
  border-left: 3px solid var(--accent);
  border-radius: 2px;
  background: var(--surface-2);
  box-shadow: none;
}
html[data-skin="halftone"] .toast--alert {
  border-left-color: var(--bad);
}
html[data-skin="halftone"] .toast--good {
  border-left-color: var(--good);
}
html[data-skin="halftone"] .docs-section {
  border-top-color: var(--line-opaque);
}
html[data-skin="halftone"] .docs-toc a {
  border-radius: 2px;
}

/* Board. Frame: graphite with a 12% halftone screen. Surface and bar: flat
   near-black. Points: paper white and graphite, each screened with dots that
   grow toward the base, hairline edge in the bar colour. Pieces: flat discs,
   a crisp contrasting rim, no gradient anywhere. */
html[data-skin="halftone"] .bg-board text {
  font-family: var(--font-sans);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
html[data-skin="halftone"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-halftone-screen);
  opacity: 0.12;
}
html[data-skin="halftone"] .bg-board [data-pattern="surface"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="halftone"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-halftone-rule);
}
html[data-skin="halftone"] .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="halftone"] .bg-board .point-shape {
  stroke: var(--board-bar);
  stroke-width: 1;
  stroke-linejoin: miter;
}
html[data-skin="halftone"] .bg-board [data-pattern="pointA"] {
  fill: url(#skin-halftone-point-dark);
}
html[data-skin="halftone"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-halftone-point-light);
}
/* The overlay clones the face radius and hides the inner half of the rim
   stroke; a 4-unit stroke leaves a crisp 2-unit ring outside the face. */
html[data-skin="halftone"] .bg-board .checker > circle:first-child {
  stroke-width: 4;
}
html[data-skin="halftone"] .bg-board .checker [data-pattern="checker0"],
html[data-skin="halftone"] .bg-board .checker [data-pattern="checker1"],
html[data-skin="halftone"] .bg-board [data-pattern="die0"],
html[data-skin="halftone"] .bg-board [data-pattern="die1"],
html[data-skin="halftone"] .bg-board [data-pattern="cube"] {
  fill: none;
}
html[data-skin="halftone"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 2;
}
html[data-skin="halftone"] .bg-board .board-cube .cube-face {
  stroke-width: 2;
}
`,
  defs: `
<pattern id="skin-halftone-screen" patternUnits="userSpaceOnUse" width="10" height="10">
  <circle cx="5" cy="5" r="1.7" fill="#FFFFFF"/>
</pattern>
<pattern id="skin-halftone-point-dark" patternUnits="userSpaceOnUse" x="0" y="0" width="8" height="584" fill="#3A3A42" fill-opacity=".26">
  <rect x="0" y="0" width="8" height="584" fill="none"/>${pointDots()}
</pattern>
<pattern id="skin-halftone-point-light" patternUnits="userSpaceOnUse" x="0" y="0" width="8" height="584" fill="#E8E8EA" fill-opacity=".13">
  <rect x="0" y="0" width="8" height="584" fill="none"/>${pointDots()}
</pattern>
<linearGradient id="skin-halftone-rule" x1="0" y1="0" x2="1" y2="0">
  <stop offset=".475" stop-color="#D7FF3A" stop-opacity="0"/>
  <stop offset=".475" stop-color="#D7FF3A" stop-opacity=".55"/>
  <stop offset=".525" stop-color="#D7FF3A" stop-opacity=".55"/>
  <stop offset=".525" stop-color="#D7FF3A" stop-opacity="0"/>
</linearGradient>
`,
  shader: {
    // Halftone field: a 14 px dot grid (scaled with the viewport height) whose
    // dot radii follow two slow crossing waves and a drifting fbm, drawn as
    // graphite dots on the page colour; the pointer swells nearby dots; one
    // cell in forty carries a muted lime tint. Dots never exceed 0.46 of a
    // cell, so they never touch and nothing flickers.
    fragment: `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_c1; // page: the paper
uniform vec3 u_c2; // graphite: the dot ink
uniform vec3 u_c3; // lime: the accent cells
uniform vec3 u_c4; // light graphite: dots under the pointer
uniform float u_dark;

// Lattice hash on a 512-cell torus so the drifting fbm domain stays small.
float hash(vec2 i) {
  i = mod(i, 512.0);
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
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}

void main() {
  float t = u_time;
  float aspect = u_resolution.x / u_resolution.y;

  // Cell grid: 14 device px at a 900 px tall viewport, never under 11 px.
  float cell = max(11.0, 14.0 * u_resolution.y / 900.0);
  vec2 g = gl_FragCoord.xy / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;

  // Every dot takes its radius from its cell centre, so each disc stays a
  // clean circle and the modulation reads as a screen, not a texture.
  vec2 c = (id + 0.5) * cell / u_resolution;
  vec2 cu = vec2(c.x * aspect, c.y);

  // Two slow crossing waves (periods 16 s and 21 s) and a drifting fbm.
  float w1 = 0.5 + 0.5 * sin(cu.x * 6.0 + t * 0.4);
  float w2 = 0.5 + 0.5 * sin(cu.y * 5.0 - t * 0.3);
  float n = fbm(cu * 2.6 + vec2(t * 0.045, -t * 0.03));
  float amp = clamp(0.22 + 0.55 * w1 * w2 + 0.7 * (n - 0.5), 0.0, 1.0);
  float radius = 0.06 + 0.4 * amp;

  // Pointer: dots within ~240 px swell and lighten (idle until it moves).
  vec2 pc = (id + 0.5) * cell;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float near = live * smoothstep(240.0, 40.0, length(pc - u_pointer));
  radius = min(0.46, radius + 0.12 * near);

  // Ink: graphite, lighter under the pointer; one cell in forty is printed
  // smaller in lime held to 40% so a speck under muted text still clears a
  // 3:1 contrast (the sampler in the board harness checks this).
  float accentCell = step(0.975, hash(id * 1.37 + 11.0));
  radius *= 1.0 - 0.25 * accentCell;
  vec3 ink = mix(u_c2, u_c4, near);
  ink = mix(ink, u_c3 * 0.4, accentCell);

  // Slightly fuller ink on dark pages; a touch lighter paper in light mode.
  ink = mix(ink, u_c1, 0.08 * (1.0 - u_dark));

  // Anti-aliased disc: the edge is one device pixel wide.
  float aa = 0.8 / cell;
  float d = length(f);
  float dot_ = 1.0 - smoothstep(radius - aa, radius + aa, d);

  vec3 col = mix(u_c1, ink, dot_);
  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#0B0B0D", "#2A2A30", "#D7FF3A", "#3C3C45"],
    speed: 1,
    fps: 60,
    stillAt: 5,
  },
  preview: "radial-gradient(circle at 1px 1px, #2A2A30 1px, transparent 1.6px) 0 0 / 7px 7px, linear-gradient(160deg, #0B0B0D, #151518 70%, #1C1C20)",
};
