// SPDX-License-Identifier: GPL-3.0-or-later
// Gloaming: the last ten minutes of a warm dusk. An apricot horizon sinks
// into violet under a near-black sky; the board is a flat plum slab lit from
// one low side (bottom-left), so rims catch light on their lower-left edge and
// shadows fall up and to the right. Colour fields, not lines: the identity is
// the warm/cool gradient and the single directional light.
const ID = "gloaming";
const S = `html[data-skin="${ID}"]`;

export default {
  id: ID,
  name: "Gloaming",
  description: "Apricot dusk sinking into violet, lit from one low side.",
  scheme: "dark",
  tokens: {
    page: "#120F1E",
    surface: "#1C1730",
    surface2: "#251F3D",
    surface3: "#2E274A",
    glass: "rgba(28,23,48,.74)",
    line: "rgba(246,238,230,.12)",
    lineStrong: "rgba(246,238,230,.2)",
    lineOpaque: "#3A3156",
    controlBorder: "rgba(246,238,230,.3)",
    ink: "#F6EEE6",
    muted: "#B7A9B8",
    // soft sits on the shader's warm band (footer links, crumb separators), so
    // it is lifted to read at 4.5:1 over the band's brightest pixel.
    soft: "#A496AA",
    accent: "#FF9A5C",
    accent2: "#FFD166",
    accentSoft: "rgba(255,154,92,.16)",
    onAccent: "#2A1206",
    good: "#8FE3B4",
    bad: "#FF6B7A",
    warn: "#FFD166",
    info: "#B5A6E6",
    goodSoft: "rgba(143,227,180,.16)",
    badSoft: "rgba(255,107,122,.16)",
    warnSoft: "rgba(255,209,102,.16)",
    infoSoft: "rgba(181,166,230,.16)",
    radiusSm: "10px",
    radiusMd: "12px",
    radiusLg: "14px",
    radiusPill: "999px",
    // No hard borders: a 1px ring at 18% ink, a 1px top highlight (lit from
    // above), and a 24px shadow tinted with the deepest dusk colour.
    shadowTile:
      "0 0 0 1px rgba(246,238,230,.18), inset 0 1px 0 rgba(255,255,255,.08), 0 24px 24px -12px rgba(10,6,22,.8)",
    shadowRaised:
      "0 0 0 1px rgba(246,238,230,.18), inset 0 1px 0 rgba(255,255,255,.08), 0 32px 48px -16px rgba(10,6,22,.9)",
    shadowSheet:
      "0 0 0 1px rgba(246,238,230,.18), inset 0 1px 0 rgba(255,255,255,.08), 0 -24px 48px -16px rgba(10,6,22,.9)",
    fontSans:
      "-apple-system, 'Segoe UI Variable Text', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    fontMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
  board: {
    frame: "#2A2140",
    border: "#1A1328",
    surface: "#1A1528",
    bar: "#0F0C1A",
    tray: "#0F0C1A",
    pointA: "#E0683F",
    pointB: "#655596",
    numbers: "#B7A9B8",
    caption: "#B7A9B8",
    checker0: "#FBE9D3",
    rim0: "#C9A37A",
    detail0: "#EFD9BE",
    count0: "#2A1206",
    checker1: "#1B1026",
    rim1: "#A898D6",
    detail1: "#3A2D52",
    count1: "#F6EEE6",
    die0: "#FFF2E2",
    pips0: "#2A1206",
    dieBorder0: "#D9C3A8",
    die1: "#1B1026",
    pips1: "#FFF2E2",
    dieBorder1: "#A898D6",
    cube: "#FFB27A",
    cubeText: "#2A1206",
    cubeBorder: "#E08A52",
    source: "#7DF5E2",
    selection: "#7DF5E2",
    destination: "#7DF5E2",
    destinationText: "#0F0C1A",
    undo: "#FFD166",
    undoText: "#2A1206",
    hover: "#B5F9EE",
    focus: "#FFE59A",
  },
  patterns: {},
  css: `
/* Type: humanist sans at 400/500, lining proportional numerals, sentence case. */
${S} body { font-weight: 400; font-variant-numeric: lining-nums proportional-nums; }
${S} .tool-head h1, ${S} .hero h1, ${S} .dialog-head h2, ${S} .docs-body h1, ${S} .docs-body h2, ${S} .docs-body h3 { font-weight: 500; letter-spacing: -0.01em; text-transform: none; }
${S} .panel-head h2, ${S} .panel-head h3, ${S} .panel-title, ${S} .tile h3, ${S} .docs-toc-title { font-weight: 500; letter-spacing: 0; text-transform: none; }
${S} .tool-nav a, ${S} .tabs > [role="tab"], ${S} .segmented > label, ${S} .segmented > button, ${S} .field > label, ${S} .field-label, ${S} .crumbs a { font-weight: 500; letter-spacing: 0.01em; text-transform: none; }

/* Chrome: no hard borders; panels float on a 1px ring and a dusk-tinted shadow. */
${S} .topbar { padding: 6px 0; }
${S} .tool-nav a { border-radius: var(--r-sm); }
${S} .tool-nav a[aria-current="page"] { color: var(--accent); background: var(--accent-soft); }
${S} .panel, ${S} .inspector, ${S} .tile { border-color: transparent; background: var(--surface); box-shadow: var(--shadow-tile); }
${S} .panel--quiet { box-shadow: 0 0 0 1px var(--line); }
${S} .panel-head, ${S} .panel-foot { border-color: var(--line); }
${S} .tile::after { display: none; }
${S} .tile:hover, ${S} .tile:focus-visible { border-color: transparent; box-shadow: var(--shadow-raised); }

${S} .btn { border-color: transparent; border-radius: var(--r-sm); background: var(--surface-3); font-weight: 500; letter-spacing: 0.01em; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
${S} .btn:hover { border-color: transparent; background: color-mix(in oklab, var(--surface-3) 86%, var(--ink)); }
${S} .btn--primary { background: var(--accent); color: var(--on-accent); box-shadow: none; }
${S} .btn--primary:hover { background: color-mix(in oklab, var(--accent) 88%, white); }
/* Ghost buttons sit on the shader (action area, trainer controls), so they keep
   their own opaque surface under the accent label in every state. */
${S} .btn--ghost { border-color: var(--accent); background: var(--surface); color: var(--accent); box-shadow: none; }
${S} .btn--ghost:hover { border-color: var(--accent); background: color-mix(in oklab, var(--surface-2) 88%, var(--accent)); color: var(--accent); }
/* A disabled ghost keeps a readable label: it goes quiet by colour, not opacity. */
${S} .btn--ghost:disabled, ${S} .btn--ghost[aria-disabled="true"] { opacity: 1; border-color: var(--line-strong); background: var(--surface); color: var(--muted); }
${S} .btn--danger { border-color: transparent; background: var(--bad); color: var(--on-accent); box-shadow: none; }
${S} .btn--danger:hover { background: color-mix(in oklab, var(--bad) 88%, white); color: var(--on-accent); }
/* Pressed state on an opaque surface so it does not depend on what lies beneath. */
${S} .btn[aria-pressed="true"], ${S} .btn[aria-pressed="true"]:hover { border-color: transparent; background: color-mix(in oklab, var(--surface-3) 88%, var(--accent)); color: var(--accent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent); }

${S} .segmented { border-color: transparent; border-radius: var(--r-sm); background: color-mix(in oklab, var(--page) 60%, var(--surface)); }
${S} .segmented > label, ${S} .segmented > button { border-radius: calc(var(--r-sm) - 3px); }
${S} .segmented > label:has(input:checked), ${S} .segmented > button[aria-pressed="true"], ${S} .segmented > button[aria-checked="true"], ${S} .segmented > [aria-selected="true"] { background: var(--surface-3); color: var(--ink); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 2px 6px rgba(10,6,22,.5); }

${S} .tabs { border-bottom-color: var(--line); }
${S} .tabs > [role="tab"] { border-radius: var(--r-sm) var(--r-sm) 0 0; }

${S} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), ${S} .field select, ${S} .field textarea { border-color: transparent; border-radius: var(--r-sm); background: color-mix(in oklab, var(--page) 60%, var(--surface)); box-shadow: inset 0 0 0 1px var(--line-strong); }
${S} .field input:hover, ${S} .field select:hover, ${S} .field textarea:hover { border-color: transparent; box-shadow: inset 0 0 0 1px var(--control-border); }
${S} .field input:focus-visible, ${S} .field select:focus-visible, ${S} .field textarea:focus-visible { box-shadow: inset 0 0 0 1px var(--accent); }

${S} .dialog { border-color: transparent; border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-raised); }
${S} .dialog-head, ${S} .dialog-foot { border-color: var(--line); }
${S} .toast { border-color: transparent; border-left: 3px solid var(--accent); border-radius: var(--r-sm); background: var(--surface-2); box-shadow: var(--shadow-raised); }
${S} .toast--alert { border-left-color: var(--bad); }
${S} .toast--good { border-left-color: var(--good); }

/* The table. The lit side is bottom-left: the active player strip takes an
   apricot left edge; the board slab keeps a flat face. */
${S} .player-strip { border-radius: var(--r-sm); }
${S} .player-strip.active { background: color-mix(in oklab, var(--surface) 86%, var(--accent)); box-shadow: inset 2px 0 0 var(--accent); }
${S} .action-area { padding-top: 12px; }
${S} .docs-toc, ${S} .docs-status { border-color: transparent; box-shadow: 0 0 0 1px var(--line); }

/* Board material. */
${S} .bg-board text { font-family: var(--font-sans); font-weight: 500; letter-spacing: 0.01em; }
${S} .bg-board .checker text, ${S} .bg-board .board-cube text { font-weight: 600; }
${S} .bg-board [data-pattern="frame"] { fill: url(#skin-${ID}-rail); }
${S} .bg-board [data-pattern="surface"] { fill: url(#skin-${ID}-warmth); stroke: var(--board-bar); stroke-width: 3; }
${S} .bg-board [data-pattern="bar"] { fill: url(#skin-${ID}-bar-well); }
${S} .bg-board [data-pattern="tray"] { fill: url(#skin-${ID}-well); }
/* Points stay flat colour fields in every mode (no outline; the engine strips
   strokes in Advanced mode, so a skin stroke would only show on some boards). */
${S} .bg-board .checker > circle:first-child { stroke-width: 2; }
${S} .bg-board .checker [data-pattern="checker0"], ${S} .bg-board .checker [data-pattern="checker1"] { fill: url(#skin-${ID}-gloss); }
${S} .bg-board .board-die-face > rect:first-child { stroke-width: 1.5; }
${S} .bg-board [data-pattern="die0"] { fill: url(#skin-${ID}-die-gloss); }
${S} .bg-board [data-pattern="die1"] { fill: url(#skin-${ID}-die-gloss-dark); }
${S} .bg-board .board-cube .cube-face { stroke-width: 1; }
${S} .bg-board [data-pattern="cube"] { fill: url(#skin-${ID}-cube-gloss); }
${S} .bg-board .board-die.consumed .board-die-face > :not(.die-status-mark) { opacity: 0.55; }
`,
  defs: `
<linearGradient id="skin-${ID}-rail" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.14"/>
  <stop offset="0.045" stop-color="#FFFFFF" stop-opacity="0.05"/>
  <stop offset="0.07" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="0.93" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.22"/>
</linearGradient>
<radialGradient id="skin-${ID}-warmth" cx="0.04" cy="0.96" r="0.8">
  <stop offset="0" stop-color="#FF9A5C" stop-opacity="0.09"/>
  <stop offset="0.55" stop-color="#FF9A5C" stop-opacity="0.025"/>
  <stop offset="1" stop-color="#FF9A5C" stop-opacity="0"/>
</radialGradient>
<linearGradient id="skin-${ID}-well" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity="0.5"/>
  <stop offset="0.5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.07"/>
</linearGradient>
<linearGradient id="skin-${ID}-bar-well" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity="0.45"/>
  <stop offset="0.5" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.06"/>
</linearGradient>
<radialGradient id="skin-${ID}-gloss" cx="0.34" cy="0.68" r="0.5">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.3"/>
  <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.08"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="skin-${ID}-die-gloss" cx="0.3" cy="0.75" r="0.6">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="skin-${ID}-die-gloss-dark" cx="0.3" cy="0.75" r="0.6">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<radialGradient id="skin-${ID}-cube-gloss" cx="0.3" cy="0.75" r="0.7">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
`,
  shader: {
    // u_c1 apricot horizon, u_c2 dusk violet, u_c3 page, u_c4 amber sun core.
    fragment: `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1, u_c2, u_c3, u_c4;
uniform float u_dark;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time;
  // Pointer drift only once the pointer has moved; (0,0) is the unmoved state.
  float moved = step(0.5, u_pointer.x + u_pointer.y);
  vec2 ptr = (u_pointer / u_resolution - 0.5) * moved;

  // Sky: a dim apricot ember along the lowest tenth, violet just above it,
  // page colour well before the middle. Text and controls can land anywhere
  // on this layer (footer, draft line, player strips), so no pixel may exceed
  // a relative luminance of about 0.03: muted and soft text then keep 4.5:1.
  vec3 horizon = u_c1 * 0.22;
  vec3 dusk = u_c2 * 0.38;
  vec3 col = mix(horizon, dusk, smoothstep(0.0, 0.10, uv.y));
  col = mix(col, u_c3, smoothstep(0.06, 0.42, uv.y));

  // Two domain-warped fbm layers as thin cirrus bands, mixed in at 3%.
  vec2 p = vec2(uv.x * aspect, uv.y) * 3.0 + vec2(t * 0.01, 0.0);
  vec2 warp = vec2(sin(p.y * 2.0 + t * 0.05), cos(p.x * 2.0 + t * 0.05)) * 0.35;
  float layerA = fbm(p + warp);
  float layerB = fbm(p * vec2(2.4, 0.9) - warp * 0.6 + vec2(3.1, 1.4));
  float bands = smoothstep(0.42, 0.72, layerA * 0.55 + layerB * 0.45);
  bands *= smoothstep(0.02, 0.12, uv.y) * (1.0 - smoothstep(0.22, 0.42, uv.y));
  col += bands * 0.03 * vec3(1.0, 0.86, 0.72);

  // A faint sun low at bottom-left: breathes, drifts 2% with the pointer.
  vec2 sunPos = vec2(0.18, 0.04) + ptr * 0.02;
  float breathe = 1.0 + sin(t * 0.3) * 0.02;
  vec2 d = vec2((uv.x - sunPos.x) * aspect, uv.y - sunPos.y);
  float sun = 1.0 - smoothstep(0.0, 0.26 * breathe, length(d));
  sun *= sun;
  col += sun * 0.04 * mix(u_c1, u_c4, 0.4);

  // Keep the upper field quiet under the UI.
  col *= 1.0 - 0.35 * smoothstep(0.55, 0.78, uv.y);

  // First stars: a sparse hash grid in the top 15% only (1 cell in 200).
  vec2 sp = vec2(uv.x * aspect, uv.y) * 90.0;
  vec2 cell = floor(sp), cf = fract(sp);
  float h = hash21(cell);
  float star = step(0.995, h);
  vec2 sc = vec2(hash21(cell + 7.3), hash21(cell + 2.1));
  float twinkle = 0.75 + 0.25 * sin(t * 1.4 + h * 6.2831);
  float glow = (1.0 - smoothstep(0.0, 0.1, length(cf - sc))) * star * twinkle;
  col += glow * 0.12 * smoothstep(0.85, 0.9, uv.y);

  // Fine dither so the long gradient never bands.
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#FF9A5C", "#655596", "#120F1E", "#FFD166"],
    speed: 1,
    fps: 30,
    stillAt: 40,
  },
  preview: "linear-gradient(180deg, #120F1E, #2A2140 45%, #4C3F72 74%, #C4653A)",
};
