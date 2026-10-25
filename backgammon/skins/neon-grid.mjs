// SPDX-License-Identifier: GPL-3.0-or-later
// Neon Grid: a synthwave horizon. A perspective floor of magenta lines slides
// toward a low striped sun under a cyan-to-magenta horizon glow; everything
// else is near-black so the emission is the whole identity. Chrome is flat
// and crisp (4px radii, 1px magenta borders at 40%, opaque panels), light
// lives only in the shader, the primary button and the focus ring; the board
// is a dark slab with a thin neon edge, a faint cyan grid on the surface,
// points that brighten toward the tip, and flat discs carried by 2px rims:
// white with magenta, black with cyan. Shape and rules:
// docs/redesign/backgammon-themes/skin-contract.md §2.
const P = 'html[data-skin="neon-grid"]';
const ID = "skin-neon-grid";
const GROTESK =
  'Inter, "Helvetica Neue", Helvetica, "Segoe UI", Roboto, Arial, sans-serif';
const MONO =
  'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
const BORDER = "color-mix(in srgb, var(--accent) 40%, transparent)";
const BORDER_HOT = "color-mix(in srgb, var(--accent) 70%, transparent)";
const GLOW = "0 0 18px color-mix(in srgb, var(--accent) 45%, transparent)";

const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; // page: zenith and floor
uniform vec3  u_c2; // surface: sky at the horizon
uniform vec3  u_c3; // accent: magenta lines, sun foot
uniform vec3  u_c4; // accent2: cyan horizon
uniform float u_dark;

const float HORIZON = 0.45;

float hash21(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// Antialiased line: d is the distance to the line, w one pixel, both in
// grid units. About 1.5 px wide at every depth.
float gridLine(float d, float w) {
  return 1.0 - smoothstep(0.3 * w, 1.1 * w, d);
}

// A horizontal cut through the sun: c is the centre, w the half width, both
// as a fraction of the disc's height.
float cut(float y, float c, float w, float aa) {
  return 1.0 - smoothstep(w - aa, w + aa, abs(y - c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float px = 1.0 / u_resolution.y;
  float t = u_time;
  // Horizon-centred coordinates, square units, 1 = the canvas height.
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - HORIZON);
  float sky = step(0.0, p.y);
  vec3 col;

  // Sky: surface at the horizon, page at the zenith.
  float a = clamp(p.y / (1.0 - HORIZON), 0.0, 1.0);
  col = mix(u_c2, u_c1, smoothstep(0.0, 0.75, a));

  // Stars: one per 16 px cell at most, 4% of cells, a 16 s twinkle of +-40%.
  vec2 cell = floor(gl_FragCoord.xy / 16.0);
  float h = hash21(cell);
  vec2 centre = (cell + vec2(hash21(cell + 1.7), hash21(cell + 9.1))) * 16.0;
  float star = smoothstep(1.7, 0.3, length(gl_FragCoord.xy - centre));
  star *= step(0.96, h) * (0.6 + 0.4 * sin(t * 0.4 + h * 40.0));
  star *= smoothstep(0.08, 0.35, a) * sky;
  col += mix(u_c4, vec3(1.0), 0.65) * star * 0.42;

  // Horizon glow: cyan above, magenta below, plus a wide magenta haze.
  float glow = exp(-abs(p.y) * 22.0);
  vec3 tint = mix(u_c3, u_c4, smoothstep(-0.03, 0.04, p.y));
  col += tint * glow * 0.38;
  col += u_c3 * 0.045 * exp(-abs(p.y) * 5.0);

  // Sun: a low disc with three cuts through its lower half, pale at the
  // crown, magenta at the foot, drawn only in the sky. Sized to the width
  // on tall screens so a phone keeps a sun, not a wall.
  float r = 0.145 * min(1.0, aspect * 1.25);
  vec2 sc = vec2(0.0, r + 0.045);
  float sd = length(p - sc) - r;
  float disc = (1.0 - smoothstep(-px, px, sd)) * sky;
  float yrel = clamp((p.y - sc.y + r) / (2.0 * r), 0.0, 1.0);
  float aa = px / (2.0 * r);
  float cuts = cut(yrel, 0.11, 0.034, aa) + cut(yrel, 0.23, 0.028, aa) + cut(yrel, 0.36, 0.02, aa);
  disc *= 1.0 - clamp(cuts, 0.0, 1.0);
  vec3 sun = mix(u_c3, vec3(1.0, 0.76, 0.42), smoothstep(0.08, 0.92, yrel)) * 0.52;
  col = mix(col, sun, disc);
  col += u_c3 * 0.10 * exp(-max(sd, 0.0) * 14.0);

  // Floor: a plane under the camera, lines every unit in x and z, sliding
  // toward the viewer at 0.3 units a second. Near the horizon the lines
  // crowd below a pixel, so they fade out before they can shimmer.
  float d = max(-p.y, 0.002);
  float zw = 0.32 / d;
  float X = p.x * zw * 3.0;
  float Z = zw * 1.6 + t * 0.3;
  float wx = aspect * zw * 3.0 / u_resolution.x;
  float wz = 0.512 / (d * d) / u_resolution.y;
  float lx = gridLine(0.5 - abs(fract(X) - 0.5), wx);
  float lz = gridLine(0.5 - abs(fract(Z) - 0.5), wz);
  float grid = clamp(lx + lz, 0.0, 1.0);
  float fade = exp(-zw * 0.55) * smoothstep(0.0, 0.05, d);

  // Pointer: the lines brighten a little within ~250 px of it.
  vec2 pp = gl_FragCoord.xy - u_pointer;
  float pd = length(pp) / 250.0;
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float boost = live * exp(-pd * pd);

  vec3 floorCol = u_c1 * 0.85;
  floorCol += u_c3 * 0.05 * exp(-d * 10.0);
  floorCol += u_c3 * 0.07 * exp(-abs(p.x) * 7.0) * exp(-d * 7.0); // the sun's reflection
  floorCol += u_c3 * grid * fade * (0.6 + 0.5 * boost);
  floorCol += u_c4 * 0.03 * boost;
  col = mix(floorCol, col, sky);

  // Vignette keeps the corners under the panels quiet.
  float v = length((uv - 0.5) * vec2(aspect, 1.0));
  col *= 1.0 - 0.3 * smoothstep(0.55, 1.05, v);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: "neon-grid",
  name: "Neon Grid",
  description: "Magenta grid, cyan horizon, a low sun on near-black.",
  scheme: "dark",
  tokens: {
    page: "#070312",
    surface: "#110A24",
    surface2: "#1A1033",
    surface3: "#241745",
    glass: "rgba(17,10,36,.96)",
    line: "rgba(255,63,164,.2)",
    lineStrong: "rgba(255,63,164,.4)",
    lineOpaque: "#701F57",
    controlBorder: "rgba(255,63,164,.65)",
    ink: "#F4ECFF",
    muted: "#B39BD6",
    soft: "#7E6A9C",
    accent: "#FF3FA4",
    accent2: "#2EE6FF",
    accentSoft: "rgba(255,63,164,.16)",
    onAccent: "#1A0410",
    good: "#4DF5A8",
    bad: "#FF6B8A",
    warn: "#FFD166",
    info: "#2EE6FF",
    goodSoft: "rgba(77,245,168,.16)",
    badSoft: "rgba(255,107,138,.16)",
    warnSoft: "rgba(255,209,102,.16)",
    infoSoft: "rgba(46,230,255,.16)",
    radiusSm: "4px",
    radiusMd: "4px",
    radiusLg: "4px",
    radiusPill: "4px",
    shadowTile: "none",
    shadowRaised: "0 24px 60px -24px rgba(0,0,0,.9)",
    shadowSheet: "0 -12px 40px -20px rgba(0,0,0,.9)",
    fontSans: GROTESK,
    fontMono: MONO,
  },
  board: {
    frame: "#140B2A",
    border: "#3A1F66",
    surface: "#0A0518",
    bar: "#040210",
    tray: "#060314",
    pointA: "#8E2A6B",
    pointB: "#1D6E7A",
    numbers: "#B39BD6",
    caption: "#B39BD6",
    checker0: "#F7F2FF",
    rim0: "#FF3FA4",
    detail0: "#E6A9D0",
    count0: "#1A0410",
    checker1: "#0D0718",
    rim1: "#2EE6FF",
    detail1: "#1B6F80",
    count1: "#F4ECFF",
    die0: "#F7F2FF",
    pips0: "#1A0410",
    dieBorder0: "#FF3FA4",
    die1: "#0D0718",
    pips1: "#F4ECFF",
    dieBorder1: "#2EE6FF",
    cube: "#2EE6FF",
    cubeText: "#061018",
    cubeBorder: "#BDF6FF",
    source: "#FFE45C",
    selection: "#FFE45C",
    destination: "#FFE45C",
    destinationText: "#1A1400",
    undo: "#FFB347",
    undoText: "#1A0C00",
    hover: "#7DF0FF",
    focus: "#FFE45C",
  },
  patterns: {},
  css: `
/* Type: a bold grotesk for headings, mono lining numerals for every counter;
   focus is the one place light is allowed on chrome besides the primary. */
${P} {
  --focus-ring: 2px solid var(--accent-2);
  --focus-halo: 0 0 14px color-mix(in srgb, var(--accent-2) 55%, transparent);
  font-variant-numeric: tabular-nums lining-nums;
}
${P} .tool-head h1,
${P} .panel-head h2,
${P} .panel-head h3,
${P} .panel-title,
${P} .dialog-head h2,
${P} .docs-section h2,
${P} .docs-section h3,
${P} .group-head h2,
${P} .tile h3 {
  font-weight: 700;
  letter-spacing: -0.02em;
}
${P} .hero h1 {
  font-weight: 800;
  letter-spacing: -0.035em;
  background: linear-gradient(175deg, var(--ink) 30%, color-mix(in oklab, var(--accent) 70%, white) 120%);
  -webkit-background-clip: text;
  background-clip: text;
}
${P} .player-stats,
${P} .group-head span,
${P} .draft-progress-moves,
${P} .field-value,
${P} .field-row output {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums lining-nums;
}

/* Chrome: crisp 4px corners, 1px magenta borders at 40%, opaque panels,
   no gradients and no shadows; the shader is the only depth. */
${P} .topbar {
  border-bottom: 1px solid var(--line);
}
${P} .tool-nav a,
${P} .crumbs a {
  border-radius: 4px;
}
${P} .tool-nav a[aria-current="page"] {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px ${BORDER};
}
${P} .panel,
${P} .inspector,
${P} .tile,
${P} .docs-card,
${P} .docs-callout {
  background: var(--surface);
  border: 1px solid ${BORDER};
  border-radius: 4px;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
${P} .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
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
  translate: none;
  border-color: var(--accent);
  box-shadow: none;
}
${P} .dialog {
  background: var(--surface);
  border: 1px solid ${BORDER};
  border-radius: 4px;
  box-shadow: var(--shadow-raised);
}
${P} .dialog-foot {
  background: var(--surface);
}
${P} .toast {
  background: var(--surface-2);
  border: 1px solid ${BORDER};
  border-left: 3px solid var(--accent);
  border-radius: 4px;
  box-shadow: none;
}
${P} .toast--alert {
  border-left-color: var(--bad);
}
${P} .toast--good {
  border-left-color: var(--good);
}

/* Buttons: flat fills, readable labels in every state; the primary alone
   glows. Ghost keeps a visible border so it never reads as a dead block. */
${P} .btn {
  border-radius: 4px;
  background: var(--surface-2);
  border-color: ${BORDER};
  color: var(--ink);
  box-shadow: none;
}
${P} .btn:hover {
  background: var(--surface-3);
  border-color: ${BORDER_HOT};
  color: var(--ink);
}
${P} .btn:active {
  background: var(--surface-3);
  border-color: var(--accent);
}
${P} .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: ${GLOW};
}
${P} .btn--primary:hover,
${P} .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, white);
  border-color: color-mix(in oklab, var(--accent) 86%, white);
  color: var(--on-accent);
  box-shadow: ${GLOW};
}
${P} .btn--ghost {
  background: transparent;
  border-color: ${BORDER};
  color: var(--ink);
}
${P} .btn--ghost:hover,
${P} .btn--ghost:active {
  background: var(--accent-soft);
  border-color: ${BORDER_HOT};
  color: var(--ink);
}
${P} .btn--danger {
  background: transparent;
  border-color: color-mix(in srgb, var(--bad) 55%, transparent);
  color: var(--bad);
}
${P} .btn--danger:hover,
${P} .btn--danger:active {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
${P} .btn[aria-pressed="true"],
${P} .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: ${BORDER_HOT};
  color: var(--ink);
}
${P} .segmented {
  padding: 2px;
  background: var(--page);
  border-color: ${BORDER};
  border-radius: 4px;
}
${P} .segmented > label,
${P} .segmented > button {
  border-radius: 2px;
}
${P} .segmented > label:has(input:checked),
${P} .segmented > button[aria-pressed="true"],
${P} .segmented > button[aria-checked="true"],
${P} .segmented > [aria-selected="true"] {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px ${BORDER_HOT};
}
${P} .tabs {
  border-bottom-color: var(--line);
}
${P} .tabs > [role="tab"] {
  border-radius: 4px 4px 0 0;
}
${P} .tabs > [role="tab"][aria-selected="true"] {
  box-shadow: inset 0 -2px 0 var(--accent-2);
}
${P} .tabs.has-indicator > [role="tab"][aria-selected="true"] {
  box-shadow: none;
}
${P} .tabs.has-indicator::after {
  border-radius: 0;
  background: var(--accent-2);
}
${P} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${P} .field select,
${P} .field textarea {
  background: var(--page);
  border-color: ${BORDER};
  border-radius: 4px;
}
${P} .field input:focus-visible,
${P} .field select:focus-visible,
${P} .field textarea:focus-visible {
  border-color: var(--accent-2);
}

/* Text that would sit on the shader gets an opaque slab: player strips,
   the action area and draft line, the tab row, hub group heads and footer,
   the docs reading column and its flow captions. */
${P} .player-strip {
  padding: 4px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
}
${P} .player-strip.active {
  background: var(--surface);
  border-color: ${BORDER};
  box-shadow: inset 2px 0 0 var(--accent-2);
}
${P} .action-area {
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
}
${P} .draft-line,
${P} .docs-flow-caption {
  padding: 2px 8px;
  background: var(--surface);
  border-radius: 4px;
}
${P} .tabs,
${P} .group-head {
  padding-inline: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
}
${P} .docs-body {
  padding: 0 20px 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
}
${P} .foot {
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 4px;
}
${P} .docs-section {
  border-top-color: var(--line);
}
${P} .docs-toc a {
  border-radius: 4px;
  border-color: ${BORDER};
}

/* Board: a dark slab with a thin neon edge, a faint cyan grid on the
   surface, points that brighten toward the tip, flat discs and dice with
   neon rims. The frame overlay carries the edge so the frame's own flat fill
   stays untouched. */
${P} .bg-board text {
  font-family: var(--font-mono);
  font-weight: 700;
}
${P} .bg-board [data-pattern="frame"] {
  fill: url(#${ID}-frame);
  stroke: url(#${ID}-edge);
  stroke-width: 2;
}
${P} .bg-board [data-pattern="surface"] {
  fill: url(#${ID}-grid);
  stroke: var(--board-border);
  stroke-width: 1;
}
${P} .bg-board [data-pattern="bar"] {
  fill: url(#${ID}-bar);
}
${P} .bg-board [data-pattern="tray"] {
  fill: url(#${ID}-tray);
}
${P} .bg-board .point-shape {
  stroke: rgba(0, 0, 0, 0.35);
  stroke-width: 1;
  stroke-linejoin: round;
}
/* Top points have their base at y=28 and bottom points at y=632; the path
   data tells them apart so one gradient can run base to tip on both. */
${P} .bg-board [data-pattern="pointA"][d*=" 28 L"],
${P} .bg-board [data-pattern="pointB"][d*=" 28 L"] {
  fill: url(#${ID}-tip-down);
}
${P} .bg-board [data-pattern="pointA"][d*=" 632 L"],
${P} .bg-board [data-pattern="pointB"][d*=" 632 L"] {
  fill: url(#${ID}-tip-up);
}
/* Flat faces; the 3-unit rim is about 2.7 px on a desktop board and 1.3 px
   on a phone, enough for the black disc to read on the near-black bar. */
${P} .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
${P} .bg-board .board-die-face > rect:first-child {
  stroke-width: 2.5;
}
${P} .bg-board .board-cube .cube-face {
  stroke-width: 1.5;
}
`,
  defs: `
<linearGradient id="${ID}-edge" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" style="stop-color:var(--board-rim0)"/>
  <stop offset="1" style="stop-color:var(--board-rim1)"/>
</linearGradient>
<linearGradient id="${ID}-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".04"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".22"/>
</linearGradient>
<pattern id="${ID}-grid" patternUnits="userSpaceOnUse" width="30" height="30" x="18" y="28">
  <path d="M30 .5H0M.5 0V30" fill="none" style="stroke:var(--board-rim1)" stroke-opacity=".09" stroke-width="1"/>
</pattern>
<linearGradient id="${ID}-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".45"/>
  <stop offset=".25" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".485" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".485" style="stop-color:var(--board-rim0)" stop-opacity=".55"/>
  <stop offset=".515" style="stop-color:var(--board-rim0)" stop-opacity=".55"/>
  <stop offset=".515" stop-color="#000000" stop-opacity="0"/>
  <stop offset=".75" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".45"/>
</linearGradient>
<linearGradient id="${ID}-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".5"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".03"/>
</linearGradient>
<linearGradient id="${ID}-tip-down" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".3"/>
  <stop offset=".45" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".26"/>
</linearGradient>
<linearGradient id="${ID}-tip-up" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".3"/>
  <stop offset=".45" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".26"/>
</linearGradient>
`,
  shader: {
    fragment: FRAGMENT,
    colors: ["#070312", "#110A24", "#FF3FA4", "#2EE6FF"],
    speed: 1,
    fps: 60,
    stillAt: 3,
  },
  preview: "linear-gradient(180deg, #070312 0%, #110A24 42%, #2EE6FF 46%, #FF3FA4 50%, #0A0518 56%, #3A1040 100%)",
};
