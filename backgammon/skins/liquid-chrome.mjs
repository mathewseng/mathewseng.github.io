// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Chrome: molten metal rippling in a dark studio. The shader is a
// reflective height field under a fake environment map (one bright horizon,
// one blue rim light); the chrome is near-black plates with silver gradient
// edges, buttons with a vertical metal gradient, no glass. Pieces are chrome
// and black chrome, told apart by their rims, with electric blue for play
// highlights and amber for undo.
// Shape per docs/redesign/backgammon-themes/skin-contract.md §2.
const S = 'html[data-skin="liquid-chrome"]';

export default {
  id: "liquid-chrome",
  name: "Liquid Chrome",
  description: "Molten chrome in the dark, silver edges and electric blue.",
  scheme: "dark",
  tokens: {
    page: "#07080B",
    surface: "#111319",
    surface2: "#181B23",
    surface3: "#21252F",
    glass: "rgba(17,19,25,.96)",
    line: "rgba(201,211,230,.12)",
    lineStrong: "rgba(201,211,230,.24)",
    lineOpaque: "#2A2F3A",
    controlBorder: "#4A5262",
    ink: "#F2F4F8",
    muted: "#9BA3B4",
    soft: "#6B7383",
    accent: "#C9D3E6",
    accent2: "#6FA8FF",
    accentSoft: "rgba(201,211,230,.14)",
    onAccent: "#0B0D12",
    good: "#7FE0A0",
    bad: "#FF7D7D",
    warn: "#FFC46B",
    info: "#6FA8FF",
    goodSoft: "rgba(127,224,160,.16)",
    badSoft: "rgba(255,125,125,.16)",
    warnSoft: "rgba(255,196,107,.16)",
    infoSoft: "rgba(111,168,255,.16)",
    radiusSm: "8px",
    radiusMd: "8px",
    radiusLg: "8px",
    radiusPill: "999px",
    shadowTile: "inset 0 1px 0 rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.6)",
    shadowRaised: "inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -24px rgba(0,0,0,.95)",
    shadowSheet: "0 -18px 48px -24px rgba(0,0,0,.9)",
    fontSans: 'Inter, "SF Pro Text", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#B9C2D0",
    border: "#5B6474",
    surface: "#15181F",
    bar: "#0B0D12",
    tray: "#0B0D12",
    pointA: "#8F9AAE",
    pointB: "#3B4252",
    numbers: "#1B1F28",
    caption: "#9BA3B4",
    checker0: "#E6EAF2",
    rim0: "#2A2F3A",
    detail0: "#B9C2D0",
    count0: "#0B0D12",
    checker1: "#101318",
    rim1: "#C9D3E6",
    detail1: "#4A5262",
    count1: "#F2F4F8",
    die0: "#E6EAF2",
    pips0: "#0B0D12",
    dieBorder0: "#2A2F3A",
    die1: "#101318",
    pips1: "#F2F4F8",
    dieBorder1: "#C9D3E6",
    cube: "#1B1F28",
    cubeText: "#C9D3E6",
    cubeBorder: "#8F9AAE",
    source: "#6FA8FF",
    selection: "#9CC4FF",
    destination: "#6FA8FF",
    destinationText: "#0B0D12",
    undo: "#FFB454",
    undoText: "#2A1A05",
    hover: "#6FA8FF",
    focus: "#DDE8FF",
  },
  patterns: {},
  css: `
${S} body {
  font-variant-numeric: tabular-nums lining-nums;
}
${S} .tool-head h1,
${S} .hero h1 {
  font-weight: 700;
  letter-spacing: -0.03em;
}
${S} .panel-head h2,
${S} .panel-head h3,
${S} .panel-title,
${S} .dialog-head h2,
${S} .tile h3 {
  font-weight: 700;
  letter-spacing: -0.02em;
}
/* Plates: an opaque charcoal face inside a 1px border that fades from silver
   at the top to nothing at the bottom (two backgrounds, padding-box over
   border-box). Crisp 8px corners, no glass anywhere. */
${S} .topbar,
${S} .panel,
${S} .inspector,
${S} .tile,
${S} .dialog,
${S} .action-area,
${S} .toast {
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background:
    linear-gradient(var(--surface), var(--surface)) padding-box,
    linear-gradient(180deg, color-mix(in oklab, var(--accent) 55%, transparent), color-mix(in oklab, var(--accent) 10%, transparent) 60%, transparent) border-box;
  box-shadow: var(--shadow-tile);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
${S} .topbar {
  padding: 4px 8px;
}
${S} .panel--quiet {
  background: var(--surface);
  border-color: var(--line);
  box-shadow: none;
}
${S} .panel-head,
${S} .panel-foot,
${S} .dialog-head,
${S} .dialog-foot,
${S} .tabs {
  border-color: var(--line-strong);
}
${S} .dialog-foot {
  background: var(--surface);
}
${S} .tile:hover,
${S} .tile:focus-visible {
  translate: none;
  box-shadow: var(--shadow-raised);
}
${S} .toast {
  background:
    linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
    linear-gradient(180deg, color-mix(in oklab, var(--accent) 55%, transparent), color-mix(in oklab, var(--accent) 10%, transparent) 60%, transparent) border-box;
  box-shadow: var(--shadow-raised);
}
${S} .toast--alert {
  box-shadow: inset 3px 0 0 var(--bad), var(--shadow-raised);
}
${S} .toast--good {
  box-shadow: inset 3px 0 0 var(--good), var(--shadow-raised);
}
/* Controls: a vertical metal gradient, brighter on hover, inverted when
   pressed. The primary button is the chrome itself: a bright crest, the
   silver body and a dark band at the bottom edge. */
${S} .btn {
  border-radius: var(--r-sm);
  border-color: var(--line-strong);
  background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}
${S} .btn:hover {
  border-color: var(--control-border);
  background: linear-gradient(180deg, color-mix(in oklab, var(--surface-3) 88%, var(--ink)), var(--surface-3));
}
${S} .btn:active {
  background: linear-gradient(180deg, var(--surface-2), var(--surface-3));
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}
${S} .btn--primary {
  border-color: color-mix(in oklab, var(--accent) 70%, black);
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 72%, white), var(--accent) 48%, color-mix(in oklab, var(--accent) 86%, black) 52%, color-mix(in oklab, var(--accent) 74%, black));
  color: var(--on-accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
${S} .btn--primary:hover {
  border-color: color-mix(in oklab, var(--accent) 60%, black);
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 56%, white), color-mix(in oklab, var(--accent) 84%, white) 48%, var(--accent) 52%, color-mix(in oklab, var(--accent) 84%, black));
  color: var(--on-accent);
}
${S} .btn--primary:active {
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 80%, black), var(--accent));
  color: var(--on-accent);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
}
${S} .btn--ghost {
  border-color: color-mix(in oklab, var(--accent) 32%, transparent);
  background: transparent;
  color: var(--ink);
  box-shadow: none;
}
${S} .btn--ghost:hover {
  border-color: color-mix(in oklab, var(--accent) 55%, transparent);
  background: var(--surface-2);
  color: var(--ink);
}
${S} .btn--ghost:active {
  background: var(--surface-3);
  color: var(--ink);
}
${S} .btn--danger {
  border-color: color-mix(in oklab, var(--bad) 50%, transparent);
  background: var(--bad-soft);
  color: var(--bad);
  box-shadow: none;
}
${S} .btn--danger:hover {
  border-color: var(--bad);
  background: var(--bad);
  color: var(--on-accent);
}
${S} .btn[aria-pressed="true"] {
  border-color: color-mix(in oklab, var(--accent-2) 60%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent-2) 26%, var(--surface-3)), color-mix(in oklab, var(--accent-2) 18%, var(--surface-2)));
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
${S} .btn[aria-pressed="true"]:hover {
  border-color: var(--accent-2);
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent-2) 34%, var(--surface-3)), color-mix(in oklab, var(--accent-2) 24%, var(--surface-2)));
  color: var(--ink);
}
${S} .segmented {
  border-color: var(--line-strong);
  border-radius: var(--r-sm);
  background: var(--page);
}
${S} .segmented > label,
${S} .segmented > button {
  border-radius: 6px;
}
${S} .segmented > label:has(input:checked),
${S} .segmented > button[aria-pressed="true"],
${S} .segmented > button[aria-checked="true"],
${S} .segmented > [aria-selected="true"] {
  background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
  box-shadow: inset 0 0 0 1px var(--line-strong), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
${S} .tool-nav a,
${S} .crumbs a,
${S} .docs-toc a {
  border-radius: var(--r-sm);
}
${S} .tool-nav a[aria-current="page"] {
  background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
${S} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${S} .field select,
${S} .field textarea {
  border-color: var(--control-border);
  border-radius: var(--r-sm);
  background: var(--page);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}
/* Text that would otherwise sit on the shader gets a plate: the player
   strips and the action area (the draft line lives inside it). */
${S} .player-strip {
  min-height: 36px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-sm);
  background: var(--surface);
}
${S} .player-strip.active {
  border-color: color-mix(in oklab, var(--accent-2) 55%, transparent);
  background: linear-gradient(90deg, color-mix(in oklab, var(--accent-2) 16%, var(--surface)), var(--surface) 70%);
}
${S} .action-area {
  padding: 10px 12px;
}
${S} .docs-section {
  border-top-color: var(--line-strong);
}
${S} .docs-toc {
  border-radius: var(--r-md);
}
/* Board: brushed frame, faceted points, chrome and black chrome pieces. */
${S} .bg-board text {
  font-family: var(--font-sans);
  font-weight: 700;
}
${S} .bg-board [data-pattern="frame"] {
  fill: url(#skin-liquid-chrome-frame);
}
${S} .bg-board [data-pattern="surface"] {
  fill: url(#skin-liquid-chrome-surface);
  stroke: var(--board-border);
  stroke-width: 1.5;
}
${S} .bg-board [data-pattern="bar"] {
  fill: url(#skin-liquid-chrome-bar);
}
${S} .bg-board [data-pattern="tray"] {
  fill: url(#skin-liquid-chrome-tray);
}
${S} .bg-board .point-shape {
  stroke: rgba(0, 0, 0, 0.45);
  stroke-width: 1;
  stroke-linejoin: round;
}
${S} .bg-board [data-pattern="pointA"],
${S} .bg-board [data-pattern="pointB"] {
  fill: url(#skin-liquid-chrome-facet);
}
${S} .bg-board .checker [data-pattern="checker0"],
${S} .bg-board [data-pattern="die0"] {
  fill: url(#skin-liquid-chrome-silver);
}
${S} .bg-board .checker [data-pattern="checker1"],
${S} .bg-board [data-pattern="die1"] {
  fill: url(#skin-liquid-chrome-black);
}
${S} .bg-board [data-pattern="cube"] {
  fill: url(#skin-liquid-chrome-gunmetal);
}
/* The gradient overlay clones the face and would hide the inner half of the
   rim stroke; pull it in so the whole rim shows. Black chrome on the
   near-black bar and trays is carried by its silver rim, so that one is
   wider. */
${S} .bg-board .checker[data-player="0"] > circle:first-child {
  stroke-width: 2.5;
}
${S} .bg-board .checker[data-player="0"] > [data-pattern="checker0"] {
  r: 20.75px;
}
${S} .bg-board .checker[data-player="1"] > circle:first-child {
  stroke-width: 3.5;
}
${S} .bg-board .checker[data-player="1"] > [data-pattern="checker1"] {
  r: 20.25px;
}
${S} .bg-board .board-die-face > rect:first-child {
  stroke-width: 2;
}
${S} .bg-board .board-cube .cube-face {
  stroke-width: 1.5;
}
`,
  defs: `
<linearGradient id="skin-liquid-chrome-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".46"/>
  <stop offset=".07" stop-color="#FFFFFF" stop-opacity=".2"/>
  <stop offset=".2" stop-color="#FFFFFF" stop-opacity=".3"/>
  <stop offset=".4" stop-color="#FFFFFF" stop-opacity=".04"/>
  <stop offset=".5" stop-color="#000000" stop-opacity=".2"/>
  <stop offset=".525" stop-color="#000000" stop-opacity=".4"/>
  <stop offset=".64" stop-color="#000000" stop-opacity=".14"/>
  <stop offset=".84" stop-color="#000000" stop-opacity=".04"/>
  <stop offset=".93" stop-color="#FFFFFF" stop-opacity=".1"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".22"/>
</linearGradient>
<radialGradient id="skin-liquid-chrome-surface" cx=".5" cy=".12" r="1.1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".06"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity=".01"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".28"/>
</radialGradient>
<linearGradient id="skin-liquid-chrome-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity=".55"/>
  <stop offset=".18" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset=".46" stop-color="#FFFFFF" stop-opacity=".12"/>
  <stop offset=".6" stop-color="#FFFFFF" stop-opacity=".03"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".6"/>
</linearGradient>
<linearGradient id="skin-liquid-chrome-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity=".55"/>
  <stop offset=".5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".04"/>
</linearGradient>
<linearGradient id="skin-liquid-chrome-facet" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".26"/>
  <stop offset=".5" stop-color="#FFFFFF" stop-opacity=".02"/>
  <stop offset=".5" stop-color="#000000" stop-opacity=".16"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".36"/>
</linearGradient>
<radialGradient id="skin-liquid-chrome-silver" cx=".36" cy=".3" r=".76">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".9"/>
  <stop offset=".3" stop-color="#FFFFFF" stop-opacity=".3"/>
  <stop offset=".56" stop-color="#000000" stop-opacity=".03"/>
  <stop offset=".78" stop-color="#000000" stop-opacity=".42"/>
  <stop offset=".9" stop-color="#000000" stop-opacity=".22"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".3"/>
</radialGradient>
<radialGradient id="skin-liquid-chrome-black" cx=".36" cy=".3" r=".8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".34"/>
  <stop offset=".3" stop-color="#FFFFFF" stop-opacity=".09"/>
  <stop offset=".6" stop-color="#000000" stop-opacity=".1"/>
  <stop offset=".82" stop-color="#000000" stop-opacity=".55"/>
  <stop offset=".93" stop-color="#FFFFFF" stop-opacity=".08"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity=".24"/>
</radialGradient>
<linearGradient id="skin-liquid-chrome-gunmetal" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity=".2"/>
  <stop offset=".46" stop-color="#FFFFFF" stop-opacity=".03"/>
  <stop offset=".5" stop-color="#000000" stop-opacity=".22"/>
  <stop offset="1" stop-color="#000000" stop-opacity=".4"/>
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
uniform vec3 u_c1; // page: the dark between reflections
uniform vec3 u_c2; // chrome silver: the studio horizon
uniform vec3 u_c3; // electric blue: the rim light
uniform vec3 u_c4; // surface: the metal body
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
    a *= 0.36;
  }
  return v;
}

// The liquid: two fbm layers, both domain-warped by a drift of 0.06 units a
// second, plus a slow ripple spreading from the pointer.
float height(vec2 p, vec2 rp, float t) {
  vec2 d = vec2(t * 0.06, t * 0.035);
  vec2 w = vec2(vnoise(p * 0.6 + d), vnoise(p * 0.6 - d + 4.7)) - 0.5;
  float a = fbm(p + 1.4 * w + d);
  float b = fbm(p * 1.9 - 0.7 * w - d * 0.6 + 7.3);
  float r = length(rp);
  float ripple = sin(r * 30.0 - t * 2.0) * exp(-r * 6.0);
  return a * 0.75 + b * 0.25 + ripple * 0.008;
}

// Fake studio environment indexed by the reflected ray's height: a dark
// floor, one bright horizon band above eye level (so a flat surface stays
// dark), a dim ceiling and a blue rim light below.
vec3 env(float y) {
  float horizon = exp(-pow((y - 0.34) / 0.06, 2.0));
  float ceiling = smoothstep(0.34, 1.0, y) * 0.08;
  float rim = exp(-pow((y + 0.4) / 0.07, 2.0));
  return u_c2 * (horizon * 0.9 + ceiling) + u_c3 * rim * 0.5;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;
  // Stretched sideways so the reflections run as horizontal streaks.
  vec2 p = vec2(uv.x * aspect * 1.1, uv.y * 1.7);

  // Pointer offset in the same units (parked far away until it moves).
  float live = step(0.5, u_pointer.x + u_pointer.y);
  vec2 rp = (gl_FragCoord.xy - u_pointer) / u_resolution.y * 1.4 * live + (1.0 - live) * 50.0;

  // Normal from finite differences of the height field.
  float e = 0.01;
  float h0 = height(p, rp, t);
  float hx = height(p + vec2(e, 0.0), rp + vec2(e, 0.0), t);
  float hy = height(p + vec2(0.0, e), rp + vec2(0.0, e), t);
  vec3 n = normalize(vec3(-(hx - h0), -(hy - h0), e * 1.5));

  // Mirror reflection of a straight-on view, read against the environment.
  vec3 r = 2.0 * n.z * n - vec3(0.0, 0.0, 1.0);
  vec3 reflected = env(r.y + 0.1 * r.x);

  // One key light up and to the left, tight specular.
  vec3 l = normalize(vec3(-0.4, 0.8, 0.45));
  float spec = pow(max(dot(r, l), 0.0), 24.0);
  float fresnel = pow(1.0 - n.z, 2.0);

  // Near-black metal body, then the reflections on top.
  vec3 col = mix(u_c1, u_c4, 0.08 + 0.3 * h0);
  col += reflected * 0.36;
  col += u_c2 * spec * 0.25;
  col += u_c2 * fresnel * 0.04;

  // The top and bottom bands of the viewport hold the topbar and footer:
  // keep the reflections quiet there so text on the bare shader reads.
  float quiet = smoothstep(0.0, 150.0, u_resolution.y - gl_FragCoord.y) * smoothstep(0.0, 110.0, gl_FragCoord.y);
  col = mix(u_c1, col, 0.5 + 0.5 * quiet);

  // Legibility: cap the brightest reflections.
  float l0 = luma(col);
  float lmax = mix(0.42, 0.38, u_dark);
  if (l0 > lmax) col *= lmax / l0;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#07080B", "#C9D3E6", "#6FA8FF", "#111319"],
    speed: 1,
    fps: 60,
    stillAt: 8,
  },
  preview: "linear-gradient(172deg, #07080B 0%, #3B4252 26%, #C9D3E6 36%, #15181F 48%, #07080B 70%, #1B1F28 88%, #6FA8FF 100%)",
};
