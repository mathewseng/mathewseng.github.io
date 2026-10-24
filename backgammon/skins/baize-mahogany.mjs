// SPDX-License-Identifier: GPL-3.0-or-later
// Baize & Mahogany: a casino table at night. Green baize under one tungsten
// lamp, a mahogany rail, camel and lacquer-red leather points with a stitch
// line, ivory and black-lacquer checkers, translucent red dice. The chrome
// accent is brass (it is used as text, links, focus rings and pressed labels
// by the engine, so it must read on felt); the lacquer red lives in accent2
// and is used only as a fill under ink. Move cues are cool on warm (mint
// rings, an ivory selection ring, sky focus) so they read on camel as well as
// on felt. Shape per skin-contract.md §2.
export default {
  id: "baize-mahogany",
  name: "Baize & Mahogany",
  description: "Green baize under one lamp, a mahogany rail, leather points.",
  scheme: "dark",
  tokens: {
    page: "#0E2A1F",
    surface: "#153626",
    surface2: "#1B4230",
    surface3: "#214E39",
    glass: "rgba(21,54,38,.8)",
    line: "#2A5440",
    lineStrong: "#3B6B52",
    lineOpaque: "#2A5440",
    controlBorder: "rgba(169,196,178,.6)",
    ink: "#EEF3E9",
    muted: "#A9C4B2",
    soft: "#7FA08E",
    accent: "#FFE7A3",
    accent2: "#B3382F",
    accentSoft: "rgba(255,231,163,.18)",
    onAccent: "#2A1A14",
    good: "#8FDBA6",
    bad: "#FF9A8E",
    warn: "#F2C14E",
    info: "#9ED2FF",
    goodSoft: "rgba(143,219,166,.16)",
    badSoft: "rgba(255,154,142,.16)",
    warnSoft: "rgba(242,193,78,.16)",
    infoSoft: "rgba(158,210,255,.16)",
    radiusSm: "8px",
    radiusMd: "10px",
    radiusLg: "10px",
    radiusPill: "999px",
    shadowTile: "0 6px 18px rgba(0,0,0,.45)",
    shadowRaised: "0 12px 32px rgba(0,0,0,.55)",
    shadowSheet: "0 -12px 32px rgba(0,0,0,.55)",
    fontSans:
      '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#4B1D12",
    border: "#7A3320",
    surface: "#14402B",
    bar: "#3A1710",
    tray: "#0F3021",
    pointA: "#B89560",
    pointB: "#B23A2E",
    numbers: "#A9C4B2",
    caption: "#A9C4B2",
    checker0: "#F8F3E6",
    rim0: "#D6CCB3",
    detail0: "#E8DFC9",
    count0: "#2A1A14",
    checker1: "#121110",
    rim1: "#8A8078",
    detail1: "#2C2927",
    count1: "#FFF6EE",
    die0: "#C8262A",
    pips0: "#FFFFFF",
    dieBorder0: "#8E1418",
    die1: "#B01F24",
    pips1: "#FFFFFF",
    dieBorder1: "#7A1014",
    cube: "#F5EFE0",
    cubeText: "#1A1A1A",
    cubeBorder: "#D6CCB3",
    source: "#A6F2C9",
    selection: "#F8F3E6",
    destination: "#A6F2C9",
    destinationText: "#0E2A1F",
    undo: "#FFF4C9",
    undoText: "#21180E",
    hover: "#BFE3FF",
    focus: "#BFE3FF",
  },
  patterns: {},
  css: `
/* Type: an old-style serif, sentence case, lining tabular numerals. */
html[data-skin="baize-mahogany"] body {
  font-variant-numeric: lining-nums tabular-nums;
}
html[data-skin="baize-mahogany"] .tool-head h1,
html[data-skin="baize-mahogany"] .hero h1,
html[data-skin="baize-mahogany"] .panel-head h2,
html[data-skin="baize-mahogany"] .panel-head h3,
html[data-skin="baize-mahogany"] .panel-title,
html[data-skin="baize-mahogany"] .dialog-head h2,
html[data-skin="baize-mahogany"] .tile h3 {
  font-weight: 500;
  letter-spacing: 0.01em;
  text-transform: none;
}
html[data-skin="baize-mahogany"] .hero h1 {
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: var(--ink);
}
html[data-skin="baize-mahogany"] .tool-nav a,
html[data-skin="baize-mahogany"] .btn,
html[data-skin="baize-mahogany"] .segmented > label,
html[data-skin="baize-mahogany"] .segmented > button,
html[data-skin="baize-mahogany"] .tabs > [role="tab"],
html[data-skin="baize-mahogany"] .field > label,
html[data-skin="baize-mahogany"] .field-label,
html[data-skin="baize-mahogany"] .player-name strong {
  font-weight: 500;
  letter-spacing: 0.01em;
  text-transform: none;
}

/* Topbar: a thin brass rule under the rail, nothing else. */
html[data-skin="baize-mahogany"] .topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="baize-mahogany"] .mark {
  border-radius: 999px;
  border-color: var(--line-strong);
  background: var(--surface);
}
html[data-skin="baize-mahogany"] .tool-nav a {
  border-radius: 999px;
}
html[data-skin="baize-mahogany"] .tool-nav a[aria-current="page"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}

/* Panels: felt with one line and one soft shadow, no inner glow. */
html[data-skin="baize-mahogany"] .panel,
html[data-skin="baize-mahogany"] .inspector,
html[data-skin="baize-mahogany"] .tile {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-tile);
}
html[data-skin="baize-mahogany"] .tile::before,
html[data-skin="baize-mahogany"] .tile::after {
  display: none;
}
html[data-skin="baize-mahogany"] .tile:hover,
html[data-skin="baize-mahogany"] .tile:focus-visible {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-raised);
}
html[data-skin="baize-mahogany"] .panel-head,
html[data-skin="baize-mahogany"] .panel-foot {
  border-color: var(--line);
}

/* Stage: the board sits straight on the felt; the strips are chips. */
html[data-skin="baize-mahogany"] .player-strip {
  border-radius: 999px;
  padding: 4px 14px;
}
html[data-skin="baize-mahogany"] .player-strip.active {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="baize-mahogany"] .action-area {
  padding-top: 12px;
}

/* Buttons: chips. Primary is lacquer red (accent-2) under ink, ghost a 60%
   outline, danger the same red with a brass edge. Brass (accent) is never a
   fill under on-accent here; the engine's pressed and link colours use it as
   text on felt. */
html[data-skin="baize-mahogany"] .btn {
  border-radius: 999px;
  border-color: var(--line-strong);
  background: var(--surface-2);
}
html[data-skin="baize-mahogany"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
}
html[data-skin="baize-mahogany"] .btn--primary {
  border-color: var(--accent-2);
  background: var(--accent-2);
  color: var(--ink);
  box-shadow: 0 6px 18px rgba(0,0,0,.45);
}
html[data-skin="baize-mahogany"] .btn--primary:hover {
  background: color-mix(in oklab, var(--accent-2) 88%, black);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="baize-mahogany"] .btn--ghost {
  background: transparent;
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="baize-mahogany"] .btn--ghost:hover {
  background: var(--surface-2);
  border-color: var(--muted);
}
html[data-skin="baize-mahogany"] .btn--ghost.btn--icon {
  border-color: transparent;
}
html[data-skin="baize-mahogany"] .btn--danger {
  background: var(--accent-2);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="baize-mahogany"] .btn--danger:hover {
  background: color-mix(in oklab, var(--accent-2) 85%, black);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="baize-mahogany"] .btn[aria-pressed="true"] {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
/* The engine paints pressed toggles and the turn badge in the accent (an id
   selector for #equity-toggle); brass on felt reads, and the chip border
   keeps the pressed state distinct from idle. */
html[data-skin="baize-mahogany"] #equity-toggle[aria-pressed="true"],
html[data-skin="baize-mahogany"] .sound-toggle[aria-pressed="true"] {
  border-color: var(--line-strong);
}
html[data-skin="baize-mahogany"] .player-strip .badge--accent {
  background: var(--accent-soft);
  border-color: var(--line-strong);
  color: var(--accent);
}
/* Anchor-styled buttons (the Library empty state) inherit the link colour;
   a chip label is ink. */
html[data-skin="baize-mahogany"] a.btn:not(.btn--primary):not(.btn--danger) {
  color: var(--ink);
}

/* Segments and tabs: chip-shaped. */
html[data-skin="baize-mahogany"] .segmented {
  border-color: var(--line);
  background: var(--page);
}
html[data-skin="baize-mahogany"] .segmented > label:has(input:checked),
html[data-skin="baize-mahogany"] .segmented > button[aria-pressed="true"],
html[data-skin="baize-mahogany"] .segmented > button[aria-checked="true"],
html[data-skin="baize-mahogany"] .segmented > [aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="baize-mahogany"] .tabs {
  gap: 4px;
  padding-bottom: 6px;
  border-bottom-color: var(--line);
}
html[data-skin="baize-mahogany"] .tabs > [role="tab"] {
  border-radius: 999px;
}
html[data-skin="baize-mahogany"] .tabs > [role="tab"][aria-selected="true"],
html[data-skin="baize-mahogany"] .tabs.has-indicator > [role="tab"][aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="baize-mahogany"] .tabs.has-indicator::after {
  display: none;
}

/* Fields: felt wells with the 60% outline. */
html[data-skin="baize-mahogany"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="baize-mahogany"] .field select,
html[data-skin="baize-mahogany"] .field textarea {
  border-radius: 8px;
  border-color: var(--control-border);
  background: var(--page);
}

/* Dialogs and sheets: felt with a mahogany top rail. Toasts: ivory chips. */
html[data-skin="baize-mahogany"] .dialog {
  border: 1px solid var(--line-strong);
  border-top: 6px solid var(--board-frame, #4B1D12);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-raised);
}
html[data-skin="baize-mahogany"] .dialog-head,
html[data-skin="baize-mahogany"] .dialog-foot {
  border-color: var(--line);
}
html[data-skin="baize-mahogany"] .toast {
  border: 0;
  border-radius: 999px;
  padding-left: 18px;
  background: var(--board-cube, #F5EFE0);
  color: var(--board-cube-text, #1A1A1A);
  box-shadow: 0 6px 18px rgba(0,0,0,.45);
}
html[data-skin="baize-mahogany"] .toast--alert {
  background: color-mix(in oklab, var(--accent-2) 22%, var(--board-cube, #F5EFE0));
}
html[data-skin="baize-mahogany"] .toast--good {
  background: color-mix(in oklab, var(--good) 28%, var(--board-cube, #F5EFE0));
}
html[data-skin="baize-mahogany"] .toast .btn--ghost {
  color: var(--board-cube-text, #1A1A1A);
}

/* Docs pages. */
html[data-skin="baize-mahogany"] .docs-section,
html[data-skin="baize-mahogany"] .docs-toc {
  border-color: var(--line);
  border-radius: 10px;
}

/* ---- Board ---- */
html[data-skin="baize-mahogany"] .bg-board text {
  font-family: var(--font-sans);
  font-variant-numeric: lining-nums tabular-nums;
}

/* Rail: ribbon-grained mahogany over the frame token. */
html[data-skin="baize-mahogany"] .bg-board [data-pattern="frame"] {
  fill: url(#skin-baize-mahogany-rail);
  filter: url(#skin-baize-mahogany-grain);
  opacity: 1;
}
/* Baize: the lamp pools at the top of the field; a fine static nap. */
html[data-skin="baize-mahogany"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-baize-mahogany-lamp);
  filter: url(#skin-baize-mahogany-nap);
  opacity: 1;
}
/* Bar: dark mahogany with a brass rivet at each end. */
html[data-skin="baize-mahogany"] .bg-board [data-pattern="bar"] {
  fill: url(#skin-baize-mahogany-bar);
  opacity: 1;
}
/* Trays: felt-lined wells. */
html[data-skin="baize-mahogany"] .bg-board [data-pattern="tray"] {
  fill: url(#skin-baize-mahogany-well);
  opacity: 1;
}

/* Points: leather inlays, lit from the base, with a gold stitch line. */
html[data-skin="baize-mahogany"] .bg-board .point-shape,
html[data-skin="baize-mahogany"] .bg-board.no-move-hints .point .point-shape {
  stroke: rgba(227,193,122,.42);
  stroke-width: 1;
  stroke-dasharray: 1.5 1.5;
  stroke-linejoin: round;
}
html[data-skin="baize-mahogany"] .bg-board [data-pattern="pointA"],
html[data-skin="baize-mahogany"] .bg-board [data-pattern="pointB"] {
  fill: url(#skin-baize-mahogany-leather);
  opacity: 1;
}

/* Checkers: turned ivory and black lacquer with a pewter band. */
html[data-skin="baize-mahogany"] .bg-board .checker > circle:first-child {
  stroke-width: 2;
}
html[data-skin="baize-mahogany"] .bg-board .checker [data-pattern="checker0"] {
  fill: url(#skin-baize-mahogany-ivory);
  opacity: 1;
}
html[data-skin="baize-mahogany"] .bg-board .checker [data-pattern="checker1"] {
  fill: url(#skin-baize-mahogany-lacquer);
  opacity: 1;
}

/* Dice: translucent casino red with an inner light. */
html[data-skin="baize-mahogany"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 1.5;
}
html[data-skin="baize-mahogany"] .bg-board [data-pattern="die0"],
html[data-skin="baize-mahogany"] .bg-board [data-pattern="die1"] {
  fill: url(#skin-baize-mahogany-dice);
  opacity: 1;
}
html[data-skin="baize-mahogany"] .bg-board .board-die.consumed [data-pattern="die0"],
html[data-skin="baize-mahogany"] .bg-board .board-die.consumed [data-pattern="die1"],
html[data-skin="baize-mahogany"] .bg-board .board-die.blocked [data-pattern="die0"],
html[data-skin="baize-mahogany"] .bg-board .board-die.blocked [data-pattern="die1"] {
  opacity: 0;
}

/* Cube: ivory with a soft bevel. */
html[data-skin="baize-mahogany"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
html[data-skin="baize-mahogany"] .bg-board [data-pattern="cube"] {
  fill: url(#skin-baize-mahogany-bevel);
  opacity: 1;
}
`,
  defs: `
<linearGradient id="skin-baize-mahogany-rail" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#5C2416"/>
  <stop offset="0.5" stop-color="#4B1D12"/>
  <stop offset="1" stop-color="#3D170E"/>
</linearGradient>
<filter id="skin-baize-mahogany-grain" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.02 0.6" numOctaves="2" seed="11" result="n"/>
  <feColorMatrix in="n" type="saturate" values="0" result="g"/>
  <feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope="0.26"/></feComponentTransfer>
  <feBlend in="SourceGraphic" in2="g2" mode="overlay"/>
</filter>
<radialGradient id="skin-baize-mahogany-lamp" cx="0.5" cy="0.08" r="0.9" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFF1C4" stop-opacity="0.16"/>
  <stop offset="0.45" stop-color="#FFF1C4" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
</radialGradient>
<filter id="skin-baize-mahogany-nap" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="n"/>
  <feColorMatrix in="n" type="saturate" values="0" result="g"/>
  <feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope="0.10"/></feComponentTransfer>
  <feBlend in="SourceGraphic" in2="g2" mode="overlay"/>
</filter>
<pattern id="skin-baize-mahogany-bar" x="388" y="28" width="40" height="604" patternUnits="userSpaceOnUse">
  <rect width="40" height="604" fill="#3A1710"/>
  <rect x="0" width="2" height="604" fill="#5A2518"/>
  <rect x="38" width="2" height="604" fill="#24100A"/>
  <circle cx="20" cy="16" r="4" fill="url(#skin-baize-mahogany-brass)"/>
  <circle cx="20" cy="588" r="4" fill="url(#skin-baize-mahogany-brass)"/>
</pattern>
<radialGradient id="skin-baize-mahogany-brass" cx="0.35" cy="0.3" r="0.8" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#F1D58A"/>
  <stop offset="1" stop-color="#8A6420"/>
</radialGradient>
<linearGradient id="skin-baize-mahogany-well" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>
  <stop offset="0.25" stop-color="#000000" stop-opacity="0.12"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.04"/>
</linearGradient>
<linearGradient id="skin-baize-mahogany-leather" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.24"/>
</linearGradient>
<radialGradient id="skin-baize-mahogany-ivory" cx="0.4" cy="0.34" r="0.7" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="0.55" stop-color="#FFF4D6" stop-opacity="0.08"/>
  <stop offset="1" stop-color="#6B4A2A" stop-opacity="0.22"/>
</radialGradient>
<linearGradient id="skin-baize-mahogany-lacquer" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.24"/>
  <stop offset="0.3" stop-color="#FFFFFF" stop-opacity="0.1"/>
  <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.04"/>
</linearGradient>
<radialGradient id="skin-baize-mahogany-dice" cx="0.5" cy="0.42" r="0.68" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFB0A8" stop-opacity="0.5"/>
  <stop offset="0.55" stop-color="#FF8A86" stop-opacity="0.16"/>
  <stop offset="1" stop-color="#3A0004" stop-opacity="0.3"/>
</radialGradient>
<linearGradient id="skin-baize-mahogany-bevel" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.4"/>
  <stop offset="0.4" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#6B4A2A" stop-opacity="0.16"/>
</linearGradient>
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
uniform vec3 u_c1; /* felt in shadow */
uniform vec3 u_c2; /* felt under the lamp */
uniform vec3 u_c3; /* corner vignette */
uniform vec3 u_c4; /* smoke tint */

/* Lattice hash on a wrapped integer grid (no period-10 structure, small
   magnitudes), value noise and a two-octave fbm, all inlined. */
float hash(vec2 i) {
  i = mod(i, 512.0);
  vec3 p = fract(vec3(i.x, i.y, i.x) * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) {
  float v = 0.5 * noise(p);
  p = p * 2.1 + vec2(1.7, 9.2);
  v += 0.25 * noise(p);
  return v;
}

void main() {
  /* Top-down uv: the lamp hangs above centre, slightly forward. */
  vec2 uv = gl_FragCoord.xy / u_resolution;
  uv.y = 1.0 - uv.y;
  float aspect = u_resolution.x / u_resolution.y;
  /* Measured in short sides, so the pool reads the same on a phone. */
  vec2 unit = vec2(aspect, 1.0) / min(aspect, 1.0);

  /* Lamp centre, nudged 0.02 toward the pointer once it has moved. */
  vec2 ptr = clamp(u_pointer / u_resolution, 0.0, 1.0);
  ptr.y = 1.0 - ptr.y;
  float moved = step(0.5, length(u_pointer));
  vec2 c = vec2(0.5, 0.35);
  c += (ptr - c) * 0.02 * moved;

  /* A soft tungsten cone; the filament hums, barely. */
  vec2 d = (uv - c) * unit * vec2(1.0, 1.2);
  float l = smoothstep(1.08, 0.0, length(d));
  l *= 1.0 + 0.03 * sin(u_time * 0.6);
  vec3 col = mix(u_c1, u_c2, l);

  /* Felt nap: static, per pixel, just a texture under the hand. */
  float n = noise(gl_FragCoord.xy * 0.55);
  col += (n - 0.5) * 0.05;

  /* Smoke: two fbm layers drifting upward, shown only where the lamp lights it. */
  vec2 sp = uv * unit;
  float s1 = fbm2(sp * 3.0 + vec2(0.0, u_time * 0.02));
  float s2 = fbm2(sp * 5.5 + vec2(1.3, u_time * 0.03) + s1 * 0.8);
  float smoke = smoothstep(0.30, 0.78, s1 * 0.6 + s2 * 0.4);
  col += u_c4 * smoke * 0.035 * l;

  /* Vignette toward the corners. */
  float v = smoothstep(1.45, 0.55, length((uv - 0.5) * unit));
  col = mix(u_c3, col, v);

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#081D15", "#16412D", "#06170F", "#C7BDAD"],
    speed: 1,
    fps: 30,
    stillAt: 24,
  },
  preview: "linear-gradient(135deg, #081A13, #14402B 55%, #4B1D12 85%, #B23A2E)",
};
