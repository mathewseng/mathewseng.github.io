// SPDX-License-Identifier: GPL-3.0-or-later
// Prism: white light split through glass. A near-black room, a few diagonal
// spectral bands sweeping slowly across it, dark glass panels with a hairline
// of white at their top edge, and a single white primary. The board is matte
// black glass with a spectral hairline around its rim; the pieces are pure
// white and pure black, each carrying a faint spectral rim.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
const PAGE = "#050507";
const SURFACE = "#121216";
const INK = "#F7F7FA";
const VIOLET = "#8A5CFF";
const AMBER = "#FFC46B";

export default {
  id: "prism",
  name: "Prism",
  description: "Black glass with spectral light bands.",
  scheme: "dark",
  tokens: {
    page: PAGE,
    surface: SURFACE,
    surface2: "#1A1A20",
    surface3: "#23232B",
    glass: "rgba(18,18,22,.78)",
    line: "rgba(255,255,255,.08)",
    lineStrong: "rgba(255,255,255,.18)",
    lineOpaque: "#27272F",
    controlBorder: "rgba(255,255,255,.28)",
    ink: INK,
    muted: "#A9A9B4",
    soft: "#75757F",
    accent: "#FFFFFF",
    accent2: VIOLET,
    accentSoft: "rgba(255,255,255,.12)",
    onAccent: "#101014",
    good: "#7FE3A4",
    bad: "#FF7D8C",
    warn: AMBER,
    info: "#7DB9FF",
    goodSoft: "rgba(127,227,164,.16)",
    badSoft: "rgba(255,125,140,.16)",
    warnSoft: "rgba(255,196,107,.16)",
    infoSoft: "rgba(125,185,255,.16)",
    radiusSm: "10px",
    radiusMd: "10px",
    radiusLg: "14px",
    radiusPill: "999px",
    // Glass plates: a white hairline along the top edge, a deep soft shadow
    // so the plate lifts off the bands behind it.
    shadowTile: "inset 0 1px 0 rgba(255,255,255,.08), 0 20px 50px -30px rgba(0,0,0,.9)",
    shadowRaised: "inset 0 1px 0 rgba(255,255,255,.1), 0 32px 80px -32px rgba(0,0,0,1)",
    shadowSheet: "inset 0 1px 0 rgba(255,255,255,.08)",
    fontSans: 'Inter, "SF Pro Text", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#17171C",
    border: "#2E2E37",
    surface: "#0D0D11",
    bar: "#000000",
    tray: "#07070A",
    pointA: "#E4E4EA",
    pointB: "#4A4A55",
    numbers: "#A9A9B4",
    caption: "#A9A9B4",
    checker0: "#FFFFFF",
    rim0: "#2A2A33",
    detail0: "#D4D4DC",
    count0: "#101014",
    checker1: "#0B0B0F",
    rim1: "#FFFFFF",
    detail1: "#3A3A45",
    count1: INK,
    die0: "#FFFFFF",
    pips0: "#101014",
    dieBorder0: "#B9B9C4",
    die1: "#FFFFFF",
    pips1: "#101014",
    dieBorder1: VIOLET,
    cube: "#FFFFFF",
    cubeText: "#101014",
    cubeBorder: "#B9B9C4",
    source: VIOLET,
    selection: "#C9B8FF",
    destination: VIOLET,
    destinationText: PAGE,
    undo: AMBER,
    undoText: "#1A1206",
    hover: "#B79BFF",
    focus: AMBER,
  },
  patterns: {},
  css: `
/* Type: a grotesk at 500/700, tracking off everywhere. */
html[data-skin="prism"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
html[data-skin="prism"] .tool-head h1,
html[data-skin="prism"] .hero h1,
html[data-skin="prism"] .panel-head h2,
html[data-skin="prism"] .panel-head h3,
html[data-skin="prism"] .panel-title,
html[data-skin="prism"] .dialog-head h2 {
  font-weight: 700;
  letter-spacing: 0;
}
html[data-skin="prism"] .tool-nav a,
html[data-skin="prism"] .crumbs a,
html[data-skin="prism"] .tabs > [role="tab"],
html[data-skin="prism"] .segmented > label,
html[data-skin="prism"] .segmented > button,
html[data-skin="prism"] .btn {
  font-weight: 500;
  letter-spacing: 0;
}
html[data-skin="prism"] .tool-nav a {
  border-radius: var(--r-md);
}
html[data-skin="prism"] .tool-nav a[aria-current="page"] {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--line);
}
html[data-skin="prism"] .mark {
  border-radius: var(--r-md);
  border-color: transparent;
  background:
    linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
    linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,0)) border-box;
}

/* Glass plates: the page shader shows through at 78%, blurred 16px, inside a
   1px border that fades from white 20% at the top-left to nothing. */
html[data-skin="prism"] .panel,
html[data-skin="prism"] .inspector,
html[data-skin="prism"] .tile,
html[data-skin="prism"] .docs-toc--sticky,
html[data-skin="prism"] .hub-board-frame {
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background:
    linear-gradient(var(--glass), var(--glass)) padding-box,
    linear-gradient(160deg, rgba(255,255,255,.2), rgba(255,255,255,.04) 45%, rgba(255,255,255,0)) border-box;
  box-shadow: var(--shadow-tile);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
html[data-skin="prism"] .panel--quiet {
  background:
    linear-gradient(var(--glass), var(--glass)) padding-box,
    linear-gradient(160deg, rgba(255,255,255,.1), rgba(255,255,255,0)) border-box;
}
html[data-skin="prism"] .tile:hover,
html[data-skin="prism"] .tile:focus-visible {
  translate: none;
  box-shadow: var(--shadow-raised);
}
html[data-skin="prism"] .panel-head,
html[data-skin="prism"] .panel-foot {
  border-color: var(--line);
}
html[data-skin="prism"] .stage,
html[data-skin="prism"] .board-slot,
html[data-skin="prism"] .board-frame {
  border-radius: var(--r-lg);
}
html[data-skin="prism"] .dialog {
  border: 1px solid transparent;
  border-radius: var(--r-lg);
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,0)) border-box;
  box-shadow: var(--shadow-raised);
}
html[data-skin="prism"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="prism"] .toast {
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background:
    linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
    linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,0)) border-box;
  box-shadow: var(--shadow-raised);
}

/* Controls: one white primary with black text, dark glass secondaries, ghosts
   outlined in the line colour so their label always sits on the page. */
html[data-skin="prism"] .btn {
  border-radius: var(--r-md);
  border-color: var(--line-strong);
  background: var(--surface-2);
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}
html[data-skin="prism"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
}
html[data-skin="prism"] .btn:active {
  background: color-mix(in oklab, var(--surface-3) 85%, var(--ink));
}
html[data-skin="prism"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 10px 30px -14px rgba(255,255,255,.45);
}
html[data-skin="prism"] .btn--primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 12px 34px -12px rgba(255,255,255,.6);
}
html[data-skin="prism"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, black);
  border-color: color-mix(in oklab, var(--accent) 86%, black);
  color: var(--on-accent);
}
html[data-skin="prism"] .btn--ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="prism"] .btn--ghost:hover {
  background: var(--accent-soft);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="prism"] .btn--ghost:active {
  background: color-mix(in oklab, var(--surface-3) 85%, var(--ink));
}
html[data-skin="prism"] .btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--control-border);
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.1);
}
html[data-skin="prism"] .btn--danger {
  background: var(--bad-soft);
  border-color: color-mix(in oklab, var(--bad) 50%, transparent);
  color: var(--bad);
  box-shadow: none;
}
html[data-skin="prism"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="prism"] .segmented {
  border-radius: var(--r-md);
  border-color: var(--line);
  background: var(--surface);
  padding: 3px;
}
html[data-skin="prism"] .segmented > label,
html[data-skin="prism"] .segmented > button {
  border-radius: 7px;
}
html[data-skin="prism"] .segmented > label:has(input:checked),
html[data-skin="prism"] .segmented > button[aria-pressed="true"],
html[data-skin="prism"] .segmented > button[aria-checked="true"],
html[data-skin="prism"] .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.1), inset 0 0 0 1px var(--line-strong);
}
html[data-skin="prism"] .tabs {
  border-bottom-color: var(--line);
}
html[data-skin="prism"] .tabs > [role="tab"][aria-selected="true"] {
  box-shadow: inset 0 -2px 0 var(--accent);
}
html[data-skin="prism"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="prism"] .field select,
html[data-skin="prism"] .field textarea {
  background: var(--page);
  border-color: var(--line-strong);
  border-radius: var(--r-md);
}
html[data-skin="prism"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):hover,
html[data-skin="prism"] .field select:hover,
html[data-skin="prism"] .field textarea:hover {
  border-color: var(--control-border);
}

/* Player strips and the action area sit directly on the shader; the strips
   become small glass pills, the active one bordered in white. */
html[data-skin="prism"] .player-strip {
  border-radius: var(--r-md);
  padding-inline: 12px;
  background: var(--glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: inset 0 0 0 1px var(--line);
}
html[data-skin="prism"] .player-strip.active {
  background: var(--glass);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--control-border), inset 0 1px 0 rgba(255,255,255,.1);
}
html[data-skin="prism"] .docs-section {
  border-top-color: var(--line);
}
html[data-skin="prism"] .docs-toc a {
  border-radius: var(--r-md);
}

/* Board: matte black glass. The frame overlay carries a spectral hairline
   around the rim (the stroke is centred on the SVG edge, so one unit shows);
   the surface lifts faintly toward the top-left; the bar is black with a
   spectral thread down its centre; points stay flat; the pieces carry a
   faint spectral rim gradient as their edge stroke. */
html[data-skin="prism"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-prism-frame);
  stroke: url(#skin-prism-spectrum);
  stroke-width: 3;
  stroke-opacity: .85;
}
html[data-skin="prism"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-prism-surface);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="prism"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-prism-bar);
}
html[data-skin="prism"] .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="prism"] .bg-board .point-shape {
  stroke: none;
}
html[data-skin="prism"] .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
html[data-skin="prism"] .bg-board .checker[data-player="0"] > circle:first-child {
  stroke: url(#skin-prism-rim0);
}
html[data-skin="prism"] .bg-board .checker[data-player="1"] > circle:first-child {
  stroke: url(#skin-prism-rim1);
}
/* The overlay clones the face radius and would hide the inner half of the
   stroke; pull it in to the stroke's inner edge so the whole rim shows. */
html[data-skin="prism"] .bg-board .checker [data-pattern="checker0"],
html[data-skin="prism"] .bg-board .checker [data-pattern="checker1"] {
  r: 20.5px;
}
html[data-skin="prism"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-prism-white);
}
html[data-skin="prism"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-prism-black);
}
html[data-skin="prism"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="prism"] .bg-board [data-pattern="die0"],
html[data-skin="prism"] .bg-board [data-pattern="die1"],
html[data-skin="prism"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-prism-face);
}
html[data-skin="prism"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
html[data-skin="prism"] .bg-board text {
  font-family: var(--font-sans);
  font-weight: 500;
}
html[data-skin="prism"] .bg-board .checker text,
html[data-skin="prism"] .bg-board .board-cube text {
  font-weight: 700;
}
`,
  defs: `
<linearGradient id="skin-prism-spectrum" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FF6B8A"/>
  <stop offset=".2" stop-color="#FFC46B"/>
  <stop offset=".4" stop-color="#7FE3A4"/>
  <stop offset=".6" stop-color="#7DB9FF"/>
  <stop offset=".8" stop-color="#8A5CFF"/>
  <stop offset="1" stop-color="#FF6B8A"/>
</linearGradient>
<linearGradient id="skin-prism-frame" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".07"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".18"/>
</linearGradient>
<radialGradient id="skin-prism-surface" cx=".2" cy=".08" r="1.1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".06"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity=".01"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".2"/>
</radialGradient>
<linearGradient id="skin-prism-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset=".47" stop-color="#8A5CFF" stop-opacity="0"/>
  <stop offset=".49" stop-color="#8A5CFF" stop-opacity=".55"/>
  <stop offset=".51" stop-color="#FFC46B" stop-opacity=".55"/>
  <stop offset=".53" stop-color="#FFC46B" stop-opacity="0"/>
</linearGradient>
<linearGradient id="skin-prism-rim0" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#4A3A6E"/>
  <stop offset=".5" stop-color="#2A2A33"/>
  <stop offset="1" stop-color="#5A4A2E"/>
</linearGradient>
<linearGradient id="skin-prism-rim1" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#E4D8FF"/>
  <stop offset=".5" stop-color="#FFFFFF"/>
  <stop offset="1" stop-color="#FFE6C2"/>
</linearGradient>
<radialGradient id="skin-prism-white" cx=".38" cy=".3" r=".78">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset=".6" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".1"/>
</radialGradient>
<radialGradient id="skin-prism-black" cx=".38" cy=".3" r=".78">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".12"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".3"/>
</radialGradient>
<linearGradient id="skin-prism-face" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".09"/>
</linearGradient>
`,
  shader: {
    // White light through a prism: four diagonal bands, each a Gaussian in
    // the distance along the diagonal whose centre drifts on its own slow
    // phase. Inside a band the hue disperses across its width (red on one
    // edge, violet on the other) from a cosine spectrum palette; a soft noise
    // field breaks the edges; the pointer bends the bands as a lens would.
    // The sum is added over the page colour and capped at 22% so ink and
    // muted text stay legible wherever they sit directly on the shader.
    fragment: `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; // page
uniform vec3  u_c2; // violet haze
uniform vec3  u_c3; // white light
uniform vec3  u_c4; // amber warmth
uniform float u_dark;

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

// Cosine spectrum, periodic: 0 red, 1/3 green, 2/3 blue, back to red.
vec3 spectrum(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;

  // Centred, aspect-correct plane, normalised so the diagonal runs -1..1 and
  // the bands cover a phone and a desktop window alike.
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) / (0.5 * length(vec2(aspect, 1.0)));

  // Lens: the pointer bends the bands slightly toward itself (idle at 0,0).
  float live = step(0.5, u_pointer.x + u_pointer.y);
  vec2 pv = (gl_FragCoord.xy - u_pointer) / min(u_resolution.x, u_resolution.y);
  float lens = live * exp(-dot(pv, pv) * 2.2);

  // Soft breakup: two slow noise fields feather every edge and grain the light.
  float n = vnoise(p * 2.4 + vec2(t * 0.025, -t * 0.017));
  float n2 = vnoise(p * 1.1 - vec2(t * 0.012, t * 0.02) + 7.3);

  vec3 light = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    // Each band leaves the prism at its own angle: a fan around the diagonal.
    float ang = 0.76 + (fi - 1.5) * 0.11 + 0.04 * sin(t * 0.013 + fi);
    vec2 dir = vec2(cos(ang), sin(ang));
    float d = dot(p, dir) + 0.05 * lens * dot(pv, dir) + (n - 0.5) * 0.07;
    float along = dot(p, vec2(-dir.y, dir.x));
    // Centre: two incommensurate sines so the drift never visibly repeats.
    float c = 0.45 * sin(t * 0.041 + fi * 1.7) + 0.3 * sin(t * 0.017 + fi * 2.9 + 1.3);
    float w = 0.048 + 0.015 * sin(t * 0.023 + fi * 2.1);
    float x = (d - c) / w;
    float band = exp(-x * x) + 0.06 * exp(-x * x * 0.1);
    // Dispersion across the band, and the hue also runs along its length so
    // one band passes from violet through amber as it crosses the window.
    float hue = fi * 0.29 + 0.2 * x + 0.38 * along + t * 0.004;
    // One hero band, the rest fainter: calm, not a rainbow wallpaper.
    float gain = (0.3 + 0.06 * sin(t * 0.029 + fi * 1.1)) * pow(0.62, fi);
    vec3 sc = spectrum(hue);
    // Soften toward white light: the bands are light, not paint.
    light += mix(sc, vec3(dot(sc, vec3(0.33))), 0.2) * band * gain;
  }

  // Grain, then a touch of amber warmth, then the white-light scale.
  light *= 0.8 + 0.4 * n2;
  light = mix(light, light * u_c4 * 1.2, 0.1);
  light *= u_c3 * mix(0.85, 1.0, u_dark);
  // A whisper of violet haze over the page.
  vec3 col = u_c1 + u_c2 * 0.02 * (0.4 + 0.6 * n2) + light;

  // Legibility floor: cap the (gamma-2) relative luminance at 4.5% so ink
  // keeps 10:1 and muted text 4.7:1 wherever they sit on the shader. Scaling
  // the whole pixel keeps the hue; nothing clips to grey.
  float y = dot(col * col, vec3(0.2126, 0.7152, 0.0722));
  col *= y > 0.045 ? sqrt(0.045 / y) : 1.0;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: [PAGE, VIOLET, "#FFFFFF", AMBER],
    speed: 1,
    fps: 60,
    stillAt: 6,
  },
  preview: "linear-gradient(135deg, #050507 0%, #050507 28%, #3A1E5E 42%, #1E3A5E 50%, #1E4A34 56%, #5E4A1E 62%, #050507 78%)",
};
