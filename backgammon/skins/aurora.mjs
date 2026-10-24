// SPDX-License-Identifier: GPL-3.0-or-later
// Aurora: northern lights over a deep blue night. Green and violet curtains
// fold slowly high in the frame above a faint starfield; the chrome is opaque
// navy so the game sits in front of the sky, pearl against midnight pieces.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
export default {
  id: "aurora",
  name: "Aurora",
  description: "Green and violet curtains over a deep blue night.",
  scheme: "dark",
  tokens: {
    page: "#050A16",
    surface: "#0D1526",
    surface2: "#121C32",
    surface3: "#18253F",
    glass: "rgba(13,21,38,.9)",
    line: "rgba(159,176,204,.16)",
    lineStrong: "rgba(159,176,204,.3)",
    lineOpaque: "#22304A",
    controlBorder: "#51688F",
    ink: "#EEF3FF",
    muted: "#9FB0CC",
    soft: "#6B7D9C",
    accent: "#5CF2B8",
    accent2: "#9D7BFF",
    accentSoft: "rgba(92,242,184,.14)",
    onAccent: "#05221A",
    good: "#7EE8A8",
    bad: "#FF8A9B",
    warn: "#FFC56B",
    info: "#7CC8FF",
    goodSoft: "rgba(126,232,168,.16)",
    badSoft: "rgba(255,138,155,.16)",
    warnSoft: "rgba(255,197,107,.16)",
    infoSoft: "rgba(124,200,255,.16)",
    radiusSm: "10px",
    radiusMd: "12px",
    radiusLg: "12px",
    radiusPill: "999px",
    shadowTile: "0 1px 0 rgba(255,255,255,.04)",
    shadowRaised: "0 1px 0 rgba(255,255,255,.04), 0 28px 70px -36px rgba(0,0,0,.95)",
    shadowSheet: "0 -20px 50px -30px rgba(0,0,0,.95)",
    fontSans: 'Seravek, "Segoe UI", "Trebuchet MS", Roboto, -apple-system, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#0A1326",
    border: "#22304A",
    surface: "#0F1A30",
    bar: "#070C18",
    tray: "#070C18",
    pointA: "#2E7F6E",
    pointB: "#4A3C8A",
    numbers: "#9FB0CC",
    caption: "#9FB0CC",
    checker0: "#F2F6FF",
    rim0: "#223252",
    detail0: "#B8C6E6",
    count0: "#0A1326",
    checker1: "#141B33",
    rim1: "#2FB58C",
    detail1: "#2E8C6E",
    count1: "#EEF3FF",
    die0: "#F2F6FF",
    pips0: "#0A1326",
    dieBorder0: "#9FB0CC",
    die1: "#F2F6FF",
    pips1: "#0A1326",
    dieBorder1: "#5CF2B8",
    cube: "#6B55C2",
    cubeText: "#FFFFFF",
    cubeBorder: "#B9A6FF",
    source: "#5CF2B8",
    selection: "#C8FFEA",
    destination: "#5CF2B8",
    destinationText: "#05221A",
    undo: "#FFB86B",
    undoText: "#2A1A08",
    hover: "#9DF7D4",
    focus: "#E6FFF5",
  },
  patterns: {},
  css: `
html[data-skin="aurora"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="aurora"] .tool-head h1,
html[data-skin="aurora"] .hero h1,
html[data-skin="aurora"] .panel-head h2,
html[data-skin="aurora"] .panel-head h3,
html[data-skin="aurora"] .panel-title,
html[data-skin="aurora"] .dialog-head h2 {
  font-weight: 600;
  letter-spacing: 0;
}
/* The nav sits straight on the sky, where the curtains are brightest: a
   near-opaque pill behind the links keeps the muted labels readable. */
html[data-skin="aurora"] .tool-nav {
  padding: 3px;
  border-radius: var(--r-pill);
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
html[data-skin="aurora"] .tool-nav a,
html[data-skin="aurora"] .crumbs a,
html[data-skin="aurora"] .docs-toc a {
  border-radius: var(--r-pill);
}
html[data-skin="aurora"] .tool-nav a[aria-current="page"] {
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="aurora"] .panel,
html[data-skin="aurora"] .inspector,
html[data-skin="aurora"] .tile {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="aurora"] .tile:hover,
html[data-skin="aurora"] .tile:focus-visible {
  translate: none;
  border-color: var(--control-border);
  box-shadow: var(--shadow-tile);
}
html[data-skin="aurora"] .panel--quiet {
  background: var(--surface);
  border-color: var(--line-opaque);
}
html[data-skin="aurora"] .panel-head,
html[data-skin="aurora"] .panel-foot {
  border-color: var(--line-opaque);
}
html[data-skin="aurora"] .dialog {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-raised);
}
html[data-skin="aurora"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="aurora"] .toast {
  background: var(--surface-2);
  border: 1px solid var(--line-opaque);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-tile);
}
html[data-skin="aurora"] .toast--alert {
  border-left-color: var(--bad);
}
html[data-skin="aurora"] .toast--good {
  border-left-color: var(--good);
}
/* Flat buttons: one solid fill each, no gradient, no lift. */
html[data-skin="aurora"] .btn {
  border-radius: var(--r-md);
  background: var(--surface-2);
  border-color: var(--line-opaque);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="aurora"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="aurora"] .btn:active {
  background: var(--surface-3);
  border-color: var(--control-border);
}
html[data-skin="aurora"] .btn[aria-pressed="true"],
html[data-skin="aurora"] .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="aurora"] .btn--primary,
html[data-skin="aurora"] .btn--primary:hover,
html[data-skin="aurora"] .btn--primary:active,
html[data-skin="aurora"] .btn--primary[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
html[data-skin="aurora"] .btn--primary:hover {
  background: color-mix(in oklab, var(--accent) 88%, white);
  border-color: color-mix(in oklab, var(--accent) 88%, white);
}
html[data-skin="aurora"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, black);
  border-color: color-mix(in oklab, var(--accent) 86%, black);
}
html[data-skin="aurora"] .btn--ghost {
  background: transparent;
  border-color: var(--line-opaque);
  color: var(--ink);
}
html[data-skin="aurora"] .btn--ghost:hover,
html[data-skin="aurora"] .btn--ghost:active {
  background: var(--surface-2);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="aurora"] .btn--ghost[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="aurora"] .btn--danger {
  background: var(--bad-soft);
  border-color: var(--bad);
  color: var(--bad);
}
html[data-skin="aurora"] .btn--danger:hover,
html[data-skin="aurora"] .btn--danger:active {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="aurora"] .segmented {
  background: var(--page);
  border-color: var(--line-opaque);
  border-radius: var(--r-md);
}
html[data-skin="aurora"] .segmented > label,
html[data-skin="aurora"] .segmented > button {
  border-radius: var(--r-sm);
}
html[data-skin="aurora"] .segmented > label:has(input:checked),
html[data-skin="aurora"] .segmented > button[aria-pressed="true"],
html[data-skin="aurora"] .segmented > button[aria-checked="true"],
html[data-skin="aurora"] .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="aurora"] .tabs {
  border-bottom-color: var(--line-opaque);
}
html[data-skin="aurora"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="aurora"] .field select,
html[data-skin="aurora"] .field textarea {
  background: var(--page);
  border-color: var(--control-border);
  border-radius: var(--r-sm);
}
html[data-skin="aurora"] .player-strip {
  border-radius: var(--r-pill);
  padding-inline: 12px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque);
}
html[data-skin="aurora"] .player-strip.active {
  background: var(--surface-2);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 55%, transparent);
}
html[data-skin="aurora"] .docs-section {
  border-top-color: var(--line-opaque);
}
html[data-skin="aurora"] .bg-board text {
  font-family: var(--font-sans);
  font-weight: 600;
}
html[data-skin="aurora"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-aurora-frame);
}
html[data-skin="aurora"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-aurora-sky);
  stroke: var(--board-border);
  stroke-width: 2;
}
html[data-skin="aurora"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-aurora-bar);
}
html[data-skin="aurora"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-aurora-tray);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="aurora"] .bg-board .point-shape {
  stroke: rgba(0, 0, 0, 0.3);
  stroke-width: 1;
  stroke-linejoin: round;
}
/* Points brighten toward their tips, like the lit lower edge of a curtain.
   Top points end their path at y=262, bottom points at y=398, so the two
   gradient directions select on the path data (the overlay clones it). */
html[data-skin="aurora"] .bg-board [data-pattern="pointA"][d$="262 Z"],
html[data-skin="aurora"] .bg-board [data-pattern="pointB"][d$="262 Z"] {
  fill: url(#skin-aurora-point-down);
}
html[data-skin="aurora"] .bg-board [data-pattern="pointA"][d$="398 Z"],
html[data-skin="aurora"] .bg-board [data-pattern="pointB"][d$="398 Z"] {
  fill: url(#skin-aurora-point-up);
}
html[data-skin="aurora"] .bg-board .checker [data-pattern="checker0"],
html[data-skin="aurora"] .bg-board [data-pattern="die0"],
html[data-skin="aurora"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-aurora-pearl);
}
html[data-skin="aurora"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-aurora-midnight);
}
html[data-skin="aurora"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-aurora-violet);
}
/* Midnight checkers live on the near-black bar and tray; the green rim is
   what separates them. The overlay clones the face radius and would cover
   the stroke's inner half, so widen the stroke and pull the overlay in. */
html[data-skin="aurora"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 4;
}
html[data-skin="aurora"] .bg-board .checker[data-player="1"] > [data-pattern="checker1"] {
  r: 20px;
}
html[data-skin="aurora"] .bg-board .board-die-face > rect:first-child,
html[data-skin="aurora"] .bg-board .board-cube .cube-face {
  stroke-width: 1.5;
}
`,
  defs: `
<linearGradient id="skin-aurora-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".05"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".16"/>
</linearGradient>
<radialGradient id="skin-aurora-sky-glow" cx=".5" cy="0" r="1.1">
  <stop offset="0" stop-color="#9D7BFF" stop-opacity=".1"/>
  <stop offset=".4" stop-color="#5CF2B8" stop-opacity=".03"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".14"/>
</radialGradient>
<pattern id="skin-aurora-sky" patternUnits="userSpaceOnUse" x="0" y="0" width="876" height="660">
  <rect width="876" height="660" fill="url(#skin-aurora-sky-glow)"/>
  <g fill="#FFFFFF" fill-opacity=".04">
    <circle cx="61" cy="52" r="1.2"/><circle cx="143" cy="118" r=".9"/><circle cx="97" cy="233" r="1.1"/>
    <circle cx="214" cy="61" r=".8"/><circle cx="183" cy="176" r="1.3"/><circle cx="262" cy="131" r=".9"/>
    <circle cx="331" cy="47" r="1.1"/><circle cx="305" cy="212" r=".8"/><circle cx="371" cy="156" r="1.2"/>
    <circle cx="451" cy="83" r=".9"/><circle cx="492" cy="188" r="1.1"/><circle cx="541" cy="59" r=".8"/>
    <circle cx="604" cy="137" r="1.3"/><circle cx="662" cy="74" r=".9"/><circle cx="711" cy="203" r="1.1"/>
    <circle cx="771" cy="109" r=".8"/><circle cx="818" cy="171" r="1.2"/><circle cx="748" cy="46" r=".9"/>
    <circle cx="74" cy="356" r=".9"/><circle cx="156" cy="421" r="1.1"/><circle cx="118" cy="548" r=".8"/>
    <circle cx="233" cy="493" r="1.2"/><circle cx="287" cy="378" r=".9"/><circle cx="344" cy="572" r="1.1"/>
    <circle cx="462" cy="441" r=".8"/><circle cx="517" cy="529" r="1.2"/><circle cx="583" cy="386" r=".9"/>
    <circle cx="641" cy="602" r="1.1"/><circle cx="696" cy="467" r=".8"/><circle cx="757" cy="553" r="1.2"/>
    <circle cx="812" cy="412" r=".9"/><circle cx="403" cy="318" r="1.1"/><circle cx="572" cy="296" r=".8"/>
  </g>
</pattern>
<linearGradient id="skin-aurora-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".45"/>
  <stop offset=".22" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".485" stop-color="#5CF2B8" stop-opacity="0"/>
  <stop offset=".485" stop-color="#5CF2B8" stop-opacity=".45"/>
  <stop offset=".515" stop-color="#9D7BFF" stop-opacity=".45"/>
  <stop offset=".515" stop-color="#9D7BFF" stop-opacity="0"/>
  <stop offset=".78" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".45"/>
</linearGradient>
<linearGradient id="skin-aurora-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".45"/>
  <stop offset=".45" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".03"/>
</linearGradient>
<linearGradient id="skin-aurora-point-down" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".3"/>
  <stop offset=".55" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".28"/>
</linearGradient>
<linearGradient id="skin-aurora-point-up" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".3"/>
  <stop offset=".55" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".28"/>
</linearGradient>
<radialGradient id="skin-aurora-pearl" cx=".5" cy=".28" r=".8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".5"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity=".06"/>
  <stop offset="1" stop-color="#223252" stop-opacity=".22"/>
</radialGradient>
<radialGradient id="skin-aurora-midnight" cx=".5" cy=".28" r=".82">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".14"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".4"/>
</radialGradient>
<radialGradient id="skin-aurora-violet" cx=".5" cy=".25" r=".85">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".3"/>
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
uniform vec3 u_c1; // page: the night
uniform vec3 u_c2; // accent: aurora green, the low edge of each curtain
uniform vec3 u_c3; // accent-2: violet, the high haze
uniform vec3 u_c4; // surface-2: the horizon lift
uniform float u_dark;

// Lattice hash on a 256-cell torus so slowly drifting domains never grow large.
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
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// One curtain: a soft vertical band whose centre wanders around its base
// position, hanging from the top of the frame above a ragged lower edge that
// carries the brightest light. Folds and fine rays drift sideways through it.
// Returns intensity and the height above the edge, which picks the colour.
vec2 curtain(vec2 uv, float t, float seed, float base, float width) {
  float x = base + 0.3 * (fbm(vec2(t * 0.02 + seed * 7.3, seed * 3.1)) - 0.5);
  float band = exp(-pow((uv.x - x) * width, 2.0));
  float edge = 0.56 + 0.16 * (fbm(vec2(uv.x * 2.5 + seed * 5.0, t * 0.03)) - 0.5);
  float above = uv.y - edge;
  float hang = smoothstep(0.0, 0.1, above) * (1.0 - 0.55 * smoothstep(0.7, 1.0, uv.y));
  float rim = exp(-max(above, 0.0) * 4.5);
  vec2 q = vec2(uv.x * 7.0 + above * 1.2 + seed * 11.0, uv.y * 1.3);
  float folds = fbm(q + vec2(t * 0.04, -t * 0.015));
  float rays = vnoise(vec2(uv.x * 34.0 + seed * 5.0 + t * 0.07 + folds * 2.0, uv.y * 1.2 + t * 0.02));
  float glow = pow(folds * 0.7 + rays * 0.3, 2.2) * 3.0;
  return vec2(band * hang * glow * (0.35 + 0.65 * rim), above);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;

  // Night sky: page colour, lifted a touch toward the horizon.
  vec3 col = mix(u_c1, u_c4, 0.12 * (1.0 - smoothstep(0.0, 0.5, uv.y)));

  // Starfield: a hash grid of cells, roughly 1/300 of the frame each; a
  // star in about one cell in twelve, placed and sized by its own hash, and
  // twinkling well under one cycle a second.
  vec2 cells = vec2(aspect, 1.0) * 17.0;
  vec2 g = uv * cells;
  vec2 cell = floor(g);
  float h = hash(cell);
  vec2 pos = vec2(hash(cell + 31.0), hash(cell + 57.0)) * 0.8 + 0.1;
  float px = u_resolution.y / cells.y;
  float d = length((fract(g) - pos) * px);
  float twinkle = 0.65 + 0.35 * sin(t * (0.3 + h * 0.5) + h * 6.2832);
  float star = step(h, 0.085) * smoothstep(1.7, 0.2, d) * (0.35 + 0.65 * hash(cell + 3.0)) * twinkle;
  star *= 0.25 + 0.75 * smoothstep(0.15, 0.6, uv.y);

  // Three curtains of different width and pace, green low and violet high.
  vec2 a = curtain(uv, t, 0.0, 0.3, 6.5);
  vec2 b = curtain(uv, t * 0.85, 1.0, 0.62, 9.0);
  vec2 c = curtain(uv, t * 1.15, 2.0, 0.85, 13.0);
  float lit = a.x + b.x * 0.85 + c.x * 0.7;
  float above = (a.y * a.x + b.y * b.x + c.y * c.x) / max(lit, 0.001);
  vec3 tint = mix(u_c2, u_c3, smoothstep(0.03, 0.25, above));
  vec3 aurora = tint * lit * mix(0.18, 0.26, u_dark);

  col += aurora;
  // Stars dim behind the curtains.
  col += vec3(0.9, 0.95, 1.0) * star * 0.45 * (1.0 - clamp(lit * 0.8, 0.0, 1.0));

  // Pointer: a faint green breath within 320px once the pointer has moved.
  vec2 pp = gl_FragCoord.xy - u_pointer;
  float pd = length(pp) / 320.0;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  col += u_c2 * 0.035 * live * (1.0 / (1.0 + pd * pd)) * smoothstep(1.0, 0.5, pd);

  // Legibility: the topbar and headings sit straight on this sky, so the
  // brightest fold stays under 22% luma; ink keeps 10:1 and muted 5:1 there.
  float l = luma(col);
  float lmax = 0.22;
  if (l > lmax) col *= lmax / l;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#050A16", "#5CF2B8", "#9D7BFF", "#121C32"],
    speed: 1,
    fps: 60,
    stillAt: 25,
  },
  preview: "linear-gradient(165deg, #3A2E78 0%, #0B1430 38%, #050A16 60%, #1F6B5C 100%)",
};
