// SPDX-License-Identifier: GPL-3.0-or-later
// Obsidian: volcanic glass lit from below. Near-black plates, ember fissures
// breathing on their own phases, rim-lit pieces and no cast shadows. Points
// separate by value (dark basalt against matte pumice), not by hue.
const EMBER = "#FF6A2A";
const AMBER = "#FFB347";
const PAGE = "#0A0A0C";
const SURFACE = "#141417";

export default {
  id: "obsidian",
  name: "Obsidian",
  description: "Black volcanic glass with ember fissures.",
  scheme: "dark",
  tokens: {
    page: PAGE,
    surface: SURFACE,
    surface2: "#1C1C21",
    surface3: "#24242A",
    glass: "rgba(20,20,23,.84)",
    line: "#2A2A31",
    lineStrong: "rgba(255,255,255,.14)",
    lineOpaque: "#2A2A31",
    controlBorder: "#4A4A54",
    ink: "#ECEBE8",
    muted: "#A09D98",
    soft: "#75736E",
    accent: EMBER,
    accent2: AMBER,
    accentSoft: "rgba(255,106,42,.16)",
    onAccent: "#140800",
    good: "#8EDB9C",
    bad: "#E5484D",
    warn: AMBER,
    info: "#4FD1FF",
    goodSoft: "rgba(142,219,156,.16)",
    badSoft: "rgba(229,72,77,.16)",
    warnSoft: "rgba(255,179,71,.16)",
    infoSoft: "rgba(79,209,255,.16)",
    radiusSm: "4px",
    radiusMd: "4px",
    radiusLg: "6px",
    radiusPill: "4px",
    // Stacked glass plates: a 1px top-edge highlight and a 1px page-coloured
    // bottom edge instead of a cast shadow.
    shadowTile: "inset 0 1px 0 rgba(255,255,255,.05), 0 1px 0 #0A0A0C",
    shadowRaised: "inset 0 1px 0 rgba(255,255,255,.06), 0 0 0 1px rgba(255,106,42,.14)",
    shadowSheet: "inset 0 1px 0 rgba(255,255,255,.06)",
    fontSans: '-apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#151518",
    border: "#2A2A31",
    surface: "#1B1B1F",
    bar: "#0A0A0C",
    tray: "#0E0E11",
    pointA: "#3A3332", // basalt
    pointB: "#7A7772", // matte pumice, luminance ≈ 0.19
    numbers: "#A09D98",
    caption: "#B9B5AE",
    checker0: "#E9E4DC",
    rim0: "#A8A39A",
    detail0: "#CFC9BF",
    count0: "#0A0A0C",
    checker1: "#0C0C0E",
    rim1: EMBER,
    detail1: "#6B2E12",
    count1: EMBER,
    die0: "#E9E4DC",
    pips0: "#0A0A0C",
    dieBorder0: "#A8A39A",
    die1: "#141417",
    pips1: "#E9E4DC",
    dieBorder1: EMBER,
    cube: EMBER,
    cubeText: "#140800",
    cubeBorder: "#C24D18",
    source: AMBER,
    selection: AMBER,
    destination: AMBER,
    destinationText: "#140800",
    undo: "#4FD1FF",
    undoText: "#04131A",
    hover: "#FFC978",
    focus: "#4FD1FF",
  },
  patterns: {},
  css: `
/* Page chrome: sharp 4px radii, opaque plates with a 1px line and a top-edge
   highlight, nothing cast downward. */
html[data-skin="obsidian"] .topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="obsidian"] .mark {
  border-radius: 4px;
  border-color: var(--line);
  background: var(--surface);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
}
html[data-skin="obsidian"] .tool-nav a {
  border-radius: 0;
  letter-spacing: -0.01em;
}
html[data-skin="obsidian"] .tool-nav a[aria-current] {
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--accent);
}
html[data-skin="obsidian"] .tool-head h1,
html[data-skin="obsidian"] .hero h1 {
  font-weight: 700;
  letter-spacing: -0.025em;
}
html[data-skin="obsidian"] .panel,
html[data-skin="obsidian"] .inspector,
html[data-skin="obsidian"] .tile,
html[data-skin="obsidian"] .docs-toc--sticky {
  border-radius: 4px;
  border-color: var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-tile);
}
html[data-skin="obsidian"] .tile:hover,
html[data-skin="obsidian"] .tile:focus-visible {
  translate: 0 0;
  border-color: var(--line-strong);
  box-shadow: var(--shadow-tile), 0 0 0 1px rgba(255,106,42,.18);
}
html[data-skin="obsidian"] .panel-head h2,
html[data-skin="obsidian"] .panel-head h3,
html[data-skin="obsidian"] .panel-title {
  font-weight: 700;
  letter-spacing: -0.02em;
}
html[data-skin="obsidian"] .stage,
html[data-skin="obsidian"] .board-slot,
html[data-skin="obsidian"] .board-frame {
  border-radius: 4px;
}
html[data-skin="obsidian"] .hub-board-frame {
  border-radius: 4px;
  background: var(--surface);
  box-shadow: var(--shadow-tile);
}
html[data-skin="obsidian"] .player-strip {
  border-radius: 4px;
  font-family: var(--font-mono);
  font-weight: 500;
}
html[data-skin="obsidian"] .player-strip.active {
  background: var(--surface);
  box-shadow: inset 2px 0 0 var(--accent), inset 0 1px 0 rgba(255,255,255,.05);
}
html[data-skin="obsidian"] .player-name strong {
  font-family: var(--font-sans);
  font-weight: 700;
  letter-spacing: -0.01em;
}
html[data-skin="obsidian"] .btn {
  border-radius: 4px;
  border-color: var(--line);
  background: var(--surface-2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
  letter-spacing: -0.01em;
}
html[data-skin="obsidian"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
}
html[data-skin="obsidian"] .btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18);
}
html[data-skin="obsidian"] .btn--primary:hover {
  background: var(--accent-2);
  border-color: var(--accent-2);
}
html[data-skin="obsidian"] .btn--ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="obsidian"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="obsidian"] .btn--danger {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="obsidian"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--ink);
}
html[data-skin="obsidian"] .btn[aria-pressed="true"] {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="obsidian"] .segmented {
  border-radius: 4px;
  border-color: var(--line);
  background: var(--page);
  padding: 2px;
}
html[data-skin="obsidian"] .segmented > label,
html[data-skin="obsidian"] .segmented > button {
  border-radius: 3px;
}
html[data-skin="obsidian"] .segmented > label:has(input:checked),
html[data-skin="obsidian"] .segmented > button[aria-pressed="true"],
html[data-skin="obsidian"] .segmented > button[aria-checked="true"],
html[data-skin="obsidian"] .segmented > [aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong), inset 0 -2px 0 var(--accent);
}
html[data-skin="obsidian"] .tabs > [role="tab"] {
  border-radius: 0;
  letter-spacing: -0.01em;
}
html[data-skin="obsidian"] .tabs--pill > [role="tab"] {
  border-radius: 4px;
}
html[data-skin="obsidian"] .tabs.has-indicator::after {
  border-radius: 0;
}
html[data-skin="obsidian"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="obsidian"] .field select,
html[data-skin="obsidian"] .field textarea {
  border-radius: 4px;
  border-color: var(--line-opaque);
  background: var(--page);
  box-shadow: inset 0 1px 0 rgba(0,0,0,.4);
}
html[data-skin="obsidian"] .field input:focus-visible,
html[data-skin="obsidian"] .field select:focus-visible,
html[data-skin="obsidian"] .field textarea:focus-visible {
  border-color: var(--accent);
}
html[data-skin="obsidian"] .field-value,
html[data-skin="obsidian"] .field-row output {
  font-family: var(--font-mono);
  font-weight: 500;
}
html[data-skin="obsidian"] .dialog {
  border-radius: 6px;
  border-color: var(--line-strong);
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}
html[data-skin="obsidian"] .dialog::backdrop {
  background: rgba(10,10,12,.7);
  backdrop-filter: none;
}
html[data-skin="obsidian"] .toast {
  border-radius: 4px;
  border-color: var(--line-strong);
  background: var(--surface-2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}
html[data-skin="obsidian"] .toast .btn {
  color: var(--accent);
}
html[data-skin="obsidian"] .equity-retry {
  border-radius: 4px;
}

/* Board. Frame: matte black glass with a conchoidal sheen. Surface: lit
   faintly from the bar's fissure. Points: straight triangles outlined in the
   line colour, brightening toward the tip. Pieces: bone discs with a soft
   sheen; obsidian discs that glow at the rim. Dice and cube are lit from
   below. Numerals are monospaced so they read as engraved. */
html[data-skin="obsidian"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-obsidian-frame);
}
html[data-skin="obsidian"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-obsidian-surface);
}
html[data-skin="obsidian"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-obsidian-bar);
}
html[data-skin="obsidian"] .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="obsidian"] .bg-board .point-shape {
  stroke: var(--board-border);
  stroke-width: 1;
  stroke-linejoin: round;
}
html[data-skin="obsidian"] .bg-board [data-pattern="pointA"],
html[data-skin="obsidian"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-obsidian-point);
}
html[data-skin="obsidian"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-obsidian-bone);
}
html[data-skin="obsidian"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-obsidian-glass);
}
/* The glass disc is as dark as the bar and the basalt points, so its ember
   rim carries the separation: a wider face stroke (the overlay covers the
   inner half) keeps the ring above a CSS pixel on a phone-scale board. */
html[data-skin="obsidian"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 5;
}
html[data-skin="obsidian"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="obsidian"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-obsidian-die0);
}
html[data-skin="obsidian"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-obsidian-die1);
}
html[data-skin="obsidian"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
html[data-skin="obsidian"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-obsidian-cube);
}
html[data-skin="obsidian"] .bg-board text {
  font-family: var(--font-mono);
  font-weight: 500;
}
html[data-skin="obsidian"] .bg-board .checker text,
html[data-skin="obsidian"] .bg-board .board-cube text {
  font-weight: 700;
}
`,
  defs: `
<linearGradient id="skin-obsidian-frame" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(35 .5 .5)">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".07"/>
  <stop offset=".45" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".14"/>
</linearGradient>
<linearGradient id="skin-obsidian-surface" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".16"/>
  <stop offset=".5" stop-color="#FF6A2A" stop-opacity=".035"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".16"/>
</linearGradient>
<linearGradient id="skin-obsidian-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset=".46" stop-color="#FF6A2A" stop-opacity="0"/>
  <stop offset=".487" stop-color="#FF6A2A" stop-opacity=".45"/>
  <stop offset=".513" stop-color="#FF6A2A" stop-opacity=".45"/>
  <stop offset=".54" stop-color="#FF6A2A" stop-opacity="0"/>
</linearGradient>
<linearGradient id="skin-obsidian-point" gradientUnits="userSpaceOnUse" x1="0" y1="28" x2="0" y2="632">
  <stop offset="0" stop-color="#FFD9C4" stop-opacity="0"/>
  <stop offset=".383" stop-color="#FFD9C4" stop-opacity=".16"/>
  <stop offset=".617" stop-color="#FFD9C4" stop-opacity=".16"/>
  <stop offset="1" stop-color="#FFD9C4" stop-opacity="0"/>
</linearGradient>
<radialGradient id="skin-obsidian-bone" cx=".4" cy=".32" r=".78">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".34"/>
  <stop offset=".55" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".2"/>
</radialGradient>
<radialGradient id="skin-obsidian-glass" cx=".5" cy=".5" r=".5">
  <stop offset="0" stop-color="#FF6A2A" stop-opacity="0"/>
  <stop offset=".62" stop-color="#FF6A2A" stop-opacity="0"/>
  <stop offset=".84" stop-color="#FF6A2A" stop-opacity=".2"/>
  <stop offset="1" stop-color="#FF6A2A" stop-opacity=".5"/>
</radialGradient>
<linearGradient id="skin-obsidian-die0" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".16"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".1"/>
</linearGradient>
<linearGradient id="skin-obsidian-die1" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FF6A2A" stop-opacity="0"/>
  <stop offset=".55" stop-color="#FF6A2A" stop-opacity=".04"/>
  <stop offset="1" stop-color="#FF6A2A" stop-opacity=".3"/>
</linearGradient>
<linearGradient id="skin-obsidian-cube" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".2"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFB347" stop-opacity=".32"/>
</linearGradient>
`,
  shader: {
    // Cooling lava crust: Voronoi plates whose fissures glow ember, each on
    // its own breathing phase; glassy fbm grain and a slow diagonal sheen on
    // the plates; the pointer heats the nearest cracks. Crack light is capped
    // at 16% of the accent so ink stays legible over it.
    fragment: `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; // ember
uniform vec3  u_c2; // amber
uniform vec3  u_c3; // page
uniform vec3  u_c4; // surface
uniform float u_dark;

float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(i);
  float b = hash1(i + vec2(1.0, 0.0));
  float c = hash1(i + vec2(0.0, 1.0));
  float d = hash1(i + vec2(1.0, 1.0));
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
// Plates: nearest and second-nearest seed distance, plus the nearest cell's hash.
vec3 voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float h = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.84 * (hash2(n + g) - 0.5);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; h = hash1(n + g); }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), h);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_resolution.y;

  vec3  v    = voronoi(uv * 4.0 + vec2(3.1, 1.7));
  float w    = v.y - v.x;
  float glow = smoothstep(0.06, 0.0, w);
  float dark = smoothstep(0.14, 0.0, w);

  // Each fissure breathes on its own phase, ember to amber.
  float pulse     = 0.5 + 0.5 * sin(u_time * 0.6 + v.z * 6.28318);
  vec3  glowCol   = mix(u_c1, u_c2, pulse);
  float intensity = mix(0.08, 0.16, pulse);

  // The pointer heats the nearest cracks; untouched (0,0) stays cold.
  float active = step(0.5, u_pointer.x + u_pointer.y);
  float pd     = length(px - u_pointer) / (0.3 * u_resolution.y);
  float heat   = 1.0 + 0.8 * active / (1.0 + pd * pd);

  // Glassy plate: near-black with +/-2% grain and a slow diagonal sheen.
  float grain = (fbm(uv * 9.0 + v.z) - 0.5) * 0.04;
  float band  = dot(uv, vec2(0.7, 0.7)) + u_time * 0.03;
  float sheen = smoothstep(0.55, 1.0, sin(band * 2.4)) * 0.02;
  vec3  plate = mix(u_c3, u_c4, 0.35 + grain) + vec3(sheen);
  plate *= 1.0 - 0.35 * dark;

  float crack = min(glow * intensity * heat, 0.16);
  vec3 col = plate + glowCol * crack;

  // Corners fall away so the board is the brightest thing on the page.
  vec2 q = px / u_resolution - 0.5;
  col *= 1.0 - 0.35 * dot(q, q);
  col += (1.0 - u_dark) * 0.5;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: [EMBER, AMBER, PAGE, SURFACE],
    speed: 1,
    fps: 30,
    stillAt: 2.2,
  },
  preview:
    "linear-gradient(135deg, #0A0A0C 0%, #141417 46%, #FF6A2A 50%, #141417 54%, #0A0A0C 100%)",
};
