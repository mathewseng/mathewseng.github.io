// SPDX-License-Identifier: GPL-3.0-or-later
// Carrara Verde: a board cut from honed Carrara marble with verde and
// Bardiglio points inlaid flush, onyx and bone checkers, cool north daylight
// from a tall window. Flat slabs, 1px seams, no drop shadows; the only gloss
// is the pointer-following specular on the page and the arc on the onyx.
// Cue colours follow the review: a near-black ring with a white gap for the
// movable/selected checker, deep ultramarine for destinations. The engine
// draws the landing ring with no halo, so the destination has to clear 3:1
// against the surface and both point colours on its own: that caps it at
// L 0.06 (the grey point) and forces the verde up to L 0.21 (a lighter
// Verde Alpi than the first cut, still 1.3:1 off the grey). Checkers and
// dice carry a honed-edge rim (warm grey on bone, pewter on onyx) that reads
// >= 3:1 against the face and whatever it sits on (surface, bar), because
// the bone face itself is only 1.13:1 off the marble surface.
export default {
  id: "carrara-verde",
  name: "Carrara Verde",
  description: "Honed marble, verde inlay, onyx and bone in daylight.",
  scheme: "light",
  tokens: {
    page: "#ECE9E3",
    surface: "#F7F5F1",
    surface2: "#E4E0D8",
    surface3: "#DCD7CE",
    glass: "rgba(247,245,241,.8)",
    line: "#CFC9BF",
    lineStrong: "#B7B1A7",
    lineOpaque: "#D8D3CA",
    controlBorder: "#8D8F93",
    ink: "#1D1F24",
    muted: "#5A5E66",
    soft: "#767A82",
    accent: "#2F5A4A",
    accent2: "#8C6F2C",
    accentSoft: "rgba(47,90,74,.12)",
    onAccent: "#F3F6F2",
    good: "#2E6B45",
    bad: "#8C2F2A",
    warn: "#8C6F2C",
    info: "#2B50B8",
    goodSoft: "rgba(46,107,69,.12)",
    badSoft: "rgba(140,47,42,.12)",
    warnSoft: "rgba(140,111,44,.14)",
    infoSoft: "rgba(43,80,184,.1)",
    radiusSm: "4px",
    radiusMd: "4px",
    radiusLg: "4px",
    radiusPill: "4px",
    shadowTile: "none",
    shadowRaised: "none",
    shadowSheet: "none",
    fontSans: '"Helvetica Neue", Helvetica, Inter, Arial, system-ui, sans-serif',
    fontMono: '"SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#B7B1A7",
    border: "#CFC9BF",
    surface: "#EFECE6",
    bar: "#3A3C40",
    tray: "#A9A398",
    pointA: "#93959A",
    pointB: "#558A72",
    numbers: "#3A3C40",
    caption: "#5A5E66",
    checker0: "#FBFAF6",
    rim0: "#847F75",
    detail0: "#F1EDE4",
    count0: "#1D1F24",
    checker1: "#15171C",
    rim1: "#868A93",
    detail1: "#2A2D34",
    count1: "#F7F5F1",
    die0: "#FBFAF6",
    pips0: "#15171C",
    dieBorder0: "#847F75",
    die1: "#15171C",
    pips1: "#F7F5F1",
    dieBorder1: "#868A93",
    cube: "#C9A24D",
    cubeText: "#1D1F24",
    cubeBorder: "#8C6F2C",
    source: "#1D1F24",
    selection: "#1D1F24",
    destination: "#12278A",
    destinationText: "#FFFFFF",
    undo: "#8C6F2C",
    undoText: "#FFFFFF",
    hover: "#1D1F24",
    focus: "#2B50B8",
  },
  patterns: {},
  css: `
/* Page chrome: flat honed slabs, 1px seams, a 1px bottom edge under raised
   panels like one slab resting on another. Sentence case, weight 500. */
html[data-skin="carrara-verde"] body {
  font-weight: 400;
  letter-spacing: 0;
}
html[data-skin="carrara-verde"] .topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="carrara-verde"] .crumbs .brand,
html[data-skin="carrara-verde"] .crumbs .crumb-current {
  font-weight: 500;
}
html[data-skin="carrara-verde"] .tool-nav a {
  border-radius: 4px;
  font-weight: 500;
  letter-spacing: 0;
}
html[data-skin="carrara-verde"] .tool-nav a[aria-current="page"],
html[data-skin="carrara-verde"] .tool-nav a[aria-current="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line), inset 0 -2px 0 var(--accent);
}
html[data-skin="carrara-verde"] .tool-head h1,
html[data-skin="carrara-verde"] .docs-head h1,
html[data-skin="carrara-verde"] .docs-section h2,
html[data-skin="carrara-verde"] .docs-section h3,
html[data-skin="carrara-verde"] .panel-head h2,
html[data-skin="carrara-verde"] .panel-head h3,
html[data-skin="carrara-verde"] .panel-title,
html[data-skin="carrara-verde"] .dialog-head h2 {
  font-weight: 500;
  letter-spacing: 0;
}
html[data-skin="carrara-verde"] .hero h1 {
  background: none;
  color: var(--ink);
  font-weight: 500;
  letter-spacing: -0.01em;
}
html[data-skin="carrara-verde"] .panel,
html[data-skin="carrara-verde"] .inspector,
html[data-skin="carrara-verde"] .tile {
  border: 1px solid var(--line);
  border-bottom-color: var(--line-opaque);
  border-radius: 4px;
  background: var(--surface);
  box-shadow: 0 1px 0 var(--line-opaque);
}
html[data-skin="carrara-verde"] .tile:hover,
html[data-skin="carrara-verde"] .tile:focus-visible {
  border-color: var(--line-strong);
  box-shadow: 0 1px 0 var(--line-opaque);
}
html[data-skin="carrara-verde"] .tile::after {
  display: none;
}
html[data-skin="carrara-verde"] .stage {
  border-radius: 4px;
}
html[data-skin="carrara-verde"] .board-frame,
html[data-skin="carrara-verde"] .board-slot {
  border-radius: 0;
}
html[data-skin="carrara-verde"] .player-strip {
  border-radius: 4px;
  font-weight: 400;
}
html[data-skin="carrara-verde"] .player-strip.active {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line), inset 3px 0 0 var(--accent);
}
html[data-skin="carrara-verde"] .player-name strong {
  font-weight: 500;
}
html[data-skin="carrara-verde"] .action-area {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
html[data-skin="carrara-verde"] .btn {
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--surface);
  font-weight: 500;
  letter-spacing: 0;
  box-shadow: none;
}
html[data-skin="carrara-verde"] .btn:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="carrara-verde"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
html[data-skin="carrara-verde"] .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 88%, white);
  border-color: color-mix(in oklab, var(--accent) 88%, white);
}
html[data-skin="carrara-verde"] .btn--ghost {
  background: transparent;
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="carrara-verde"] .btn--ghost:hover {
  background: var(--surface);
  border-color: var(--ink);
}
html[data-skin="carrara-verde"] .btn--danger {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="carrara-verde"] .btn--danger:hover {
  background: color-mix(in oklab, var(--bad) 88%, white);
  border-color: color-mix(in oklab, var(--bad) 88%, white);
}
html[data-skin="carrara-verde"] .btn[aria-pressed="true"] {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="carrara-verde"] .segmented {
  padding: 0;
  gap: 0;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  background: var(--surface-2);
}
html[data-skin="carrara-verde"] .segmented > label,
html[data-skin="carrara-verde"] .segmented > button {
  border-radius: 0;
  font-weight: 500;
}
html[data-skin="carrara-verde"] .segmented > label:has(input:checked),
html[data-skin="carrara-verde"] .segmented > button[aria-pressed="true"],
html[data-skin="carrara-verde"] .segmented > button[aria-checked="true"],
html[data-skin="carrara-verde"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-strong), inset 0 -2px 0 var(--accent);
}
html[data-skin="carrara-verde"] .tabs {
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
}
html[data-skin="carrara-verde"] .tabs > [role="tab"] {
  border-radius: 0;
  font-weight: 500;
}
html[data-skin="carrara-verde"] .tabs > [role="tab"][aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 1px 0 var(--line-opaque), inset 0 -2px 0 var(--accent);
}
html[data-skin="carrara-verde"] .tabs.has-indicator > [role="tab"][aria-selected="true"] {
  box-shadow: inset 0 1px 0 var(--line-opaque);
}
html[data-skin="carrara-verde"] .tabs--pill {
  border: 1px solid var(--line-strong);
  background: var(--surface-2);
}
html[data-skin="carrara-verde"] .tabs--pill > [role="tab"][aria-selected="true"] {
  background: var(--surface);
}
html[data-skin="carrara-verde"] .field > label,
html[data-skin="carrara-verde"] .field-label {
  font-weight: 500;
}
html[data-skin="carrara-verde"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="carrara-verde"] .field select,
html[data-skin="carrara-verde"] .field textarea {
  border: 1px solid var(--control-border);
  border-radius: 4px;
  background: var(--surface);
  box-shadow: none;
}
html[data-skin="carrara-verde"] .field input:hover,
html[data-skin="carrara-verde"] .field select:hover,
html[data-skin="carrara-verde"] .field textarea:hover {
  border-color: var(--ink);
}
html[data-skin="carrara-verde"] .dialog {
  border: 1px solid var(--line-strong);
  border-bottom: 2px solid var(--line-opaque);
  border-radius: 4px;
  background: var(--surface);
  box-shadow: 0 1px 0 var(--line-opaque);
}
html[data-skin="carrara-verde"] .dialog::backdrop {
  background: color-mix(in oklab, var(--page) 78%, transparent);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="carrara-verde"] .dialog-head,
html[data-skin="carrara-verde"] .dialog-foot {
  border-color: var(--line);
}
html[data-skin="carrara-verde"] .toast {
  border: 1px solid var(--ink);
  border-radius: 4px;
  background: var(--ink);
  color: var(--surface);
  box-shadow: none;
}
html[data-skin="carrara-verde"] .toast .btn--ghost {
  color: var(--surface);
  border-color: transparent;
}
html[data-skin="carrara-verde"] .toast--alert {
  border-color: var(--bad);
  background: color-mix(in oklab, var(--bad) 70%, var(--ink));
}
html[data-skin="carrara-verde"] .toast--good {
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 70%, var(--ink));
}
html[data-skin="carrara-verde"] .docs-topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="carrara-verde"] .docs-toc a {
  border-radius: 4px;
  font-weight: 500;
}
html[data-skin="carrara-verde"] .docs-section {
  border-top: 1px solid var(--line);
}

/* Board: stone overlays. The frame rect keeps its flat fill; veins live on
   the overlay siblings. Points are inlays with a hairline seam. */
html[data-skin="carrara-verde"] .bg-board [data-pattern="frame"] {
  fill: var(--board-frame);
  filter: url(#skin-carrara-verde-vein-frame);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="surface"] {
  fill: var(--board-surface);
  filter: url(#skin-carrara-verde-vein-surface);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="bar"] {
  fill: var(--board-bar);
  filter: url(#skin-carrara-verde-vein-bar);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-carrara-verde-tray);
}
html[data-skin="carrara-verde"] .bg-board .point-shape {
  stroke: var(--board-border);
  stroke-width: 0.75;
  stroke-linejoin: miter;
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="pointA"] {
  fill: url(#skin-carrara-verde-veins-grey);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-carrara-verde-veins-verde);
}
/* Honed edges: the rim is the only thing that separates bone from the
   surface and onyx from the bar, so checkers and dice both keep a 3.5-unit
   rim that stays >= 1.5 px even at phone scale (the board is drawn at
   ~0.44x on a 390px viewport). */
html[data-skin="carrara-verde"] .bg-board .checker > circle:first-child {
  stroke-width: 3.5;
}
html[data-skin="carrara-verde"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-carrara-verde-bone);
}
html[data-skin="carrara-verde"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-carrara-verde-onyx);
}
html[data-skin="carrara-verde"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 3.5;
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-carrara-verde-bone-sheen);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-carrara-verde-onyx-sheen);
}
html[data-skin="carrara-verde"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-carrara-verde-gold);
}
html[data-skin="carrara-verde"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
html[data-skin="carrara-verde"] .bg-board .point > text,
html[data-skin="carrara-verde"] .bg-board .board-cube > text {
  font-family: Cinzel, "Trajan Pro", Optima, "Gill Sans", Georgia, serif;
  font-weight: 500;
}
html[data-skin="carrara-verde"] .bg-board .board-cube > text {
  font-weight: 600;
}
html[data-skin="carrara-verde"] .bg-board .checker > text {
  font-family: var(--font-sans);
  font-weight: 500;
}
`,
  defs: `
<filter id="skin-carrara-verde-vein-frame" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.005 0.014" numOctaves="3" seed="11" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.49  0 0 0 0 0.47  1 0 0 0 0" result="m"/>
  <feComponentTransfer in="m" result="v"><feFuncA type="table" tableValues="0 0 0 0 0 0 0.55 0 0 0 0 0 0"/></feComponentTransfer>
  <feComposite in="v" in2="SourceGraphic" operator="in"/>
</filter>
<filter id="skin-carrara-verde-vein-surface" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.009" numOctaves="3" seed="4" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.6  0 0 0 0 0.61  0 0 0 0 0.63  1 0 0 0 0" result="m"/>
  <feComponentTransfer in="m" result="v"><feFuncA type="table" tableValues="0 0 0 0 0 0 0.32 0 0 0 0 0 0"/></feComponentTransfer>
  <feComposite in="v" in2="SourceGraphic" operator="in"/>
</filter>
<filter id="skin-carrara-verde-vein-bar" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.01 0.02" numOctaves="2" seed="33" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" result="m"/>
  <feComponentTransfer in="m" result="v"><feFuncA type="table" tableValues="0 0 0 0 0 0 0.45 0 0 0 0 0 0"/></feComponentTransfer>
  <feComposite in="v" in2="SourceGraphic" operator="in"/>
</filter>
<linearGradient id="skin-carrara-verde-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#1D1F24" stop-opacity="0.3"/>
  <stop offset="0.035" stop-color="#1D1F24" stop-opacity="0"/>
  <stop offset="0.965" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.35"/>
</linearGradient>
<pattern id="skin-carrara-verde-veins-grey" patternUnits="userSpaceOnUse" width="120" height="230" x="0" y="0">
  <g fill="none" stroke="#C9CBCE" stroke-linecap="round">
    <path d="M8 -4C20 40 2 90 26 140S10 220 30 236" stroke-width="1.2" opacity="0.5"/>
    <path d="M70 -6C52 50 92 70 68 128S96 210 60 234" stroke-width="0.8" opacity="0.4"/>
    <path d="M112 20C96 60 124 110 100 170" stroke-width="0.6" opacity="0.35"/>
    <path d="M-4 150C30 160 50 150 80 186" stroke-width="0.6" opacity="0.3"/>
  </g>
</pattern>
<pattern id="skin-carrara-verde-veins-verde" patternUnits="userSpaceOnUse" width="120" height="230" x="37" y="60">
  <g fill="none" stroke="#A9CDBB" stroke-linecap="round">
    <path d="M14 -4C2 44 34 86 12 140S36 222 8 236" stroke-width="1.2" opacity="0.55"/>
    <path d="M78 -6C96 46 60 84 84 130S58 206 92 236" stroke-width="0.8" opacity="0.45"/>
    <path d="M40 30C56 70 30 120 52 180" stroke-width="0.6" opacity="0.4"/>
    <path d="M124 100C90 116 70 100 40 140" stroke-width="0.6" opacity="0.35"/>
  </g>
</pattern>
<radialGradient id="skin-carrara-verde-bone" cx="0.5" cy="0.5" r="0.5" fx="0.44" fy="0.4">
  <stop offset="0" stop-color="#F8E9C2" stop-opacity="0.55"/>
  <stop offset="0.6" stop-color="#F8E9C2" stop-opacity="0.12"/>
  <stop offset="0.78" stop-color="#9B9385" stop-opacity="0.06"/>
  <stop offset="1" stop-color="#7E7769" stop-opacity="0.4"/>
</radialGradient>
<radialGradient id="skin-carrara-verde-onyx-glow" cx="0.5" cy="0.5" r="0.5" fx="0.34" fy="0.32">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.03"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.2"/>
</radialGradient>
<pattern id="skin-carrara-verde-onyx" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">
  <circle cx="0.5" cy="0.5" r="0.5" fill="url(#skin-carrara-verde-onyx-glow)"/>
  <path d="M0.094 0.391A0.42 0.42 0 0 1 0.391 0.094" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="0.026" stroke-linecap="round"/>
</pattern>
<linearGradient id="skin-carrara-verde-onyx-sheen" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.25"/>
</linearGradient>
<linearGradient id="skin-carrara-verde-bone-sheen" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="0.5" stop-color="#F8E9C2" stop-opacity="0.18"/>
  <stop offset="1" stop-color="#9B9385" stop-opacity="0.16"/>
</linearGradient>
<linearGradient id="skin-carrara-verde-gold" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFF1C4" stop-opacity="0.5"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.04"/>
  <stop offset="0.55" stop-color="#5A3C08" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#5A3C08" stop-opacity="0.3"/>
</linearGradient>
`,
  shader: {
    fragment: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; // light carrara
uniform vec3  u_c2; // shaded carrara
uniform vec3  u_c3; // verde alpi
uniform vec3  u_c4; // bardiglio vein grey
uniform float u_dark;

// Marble veins in daylight: domain-warped value noise folded into thin
// creases, a cloudy tonal base, a few veins tinted verde, a soft window
// light from the top-left that sways 0.3 degrees, and a polished-stone
// specular disc under the pointer. Luminance is floored so the ink above
// stays legible everywhere.
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
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
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // slab coordinates, turned 30 degrees and stretched so the creases run
  // as long diagonal veins; the field drifts very slowly and never resets
  vec2 p = uv * vec2(aspect, 1.0) * 1.6;
  vec2 s = mat2(0.866, -0.5, 0.5, 0.866) * p * vec2(0.55, 1.9);
  vec2 q = s + 0.5 * vec2(fbm(s + 1.7 + vec2(0.0, u_time * 0.004)), fbm(s + 9.2));
  float v = fbm(q * 1.6);
  float veins = pow(1.0 - abs(sin(v * 6.28318 * 2.0)), 14.0);
  float fine = pow(1.0 - abs(sin(fbm(q * 3.1 + 4.3) * 6.28318 * 2.0)), 22.0) * 0.4;
  veins = min(1.0, veins + fine);

  // honed carrara: cloudy tonal variation between the two slab tones
  vec3 base = mix(u_c1, u_c2, fbm(p * 0.7));

  // bardiglio grey veins, a subset carrying a verde tint
  vec3 col = mix(base, u_c4, veins * 0.45);
  float verdeMask = smoothstep(0.58, 0.68, fbm(q * 0.5));
  col = mix(col, u_c3, veins * verdeMask * 0.25);

  // daylight from a tall window, top-left, swaying 0.3 degrees
  float sway = sin(u_time * 0.05) * 0.00524;
  vec2 dir = normalize(vec2(-1.0 + sway, 1.0 + sway));
  vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
  float reach = 0.5 * length(vec2(aspect, 1.0));
  col += clamp(dot(c, dir) / reach, 0.0, 1.0) * 0.03;

  // pointer: polished stone catching the light; centred until the pointer moves
  vec2 ptr = u_pointer;
  if (ptr.x + ptr.y < 1.0) ptr = u_resolution * 0.5;
  float d = distance(gl_FragCoord.xy, ptr);
  float spec = smoothstep(150.0, 0.0, d);
  col += spec * spec * 0.06;

  // legibility floor for the ink above
  col += max(0.0, 0.86 - luma(col));
  col = min(col, vec3(1.0));

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#F1EEE8", "#E4E0D8", "#4B7A67", "#A7AAAE"],
    speed: 1,
    fps: 30,
    stillAt: 12,
  },
  preview: "linear-gradient(135deg, #F1EEE8, #E4E0D8 55%, #2F5A4A)",
};
