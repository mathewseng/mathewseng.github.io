// SPDX-License-Identifier: GPL-3.0-or-later
// Tidal: a night sea seen from just under the surface. Deep navy water,
// caustic light wandering over everything, sea-foam teal as the only accent;
// the pieces stay warm ivory so the game reads before the room does.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
export default {
  id: "tidal",
  name: "Tidal",
  description: "Navy water, caustic light and ivory pieces.",
  scheme: "dark",
  tokens: {
    page: "#06141F",
    surface: "#0D2130",
    surface2: "#132D40",
    surface3: "#18384E",
    glass: "rgba(13,33,48,.94)",
    line: "rgba(143,179,194,.18)",
    lineStrong: "rgba(143,179,194,.32)",
    lineOpaque: "#1F4257",
    controlBorder: "#3E7389",
    ink: "#E6F1F5",
    muted: "#8FB3C2",
    soft: "#5F8696",
    accent: "#3FD6C3",
    accent2: "#7DFFE9",
    accentSoft: "rgba(63,214,195,.16)",
    onAccent: "#06141F",
    good: "#7FE3A6",
    bad: "#FF7B7B",
    warn: "#FFB86B",
    info: "#7CC8FF",
    goodSoft: "rgba(127,227,166,.16)",
    badSoft: "rgba(255,123,123,.16)",
    warnSoft: "rgba(255,184,107,.16)",
    infoSoft: "rgba(124,200,255,.16)",
    radiusSm: "10px",
    radiusMd: "12px",
    radiusLg: "14px",
    radiusPill: "999px",
    shadowTile: "inset 0 1px 0 rgba(255,255,255,.06)",
    shadowRaised: "inset 0 1px 0 rgba(255,255,255,.06), 0 24px 60px -32px rgba(0,0,0,.9)",
    shadowSheet: "inset 0 1px 0 rgba(255,255,255,.06)",
    fontSans: '-apple-system, "Segoe UI", Roboto, Inter, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#0A1A26",
    border: "#1F4257",
    surface: "#0F2A3A",
    bar: "#081620",
    tray: "#081620",
    pointA: "#2B7F8C",
    pointB: "#174C60",
    numbers: "#8FB3C2",
    caption: "#8FB3C2",
    checker0: "#F2EFE4",
    rim0: "#B9B3A0",
    detail0: "#D8D2C0",
    count0: "#06141F",
    checker1: "#0A1216",
    rim1: "#3FD6C3",
    detail1: "#2A8C80",
    count1: "#F2EFE4",
    die0: "#F2EFE4",
    pips0: "#06141F",
    dieBorder0: "#B9B3A0",
    die1: "#0A1216",
    pips1: "#F2EFE4",
    dieBorder1: "#3FD6C3",
    cube: "#F2EFE4",
    cubeText: "#06141F",
    cubeBorder: "#B9B3A0",
    source: "#7DFFE9",
    selection: "#7DFFE9",
    destination: "#7DFFE9",
    destinationText: "#06141F",
    undo: "#FFB86B",
    undoText: "#2A1A08",
    hover: "#3FD6C3",
    focus: "#C9FFF6",
  },
  patterns: {},
  css: `
html[data-skin="tidal"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="tidal"] .tool-head h1,
html[data-skin="tidal"] .hero h1,
html[data-skin="tidal"] .panel-head h2,
html[data-skin="tidal"] .panel-head h3,
html[data-skin="tidal"] .panel-title,
html[data-skin="tidal"] .dialog-head h2 {
  font-weight: 600;
  letter-spacing: 0.01em;
}
html[data-skin="tidal"] .tool-nav a,
html[data-skin="tidal"] .crumbs a {
  border-radius: var(--r-pill);
}
html[data-skin="tidal"] .panel,
html[data-skin="tidal"] .inspector,
html[data-skin="tidal"] .tile {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="tidal"] .tile:hover,
html[data-skin="tidal"] .tile:focus-visible {
  translate: none;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-tile);
}
html[data-skin="tidal"] .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
}
html[data-skin="tidal"] .panel-head,
html[data-skin="tidal"] .panel-foot {
  border-color: var(--line-opaque);
}
html[data-skin="tidal"] .dialog {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: 20px 20px var(--r-lg) var(--r-lg);
  box-shadow: var(--shadow-raised);
}
html[data-skin="tidal"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="tidal"] .toast {
  background: var(--surface-2);
  border: 1px solid var(--line-opaque);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-tile);
}
html[data-skin="tidal"] .toast--alert {
  border-left-color: var(--bad);
}
html[data-skin="tidal"] .toast--good {
  border-left-color: var(--good);
}
html[data-skin="tidal"] .btn {
  border-radius: var(--r-pill);
  background: var(--surface-2);
  border-color: var(--line-opaque);
}
html[data-skin="tidal"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
}
html[data-skin="tidal"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
/* The generic .btn:hover above outranks the kit's primary hover; keep the
   accent fill (lightened as the kit does) and the dark label on hover/press. */
html[data-skin="tidal"] .btn--primary:hover,
html[data-skin="tidal"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, white);
  border-color: color-mix(in oklab, var(--accent) 86%, white);
  color: var(--on-accent);
}
html[data-skin="tidal"] .btn--ghost {
  background: transparent;
  border-color: var(--line-opaque);
  color: var(--ink);
}
html[data-skin="tidal"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="tidal"] .btn--danger {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="tidal"] .btn--danger:hover {
  background: color-mix(in oklab, var(--bad) 86%, white);
  border-color: color-mix(in oklab, var(--bad) 86%, white);
}
html[data-skin="tidal"] .segmented {
  background: var(--page);
  border-color: var(--line-opaque);
}
html[data-skin="tidal"] .segmented > label:has(input:checked),
html[data-skin="tidal"] .segmented > button[aria-pressed="true"],
html[data-skin="tidal"] .segmented > button[aria-checked="true"],
html[data-skin="tidal"] .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="tidal"] .tabs {
  border-bottom-color: var(--line-opaque);
}
html[data-skin="tidal"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="tidal"] .field select,
html[data-skin="tidal"] .field textarea {
  background: var(--page);
  border-color: var(--control-border);
  border-radius: var(--r-sm);
}
html[data-skin="tidal"] .player-strip {
  border-radius: var(--r-pill);
  padding-inline: 12px;
}
html[data-skin="tidal"] .player-strip.active {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 35%, transparent);
}
html[data-skin="tidal"] .docs-section {
  border-top-color: var(--line-opaque);
}
html[data-skin="tidal"] .docs-toc a {
  border-radius: var(--r-pill);
}
html[data-skin="tidal"] .bg-board text {
  font-family: var(--font-mono);
}
html[data-skin="tidal"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-tidal-frame);
}
html[data-skin="tidal"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-tidal-surface);
  stroke: var(--board-border);
  stroke-width: 2;
}
html[data-skin="tidal"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-tidal-bar);
}
html[data-skin="tidal"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-tidal-tray);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="tidal"] .bg-board .point [data-pattern="pointA"],
html[data-skin="tidal"] .bg-board .point [data-pattern="pointB"] {
  stroke: rgba(0, 0, 0, 0.38);
  stroke-width: 1.5;
  stroke-linejoin: round;
}
html[data-skin="tidal"] .bg-board [data-pattern="pointA"],
html[data-skin="tidal"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-tidal-ridge);
}
html[data-skin="tidal"] .bg-board .checker [data-pattern="checker0"],
html[data-skin="tidal"] .bg-board [data-pattern="die0"],
html[data-skin="tidal"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-tidal-ivory);
}
html[data-skin="tidal"] .bg-board .checker [data-pattern="checker1"],
html[data-skin="tidal"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-tidal-slate);
}
/* Slate checkers sit on the near-black bar and tray, so the teal rim carries
   them. The gradient overlay clones the face radius and hides the inner half
   of the stroke; widen the stroke and pull the overlay in to the stroke's
   inner edge so the whole 4-unit ring shows (about 1.6 px on a phone board). */
html[data-skin="tidal"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 4;
}
html[data-skin="tidal"] .bg-board .checker[data-player="1"] > [data-pattern="checker1"] {
  r: 20px;
}
html[data-skin="tidal"] .bg-board .board-die-face > rect:first-child,
html[data-skin="tidal"] .bg-board .board-cube .cube-face {
  stroke-width: 1.5;
}
`,
  defs: `
<linearGradient id="skin-tidal-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".05"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".14"/>
</linearGradient>
<radialGradient id="skin-tidal-surface" cx=".18" cy=".1" r="1.05">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".09"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".12"/>
</radialGradient>
<linearGradient id="skin-tidal-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".4"/>
  <stop offset=".2" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".487" stop-color="#3FD6C3" stop-opacity="0"/>
  <stop offset=".487" stop-color="#3FD6C3" stop-opacity=".6"/>
  <stop offset=".513" stop-color="#3FD6C3" stop-opacity=".6"/>
  <stop offset=".513" stop-color="#3FD6C3" stop-opacity="0"/>
  <stop offset=".8" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".4"/>
</linearGradient>
<linearGradient id="skin-tidal-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".45"/>
  <stop offset=".45" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".03"/>
</linearGradient>
<linearGradient id="skin-tidal-ridge" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".12"/>
  <stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".3"/>
</linearGradient>
<radialGradient id="skin-tidal-ivory" cx=".34" cy=".28" r=".78">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity=".08"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".12"/>
</radialGradient>
<radialGradient id="skin-tidal-slate" cx=".34" cy=".28" r=".8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".12"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".45"/>
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
uniform vec3 u_c1; // page
uniform vec3 u_c2; // surface-2: the water near the surface
uniform vec3 u_c3; // accent: the caustic tint
uniform vec3 u_c4; // surface: the water column
uniform float u_dark;

// Lattice hash on a 256-cell torus so the drifting domain never grows large.
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
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float depth = 1.0 - uv.y;             // 0 at the water line, 1 at the seabed
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;

  // Sloped seabed: the field stretches as it falls away from the light.
  vec2 p = vec2(uv.x * aspect, uv.y) * 3.2;
  p.y *= 1.0 + depth * 0.5;

  // Two wavefronts drifting against each other. The warp is a single
  // noise octave (half the cost of a warped fbm) and the fields keep 3 octaves.
  vec2 q1 = p + 0.08 * t;
  vec2 q2 = p - 0.05 * t;
  vec2 w1 = vec2(vnoise(q1 + vec2(0.0, t * 0.03)), vnoise(q1 + vec2(5.2, 1.3)));
  vec2 w2 = vec2(vnoise(q2 + vec2(3.1, 2.7)), vnoise(q2 - vec2(1.0, 4.4)));
  float n1 = fbm(q1 + 1.4 * w1);
  float n2 = fbm(q2 + 1.4 * w2);

  // Thin bright filaments where both wavefronts cross zero, fading with depth.
  float caustic = pow(1.0 - abs(sin(n1 * 12.566) * sin(n2 * 12.566)), 10.0);
  caustic *= 1.0 - depth * 0.7;

  // Water column: surface-2 near the top, the page colour at the seabed.
  vec3 col = mix(u_c2, u_c1, 0.65 + depth * 0.35);
  col = mix(col, u_c4, 0.3 * (1.0 - depth));

  // A very slow swell modulates brightness by 4%.
  col *= 1.0 + 0.04 * sin(uv.x * 2.0 + t * 0.15);

  col += u_c3 * caustic * mix(0.12, 0.22, u_dark);

  // Pointer: a soft brightening within 300px (idle until the pointer moves).
  vec2 pp = gl_FragCoord.xy - u_pointer;
  float d = length(pp) / 300.0;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  col += u_c3 * 0.06 * live * (1.0 / (1.0 + d * d)) * smoothstep(1.0, 0.6, d);

  // Legibility: clamp just above the surface-2 luminance, then a 35% page
  // overlay so filaments stay within a few percent of the water around them.
  float lmax = luma(u_c2) * 1.25;
  float l = luma(col);
  if (l > lmax) col *= lmax / l;
  col = mix(col, u_c1, 0.35);

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#06141F", "#132D40", "#3FD6C3", "#0D2130"],
    speed: 1,
    fps: 60,
    stillAt: 11.3,
  },
  preview: "linear-gradient(170deg, #132D40, #06141F 62%, #0F2A3A 100%)",
};
