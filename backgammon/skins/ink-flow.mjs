// SPDX-License-Identifier: GPL-3.0-or-later
// Ink Flow: black and indigo ink swirling slowly in water on cream paper.
// Suminagashi, not a device: the page is flat paper with 1px ink rules, the
// board is printed in two inks (indigo and ink-grey points, an ink bar), the
// pieces are cream and ink discs with the opposite rim, and the only light is
// the shader's curl-noise flow that never settles. Shape and rules:
// docs/redesign/backgammon-themes/skin-contract.md §2.
const P = 'html[data-skin="ink-flow"]';
const SERIF =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_c1; // page: cream paper
uniform vec3 u_c2; // black ink
uniform vec3 u_c3; // indigo ink
uniform vec3 u_c4; // surface: the paper's brightest fibre
uniform float u_dark;

// Lattice hash on a 256-cell torus: the advected domain drifts for minutes
// without the coordinates growing past float precision.
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

// Two octaves for the flow potential (sampled four times per curl), three for
// the ink itself.
float potential(vec2 p) {
  return vnoise(p) + 0.5 * vnoise(p * 2.07 + vec2(3.1, 7.7));
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Curl of the potential: a divergence-free velocity, so the ink is stirred
// and stretched into veins but never piles up or drains away.
vec2 curl(vec2 p) {
  const float e = 0.05;
  float dx = potential(p + vec2(e, 0.0)) - potential(p - vec2(e, 0.0));
  float dy = potential(p + vec2(0.0, e)) - potential(p - vec2(0.0, e));
  return vec2(dy, -dx) / (2.0 * e);
}

// A soft band of ink where the density field crosses c.
float vein(float v, float c, float w, float s) {
  return smoothstep(c - w - s, c - w, v) * (1.0 - smoothstep(c + w, c + w + s, v));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.y;
  float t = u_time * 0.02;
  vec2 p = uv * 2.0;

  // The pointer stirs the water: a tangential push that fades within about a
  // third of the screen height (idle until the pointer first moves).
  vec2 d = (gl_FragCoord.xy - u_pointer) / u_resolution.y;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float stir = live * exp(-dot(d, d) * 28.0);
  p += 0.45 * stir * vec2(-d.y, d.x);

  // Curl-noise advection: four small steps along a slowly drifting flow.
  for (int i = 0; i < 4; i++) {
    p += 0.08 * curl(p * 0.9 + vec2(t, 0.37 * t));
  }

  // Ink density, then veins: one main vein and two hairlines either side, as
  // a comb drawn through floating ink leaves them.
  float v = fbm(p * 1.6 + vec2(7.3, 2.9));
  float ink = vein(v, 0.50, 0.013, 0.014)
            + 0.55 * vein(v, 0.585, 0.006, 0.012)
            + 0.55 * vein(v, 0.415, 0.006, 0.012);
  ink = min(ink, 1.0);

  // Which ink: a second, broader field decides black or indigo per region.
  float which = fbm(p * 0.7 + vec2(31.0, 17.0));
  vec3 inkColor = mix(u_c2, u_c3, smoothstep(0.42, 0.58, which));

  // Paper first: the brightest fibre where the water is clearest, then the
  // ink mixed over the cream at 35% so the veins stay a wash, not a line.
  vec3 col = mix(u_c1, u_c4, 0.35 * (1.0 - smoothstep(0.30, 0.50, v)));
  col = mix(col, inkColor, 0.35 * ink);

  gl_FragColor = vec4(col, 1.0);
}
`;

const CSS = `
/* ---- type: serif headings, a 500-weight sans body, lining figures ---- */
${P} body {
  font-weight: 500;
  font-variant-numeric: lining-nums tabular-nums;
}
${P} .tool-head h1,
${P} .hero h1,
${P} .panel-head h2,
${P} .panel-head h3,
${P} .panel-title,
${P} .dialog-head h2,
${P} .tile h3,
${P} .tile--featured h3 {
  font-family: ${SERIF};
  font-weight: 500;
  letter-spacing: -0.01em;
  text-transform: none;
}
${P} .tool-head h1 {
  font-size: 1.85rem;
}
${P} .hero h1 {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: var(--ink);
  -webkit-text-fill-color: var(--ink);
  letter-spacing: -0.015em;
  line-height: 1.02;
}
${P} .panel-head h2,
${P} .panel-head h3,
${P} .panel-title {
  font-size: 1.3rem;
}
${P} ::selection {
  background: var(--accent);
  color: var(--on-accent);
}

/* ---- topbar: one ink rule, the mark as a small ink square ---- */
${P} .topbar {
  border-bottom: 1px solid var(--line);
}
${P} .mark {
  border: 1px solid var(--ink);
  border-radius: var(--r-sm);
  background: var(--ink);
  color: var(--surface);
  box-shadow: none;
}
${P} .crumbs a:hover .mark {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: none;
}
/* The crumbs, nav and tabs sit directly on the shader: ink text, not muted,
   and the tab row on a paper strip. */
${P} .tool-nav a,
${P} .crumbs a,
${P} .crumbs .brand,
${P} .crumbs {
  border-radius: var(--r-sm);
  color: var(--ink);
  font-weight: 500;
}
${P} .crumb-sep {
  color: var(--muted);
}
${P} .tool-nav a:hover {
  background: var(--glass);
}
${P} .tool-nav a[aria-current="page"],
${P} .tool-nav a[aria-current="true"] {
  background: var(--glass);
  color: var(--ink);
  box-shadow: inset 0 -2px 0 var(--accent);
}

/* ---- surfaces: opaque paper with a 15% ink rule, no shadows, no glow ---- */
${P} .panel,
${P} .inspector,
${P} .tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: none;
}
${P} .panel--quiet {
  background: var(--surface);
}
${P} .panel-head,
${P} .panel-foot {
  border-color: var(--line);
}
${P} .tile::before,
${P} .tile::after {
  display: none;
}
${P} .tile:hover,
${P} .tile:focus-visible {
  translate: 0 0;
  border-color: var(--ink);
  box-shadow: none;
}
${P} .tile:active {
  translate: 0 0;
}
${P} .tile-icon {
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  box-shadow: none;
}
${P} .tile:hover .tile-icon {
  scale: 1;
  rotate: 0deg;
}

/* ---- stage: the strips, action row and footer sit on the shader, so they
   get a paper backing (glass) that keeps their text legible ---- */
${P} .player-strip {
  min-height: 36px;
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
${P} .player-strip.active {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line-strong);
  box-shadow: inset 3px 0 0 var(--accent);
}
${P} .action-area {
  padding: 10px 12px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
${P} .draft-line {
  color: var(--muted);
}
${P} .foot {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
${P} .foot a {
  color: var(--ink);
}
${P} .foot a:hover {
  color: var(--accent);
}
${P} .board-frame,
${P} .board-slot {
  border-radius: var(--r-sm);
  box-shadow: none;
}

/* ---- controls: 2px corners, 1px rules, indigo primary, outlined ghost ---- */
${P} .btn {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: var(--surface);
  color: var(--ink);
  font-weight: 500;
  box-shadow: none;
}
${P} .btn:hover {
  background: var(--surface-2);
  border-color: var(--ink);
}
${P} .btn:active {
  background: var(--surface-3);
}
${P} .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
${P} .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 86%, black);
  border-color: color-mix(in oklab, var(--accent) 86%, black);
  color: var(--on-accent);
}
${P} .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 74%, black);
  color: var(--on-accent);
}
${P} .btn--ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
${P} .btn--ghost:hover {
  background: var(--glass);
  border-color: var(--ink);
  color: var(--ink);
}
${P} .btn--ghost:active {
  background: var(--surface-2);
}
${P} .btn--danger {
  background: transparent;
  border-color: var(--bad);
  color: var(--bad);
}
${P} .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
${P} .btn[aria-pressed="true"],
${P} .btn--ghost[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
${P} .btn[aria-pressed="true"]:hover,
${P} .btn--ghost[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: var(--ink);
  color: var(--ink);
}
${P} .segmented {
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  background: var(--surface);
}
${P} .segmented > label,
${P} .segmented > button {
  border-radius: var(--r-sm);
  font-weight: 500;
}
${P} .segmented > label:has(input:checked),
${P} .segmented > button[aria-pressed="true"],
${P} .segmented > button[aria-checked="true"],
${P} .segmented > [aria-selected="true"] {
  background: var(--ink);
  color: var(--surface);
  box-shadow: none;
}
${P} .tabs {
  border-bottom-color: var(--line);
  border-radius: var(--r-sm) var(--r-sm) 0 0;
  background: var(--glass);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}
${P} .tabs > [role="tab"] {
  border-radius: var(--r-sm) var(--r-sm) 0 0;
  font-weight: 500;
}
${P} .tabs > [role="tab"][aria-selected="true"] {
  box-shadow: inset 0 -2px 0 var(--ink);
}
${P} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${P} .field select,
${P} .field textarea {
  border-radius: var(--r-sm);
  border-color: var(--control-border);
  background: var(--surface);
  box-shadow: none;
}
${P} .field input:focus-visible,
${P} .field select:focus-visible,
${P} .field textarea:focus-visible {
  border-color: var(--accent);
}
${P} .field > label,
${P} .field-label {
  font-weight: 500;
}
${P} .dialog {
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: none;
}
${P} .dialog::backdrop {
  background: color-mix(in srgb, var(--ink) 32%, transparent);
}
${P} .dialog-head,
${P} .dialog-foot {
  border-color: var(--line);
}
${P} .toast {
  border: 1px solid var(--ink);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
}
${P} .toast--alert {
  border-left-color: var(--bad);
  background: var(--surface);
}
${P} .toast--good {
  border-left-color: var(--good);
  background: var(--surface);
}
${P} .docs-section {
  border-top-color: var(--line);
}
${P} .docs-toc a {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: var(--glass);
  color: var(--ink);
  font-weight: 500;
}
${P} .docs-toc a:hover,
${P} .docs-toc a[aria-current] {
  border-color: var(--ink);
  background: var(--surface);
  color: var(--ink);
}
${P} .docs-release,
${P} .docs-flow-caption,
${P} .group-head span,
${P} .hub-recent {
  color: var(--ink);
}

/* ---- board: printed paper. Flat frame, a marbled wash on the playing
   surface, points flat with a 1px ink outline, flat discs and dice. ---- */
${P} .bg-board text {
  font-family: var(--font-sans);
  font-weight: 500;
}
${P} .bg-board [data-pattern="frame"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
${P} .bg-board [data-pattern="surface"] {
  fill: var(--board-bar);
  filter: url(#skin-ink-flow-marble);
  opacity: 0.08;
}
${P} .bg-board [data-pattern="bar"] {
  fill: url(#skin-ink-flow-bar);
}
${P} .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
${P} .bg-board .point-shape {
  stroke: var(--board-bar);
  stroke-width: 1;
  stroke-linejoin: miter;
}
${P} .bg-board [data-pattern="pointA"],
${P} .bg-board [data-pattern="pointB"] {
  fill: none;
}
/* The cream disc is within 1.1:1 of the surface, so the ink rim carries it;
   the ink disc on the ink bar is carried by its cream rim. 3 units render
   about 1.3 px on a 390-wide phone board. */
${P} .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
${P} .bg-board .checker[data-player="1"] > [data-pattern="checker1"] {
  r: 20.5px;
}
${P} .bg-board .board-die-face > rect:first-child {
  stroke-width: 2;
}
${P} .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
${P} .bg-board .board-cube text {
  font-family: ${SERIF};
  font-weight: 500;
}
${P} .bg-board .dice-switch-surface {
  fill: var(--surface);
  stroke: var(--line-strong);
}
`;

const DEFS = `
<filter id="skin-ink-flow-marble" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.0045 0.011" numOctaves="4" seed="11" result="noise"/>
  <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.106  0 0 0 0 0.106  0 0 0 0 0.141  1.6 0.8 0 0 -0.55" result="ink"/>
  <feComponentTransfer in="ink" result="veins">
    <feFuncA type="table" tableValues="0 0 0.2 1 0.3 0 0 0.6 1 0.4 0 0 0 0.8 1 0"/>
  </feComponentTransfer>
  <feComposite in="veins" in2="SourceAlpha" operator="in"/>
</filter>
<linearGradient id="skin-ink-flow-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFDF8" stop-opacity="0"/>
  <stop offset="0.48" stop-color="#FFFDF8" stop-opacity="0"/>
  <stop offset="0.48" stop-color="#FFFDF8" stop-opacity="0.22"/>
  <stop offset="0.52" stop-color="#FFFDF8" stop-opacity="0.22"/>
  <stop offset="0.52" stop-color="#FFFDF8" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFDF8" stop-opacity="0"/>
</linearGradient>
`;

export default {
  id: "ink-flow",
  name: "Ink Flow",
  description: "Black and indigo ink drifting on cream paper.",
  scheme: "light",
  tokens: {
    page: "#F4F1EA",
    surface: "#FFFDF8",
    surface2: "#F6F3EC",
    surface3: "#ECE8DE",
    glass: "rgba(255,253,248,.86)",
    line: "rgba(27,27,36,.15)",
    lineStrong: "rgba(27,27,36,.3)",
    lineOpaque: "#DDDBD8",
    controlBorder: "#8A8A96",
    ink: "#1B1B24",
    muted: "#5F5F6B",
    soft: "#7A7A86",
    accent: "#2436A8",
    accent2: "#C2410C",
    accentSoft: "rgba(36,54,168,.1)",
    onAccent: "#FFFFFF",
    good: "#1F7A4A",
    bad: "#B3261E",
    warn: "#8A5A00",
    info: "#2F5FB3",
    goodSoft: "rgba(31,122,74,.12)",
    badSoft: "rgba(179,38,30,.12)",
    warnSoft: "rgba(138,90,0,.12)",
    infoSoft: "rgba(47,95,179,.12)",
    radiusSm: "2px",
    radiusMd: "3px",
    radiusLg: "4px",
    radiusPill: "4px",
    shadowTile: "none",
    shadowRaised: "none",
    shadowSheet: "none",
    fontSans:
      'Inter, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#ECE7DC",
    border: "#B9B4A8",
    surface: "#F8F5EE",
    bar: "#1B1B24",
    tray: "#E4DFD2",
    pointA: "#2436A8",
    pointB: "#8A8A96",
    numbers: "#4A4A58",
    caption: "#5F5F6B",
    checker0: "#FFFDF8",
    rim0: "#1B1B24",
    detail0: "#D9D5CC",
    count0: "#1B1B24",
    checker1: "#1B1B24",
    rim1: "#FFFDF8",
    detail1: "#4A4A58",
    count1: "#FFFDF8",
    die0: "#FFFDF8",
    pips0: "#1B1B24",
    dieBorder0: "#1B1B24",
    die1: "#FFFDF8",
    pips1: "#2436A8",
    dieBorder1: "#2436A8",
    cube: "#2436A8",
    cubeText: "#FFFFFF",
    cubeBorder: "#1B1B24",
    source: "#C2410C",
    selection: "#C2410C",
    destination: "#C2410C",
    destinationText: "#FFFFFF",
    undo: "#8A5A00",
    undoText: "#FFFFFF",
    hover: "#2436A8",
    focus: "#C2410C",
  },
  patterns: {},
  css: CSS,
  defs: DEFS,
  shader: {
    fragment: FRAGMENT,
    colors: ["#F4F1EA", "#1B1B24", "#2436A8", "#FFFDF8"],
    speed: 1,
    fps: 60,
    stillAt: 15,
  },
  preview:
    "linear-gradient(150deg, #FFFDF8 0%, #F4F1EA 42%, #2436A8 50%, #F4F1EA 58%, #ECE7DC 78%, #1B1B24 86%, #F4F1EA 92%)",
};
