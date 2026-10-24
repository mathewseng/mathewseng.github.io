// SPDX-License-Identifier: GPL-3.0-or-later
// Flow Field: a generative-art print in motion. Thousands of fine chalk
// streamlines drift across graphite; the chrome is flat, hairlined and set in
// mono, and the only colour is one ember accent (plus sky blue for targets).
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
export default {
  id: "flow-field",
  name: "Flow Field",
  description: "Chalk streamlines drifting over graphite.",
  scheme: "dark",
  tokens: {
    page: "#0E0F11",
    surface: "#17181B",
    surface2: "#1D1F23",
    surface3: "#24262B",
    glass: "rgba(23,24,27,.9)",
    line: "rgba(236,236,236,.09)",
    lineStrong: "rgba(236,236,236,.18)",
    lineOpaque: "#2B2D33",
    controlBorder: "#666A73",
    ink: "#ECECEC",
    muted: "#A2A4AA",
    soft: "#74777F",
    accent: "#FF6B3D",
    accent2: "#7FB3FF",
    accentSoft: "rgba(255,107,61,.16)",
    onAccent: "#1A0A04",
    good: "#7FD9A6",
    bad: "#FF7A7A",
    warn: "#FFB86B",
    info: "#7FB3FF",
    goodSoft: "rgba(127,217,166,.16)",
    badSoft: "rgba(255,122,122,.16)",
    warnSoft: "rgba(255,184,107,.16)",
    infoSoft: "rgba(127,179,255,.16)",
    radiusSm: "6px",
    radiusMd: "6px",
    radiusLg: "6px",
    radiusPill: "6px",
    shadowTile: "none",
    shadowRaised: "0 24px 48px -28px rgba(0,0,0,.85)",
    shadowSheet: "none",
    fontSans: '-apple-system, "Segoe UI", Roboto, Inter, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#1E2024",
    border: "#33363D",
    surface: "#121316",
    bar: "#08090A",
    tray: "#0B0C0E",
    pointA: "#ADB0B8",
    pointB: "#3C3F46",
    numbers: "#A2A4AA",
    caption: "#A2A4AA",
    checker0: "#F4F4F2",
    rim0: "#2A2C31",
    detail0: "#CFCFCC",
    count0: "#1A1C20",
    checker1: "#1A1C20",
    rim1: "#C9CBD1",
    detail1: "#3C3F46",
    count1: "#ECECEC",
    die0: "#F4F4F2",
    pips0: "#1A1C20",
    dieBorder0: "#2A2C31",
    die1: "#1A1C20",
    pips1: "#F4F4F2",
    dieBorder1: "#C9CBD1",
    cube: "#FF6B3D",
    cubeText: "#1A0A04",
    cubeBorder: "#FF9B78",
    source: "#7FB3FF",
    selection: "#FF6B3D",
    destination: "#7FB3FF",
    destinationText: "#0B1220",
    undo: "#FFB86B",
    undoText: "#1A0A04",
    hover: "#B9D4FF",
    focus: "#FFD9CC",
  },
  patterns: {},
  css: `
html[data-skin="flow-field"] body {
  font-variant-numeric: tabular-nums lining-nums;
}
/* Mono headings, sentence case, no tracking. */
html[data-skin="flow-field"] .tool-head h1,
html[data-skin="flow-field"] .hero h1,
html[data-skin="flow-field"] .panel-head h2,
html[data-skin="flow-field"] .panel-head h3,
html[data-skin="flow-field"] .panel-title,
html[data-skin="flow-field"] .dialog-head h2,
html[data-skin="flow-field"] .tile h2,
html[data-skin="flow-field"] .tile h3 {
  font-family: var(--font-mono);
  font-weight: 600;
  letter-spacing: -0.01em;
  text-transform: none;
}
/* The hub title is gradient-clipped text in the kit; here it is flat ink. */
html[data-skin="flow-field"] .hero h1 {
  background: none;
  color: var(--ink);
  font-weight: 600;
}
html[data-skin="flow-field"] .topbar {
  border-bottom: 1px solid var(--line);
}
html[data-skin="flow-field"] .tool-nav a,
html[data-skin="flow-field"] .crumbs a {
  border-radius: var(--r-sm);
}
html[data-skin="flow-field"] .tool-nav a[aria-current="page"] {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque), inset 0 -2px 0 var(--accent);
}
/* Flat plates: opaque surface, one hairline, no shadow, no glass. */
html[data-skin="flow-field"] .panel,
html[data-skin="flow-field"] .inspector,
html[data-skin="flow-field"] .tile {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-sm);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html[data-skin="flow-field"] .tile::before,
html[data-skin="flow-field"] .tile::after {
  display: none;
}
html[data-skin="flow-field"] .tile:hover,
html[data-skin="flow-field"] .tile:focus-visible {
  translate: none;
  border-color: var(--control-border);
  box-shadow: none;
}
html[data-skin="flow-field"] .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
}
html[data-skin="flow-field"] .panel-head,
html[data-skin="flow-field"] .panel-foot {
  border-color: var(--line-opaque);
}
html[data-skin="flow-field"] .dialog {
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-raised);
}
html[data-skin="flow-field"] .dialog-foot {
  background: var(--surface);
}
html[data-skin="flow-field"] .toast {
  background: var(--surface-2);
  border: 1px solid var(--line-opaque);
  border-left: 2px solid var(--accent);
  border-radius: var(--r-sm);
  box-shadow: none;
}
html[data-skin="flow-field"] .toast--alert {
  border-left-color: var(--bad);
}
html[data-skin="flow-field"] .toast--good {
  border-left-color: var(--good);
}
/* Buttons: 1px outlines, 6px corners, ember primary, outlined ghost. */
html[data-skin="flow-field"] .btn {
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border-color: var(--line-opaque);
  color: var(--ink);
}
html[data-skin="flow-field"] .btn:hover {
  background: var(--surface-3);
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="flow-field"] .btn[aria-pressed="true"],
html[data-skin="flow-field"] .btn[aria-pressed="true"]:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--ink);
}
html[data-skin="flow-field"] .btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
/* The generic .btn:hover above outranks the kit's primary hover; keep the
   ember fill (lightened as the kit does) and the dark label on hover/press. */
html[data-skin="flow-field"] .btn--primary:hover,
html[data-skin="flow-field"] .btn--primary:active {
  background: color-mix(in oklab, var(--accent) 86%, white);
  border-color: color-mix(in oklab, var(--accent) 86%, white);
  color: var(--on-accent);
}
html[data-skin="flow-field"] .btn--ghost {
  background: transparent;
  border-color: var(--control-border);
  color: var(--ink);
}
html[data-skin="flow-field"] .btn--ghost:hover,
html[data-skin="flow-field"] .btn--ghost:active {
  background: var(--surface-2);
  border-color: var(--ink);
  color: var(--ink);
}
html[data-skin="flow-field"] .btn--danger {
  background: transparent;
  border-color: var(--bad);
  color: var(--bad);
}
html[data-skin="flow-field"] .btn--danger:hover {
  background: var(--bad);
  border-color: var(--bad);
  color: var(--on-accent);
}
html[data-skin="flow-field"] .segmented {
  background: var(--page);
  border-color: var(--line-opaque);
  border-radius: var(--r-sm);
}
html[data-skin="flow-field"] .segmented > label,
html[data-skin="flow-field"] .segmented > button {
  border-radius: 4px;
}
html[data-skin="flow-field"] .segmented > label:has(input:checked),
html[data-skin="flow-field"] .segmented > button[aria-pressed="true"],
html[data-skin="flow-field"] .segmented > button[aria-checked="true"],
html[data-skin="flow-field"] .segmented > [aria-selected="true"] {
  background: var(--surface-3);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
html[data-skin="flow-field"] .tabs {
  border-bottom-color: var(--line-opaque);
}
html[data-skin="flow-field"] .tabs > [role="tab"] {
  border-radius: var(--r-sm) var(--r-sm) 0 0;
}
html[data-skin="flow-field"] .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
html[data-skin="flow-field"] .field select,
html[data-skin="flow-field"] .field textarea {
  background: var(--page);
  border-color: var(--control-border);
  border-radius: var(--r-sm);
}
/* Text that sits straight on the shader: give it an opaque plate. */
html[data-skin="flow-field"] .player-strip {
  border-radius: var(--r-sm);
  padding-inline: 10px;
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line-opaque);
}
html[data-skin="flow-field"] .player-strip.active {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-opaque), inset 3px 0 0 var(--accent);
}
html[data-skin="flow-field"] .action-area {
  padding: 10px 12px 12px;
  background: var(--surface);
  border: 1px solid var(--line-opaque);
  border-radius: var(--r-sm);
}
html[data-skin="flow-field"] .board-frame {
  border-radius: var(--r-sm);
}
html[data-skin="flow-field"] .docs-section {
  border-top-color: var(--line-opaque);
}
html[data-skin="flow-field"] .docs-toc a {
  border-radius: var(--r-sm);
}
html[data-skin="flow-field"] .foot a {
  color: var(--muted);
}
/* Board: flat graphite plates, chalk hairlines, streamline grain. */
html[data-skin="flow-field"] .bg-board text {
  font-family: var(--font-mono);
}
html[data-skin="flow-field"] .bg-board [data-pattern="frame"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 2;
}
html[data-skin="flow-field"] .bg-board [data-pattern="surface"] {
  fill: url(#skin-flow-field-lines);
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="flow-field"] .bg-board [data-pattern="bar"],
html[data-skin="flow-field"] .bg-board [data-pattern="tray"] {
  fill: none;
  stroke: var(--board-border);
  stroke-width: 1;
}
html[data-skin="flow-field"] .bg-board .point-shape {
  stroke: rgba(236, 236, 236, 0.16);
  stroke-width: 1;
  stroke-linejoin: round;
}
html[data-skin="flow-field"] .bg-board .checker > circle:first-child,
html[data-skin="flow-field"] .bg-board .board-die-face > rect:first-child {
  stroke-width: 2;
}
html[data-skin="flow-field"] .bg-board .board-cube .cube-face {
  stroke-width: 1;
}
`,
  defs: `
<pattern id="skin-flow-field-lines" patternUnits="userSpaceOnUse" width="120" height="32">
  <g fill="none" stroke="#C9CBD1" stroke-opacity=".06" stroke-width="1">
    <path d="M0 4c20-3 40 3 60 0s40 3 60 0"/>
    <path d="M0 12c20 3 40-3 60 0s40-3 60 0"/>
    <path d="M0 20c20-3 40 3 60 0s40 3 60 0"/>
    <path d="M0 28c20 3 40-3 60 0s40-3 60 0"/>
  </g>
</pattern>
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
uniform vec3 u_c1; // page: graphite
uniform vec3 u_c2; // chalk: the streamlines
uniform vec3 u_c3; // ember: the tint near the pointer
uniform vec3 u_c4; // surface: a faint graphite wash
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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 3.0;
  float t = u_time * 0.02;

  // The field. Streamlines are the iso-lines of a stream function
  // psi = y + warp(p): they follow the field exactly and never cross. The
  // warp is a slow, drifting fbm plus a finer ripple riding on it.
  float warp = fbm(p * 0.9 + vec2(t, -0.6 * t)) * 1.1
             + fbm(p * 2.1 - vec2(1.4 * t, 3.1)) * 0.22;
  float psi = p.y + warp;

  // Two families: a dense fine one and a sparse bolder one, each with its
  // own line index so thickness and dashes can vary per line.
  float phase1 = psi * 110.0;
  float row1 = floor(phase1 / 6.2831853);
  float s1 = 0.5 + 0.5 * sin(phase1);
  float th1 = mix(0.82, 0.90, vnoise(vec2(row1 * 0.53, 3.0)));
  float line1 = smoothstep(th1, 0.985, s1);

  float phase2 = psi * 38.0 + 1.3;
  float row2 = floor(phase2 / 6.2831853);
  float s2 = 0.5 + 0.5 * sin(phase2);
  float line2 = smoothstep(0.90, 0.995, s2);

  // Bundles: a second noise gates where each family appears, so lines come
  // and go in sheaves instead of covering the whole page evenly.
  float bundle1 = smoothstep(0.40, 0.62, fbm(p * 0.7 + vec2(7.3 + 0.5 * t, 2.2)));
  float bundle2 = smoothstep(0.48, 0.70, fbm(p * 0.5 + vec2(-0.4 * t, 9.1)));

  // Dashes: each line starts and stops where its own 1-D noise says.
  float along = p.x + 0.5 * warp;
  float dash1 = smoothstep(0.30, 0.55, vnoise(vec2(along * 1.6, row1 * 0.37 + 11.0)));
  float dash2 = smoothstep(0.35, 0.60, vnoise(vec2(along * 0.9, row2 * 0.71 + 23.0)));

  float ink = line1 * bundle1 * dash1 + 0.8 * line2 * bundle2 * dash2;
  ink = min(ink, 1.0);

  // Pointer: lines within ~a fifth of the height warm to ember and brighten.
  float live = step(0.5, u_pointer.x + u_pointer.y);
  float d = length(gl_FragCoord.xy - u_pointer) / (0.22 * u_resolution.y);
  float near = live * exp(-d * d);
  vec3 chalk = mix(u_c2, u_c3, 0.85 * near);
  ink *= 1.0 + 0.6 * near;

  // Graphite: the page colour with a very slow, broad wash toward surface.
  float wash = fbm(p * 0.35 + vec2(0.3 * t, 17.0));
  vec3 col = mix(u_c1, u_c4, 0.4 * wash);

  // Chalk at about a tenth (light schemes draw the lines a little stronger).
  col = mix(col, chalk, ink * mix(0.18, 0.11, u_dark));

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#0E0F11", "#C9CBD1", "#FF6B3D", "#17181B"],
    speed: 1,
    fps: 60,
    stillAt: 10,
  },
  preview: "linear-gradient(160deg, #1D1F23, #0E0F11 58%, #3C3F46 100%)",
};
