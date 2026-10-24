// SPDX-License-Identifier: GPL-3.0-or-later
// Frosted Glass: blurred colour orbs drifting behind frosted white panels.
// Glassmorphism done quietly: every surface is translucent white with a
// backdrop blur and a hairline inner highlight, the board is a white glass
// slab, the pieces are glossy white and navy discs. Azure is the only accent,
// peach the only warmth. Shape and rules: skin-contract.md §2.
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Inter, Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const FRAGMENT = `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; /* page */
uniform vec3  u_c2; /* azure orb */
uniform vec3  u_c3; /* peach orb */
uniform vec3  u_c4; /* mint orb */
uniform float u_dark;

/* Static grain: a lattice hash of the pixel position, no time term, so the
   frost never shimmers and the reduced-motion still carries the same grain. */
float grain(vec2 p) {
  p = mod(p, 512.0);
  vec3 q = fract(vec3(p.x, p.y, p.x + p.y) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

/* One soft disc: a gaussian falloff of radius r (screen heights) around c,
   with the horizontal axis corrected for aspect so discs stay round. */
float disc(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (2.0 * r * r));
}

/* Lissajous centre: two incommensurate sine frequencies per axis, so the
   path never repeats within ten minutes and never visibly resets. */
vec2 path(vec2 base, vec2 amp, vec2 freq, vec2 phase, float t) {
  return base + amp * sin(freq * t + phase);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;

  /* Lavender derived from the azure: shifted toward violet, lifted. */
  vec3 lavender = mix(u_c2, vec3(0.86, 0.80, 0.98), 0.6);

  /* Four orbs on slow lissajous paths across a 16:9-ish field; amplitudes
     are in screen heights, frequencies in radians per second (periods of
     60–140 s), so a frame-to-frame change is far below perception. */
  vec2 c1 = path(vec2(0.28 * aspect, 0.70), vec2(0.22 * aspect, 0.18), vec2(0.071, 0.053), vec2(0.0, 1.9), t);
  vec2 c2 = path(vec2(0.74 * aspect, 0.30), vec2(0.20 * aspect, 0.20), vec2(0.047, 0.089), vec2(2.4, 0.6), t);
  vec2 c3 = path(vec2(0.62 * aspect, 0.78), vec2(0.24 * aspect, 0.16), vec2(0.059, 0.067), vec2(4.1, 3.3), t);
  vec2 c4 = path(vec2(0.22 * aspect, 0.24), vec2(0.18 * aspect, 0.20), vec2(0.083, 0.043), vec2(1.2, 5.0), t);

  /* Gaussian weights stand in for the blur of a disc seen through frost;
     discs shrink a little on portrait screens so they stay discs. */
  float r = mix(0.7, 1.0, smoothstep(0.4, 1.4, aspect));
  float w1 = disc(p, c1, 0.30 * r);
  float w2 = disc(p, c2, 0.27 * r);
  float w3 = disc(p, c3, 0.24 * r);
  float w4 = disc(p, c4, 0.26 * r);
  float wsum = w1 + w2 + w3 + w4;

  /* Weighted average of the orb tints (overlaps blend, they never stack
     darker), then coverage decides how much tint reaches the page. */
  vec3 tint = (u_c2 * w1 + u_c3 * w2 + u_c4 * w3 + lavender * w4) / max(wsum, 1e-4);
  float cover = 1.0 - exp(-1.6 * wsum);
  vec3 col = mix(u_c1, tint, cover);

  /* Mixed 60% back to the page: the orbs stay a suggestion under the glass. */
  col = mix(col, u_c1, 0.6);

  /* A broad, very soft top light: the diffuse room light of the brief. */
  col += 0.018 * smoothstep(0.2, 1.0, uv.y);

  /* Pointer: a faint cool glow within 320px once the pointer has moved. */
  float live = step(0.5, u_pointer.x + u_pointer.y);
  vec2 pp = (gl_FragCoord.xy - u_pointer) / 320.0;
  float glow = exp(-dot(pp, pp)) * live;
  col = mix(col, u_c2, 0.08 * glow);

  /* 1.5% frost grain, zero-mean. */
  col += (grain(gl_FragCoord.xy) - 0.5) * 0.015;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const CSS = `
/* ---- type ---- */
html[data-skin="frosted"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="frosted"] .tool-head h1,
html[data-skin="frosted"] .hero h1,
html[data-skin="frosted"] .panel-head h2,
html[data-skin="frosted"] .panel-head h3,
html[data-skin="frosted"] .panel-title,
html[data-skin="frosted"] .dialog-head h2,
html[data-skin="frosted"] .group-head h2,
html[data-skin="frosted"] .tile h3,
html[data-skin="frosted"] .tile--featured h3 {
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
html[data-skin="frosted"] .hero h1 {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: var(--ink);
  font-weight: 700;
  letter-spacing: -0.02em;
}
html[data-skin="frosted"] .crumb-current,
html[data-skin="frosted"] .mark {
  letter-spacing: 0;
  font-weight: 600;
}

/* ---- glass ----
   Every raised surface is the same material: translucent white, a 24px
   backdrop blur with a little extra saturation, a hairline inner highlight
   and a soft, wide shadow. The orbs behind read through it as colour wash. */
html[data-skin="frosted"] .panel,
html[data-skin="frosted"] .inspector,
html[data-skin="frosted"] .tile,
html[data-skin="frosted"] .dialog,
html[data-skin="frosted"] .toast,
html[data-skin="frosted"] .docs-card,
html[data-skin="frosted"] .docs-callout,
html[data-skin="frosted"] .flow-question {
  background: var(--glass);
  border: 1px solid color-mix(in srgb, var(--surface) 80%, transparent);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}
html[data-skin="frosted"] .panel--quiet {
  background: color-mix(in srgb, var(--surface) 40%, transparent);
  box-shadow: none;
}
html[data-skin="frosted"] .panel-head,
html[data-skin="frosted"] .panel-foot,
html[data-skin="frosted"] .dialog-head,
html[data-skin="frosted"] .dialog-foot,
html[data-skin="frosted"] .tabs,
html[data-skin="frosted"] .docs-section {
  border-color: var(--line);
}
html[data-skin="frosted"] .dialog-foot {
  background: transparent;
}
html[data-skin="frosted"] .dialog {
  box-shadow: var(--shadow-sheet);
}
html[data-skin="frosted"] .dialog::backdrop {
  background: color-mix(in srgb, var(--ink) 26%, transparent);
}
html[data-skin="frosted"] .toast {
  border-radius: var(--r-md);
  box-shadow: var(--shadow-raised);
}
html[data-skin="frosted"] .toast--alert {
  background: color-mix(in srgb, var(--bad) 12%, var(--glass));
}
html[data-skin="frosted"] .toast--good {
  background: color-mix(in srgb, var(--good) 12%, var(--glass));
}
html[data-skin="frosted"] .tile:hover,
html[data-skin="frosted"] .tile:focus-visible {
  border-color: color-mix(in srgb, var(--surface) 95%, transparent);
  box-shadow: var(--shadow-raised);
}
html[data-skin="frosted"] .tile::before {
  background: radial-gradient(460px circle at var(--mx) var(--my), color-mix(in srgb, var(--accent) 8%, transparent), transparent 45%);
}
html[data-skin="frosted"] .hub-feature > .tile {
  background: none;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="frosted"] .hub-board-frame {
  border-radius: var(--r-lg);
  background: var(--glass);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface) 80%, transparent), var(--shadow-tile);
}

/* ---- topbar ---- */
html[data-skin="frosted"] .mark {
  border-color: color-mix(in srgb, var(--surface) 80%, transparent);
  border-radius: 10px;
  background: var(--glass);
  box-shadow: var(--shadow-tile);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}
html[data-skin="frosted"] .tool-nav a,
html[data-skin="frosted"] .crumbs a,
html[data-skin="frosted"] .docs-toc a {
  border-radius: var(--r-pill);
}
html[data-skin="frosted"] .tool-nav a[aria-current="page"] {
  background: var(--glass);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface) 80%, transparent), var(--shadow-tile);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}

/* ---- controls ----
   Buttons are glass by colour only: a page can hold thirty of them, so the
   backdrop blur stays on the panels, strips and sheets around them. */
html[data-skin="frosted"] .btn {
  border-radius: var(--r-sm);
  border-color: color-mix(in srgb, var(--surface) 80%, transparent);
  background: var(--glass);
  color: var(--ink);
  box-shadow: inset 0 1px 0 var(--surface), 0 2px 8px color-mix(in srgb, var(--ink) 6%, transparent);
}
html[data-skin="frosted"] .btn:hover {
  background: var(--surface);
  border-color: var(--line-strong);
}
html[data-skin="frosted"] .btn:active {
  background: var(--surface-3);
}
html[data-skin="frosted"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--surface) 35%, transparent), 0 8px 20px color-mix(in srgb, var(--accent) 28%, transparent);
}
html[data-skin="frosted"] .btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 88%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 88%, var(--surface));
  color: var(--on-accent);
}
html[data-skin="frosted"] .btn--primary:active {
  background: color-mix(in srgb, var(--accent) 85%, var(--ink));
  color: var(--on-accent);
}
html[data-skin="frosted"] .btn--ghost {
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  border-color: color-mix(in srgb, var(--surface) 55%, transparent);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="frosted"] .btn--ghost:hover {
  background: var(--glass);
  border-color: color-mix(in srgb, var(--surface) 80%, transparent);
  color: var(--ink);
}
html[data-skin="frosted"] .btn--danger {
  background: color-mix(in srgb, var(--bad) 8%, var(--glass));
  border-color: color-mix(in srgb, var(--bad) 35%, transparent);
  color: var(--bad);
  box-shadow: none;
}
html[data-skin="frosted"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="frosted"] .btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="frosted"] .segmented {
  background: color-mix(in srgb, var(--ink) 6%, transparent);
  border-color: color-mix(in srgb, var(--surface) 60%, transparent);
}
html[data-skin="frosted"] .segmented > label:has(input:checked),
html[data-skin="frosted"] .segmented > button[aria-pressed="true"],
html[data-skin="frosted"] .segmented > button[aria-checked="true"],
html[data-skin="frosted"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ink) 12%, transparent);
}
html[data-skin="frosted"] .tabs > [role="tab"] {
  border-radius: var(--r-sm) var(--r-sm) 0 0;
}
html[data-skin="frosted"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="frosted"] .field select,
html[data-skin="frosted"] .field textarea {
  border-radius: var(--r-sm);
  border-color: var(--control-border);
  background: var(--surface);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent);
}

/* ---- stage ---- */
html[data-skin="frosted"] .player-strip {
  border-radius: var(--r-pill);
  padding-inline: 12px;
  background: color-mix(in srgb, var(--surface) 45%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface) 70%, transparent);
}
html[data-skin="frosted"] .player-strip.active {
  background: var(--glass);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface) 85%, transparent), var(--shadow-tile);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}
html[data-skin="frosted"] .checker-dot {
  box-shadow: 0 0 0 1px var(--control-border);
}

/* ---- board ----
   The frame is a white glass slab: a top highlight that fades by the middle
   and a hint of navy shade along the bottom edge. The surface and bar are
   flat frosted panes; the points stay soft and flat with one highlight at
   their base. */
html[data-skin="frosted"] .bg-board text {
  font-family: var(--font-sans);
  font-weight: 600;
}
html[data-skin="frosted"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-frosted-frame);
  stroke: var(--board-surface);
  stroke-width: 1.5;
}
html[data-skin="frosted"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-frosted-surface);
}
html[data-skin="frosted"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-frosted-bar);
}
html[data-skin="frosted"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-frosted-tray);
  stroke: var(--board-surface);
  stroke-width: 1;
}
html[data-skin="frosted"] .bg-board .point-shape {
  stroke: none;
}
html[data-skin="frosted"] .bg-board [data-pattern="pointA"],
html[data-skin="frosted"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-frosted-point);
}
/* Glossy discs: a bright top band over the face, a navy shade at the foot.
   The white face sits within 1.8:1 of the azure points, so its azure rim
   carries the separation there; 3 user units is >= 1.3 px on a phone board.
   The rim is a mid azure so the deep azure source and selection rings read
   as something new around it. */
html[data-skin="frosted"] .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
html[data-skin="frosted"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-frosted-gloss-white);
}
html[data-skin="frosted"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-frosted-gloss-navy);
}
html[data-skin="frosted"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="frosted"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-frosted-gloss-white);
}
html[data-skin="frosted"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-frosted-gloss-navy);
}
html[data-skin="frosted"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-frosted-gloss-cube);
}
html[data-skin="frosted"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
`;

const DEFS = `
<linearGradient id="skin-frosted-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.35"/>
  <stop offset="1" stop-color="#1C2340" stop-opacity="0.05"/>
</linearGradient>
<radialGradient id="skin-frosted-surface" cx="0.2" cy="0" r="1.1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/>
  <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.1"/>
  <stop offset="1" stop-color="#1C2340" stop-opacity="0.03"/>
</radialGradient>
<linearGradient id="skin-frosted-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="0.3" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="0.75" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#1C2340" stop-opacity="0.08"/>
</linearGradient>
<linearGradient id="skin-frosted-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.6"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.1"/>
  <stop offset="1" stop-color="#1C2340" stop-opacity="0.06"/>
</linearGradient>
<linearGradient id="skin-frosted-point" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.3"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
<linearGradient id="skin-frosted-gloss-white" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="0.46" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="0.47" stop-color="#1C2340" stop-opacity="0.04"/>
  <stop offset="1" stop-color="#1C2340" stop-opacity="0.16"/>
</linearGradient>
<linearGradient id="skin-frosted-gloss-navy" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="0.46" stop-color="#FFFFFF" stop-opacity="0.14"/>
  <stop offset="0.47" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
</linearGradient>
<linearGradient id="skin-frosted-gloss-cube" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.4"/>
  <stop offset="0.46" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="0.47" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
</linearGradient>
`;

export default {
  id: "frosted",
  name: "Frosted Glass",
  description: "Colour orbs behind frosted white glass, azure and peach points.",
  scheme: "light",
  tokens: {
    page: "#F2F4F8",
    surface: "#FFFFFF",
    surface2: "#F6F8FC",
    surface3: "#EAEEF6",
    glass: "rgba(255,255,255,.62)",
    line: "rgba(23,25,43,.08)",
    lineStrong: "rgba(23,25,43,.16)",
    lineOpaque: "#DDE2EC",
    controlBorder: "#8A93A8",
    ink: "#17192B",
    muted: "#535A6E",
    soft: "#6B7287",
    accent: "#1E6BE6",
    accent2: "#FF8A5B",
    accentSoft: "rgba(30,107,230,.12)",
    onAccent: "#FFFFFF",
    good: "#17804A",
    bad: "#C43131",
    warn: "#A86000",
    info: "#1E6BE6",
    goodSoft: "rgba(23,128,74,.12)",
    badSoft: "rgba(196,49,49,.12)",
    warnSoft: "rgba(168,96,0,.12)",
    infoSoft: "rgba(30,107,230,.12)",
    radiusSm: "12px",
    radiusMd: "16px",
    radiusLg: "20px",
    radiusPill: "999px",
    shadowTile: "inset 0 1px 0 rgba(255,255,255,.8), 0 8px 30px rgba(30,40,80,.12)",
    shadowRaised: "inset 0 1px 0 rgba(255,255,255,.8), 0 16px 48px rgba(30,40,80,.18)",
    shadowSheet: "inset 0 1px 0 rgba(255,255,255,.8), 0 24px 64px rgba(30,40,80,.22)",
    fontSans: SANS,
    fontMono: MONO,
  },
  board: {
    frame: "#F8FAFF",
    border: "#DCE3F0",
    surface: "#EEF2FA",
    bar: "#DCE3F0",
    tray: "#DCE3F0",
    pointA: "#A6C4F4",
    pointB: "#FFD3BE",
    numbers: "#3A4160",
    caption: "#535A6E",
    checker0: "#FFFFFF",
    rim0: "#5B90E8",
    detail0: "#D6E2F7",
    count0: "#17192B",
    checker1: "#1C2340",
    rim1: "#FFFFFF",
    detail1: "#3C4770",
    count1: "#FFFFFF",
    die0: "#FFFFFF",
    pips0: "#1C2340",
    dieBorder0: "#C9D6EE",
    die1: "#1C2340",
    pips1: "#FFFFFF",
    dieBorder1: "#FFFFFF",
    cube: "#1E6BE6",
    cubeText: "#FFFFFF",
    cubeBorder: "#1557C9",
    source: "#1E6BE6",
    selection: "#1557C9",
    destination: "#1E6BE6",
    destinationText: "#FFFFFF",
    undo: "#FF8A5B",
    undoText: "#1C2340",
    hover: "#1E6BE6",
    focus: "#17192B",
  },
  patterns: {},
  css: CSS,
  defs: DEFS,
  shader: {
    fragment: FRAGMENT,
    colors: ["#F2F4F8", "#96BDFF", "#FFB899", "#9CE3CC"],
    speed: 1,
    fps: 30,
    stillAt: 20,
  },
  preview: "linear-gradient(135deg, #FFFFFF, #DCE8FF 35%, #FFE3D4 70%, #D9F3EA)",
};
