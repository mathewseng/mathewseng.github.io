// SPDX-License-Identifier: GPL-3.0-or-later
// Nacre Shell: the light skin. Mother-of-pearl page with thin-film colour
// barely present in the surface, a deep rose beside a pale seafoam on the
// board, a pearl disc with a slate edge against an abalone-dark opponent,
// Didone headings. Shape and rules: skin-contract.md §2.
const SERIF = '"Didot", "Bodoni 72", "Bodoni MT", "Playfair Display", Georgia, serif';

const FRAGMENT = `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1; /* page pearl */
uniform vec3  u_c2; /* seafoam */
uniform vec3  u_c3; /* rose */
uniform vec3  u_c4; /* slate ink (unused tint) */
uniform float u_dark;

/* value noise and a 3-octave fbm, inlined */
float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
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
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p = p * 2.0 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return v;
}
/* cosine rainbow: the interference colour for an optical thickness t */
vec3 film(float t) {
  return 0.5 + 0.5 * cos(6.2832 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 frag = gl_FragCoord.xy / u_resolution;
  vec2 uv = gl_FragCoord.xy / u_resolution.y;

  /* large, slow height field: about 1.8 bands over the screen height */
  float h = fbm(uv * 1.8 + vec2(0.03, 0.018) * u_time);

  /* view angle from the pointer; an untouched pointer sits at screen centre */
  vec2 ptr = (u_pointer.x + u_pointer.y) > 0.0 ? u_pointer / u_resolution : vec2(0.5);
  float view = 0.6 * length(frag - ptr);
  float t = 2.0 + 3.0 * h + view;

  /* interference colour, nudged toward rose and seafoam, desaturated 70%,
     lifted toward white: shell, not oil slick */
  vec3 c = film(t);
  c = mix(c, mix(u_c3, u_c2, smoothstep(0.3, 0.7, h)), 0.22);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(lum), 0.7);
  c = mix(vec3(1.0), c, 0.75);

  /* the page stays pearl: 0.18 of the banding shows through, lifted so the
     mean sits on the page colour */
  vec3 col = mix(u_c1, c, 0.18) + 0.03;

  /* one broad, soft specular sweep, very slow and never resetting */
  float g = dot(frag, normalize(vec2(0.85, 0.53)));
  float band = 0.25 + 0.45 * (0.5 + 0.5 * sin(u_time * 0.05));
  float spec = smoothstep(band - 0.32, band, g) * (1.0 - smoothstep(band, band + 0.32, g));
  col += 0.06 * spec;

  gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
}
`;

const CSS = `
/* ---- type ---- */
html[data-skin="nacre-shell"] .tool-head h1,
html[data-skin="nacre-shell"] .hero h1,
html[data-skin="nacre-shell"] .panel-head h2,
html[data-skin="nacre-shell"] .panel-head h3,
html[data-skin="nacre-shell"] .panel-title,
html[data-skin="nacre-shell"] .dialog-head h2,
html[data-skin="nacre-shell"] .tile h3,
html[data-skin="nacre-shell"] .tile--featured h3 {
  font-family: ${SERIF};
  font-weight: 400;
  letter-spacing: 0.01em;
  text-transform: none;
  font-variant-numeric: lining-nums proportional-nums;
}
html[data-skin="nacre-shell"] .tool-head h1 {
  font-size: 1.75rem;
}
html[data-skin="nacre-shell"] .hero h1 {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: var(--ink);
  letter-spacing: 0;
  line-height: 1.02;
}
html[data-skin="nacre-shell"] .panel-head h2,
html[data-skin="nacre-shell"] .panel-head h3,
html[data-skin="nacre-shell"] .panel-title {
  font-size: 1.25rem;
}

/* ---- chrome ---- */
html[data-skin="nacre-shell"] .mark {
  background: var(--surface);
  border-color: var(--line-opaque);
  border-radius: 50%;
  font-weight: 600;
}
html[data-skin="nacre-shell"] .tool-nav a {
  border-radius: var(--r-pill);
  font-weight: 500;
}
html[data-skin="nacre-shell"] .tool-nav a[aria-current="page"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque), var(--shadow-tile);
}
html[data-skin="nacre-shell"] .panel,
html[data-skin="nacre-shell"] .inspector,
html[data-skin="nacre-shell"] .tile {
  background: var(--surface);
  border-color: var(--line-opaque);
  box-shadow: var(--shadow-tile);
}
html[data-skin="nacre-shell"] .tile::before {
  background: radial-gradient(460px circle at var(--mx) var(--my), color-mix(in srgb, var(--accent) 7%, transparent), transparent 45%);
}
html[data-skin="nacre-shell"] .player-strip {
  border-radius: var(--r-pill);
  padding: 4px 12px;
}
html[data-skin="nacre-shell"] .player-strip.active {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque), var(--shadow-tile);
}
html[data-skin="nacre-shell"] .btn {
  background: var(--surface);
  border-color: var(--line-opaque);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--surface) 60%, white), 0 1px 2px color-mix(in srgb, var(--ink) 6%, transparent);
  font-weight: 500;
}
html[data-skin="nacre-shell"] .btn:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="nacre-shell"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 22%, transparent);
}
html[data-skin="nacre-shell"] .btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 90%, white);
  border-color: color-mix(in srgb, var(--accent) 90%, white);
}
html[data-skin="nacre-shell"] .btn--ghost {
  background: transparent;
  border-color: var(--line-opaque);
  color: var(--ink);
  box-shadow: none;
}
html[data-skin="nacre-shell"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--control-border);
}
html[data-skin="nacre-shell"] .btn--danger {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
  box-shadow: none;
}
html[data-skin="nacre-shell"] .btn--danger:hover {
  background: color-mix(in srgb, var(--bad) 88%, black);
  border-color: color-mix(in srgb, var(--bad) 88%, black);
  color: var(--on-accent);
}
html[data-skin="nacre-shell"] .btn[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  box-shadow: none;
}
html[data-skin="nacre-shell"] .segmented {
  background: var(--surface-3);
  border-color: var(--line-opaque);
}
html[data-skin="nacre-shell"] .segmented > label:has(input:checked),
html[data-skin="nacre-shell"] .segmented > button[aria-pressed="true"],
html[data-skin="nacre-shell"] .segmented > button[aria-checked="true"],
html[data-skin="nacre-shell"] .segmented > [aria-selected="true"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque), 0 1px 2px color-mix(in srgb, var(--ink) 10%, transparent);
}
html[data-skin="nacre-shell"] .tabs > [role="tab"] {
  font-weight: 500;
}
html[data-skin="nacre-shell"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="nacre-shell"] .field select,
html[data-skin="nacre-shell"] .field textarea {
  background: var(--surface);
  border-color: var(--control-border);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--ink) 5%, transparent);
}
html[data-skin="nacre-shell"] .field > label,
html[data-skin="nacre-shell"] .field-label {
  font-weight: 500;
}
html[data-skin="nacre-shell"] .dialog {
  border-color: var(--line-opaque);
  background: var(--surface);
  box-shadow: var(--shadow-sheet);
}
html[data-skin="nacre-shell"] .dialog::backdrop {
  background: color-mix(in srgb, var(--ink) 28%, transparent);
}
html[data-skin="nacre-shell"] .toast {
  border-radius: var(--r-pill);
  border-color: var(--line-opaque);
  background: var(--surface-2);
  box-shadow: var(--shadow-raised);
  padding-left: 18px;
}
html[data-skin="nacre-shell"] .toast--alert {
  background: color-mix(in srgb, var(--bad) 10%, var(--surface-2));
}
html[data-skin="nacre-shell"] .toast--good {
  background: color-mix(in srgb, var(--good) 10%, var(--surface-2));
}
html[data-skin="nacre-shell"] .stage {
  min-width: 0;
}

/* ---- board ---- */
html[data-skin="nacre-shell"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-nacre-shell-frame);
  stroke: var(--board-surface);
  stroke-width: 1;
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-nacre-shell-surface);
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-nacre-shell-bar);
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-nacre-shell-bar);
  stroke: var(--board-surface);
  stroke-width: 1;
}
html[data-skin="nacre-shell"] .bg-board .point-shape {
  stroke: none;
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="pointA"] {
  fill: url(#skin-nacre-shell-point);
  stroke: color-mix(in srgb, var(--board-pointA) 78%, var(--board-count0));
  stroke-width: 1;
  stroke-linejoin: round;
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-nacre-shell-point);
  stroke: color-mix(in srgb, var(--board-pointB) 70%, var(--board-count0));
  stroke-width: 1;
  stroke-linejoin: round;
}
/* the pearl face is within 1.1:1 of the surface, so the slate rim carries
   the separation: 3 user units renders >= 1.3 px on a 390-wide phone board */
html[data-skin="nacre-shell"] .bg-board .checker > circle:first-child {
  stroke-width: 3;
}
html[data-skin="nacre-shell"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-nacre-shell-pearl);
}
html[data-skin="nacre-shell"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-nacre-shell-abalone);
}
html[data-skin="nacre-shell"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="die0"] {
  fill: url(#skin-nacre-shell-pearl);
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-nacre-shell-abalone);
}
html[data-skin="nacre-shell"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-nacre-shell-cube);
}
html[data-skin="nacre-shell"] .bg-board .board-cube text {
  font-family: ${SERIF};
  font-weight: 400;
}
html[data-skin="nacre-shell"] .bg-board text {
  font-variant-numeric: tabular-nums;
}
`;

const DEFS = `
<linearGradient id="skin-nacre-shell-frame" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
  <stop offset="0.5" stop-color="#E8DFE2" stop-opacity="0.75"/>
  <stop offset="1" stop-color="#D6E3E0" stop-opacity="0.75"/>
</linearGradient>
<linearGradient id="skin-nacre-shell-surface" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="0.5" stop-color="#F1E9EC" stop-opacity="0.5"/>
  <stop offset="1" stop-color="#E9F1EF" stop-opacity="0.5"/>
</linearGradient>
<linearGradient id="skin-nacre-shell-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.45"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#1F2A33" stop-opacity="0.08"/>
</linearGradient>
<linearGradient id="skin-nacre-shell-point" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
  <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#1F2A33" stop-opacity="0.1"/>
</linearGradient>
<radialGradient id="skin-nacre-shell-pearl" cx="0.36" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/>
  <stop offset="0.35" stop-color="#F3C4D3" stop-opacity="0.22"/>
  <stop offset="0.65" stop-color="#C4ECDF" stop-opacity="0.22"/>
  <stop offset="1" stop-color="#9DA6C7" stop-opacity="0.3"/>
</radialGradient>
<radialGradient id="skin-nacre-shell-abalone" cx="0.36" cy="0.3" r="0.85">
  <stop offset="0" stop-color="#8FD6CF" stop-opacity="0.55"/>
  <stop offset="0.4" stop-color="#5FB7B0" stop-opacity="0.12"/>
  <stop offset="0.8" stop-color="#1B2A33" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
</radialGradient>
<linearGradient id="skin-nacre-shell-cube" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
</linearGradient>
`;

export default {
  id: "nacre-shell",
  name: "Nacre Shell",
  description: "Mother-of-pearl light, rose and seafoam points, an abalone opponent.",
  scheme: "light",
  tokens: {
    page: "#F6F3F1",
    surface: "#FFFDFB",
    surface2: "#F0EBEA",
    surface3: "#E8E2E0",
    glass: "rgba(255,253,251,.78)",
    line: "rgba(31,42,51,.12)",
    lineStrong: "rgba(31,42,51,.22)",
    lineOpaque: "#D9D1CC",
    controlBorder: "#8A949C",
    ink: "#1F2A33",
    muted: "#5A6670",
    soft: "#76828B",
    accent: "#0F6E7A",
    accent2: "#5FB7B0",
    accentSoft: "rgba(15,110,122,.12)",
    onAccent: "#F6FFFE",
    good: "#1F7A4A",
    bad: "#A3341C",
    warn: "#8A5A00",
    info: "#1E5F9E",
    goodSoft: "rgba(31,122,74,.14)",
    badSoft: "rgba(163,52,28,.14)",
    warnSoft: "rgba(138,90,0,.14)",
    infoSoft: "rgba(30,95,158,.14)",
    radiusSm: "8px",
    radiusMd: "8px",
    radiusLg: "10px",
    radiusPill: "999px",
    shadowTile: "inset 0 1px 0 #FFFFFF, 0 10px 30px rgba(31,42,51,.08)",
    shadowRaised: "inset 0 1px 0 #FFFFFF, 0 14px 36px rgba(31,42,51,.14)",
    shadowSheet: "inset 0 1px 0 #FFFFFF, 0 24px 60px rgba(31,42,51,.2)",
  },
  board: {
    frame: "#D9D1CC",
    border: "#C4B9B4",
    surface: "#F8F4F1",
    bar: "#C9BFBA",
    tray: "#C9BFBA",
    pointA: "#B4616B",
    pointB: "#99CCC0",
    numbers: "#3D4A55",
    caption: "#5A6670",
    checker0: "#FBFAF7",
    rim0: "#4F5B66",
    detail0: "#E4DBDF",
    count0: "#1B2A33",
    checker1: "#1B2A33",
    rim1: "#5FB7B0",
    detail1: "#2E4652",
    count1: "#F6FFFE",
    die0: "#FBFAF7",
    pips0: "#1B2A33",
    dieBorder0: "#7D8891",
    die1: "#1B2A33",
    pips1: "#F6FFFE",
    dieBorder1: "#5FB7B0",
    cube: "#0F6E7A",
    cubeText: "#F6FFFE",
    cubeBorder: "#0B5C54",
    source: "#0B5C54",
    selection: "#0B5C54",
    destination: "#0B5C54",
    destinationText: "#FFFFFF",
    undo: "#B23A18",
    undoText: "#FFFFFF",
    hover: "#0F6E7A",
    focus: "#1F2A33",
  },
  patterns: {},
  css: CSS,
  defs: DEFS,
  shader: {
    fragment: FRAGMENT,
    colors: ["#F6F3F1", "#7FB8B0", "#CF8A91", "#1F2A33"],
    speed: 1,
    fps: 30,
    stillAt: 40,
  },
  preview: "linear-gradient(135deg, #FFFDFB, #F3E6EA 40%, #E6F1EE 75%, #D9D1CC)",
};
