// SPDX-License-Identifier: GPL-3.0-or-later
// Nebula: deep space. Slow violet and teal dust drifting behind a dense
// starfield; everything in front of it is black, opaque and precise, with a
// 1px violet line where a plate ends. The pieces are starlight (near-white
// with a violet rim) and dark matter (near-black with a teal rim).
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
const PAGE = "#030308";
const SURFACE = "#0C0C16";
const INK = "#F1F1FA";
const MUTED = "#9C9CB8";
const VIOLET = "#B48CFF";
const TEAL = "#4FD1C5";
const ON_VIOLET = "#130A2A";
const STARLIGHT = "#F6F4FF";
const DARK_MATTER = "#121223";

export default {
  id: "nebula",
  name: "Nebula",
  description: "Violet and teal dust behind a starfield, black and precise.",
  scheme: "dark",
  tokens: {
    page: PAGE,
    surface: SURFACE,
    surface2: "#141422",
    surface3: "#1C1C2E",
    glass: "rgba(12,12,22,.92)",
    line: "rgba(180,140,255,.14)",
    lineStrong: "rgba(180,140,255,.25)",
    lineOpaque: "#362C52",
    controlBorder: "rgba(180,140,255,.42)",
    ink: INK,
    muted: MUTED,
    soft: "#6C6C8A",
    accent: VIOLET,
    accent2: TEAL,
    accentSoft: "rgba(180,140,255,.16)",
    onAccent: ON_VIOLET,
    good: "#7FE3A6",
    bad: "#FF7B8A",
    warn: "#FFC46B",
    info: "#7CC8FF",
    goodSoft: "rgba(127,227,166,.16)",
    badSoft: "rgba(255,123,138,.16)",
    warnSoft: "rgba(255,196,107,.16)",
    infoSoft: "rgba(124,200,255,.16)",
    radiusSm: "10px",
    radiusMd: "12px",
    radiusLg: "12px",
    radiusPill: "999px",
    // Opaque plates in a black room: no cast shadow, only a 1px starlight
    // edge along the top of each plate.
    shadowTile: "inset 0 1px 0 rgba(246,244,255,.04)",
    shadowRaised: "inset 0 1px 0 rgba(246,244,255,.05), 0 40px 90px -40px rgba(0,0,0,.95)",
    shadowSheet: "inset 0 1px 0 rgba(246,244,255,.05)",
    fontSans: 'Inter, "Helvetica Neue", -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#0F0F1C",
    border: "#362C52",
    surface: "#07070F",
    bar: "#000000",
    tray: "#050510",
    pointA: "#5B3FA3",
    pointB: "#1F6F75",
    numbers: MUTED,
    caption: MUTED,
    checker0: STARLIGHT,
    rim0: VIOLET,
    detail0: "#CDBBFF",
    count0: ON_VIOLET,
    checker1: DARK_MATTER,
    rim1: TEAL,
    detail1: "#2A8C84",
    count1: INK,
    die0: STARLIGHT,
    pips0: ON_VIOLET,
    dieBorder0: VIOLET,
    die1: DARK_MATTER,
    pips1: INK,
    dieBorder1: TEAL,
    cube: VIOLET,
    cubeText: ON_VIOLET,
    cubeBorder: "#8A62DE",
    // Highlights are mint, a step brighter than the teal rims and points, so
    // a ring reads on a dark-matter checker and on either point colour.
    source: "#8CF5EA",
    selection: "#8CF5EA",
    destination: "#8CF5EA",
    destinationText: "#06201E",
    undo: "#FFC46B",
    undoText: "#2A1A05",
    hover: "#B6FFF6",
    focus: "#E6FFFB",
  },
  patterns: {},
  css: `
/* Type: grotesk at 600, tabular numerals everywhere numbers line up. */
html[data-skin="nebula"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="nebula"] .tool-head h1,
html[data-skin="nebula"] .hero h1,
html[data-skin="nebula"] .panel-head h2,
html[data-skin="nebula"] .panel-head h3,
html[data-skin="nebula"] .panel-title,
html[data-skin="nebula"] .dialog-head h2,
html[data-skin="nebula"] .tile h3 {
  font-weight: 600;
  letter-spacing: -0.015em;
}
/* Page chrome: opaque black plates, 12px corners, a 1px violet line. The
   shader behind is kept near black, so bare text (topbar, strips, action
   line, footer) reads without a backing plate. */
html[data-skin="nebula"] .topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="nebula"] .mark {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: var(--surface);
}
html[data-skin="nebula"] .tool-nav a,
html[data-skin="nebula"] .crumbs a {
  border-radius: var(--r-md);
}
html[data-skin="nebula"] .tool-nav a[aria-current="page"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="nebula"] .panel,
html[data-skin="nebula"] .inspector,
html[data-skin="nebula"] .tile,
html[data-skin="nebula"] .docs-toc--sticky {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-tile);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="nebula"] .tile:hover,
html[data-skin="nebula"] .tile:focus-visible {
  translate: none;
  border-color: var(--control-border);
  box-shadow: var(--shadow-tile);
}
html[data-skin="nebula"] .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
}
html[data-skin="nebula"] .panel-head,
html[data-skin="nebula"] .panel-foot {
  border-color: var(--line);
}
html[data-skin="nebula"] .hub-board-frame {
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="nebula"] .stage,
html[data-skin="nebula"] .board-slot,
html[data-skin="nebula"] .board-frame {
  border-radius: var(--r-lg);
}
html[data-skin="nebula"] .player-strip {
  border-radius: var(--r-md);
  padding-inline: 12px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
}
html[data-skin="nebula"] .player-strip.active {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong), inset 2px 0 0 var(--accent);
}
html[data-skin="nebula"] .dialog {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 16px 16px var(--r-lg) var(--r-lg);
  box-shadow: var(--shadow-raised);
}
html[data-skin="nebula"] .dialog::backdrop {
  background: rgba(3,3,8,.72);
}
html[data-skin="nebula"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="nebula"] .toast {
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-tile);
}
html[data-skin="nebula"] .toast--alert {
  border-color: color-mix(in oklab, var(--bad) 45%, transparent);
}
html[data-skin="nebula"] .toast--good {
  border-color: color-mix(in oklab, var(--good) 45%, transparent);
}
/* Buttons: flat plates with the violet line; the primary is solid violet with
   dark ink. Ghost and pressed states keep a visible label on every state. */
html[data-skin="nebula"] .btn {
  border-radius: var(--r-md);
  background: var(--surface-2);
  border-color: var(--line-strong);
  color: var(--ink);
  letter-spacing: -0.005em;
}
html[data-skin="nebula"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="nebula"] .btn[aria-pressed="true"],
html[data-skin="nebula"] .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="nebula"] .btn--primary,
html[data-skin="nebula"] .btn--primary[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
/* The generic .btn:hover above outranks the kit's primary hover; keep the
   violet fill (lightened as the kit does) and the dark label on hover/press. */
html[data-skin="nebula"] .btn--primary:hover,
html[data-skin="nebula"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, white);
  border-color: color-mix(in oklab, var(--accent) 86%, white);
  color: var(--on-accent);
}
html[data-skin="nebula"] .btn--ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
html[data-skin="nebula"] .btn--ghost:hover,
html[data-skin="nebula"] .btn--ghost:active {
  background: var(--surface-2);
  border-color: var(--control-border);
  color: var(--ink);
}
/* Opaque, so the red label never sits on the starfield. */
html[data-skin="nebula"] .btn--danger {
  background: color-mix(in oklab, var(--bad) 16%, var(--surface));
  border-color: color-mix(in oklab, var(--bad) 50%, transparent);
  color: var(--bad);
}
html[data-skin="nebula"] .btn--danger:hover,
html[data-skin="nebula"] .btn--danger:active {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="nebula"] .segmented {
  background: var(--surface);
  border-color: var(--line-strong);
  border-radius: var(--r-md);
}
html[data-skin="nebula"] .segmented > label,
html[data-skin="nebula"] .segmented > button {
  border-radius: calc(var(--r-md) - 3px);
}
html[data-skin="nebula"] .segmented > label:has(input:checked),
html[data-skin="nebula"] .segmented > button[aria-pressed="true"],
html[data-skin="nebula"] .segmented > button[aria-checked="true"],
html[data-skin="nebula"] .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--control-border);
}
html[data-skin="nebula"] .tabs {
  border-bottom-color: var(--line-strong);
}
html[data-skin="nebula"] .tabs--pill > [role="tab"] {
  border-radius: var(--r-md);
}
html[data-skin="nebula"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="nebula"] .field select,
html[data-skin="nebula"] .field textarea {
  background: var(--page);
  border-color: var(--control-border);
  border-radius: var(--r-sm);
}
html[data-skin="nebula"] .field input:focus-visible,
html[data-skin="nebula"] .field select:focus-visible,
html[data-skin="nebula"] .field textarea:focus-visible {
  border-color: var(--accent);
}
html[data-skin="nebula"] .docs-section {
  border-top-color: var(--line-strong);
}
html[data-skin="nebula"] .docs-toc a {
  border-radius: var(--r-md);
}
html[data-skin="nebula"] .equity-retry {
  border-radius: var(--r-md);
}
/* Board. Frame: a black plate lit faintly from above. Surface: deep space
   with a sparse static starfield at 10%. Points: violet and teal gradients
   that darken at the base and glow toward the tip. Checkers: starlight discs
   with a soft top light and a violet rim; dark-matter discs with a teal rim
   wide enough to read on the black bar. Dice and cube share the top light. */
html[data-skin="nebula"] .bg-board text {
  font-family: var(--font-sans);
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="nebula"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-nebula-frame);
}
html[data-skin="nebula"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-nebula-stars);
  stroke: var(--board-border);
  stroke-width: 2;
}
html[data-skin="nebula"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-nebula-bar);
}
html[data-skin="nebula"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-nebula-tray);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="nebula"] .bg-board .point-shape {
  stroke: rgba(3, 3, 8, 0.6);
  stroke-width: 1.5;
  stroke-linejoin: round;
}
html[data-skin="nebula"] .bg-board [data-pattern="pointA"],
html[data-skin="nebula"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-nebula-point);
}
html[data-skin="nebula"] .bg-board .checker [data-pattern="checker0"],
html[data-skin="nebula"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-nebula-starlight);
}
html[data-skin="nebula"] .bg-board .checker [data-pattern="checker1"],
html[data-skin="nebula"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-nebula-dark-matter);
}
html[data-skin="nebula"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-nebula-cube);
}
/* Dark-matter checkers sit on the black bar and tray, so the teal rim carries
   them. The gradient overlay clones the face radius and hides the inner half
   of the stroke; widen the stroke and pull the overlay in to the stroke's
   inner edge so the whole 4-unit ring shows (about 1.6 px on a phone board). */
html[data-skin="nebula"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 4;
}
html[data-skin="nebula"] .bg-board .checker[data-player="1"] > [data-pattern="checker1"] {
  r: 20px;
}
html[data-skin="nebula"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="nebula"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
`,
  defs: `
<linearGradient id="skin-nebula-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#F6F4FF" stop-opacity=".06"/>
  <stop offset=".4" stop-color="#F6F4FF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".3"/>
</linearGradient>
<pattern id="skin-nebula-stars" patternUnits="userSpaceOnUse" width="96" height="96" patternTransform="rotate(17)">
  <circle cx="9" cy="14" r="1.2" fill="#F6F4FF" fill-opacity=".14"/>
  <circle cx="41" cy="6" r=".8" fill="#F6F4FF" fill-opacity=".1"/>
  <circle cx="70" cy="22" r="1" fill="#CDBBFF" fill-opacity=".12"/>
  <circle cx="23" cy="47" r=".7" fill="#F6F4FF" fill-opacity=".08"/>
  <circle cx="86" cy="52" r="1.3" fill="#F6F4FF" fill-opacity=".12"/>
  <circle cx="55" cy="63" r=".8" fill="#7DEEE3" fill-opacity=".1"/>
  <circle cx="12" cy="82" r="1" fill="#F6F4FF" fill-opacity=".1"/>
  <circle cx="64" cy="90" r=".7" fill="#F6F4FF" fill-opacity=".08"/>
  <circle cx="38" cy="30" r=".6" fill="#F6F4FF" fill-opacity=".07"/>
  <circle cx="92" cy="80" r=".6" fill="#CDBBFF" fill-opacity=".08"/>
</pattern>
<linearGradient id="skin-nebula-bar" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#B48CFF" stop-opacity=".07"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#4FD1C5" stop-opacity=".06"/>
</linearGradient>
<linearGradient id="skin-nebula-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".5"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#F6F4FF" stop-opacity=".03"/>
</linearGradient>
<linearGradient id="skin-nebula-point" gradientUnits="userSpaceOnUse" x1="0" y1="38" x2="0" y2="622">
  <stop offset="0" stop-color="#000000" stop-opacity=".42"/>
  <stop offset=".2" stop-color="#000000" stop-opacity=".1"/>
  <stop offset=".383" stop-color="#F6F4FF" stop-opacity=".14"/>
  <stop offset=".617" stop-color="#F6F4FF" stop-opacity=".14"/>
  <stop offset=".8" stop-color="#000000" stop-opacity=".1"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".42"/>
</linearGradient>
<radialGradient id="skin-nebula-starlight" cx=".36" cy=".28" r=".8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".6"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity=".06"/>
  <stop offset="1" stop-color="#5B3FA3" stop-opacity=".22"/>
</radialGradient>
<radialGradient id="skin-nebula-dark-matter" cx=".36" cy=".28" r=".82">
  <stop offset="0" stop-color="#F6F4FF" stop-opacity=".14"/>
  <stop offset=".55" stop-color="#F6F4FF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".5"/>
</radialGradient>
<linearGradient id="skin-nebula-cube" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#130A2A" stop-opacity=".22"/>
</linearGradient>
`,
  shader: {
    // Nebula: two fbm dust clouds (violet, teal), domain-warped at t*0.01 and
    // shaped by a large-scale mask so most of the frame stays black; two hash
    // grid star layers at different cell sizes, each star twinkling on its own
    // slow phase; a soft vignette. Dust luminance is capped so ink and muted
    // text keep their contrast over it.
    fragment: `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec3 u_c1; // page: the black of space
uniform vec3 u_c2; // violet dust
uniform vec3 u_c3; // teal dust
uniform vec3 u_c4; // starlight
uniform float u_dark;

// Lattice hash on a 512-cell torus so slow drift never reaches large ids.
float hash(vec2 i) {
  i = mod(i, 512.0);
  vec3 q = fract(vec3(i.x, i.y, i.x + i.y) * vec3(0.1031, 0.1030, 0.0973));
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

// Four octaves with a rotation each step so the lattice never shows.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = r * p * 2.02 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}

// One star layer: cells of size px, a star in about a third of them, each
// with its own position, size, tint and twinkle phase.
vec3 stars(vec2 px, float size, float seed, float t) {
  vec2 g = px / size;
  vec2 id = floor(g) + seed;
  float h = hash(id);
  if (h < 0.66) return vec3(0.0);
  vec2 c = vec2(hash(id + 7.3), hash(id + 19.1)) * 0.7 + 0.15;
  float d = length(g - floor(g) - c) * size;
  float mag = hash(id + 41.7);
  float radius = 0.7 + mag * mag * 1.6;
  float core = exp(-d * d / (radius * radius));
  float twinkle = 0.78 + 0.22 * sin(t * (0.35 + 0.45 * mag) + h * 6.2832);
  vec3 tint = mix(vec3(1.0), mix(u_c2, u_c3, step(0.5, hash(id + 3.3))), 0.35 * hash(id + 11.0));
  return tint * core * twinkle * (0.35 + 0.65 * mag);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time;

  // Dust: slow domain warp, two clouds on different frequencies and offsets.
  vec2 drift = vec2(t * 0.01, -t * 0.006);
  vec2 q = p * 1.7 + drift;
  vec2 warp = vec2(fbm(q + vec2(0.0, t * 0.01)), fbm(q + vec2(5.2, 1.3) - t * 0.008));
  float violet = fbm(q + 1.3 * warp);
  float teal = fbm(q * 1.4 + vec2(8.7, 2.9) - 1.1 * warp);

  // Large-scale masks, barely moving, on two scales so a frame is never
  // uniformly empty or full; the violet cloud favours the lower left, the
  // teal veins the upper right, and most of the frame stays black.
  float big1 = 0.5 * vnoise(p * 0.9 + vec2(2.0, 4.0) + t * 0.0015) + 0.5 * vnoise(p * 2.3 + vec2(7.0, 3.0) - t * 0.001);
  float big2 = 0.5 * vnoise(p * 0.8 + vec2(9.0, 1.0) - t * 0.0012) + 0.5 * vnoise(p * 2.1 + vec2(1.0, 8.0) + t * 0.0009);
  float m1 = smoothstep(0.36, 0.68, big1) * (0.3 + 0.7 * smoothstep(1.6, 0.2, uv.x * aspect + uv.y * 0.9));
  float m2 = smoothstep(0.44, 0.76, big2) * (0.25 + 0.75 * smoothstep(0.4, 1.5, uv.x * aspect * 0.6 + uv.y));
  violet = pow(max(violet - 0.3, 0.0) * 2.0, 1.3) * m1;
  // The teal cloud is ridged: thin veins rather than a second blanket.
  teal = pow(1.0 - abs(2.0 * teal - 1.0), 6.0) * m2;

  // Vignette on the light, never on the black.
  float vig = 1.0 - 0.45 * smoothstep(0.35, 0.95, length(uv - 0.5) * 1.3);

  // Pointer: the nearest dust brightens slightly (idle until the pointer moves).
  vec2 pp = gl_FragCoord.xy - u_pointer;
  float dp = length(pp) / 320.0;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float warm = 1.0 + 0.35 * live * (1.0 / (1.0 + dp * dp)) * smoothstep(1.2, 0.5, dp);

  vec3 dust = (u_c2 * violet * 0.6 + mix(u_c3, u_c2, 0.5 * m1) * teal * 0.26) * vig * warm;
  // Cap the dust so text set straight on the page keeps its contrast.
  float cap = mix(0.3, 0.19, u_dark);
  float l = luma(dust);
  if (l > cap) dust *= cap / l;

  // Starfield: a dense faint layer and a sparse brighter one, drifting slowly.
  vec2 px = gl_FragCoord.xy + vec2(t * 0.35, t * 0.12);
  vec3 star = stars(px, 22.0, 0.0, t) * 0.55 + stars(px * 0.98, 61.0, 100.0, t) * 0.8;
  star *= vig * 0.6 + 0.4;

  vec3 col = u_c1 + dust + u_c4 * star;
  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`,
    colors: [PAGE, VIOLET, TEAL, STARLIGHT],
    speed: 1,
    fps: 60,
    stillAt: 30,
  },
  preview: "radial-gradient(ellipse at 28% 72%, #3A2770 0%, #030308 45%), radial-gradient(ellipse at 76% 22%, #15484C 0%, #030308 42%)",
};
