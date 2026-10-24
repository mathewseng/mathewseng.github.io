// SPDX-License-Identifier: GPL-3.0-or-later
// Phosphor Terminal: a green P1-phosphor CRT. Everything is light emitted
// from near-black glass, so there are no shadows anywhere, only bloom, and
// every element differs by brightness tier and shape rather than hue
// (ink > muted > line). The board is wireframe: a bright frame stroke, dim
// solid points against hatched points, filled white discs against hollow
// black rings, scanlines on the playing surface. Monospace throughout via the
// kit's --font-mono token; 2px radii because a phosphor cannot draw curves.
// The one hue that is not green is the amber of the warn/undo tier, and the
// movable-checker cue borrows it (board.source): the engine's dashed 1.5px
// source ring and its dashed last-move ring share the same geometry, so hue,
// not brightness, is what tells "you can move this" from "this just moved"
// (the pale selection yellow) and from every checker's green rim at phone
// scale, where the ring is under a pixel wide.
const P = 'html[data-skin="phosphor-terminal"]';
const ID = "skin-phosphor-terminal";
const BLOOM = "0 0 6px color-mix(in srgb, var(--ink) 45%, transparent)";
const GLOW = "0 0 24px color-mix(in srgb, var(--accent) 18%, transparent)";

export default {
  id: "phosphor-terminal",
  name: "Phosphor Terminal",
  description: "Green phosphor on black glass, scanlines and bloom.",
  scheme: "dark",
  tokens: {
    page: "#030803",
    surface: "#071207",
    surface2: "#0B1C0C",
    surface3: "#0F2611",
    glass: "rgba(7,18,7,.84)",
    line: "#1E4A26",
    lineStrong: "#2E6B3A",
    lineOpaque: "#1E4A26",
    controlBorder: "#4FBF62",
    ink: "#8CFF96",
    muted: "#4FBF62",
    soft: "#3F9A50",
    accent: "#5CFF7D",
    accent2: "#F4FFB0",
    accentSoft: "rgba(92,255,125,.12)",
    onAccent: "#031A08",
    good: "#8CFF96",
    bad: "#FFB85C",
    warn: "#FFD166",
    info: "#4FBF62",
    goodSoft: "rgba(140,255,150,.12)",
    badSoft: "rgba(255,184,92,.14)",
    warnSoft: "rgba(255,209,102,.14)",
    infoSoft: "rgba(79,191,98,.14)",
    radiusSm: "2px",
    radiusMd: "2px",
    radiusLg: "2px",
    radiusPill: "2px",
    shadowTile: "none",
    shadowRaised: "0 0 24px rgba(92,255,125,.18)",
    shadowSheet: "0 0 24px rgba(92,255,125,.18)",
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSans: "var(--font-mono)",
  },
  board: {
    frame: "#071207",
    border: "#8CFF96",
    surface: "#061006",
    bar: "#0D2612",
    tray: "#0A1C0C",
    pointA: "#123A1C",
    pointB: "#4FBF62",
    numbers: "#4FBF62",
    caption: "#8CFF96",
    checker0: "#E4FFE8",
    rim0: "#8CFF96",
    detail0: "#E4FFE8",
    count0: "#031A08",
    checker1: "#020703",
    rim1: "#8CFF96",
    detail1: "#123A1C",
    count1: "#8CFF96",
    die0: "#E4FFE8",
    pips0: "#071207",
    dieBorder0: "#8CFF96",
    die1: "#020703",
    pips1: "#8CFF96",
    dieBorder1: "#8CFF96",
    cube: "#5CFF7D",
    cubeText: "#031A08",
    cubeBorder: "#8CFF96",
    source: "#FFD166",
    selection: "#F4FFB0",
    destination: "#F4FFB0",
    destinationText: "#031A08",
    undo: "#FFB85C",
    undoText: "#031A08",
    hover: "#E4FFE8",
    focus: "#F4FFB0",
  },
  patterns: {},
  css: `
/* Type: one monospace, tabular lining numerals, bloom on headings only. */
${P} {
  --focus-ring: 2px solid var(--accent-2);
  --focus-halo: 0 0 10px color-mix(in srgb, var(--accent-2) 45%, transparent);
  font-variant-numeric: tabular-nums lining-nums;
}
${P} .tool-head h1,
${P} .panel-head h2,
${P} .panel-head h3,
${P} .panel-title,
${P} .dialog-head h2,
${P} .docs-section h2,
${P} .docs-section h3 {
  font-weight: 600;
  letter-spacing: 0;
  text-shadow: ${BLOOM};
}
${P} .hero h1 {
  background: none;
  color: var(--ink);
  font-weight: 600;
  letter-spacing: -0.01em;
  text-shadow: ${BLOOM};
}

/* Chrome: 1px strokes on flat surfaces, 2px radii, no fill shadows. */
${P} .topbar {
  border-bottom: 1px solid var(--line);
}
${P} .tool-nav a {
  border-radius: 0;
}
${P} .tool-nav a[aria-current="page"] {
  background: none;
  box-shadow: inset 0 -2px 0 var(--ink);
}
${P} .panel,
${P} .inspector,
${P} .tile,
${P} .docs-card,
${P} .docs-callout {
  background: var(--surface);
  border-color: var(--line);
  border-radius: 2px;
  box-shadow: none;
}
${P} .tile::before,
${P} .tile::after {
  display: none;
}
${P} .tile:hover,
${P} .tile:focus-visible {
  translate: none;
  border-color: var(--muted);
  box-shadow: ${GLOW};
}
${P} .player-strip {
  border-radius: 2px;
}
${P} .player-strip.active {
  background: var(--surface-2);
  box-shadow: inset 2px 0 0 var(--accent);
}
${P} .btn {
  border-radius: 2px;
  background: var(--surface-2);
  border-color: var(--line-strong);
  box-shadow: none;
}
${P} .btn:hover {
  background: var(--surface-3);
  border-color: var(--muted);
}
${P} .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
${P} .btn--primary:hover {
  background: var(--accent-2);
  border-color: var(--accent-2);
}
${P} .btn--ghost {
  background: transparent;
  border-color: var(--muted);
  color: var(--ink);
}
${P} .btn--ghost:hover {
  background: var(--muted);
  border-color: var(--muted);
  color: var(--on-accent);
}
${P} .btn--danger {
  background: transparent;
  border-color: var(--warn);
  color: var(--warn);
}
${P} .btn--danger:hover {
  background: var(--warn);
  border-color: var(--warn);
  color: var(--on-accent);
}
${P} .btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--muted);
}
${P} .segmented {
  padding: 2px;
  border-color: var(--line);
  border-radius: 2px;
  background: var(--surface);
}
${P} .segmented > label,
${P} .segmented > button {
  border-radius: 2px;
}
${P} .segmented > label:has(input:checked),
${P} .segmented > button[aria-pressed="true"],
${P} .segmented > button[aria-checked="true"],
${P} .segmented > [aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--muted);
}
${P} .tabs > [role="tab"] {
  border-radius: 0;
}
${P} .tabs > [role="tab"][aria-selected="true"] {
  box-shadow: inset 0 -2px 0 var(--ink);
}
${P} .tabs.has-indicator > [role="tab"][aria-selected="true"] {
  box-shadow: none;
}
${P} .tabs.has-indicator::after {
  border-radius: 0;
  background: var(--ink);
}
${P} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${P} .field select,
${P} .field textarea {
  border-radius: 2px;
  border-color: var(--line-strong);
  background: var(--page);
}
${P} .field input:focus-visible,
${P} .field select:focus-visible,
${P} .field textarea:focus-visible {
  border-color: var(--ink);
}
${P} .dialog,
${P} .toast {
  border: 1px solid var(--ink);
  border-radius: 2px;
  background: var(--surface);
  box-shadow: ${GLOW};
}
${P} .toast--alert {
  border-color: var(--warn);
  background: var(--surface);
}
${P} .toast--good {
  border-color: var(--ink);
  background: var(--surface);
}

/* Openings: the idea categories are brightness tiers of the one phosphor
   instead of the kit's hues, brighter for the more structural ideas. */
${P} .opening-guide {
  --cat-1: var(--soft);
  --cat-2: var(--accent-2);
  --cat-3: var(--muted);
  --cat-4: var(--ink);
  --cat-5: var(--accent);
  --cat-6: var(--line-strong);
  --player-2: var(--line-strong);
}
${P} .opening-guide [data-opening-kind="develop"] {
  --opening-color: var(--line);
}

/* Board: wireframe geometry. Strokes carry the structure, fills recede. */
${P} .bg-board text {
  font-family: var(--font-mono);
  font-weight: 600;
}
${P} .bg-board [data-pattern="surface"] {
  fill: url(#${ID}-scan);
  stroke: var(--line);
  stroke-width: 1;
}
${P} .bg-board [data-pattern="bar"] {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
}
${P} .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
${P} .bg-board .point [data-pattern="pointA"],
${P} .bg-board .point [data-pattern="pointB"] {
  stroke: var(--board-numbers);
  stroke-width: 1;
  stroke-linejoin: miter;
}
${P} .bg-board .point [data-pattern="pointB"] {
  fill: url(#${ID}-hatch);
}
/* Checkers: white is a filled disc with a thin ring, black a hollow 2px ring.
   The bloom is a gradient stroke on the existing overlay sibling: no filter.
   It hugs the rim (r 21.5-24.5 of a 22 radius disc) so the engine's movable
   ring at r 25 sits outside it, on the dark halo, in its own brighter tier. */
${P} .bg-board .checker[data-player="0"] > circle:first-child {
  stroke-width: 1.5;
}
${P} .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 2;
}
${P} .bg-board .checker [data-pattern="checker0"] {
  fill: none;
  stroke: url(#${ID}-glow0);
  stroke-width: 8;
}
${P} .bg-board .checker [data-pattern="checker1"] {
  fill: none;
  stroke: url(#${ID}-glow1);
  stroke-width: 8;
}
${P} .bg-board .board-die-face > rect:first-child {
  stroke-width: 1;
}
${P} .bg-board [data-pattern="die0"] {
  fill: none;
  stroke: var(--board-die-border0);
  stroke-width: 5;
  stroke-opacity: 0.16;
}
${P} .bg-board [data-pattern="die1"] {
  fill: none;
  stroke: var(--board-die-border1);
  stroke-width: 5;
  stroke-opacity: 0.16;
}
${P} .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
${P} .bg-board [data-pattern="cube"] {
  fill: none;
  stroke: var(--board-cube-border);
  stroke-width: 5;
  stroke-opacity: 0.18;
}
`,
  defs: `
<pattern id="${ID}-scan" patternUnits="userSpaceOnUse" width="3" height="3">
  <rect width="3" height="1" style="fill:var(--board-caption)" fill-opacity="0.07"/>
</pattern>
<pattern id="${ID}-hatch" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
  <rect width="7" height="7" style="fill:var(--board-surface)"/>
  <line x1="0" y1="0" x2="0" y2="7" style="stroke:var(--board-point-b)" stroke-width="1.4"/>
</pattern>
<radialGradient id="${ID}-glow0" cx="0.5" cy="0.5" r="0.68">
  <stop offset="0" style="stop-color:var(--board-rim0)" stop-opacity="0"/>
  <stop offset="0.72" style="stop-color:var(--board-rim0)" stop-opacity="0"/>
  <stop offset="0.745" style="stop-color:var(--board-rim0)" stop-opacity="0.3"/>
  <stop offset="0.82" style="stop-color:var(--board-rim0)" stop-opacity="0"/>
  <stop offset="1" style="stop-color:var(--board-rim0)" stop-opacity="0"/>
</radialGradient>
<radialGradient id="${ID}-glow1" cx="0.5" cy="0.5" r="0.68">
  <stop offset="0" style="stop-color:var(--board-rim1)" stop-opacity="0"/>
  <stop offset="0.72" style="stop-color:var(--board-rim1)" stop-opacity="0"/>
  <stop offset="0.745" style="stop-color:var(--board-rim1)" stop-opacity="0.3"/>
  <stop offset="0.82" style="stop-color:var(--board-rim1)" stop-opacity="0"/>
  <stop offset="1" style="stop-color:var(--board-rim1)" stop-opacity="0"/>
</radialGradient>
`,
  shader: {
    // CRT phosphor field: barrel-distorted glass with a darkened tube edge,
    // straight 3px scanlines, a 3% band rolling down every 12 s, frozen-cell
    // grain that cross-fades between seeds twice a second, and a beam glow
    // under the pointer. All light is accent added to the page colour.
    fragment: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; // page glass
uniform vec3  u_c2; // accent phosphor
uniform vec3  u_c3; // ink (beam)
uniform vec3  u_c4; // surface (edge floor)
uniform float u_dark;

float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float grain(vec2 cell, float seed) {
  return vnoise(cell + seed * 7.0) * 0.65 + vnoise(cell * 2.0 + seed * 11.0) * 0.35;
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 c = uv * 2.0 - 1.0;

  // Barrel distortion of the glass; the tube edge darkens beyond it.
  vec2 cb = c * (1.0 + 0.08 * dot(c, c));
  vec2 uvb = cb * 0.5 + 0.5;
  float edge = sdRoundBox(cb, vec2(1.0), 0.14);
  float glass = 1.0 - 0.75 * smoothstep(-0.03, 0.015, edge);
  float vign = 1.0 - 0.28 * dot(c, c);

  // Straight scanlines: one dark row every three canvas pixels (the period
  // survives the layer's 1.5x DPR cap), 10% depth.
  float sl = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.0943951);
  float scan = 1.0 - 0.10 * sl;

  // One brightness band rolls down the screen every 12 s at 3% peak.
  float bandY = 1.25 - fract(u_time / 12.0) * 1.6;
  float band = smoothstep(0.16, 0.0, abs(uvb.y - bandY)) * 0.03;

  // Phosphor grain in 2 px cells. Seeds advance twice a second and the two
  // neighbouring fields cross-fade, so no frame ever jumps; seeds wrap at 64
  // (consecutive pairs stay continuous) to keep the hash in precise range.
  vec2 cell = floor(gl_FragCoord.xy / 2.0);
  float fr = u_time * 0.5;
  float s0 = mod(floor(fr), 64.0);
  float s1 = mod(floor(fr) + 1.0, 64.0);
  float g = mix(grain(cell, s0), grain(cell, s1), smoothstep(0.0, 1.0, fract(fr))) - 0.5;

  // Slow afterglow drift across the tube.
  float drift = vnoise(uvb * 3.0 + vec2(u_time * 0.04, -u_time * 0.03));

  // Beam glow under the pointer (screen centre until it moves).
  vec2 ptr = (u_pointer.x + u_pointer.y) < 0.5 ? u_resolution * 0.5 : u_pointer;
  float beam = 1.0 - smoothstep(0.0, 0.22 * u_resolution.y, distance(gl_FragCoord.xy, ptr));
  beam = beam * beam * 0.06;

  // The floor sits a little above the page so the lines and grain that
  // modulate it clear two 8-bit steps. At the screen centre it is level with
  // the panel surface (the vignette drops it below everywhere else); panels
  // read by their 1px stroke, as a wireframe should.
  vec3 col = mix(u_c4, u_c1, 0.6);
  col += u_c2 * (0.04 + 0.016 * drift + band);
  col += u_c2 * g * 0.04;
  col += u_c3 * beam;
  col *= scan * glass * vign;
  col = mix(col * 0.9, col, u_dark);
  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#030803", "#5CFF7D", "#8CFF96", "#071207"],
    speed: 1,
    fps: 60,
    stillAt: 0,
  },
  preview: "linear-gradient(135deg, #030803, #0B1C0C 55%, #1F6B31 85%, #5CFF7D)",
};
