// SPDX-License-Identifier: GPL-3.0-or-later
// Chrysler Lacquer: black lacquer, brushed brass and ivory under a light that
// rakes across fluted panels (skin-contract.md §2). Identity comes from the
// material only: brass hairlines on every edge, ivory on near-black, a
// malachite second point, and an inscriptional serif for headings and
// numerals. No ornament, no decorative copy.
const DISPLAY =
  '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const P = 'html[data-skin="chrysler-lacquer"]';

export default {
  id: "chrysler-lacquer",
  name: "Chrysler Lacquer",
  description: "Black lacquer, brushed brass and ivory under raking light.",
  scheme: "dark",
  tokens: {
    page: "#0C0D12",
    surface: "#15171F",
    surface2: "#1E2130",
    surface3: "#272B3B",
    glass: "rgba(21,23,31,.88)",
    line: "rgba(214,178,94,.22)",
    lineStrong: "rgba(214,178,94,.42)",
    lineOpaque: "#3B3526",
    controlBorder: "rgba(214,178,94,.5)",
    ink: "#F3EAD3",
    muted: "#B3A98C",
    soft: "#857C66",
    accent: "#D6B25E",
    accent2: "#F0D27A",
    accentSoft: "rgba(214,178,94,.13)",
    onAccent: "#1A1407",
    good: "#8ED6A8",
    bad: "#F08A7A",
    warn: "#F0D27A",
    info: "#9CD3F0",
    goodSoft: "rgba(142,214,168,.14)",
    badSoft: "rgba(240,138,122,.14)",
    warnSoft: "rgba(240,210,122,.14)",
    infoSoft: "rgba(156,211,240,.14)",
    radiusSm: "2px",
    radiusMd: "2px",
    radiusLg: "2px",
    radiusPill: "2px",
    shadowTile: "0 1px 0 rgba(240,210,122,.06), 0 14px 32px -16px rgba(0,0,0,.7)",
    shadowRaised: "0 1px 0 rgba(240,210,122,.1), 0 24px 56px -20px rgba(0,0,0,.8)",
    shadowSheet: "0 -18px 48px -24px rgba(0,0,0,.9)",
    fontSans:
      '"Avenir Next", "Helvetica Neue", Helvetica, system-ui, -apple-system, "Segoe UI", sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#B8923E",
    border: "#F0D27A",
    surface: "#111218",
    bar: "#0A0A0E",
    tray: "#15161E",
    pointA: "#9A7A2E",
    pointB: "#2F6E62",
    numbers: "#14110A",
    caption: "#F3EAD3",
    checker0: "#F4EBD3",
    rim0: "#B8923E",
    detail0: "#D9C9A0",
    count0: "#1A1407",
    checker1: "#1B1A20",
    rim1: "#D6B25E",
    detail1: "#A58C4A",
    count1: "#F0D27A",
    die0: "#F4EBD3",
    pips0: "#1B1A20",
    dieBorder0: "#B8923E",
    die1: "#1B1A20",
    pips1: "#F0D27A",
    dieBorder1: "#D6B25E",
    cube: "#D6B25E",
    cubeText: "#1A1407",
    cubeBorder: "#F0D27A",
    source: "#F6EBC8",
    selection: "#FFF4D6",
    destination: "#9CD3F0",
    destinationText: "#0B1A26",
    undo: "#F08A7A",
    undoText: "#1A0A08",
    hover: "#BFE3FF",
    focus: "#E8F4FF",
  },
  patterns: {},
  css: `
/* Type: an inscriptional serif for headings and numerals, Avenir for body. */
${P} { font-variant-numeric: lining-nums tabular-nums; }
${P} .tool-head h1, ${P} .hero h1, ${P} .panel-head h2, ${P} .panel-head h3,
${P} .panel-title, ${P} .dialog-head h2, ${P} .tile h3,
${P} .docs-body h1, ${P} .docs-body h2, ${P} .docs-body h3 {
  font-family: ${DISPLAY};
  font-weight: 600;
  letter-spacing: .02em;
}
${P} .tool-head h1 { letter-spacing: .03em; }
${P} .hero h1 {
  font-weight: 600;
  letter-spacing: .01em;
  background: none; /* the hub clips its title to a gradient; here it is plain ivory */
  color: var(--ink);
}
${P} .player-stats, ${P} .equity-number { font-family: ${DISPLAY}; font-weight: 600; }

/* Chrome: flat lacquer surfaces, one brass hairline on the lit edge. */
${P} .topbar { border-bottom: 1px solid var(--line); }
${P} .tool-nav a { border-radius: 2px; }
${P} .tool-nav a[aria-current="page"] {
  background: transparent;
  box-shadow: inset 0 -2px 0 var(--accent);
}
${P} .panel, ${P} .inspector, ${P} .tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top-color: var(--accent);
  border-bottom-color: var(--surface-2);
  box-shadow: none;
}
${P} .tile:hover, ${P} .tile:focus-visible {
  border-color: var(--line-strong);
  border-top-color: var(--accent-2);
  border-bottom-color: var(--surface-2);
  box-shadow: var(--shadow-raised);
}
${P} .panel-head { border-bottom-color: var(--line); }
${P} .panel-foot { border-top-color: var(--line); }
${P} .player-strip { border-radius: 2px; }
${P} .player-strip.active {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}
${P} .equity-meter { border-radius: 2px; border-color: var(--line-strong); }
${P} .equity-retry { border-radius: 2px; }

/* Buttons: machined brass primary, hairline ghost, coral outline danger. */
${P} .btn { border-radius: 2px; letter-spacing: .01em; }
${P} .btn--primary { box-shadow: inset 0 1px 0 var(--accent-2); }
${P} .btn--primary:hover { background: var(--accent-2); border-color: var(--accent-2); }
${P} .btn--primary:active { box-shadow: none; }
${P} .btn--ghost { border-color: var(--line-strong); color: var(--ink); }
${P} .btn--ghost:hover { background: var(--accent-soft); border-color: var(--accent); }
${P} .btn--danger { background: transparent; border-color: var(--bad); color: var(--ink); }
${P} .btn--danger:hover, ${P} .btn--danger:active { background: var(--bad); color: var(--on-accent); }
${P} .btn[aria-pressed="true"] { border-color: var(--accent); }

/* Segmented, tabs, fields: square, with the brass line under the chosen one. */
${P} .segmented { border-radius: 2px; background: var(--surface); }
${P} .segmented > label, ${P} .segmented > button { border-radius: 2px; }
${P} .segmented > label:has(input:checked), ${P} .segmented > button[aria-pressed="true"],
${P} .segmented > button[aria-checked="true"], ${P} .segmented > [aria-selected="true"] {
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px var(--line-strong), inset 0 -2px 0 var(--accent);
}
${P} .tabs > [role="tab"] { border-radius: 0; }
${P} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${P} .field select, ${P} .field textarea {
  border-radius: 2px;
  background: var(--page);
  box-shadow: inset 0 -1px 0 var(--line-strong);
}
${P} .field input:focus-visible, ${P} .field select:focus-visible, ${P} .field textarea:focus-visible {
  border-color: var(--accent);
}

/* Dialog: a 2px brass frame, serif title, lacquer surface; nothing else. */
${P} .dialog { border: 2px solid var(--accent); border-radius: 2px; }
${P} .dialog-head { border-bottom-color: var(--line); }
${P} .dialog-foot { border-top-color: var(--line); }

/* Toast: ivory plate, dark text, a brass bar on the left. */
${P} .toast {
  border: 0;
  border-radius: 2px;
  background: var(--ink);
  color: var(--on-accent);
  box-shadow: inset 3px 0 0 var(--accent), var(--shadow-raised);
}
${P} .toast--alert { background: var(--ink); box-shadow: inset 3px 0 0 var(--bad), var(--shadow-raised); }
${P} .toast--good { background: var(--ink); box-shadow: inset 3px 0 0 var(--good), var(--shadow-raised); }
${P} .toast .btn--ghost { border-color: transparent; color: var(--on-accent); }
${P} .toast .btn--ghost:hover { background: var(--accent-soft); border-color: var(--accent); }
${P} .docs-toc a { border-radius: 2px; }

/* Board: brass frame, lacquer surface, brushed brass and malachite points. */
${P} .bg-board text { font-family: ${DISPLAY}; }
${P} .bg-board [data-pattern="frame"] { fill: url(#skin-chrysler-lacquer-frame); }
${P} .bg-board [data-pattern="surface"] {
  fill: url(#skin-chrysler-lacquer-lacquer);
  stroke: var(--board-border);
  stroke-width: 1;
  stroke-opacity: .6;
}
${P} .bg-board [data-pattern="bar"] { fill: url(#skin-chrysler-lacquer-bar); }
${P} .bg-board [data-pattern="tray"] {
  fill: url(#skin-chrysler-lacquer-tray);
  stroke: var(--board-border);
  stroke-width: 1;
  stroke-opacity: .5;
}
/* .point is part of the selector so the hairline outranks the kit's
   .bg-board.no-move-hints .point .point-shape { stroke: none } (Advanced mode). */
${P} .bg-board .point .point-shape {
  stroke: var(--board-rim1);
  stroke-width: 1;
  stroke-opacity: .55;
  stroke-linejoin: round;
}
${P} .bg-board .point-shape:has(+ [data-pattern="pointA"]) { fill: url(#skin-chrysler-lacquer-brass); }
${P} .bg-board .point-shape:has(+ [data-pattern="pointB"]) { fill: url(#skin-chrysler-lacquer-malachite); }
${P} .bg-board .checker[data-player="0"] > circle:first-child { fill: url(#skin-chrysler-lacquer-ivory); }
${P} .bg-board .checker[data-player="1"] > circle:first-child {
  fill: url(#skin-chrysler-lacquer-onyx);
  stroke-width: 4; /* onyx sits close to the lacquer; the brass rim keeps >= 1.5px on phone boards */
}
@media (max-width: 700px) {
  /* The solver's portrait-phone board scales to 0.37: 4.5 units keep the rim at >= 1.65px. */
  ${P} .bg-board .checker[data-player="1"] > circle:first-child { stroke-width: 4.5; }
}
${P} .bg-board [data-player="0"] .board-die-face > rect:first-child { fill: url(#skin-chrysler-lacquer-die0); }
${P} .bg-board [data-player="1"] .board-die-face > rect:first-child { fill: url(#skin-chrysler-lacquer-die1); }
${P} .bg-board .board-die-face > circle {
  stroke: var(--board-cube-border);
  stroke-width: .75;
  stroke-opacity: .55;
}
${P} .bg-board .board-cube .cube-face { fill: url(#skin-chrysler-lacquer-cube); }
`,
  defs: `
<linearGradient id="skin-chrysler-lacquer-frame" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" style="stop-color:var(--board-border)"/>
  <stop offset="0.45" style="stop-color:var(--board-frame)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-frame) 80%, black)"/>
</linearGradient>
<radialGradient id="skin-chrysler-lacquer-lacquer" cx="0.18" cy="0.1" r="0.8">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.07"/>
  <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.015"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
</radialGradient>
<linearGradient id="skin-chrysler-lacquer-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" style="stop-color:var(--board-border)" stop-opacity="0.75"/>
  <stop offset="0.03" style="stop-color:var(--board-border)" stop-opacity="0"/>
  <stop offset="0.97" style="stop-color:var(--board-border)" stop-opacity="0"/>
  <stop offset="1" style="stop-color:var(--board-border)" stop-opacity="0.75"/>
</linearGradient>
<linearGradient id="skin-chrysler-lacquer-tray" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity="0.4"/>
  <stop offset="0.35" stop-color="#000000" stop-opacity="0.05"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.03"/>
</linearGradient>
<pattern id="skin-chrysler-lacquer-brass" patternUnits="userSpaceOnUse" width="6" height="3">
  <rect width="6" height="3" style="fill:var(--board-point-a)"/>
  <rect width="6" height="1" fill="#FFFFFF" fill-opacity="0.11"/>
  <rect y="2" width="6" height="1" fill="#000000" fill-opacity="0.16"/>
</pattern>
<linearGradient id="skin-chrysler-lacquer-malachite" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" style="stop-color:color-mix(in srgb, var(--board-point-b) 86%, white)"/>
  <stop offset="0.55" style="stop-color:var(--board-point-b)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-point-b) 78%, black)"/>
</linearGradient>
<radialGradient id="skin-chrysler-lacquer-ivory" cx="0.38" cy="0.34" r="0.74">
  <stop offset="0" style="stop-color:color-mix(in srgb, var(--board-checker0) 78%, white)"/>
  <stop offset="0.55" style="stop-color:var(--board-checker0)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-checker0) 82%, black)"/>
</radialGradient>
<radialGradient id="skin-chrysler-lacquer-onyx" cx="0.38" cy="0.34" r="0.74">
  <stop offset="0" style="stop-color:color-mix(in srgb, var(--board-checker1) 84%, white)"/>
  <stop offset="0.6" style="stop-color:var(--board-checker1)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-checker1) 70%, black)"/>
</radialGradient>
<linearGradient id="skin-chrysler-lacquer-die0" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0" style="stop-color:color-mix(in srgb, var(--board-die0) 90%, white)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-die0) 86%, black)"/>
</linearGradient>
<linearGradient id="skin-chrysler-lacquer-die1" x1="0" y1="0" x2="0.4" y2="1">
  <stop offset="0" style="stop-color:color-mix(in srgb, var(--board-die1) 84%, white)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-die1) 72%, black)"/>
</linearGradient>
<linearGradient id="skin-chrysler-lacquer-cube" x1="0" y1="0" x2="0.3" y2="1">
  <stop offset="0" style="stop-color:var(--board-cube-border)"/>
  <stop offset="1" style="stop-color:color-mix(in srgb, var(--board-cube) 86%, black)"/>
</linearGradient>
`,
  shader: {
    // Raking light over fluted black lacquer. Vertical half-round flutes (about
    // 46 px each) carry a brass specular that slides across them as the light
    // turns once every 90 s; a faint brushing grain runs along the flutes and
    // the pointer adds a warm spot. Nothing else.
    fragment: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1;   // page lacquer
uniform vec3  u_c2;   // brass
uniform vec3  u_c3;   // pale brass
uniform vec3  u_c4;   // cool lacquer shadow
uniform float u_dark;

const float PI = 3.14159265;

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
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

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // Flutes about 46 px wide: a phone gets eight broad ones, a desktop thirty.
  float flutes = clamp(floor(u_resolution.x / 46.0), 8.0, 32.0);
  float fx = fract(uv.x * flutes) - 0.5;
  float ridge = cos(fx * PI);                       // 1 on the crest, 0 in the seam
  vec3 n = normalize(vec3(sin(fx * PI) * 1.3, 0.0, 1.0));

  // The light keeps a fixed elevation and sweeps from side to side once every
  // 90 s, so the specular slides across each flute at a steady brightness. At
  // t = 0 it rakes in from the upper left, which is also the reduced-motion frame.
  float a = radians(-37.0) + u_time * (2.0 * PI / 90.0);
  vec3 L = normalize(vec3(0.85 * sin(a), 0.35, 0.7));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n, H), 0.0), 48.0);

  // Lacquer body: a hair lighter toward the top, cooler and darker in the seams.
  vec3 body = u_c1 * (0.72 + 0.30 * uv.y);
  vec3 seam = mix(u_c4 * 0.4, u_c1 * 0.6, 0.5);
  vec3 col = mix(seam, body, smoothstep(0.0, 0.6, ridge));

  // Brushing along the flutes.
  float grain = noise(vec2(uv.x * flutes * 3.0, uv.y * 240.0)) - 0.5;
  col += grain * 0.02;

  // Brass on each crest: a whisper of diffuse and a tight specular (18% max).
  col += u_c2 * (diff * 0.03 + spec * 0.18);

  // Pointer: a faint warm spot, absent until the pointer has moved.
  float moved = step(0.5, length(u_pointer));
  vec2 m = (u_pointer / u_resolution - uv) * vec2(aspect, 1.0);
  col += u_c3 * exp(-dot(m, m) * 8.0) * 0.06 * moved;

  // Vignette.
  vec2 q = uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.5;

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#0C0D12", "#D6B25E", "#F0D27A", "#1E2130"],
    speed: 1,
    fps: 60,
    stillAt: 0,
  },
  preview: "linear-gradient(135deg, #0C0D12, #1E2130 55%, #D6B25E)",
};
