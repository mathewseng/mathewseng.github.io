// SPDX-License-Identifier: GPL-3.0-or-later
// Woodblock Indigo: a nishiki-e print on washi. Sumi keylines hold flat asagi
// and kihada blocks; depth is a second block printed slightly off register,
// never a shadow; the sky is a bokashi wipe with one faint crest at the foot.
const ID = "ukiyo-e-woodblock";
const S = `html[data-skin="${ID}"]`;

const css = `
/* ---- type and page ---- */
${S} body { font-variant-numeric: lining-nums tabular-nums; }
${S} .tool-head h1 { font-weight: 700; letter-spacing: 0.01em; line-height: 1.3; }
${S} .hero h1 { font-weight: 700; letter-spacing: 0; background: none; color: var(--ink); -webkit-text-fill-color: var(--ink); }
${S} .panel-head h2, ${S} .panel-head h3, ${S} .panel-title, ${S} .dialog-head h2 { font-weight: 700; letter-spacing: 0; }

/* ---- topbar and navigation: the key block ---- */
${S} .topbar { border-bottom: 1.5px solid var(--ink); }
${S} .crumbs .mark { border: 1.5px solid var(--ink); border-radius: var(--r-sm); background: var(--surface); box-shadow: none; }
${S} .crumbs a:hover .mark { border-color: var(--ink); box-shadow: 2px 2px 0 0 var(--line); }
${S} .tool-nav a { border-radius: var(--r-sm); color: var(--ink); }
${S} .tool-nav a[aria-current] { background: var(--accent-2); color: var(--on-accent); box-shadow: inset 0 0 0 1.5px var(--ink); }

/* ---- containers: flat washi, sumi keyline, an off-register second block ---- */
${S} .panel, ${S} .inspector, ${S} .tile {
  border: 1.5px solid var(--ink);
  border-radius: var(--r-sm);
  background: var(--surface);
  box-shadow: var(--shadow-tile);
}
${S} .panel-head, ${S} .panel-foot { border-color: var(--line); }
${S} .tile::before, ${S} .tile::after { display: none; }
${S} .tile:hover, ${S} .tile:focus-visible { translate: 0 0; border-color: var(--ink); box-shadow: var(--shadow-raised); }
${S} .tile:active { translate: 0 0; }
${S} .player-strip { border-radius: var(--r-sm); }
${S} .player-strip.active { background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--ink); }
${S} .checker-dot { box-shadow: 0 0 0 1.5px var(--ink); }

/* ---- buttons: vermilion seal, washi ghost, sumi danger ---- */
${S} .btn {
  border: 1.5px solid var(--ink);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--ink);
  box-shadow: none;
}
${S} .btn:hover { background: var(--surface-2); border-color: var(--ink); }
${S} .btn:active { background: var(--surface-3); }
${S} .btn--primary { background: var(--accent); border-color: var(--ink); color: var(--on-accent); }
${S} .btn--primary:hover { background: color-mix(in oklab, var(--accent) 88%, black); border-color: var(--ink); }
${S} .btn--primary:active { background: color-mix(in oklab, var(--accent) 78%, black); }
${S} .btn--ghost { background: var(--surface); border-color: var(--ink); color: var(--ink); }
${S} .btn--ghost:hover { background: var(--surface-2); border-color: var(--ink); color: var(--ink); }
${S} .btn--danger { background: var(--ink); border-color: var(--accent); color: var(--on-accent); }
${S} .btn--danger:hover { background: var(--accent); border-color: var(--ink); color: var(--on-accent); }
${S} .btn[aria-pressed="true"] { background: var(--accent-2); border-color: var(--ink); color: var(--on-accent); }
/* Id-level base rules recolour pressed labels; keep them washi on the indigo block. */
${S} #equity-toggle[aria-pressed="true"], ${S} .btn--ghost[aria-pressed="true"] { color: var(--on-accent); }

/* ---- segmented and tabs: keyline boxes, the chosen one printed indigo ---- */
${S} .segmented { padding: 3px; gap: 3px; border: 1.5px solid var(--ink); border-radius: var(--r-sm); background: var(--surface); }
${S} .segmented > label, ${S} .segmented > button { border-radius: 3px; color: var(--ink); }
${S} .segmented > label:has(input:checked),
${S} .segmented > button[aria-pressed="true"],
${S} .segmented > button[aria-checked="true"],
${S} .segmented > [aria-selected="true"] { background: var(--accent-2); color: var(--on-accent); box-shadow: none; }
${S} .tabs { gap: 6px; padding-bottom: 2px; border-bottom: 0; }
${S} .tabs > [role="tab"] { border: 1.5px solid var(--ink); border-radius: var(--r-sm); background: var(--surface); color: var(--ink); }
${S} .tabs > [role="tab"]:hover { background: var(--surface-2); }
${S} .tabs > [role="tab"][aria-selected="true"], ${S} .tabs.has-indicator > [role="tab"][aria-selected="true"] { background: var(--accent-2); color: var(--on-accent); box-shadow: none; }
${S} .tabs.has-indicator::after { display: none; }
${S} .tabs--pill > [role="tab"] { border-radius: var(--r-sm); }

/* ---- fields ---- */
${S} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${S} .field select,
${S} .field textarea { border: 1.5px solid var(--ink); border-radius: var(--r-sm); background: var(--surface); }
${S} .field input:hover, ${S} .field select:hover, ${S} .field textarea:hover { border-color: var(--ink); }
${S} .field > label, ${S} .field-label { font-weight: 400; }

/* ---- dialogs and toasts: washi sheets with a bokashi band; indigo blocks ---- */
${S} .dialog {
  border: 1.5px solid var(--ink);
  border-radius: var(--r-sm);
  background: linear-gradient(180deg, var(--info-soft), transparent 48px), var(--surface);
  box-shadow: var(--shadow-raised);
}
${S} .dialog-head { border-color: var(--line); }
${S} .dialog-foot { border-color: var(--line); background: var(--surface); }
${S} .toast {
  border: 1.5px solid var(--ink);
  border-radius: var(--r-sm);
  background: var(--accent-2);
  color: var(--on-accent);
  box-shadow: var(--shadow-raised);
}
${S} .toast--alert { background: var(--ink); border-color: var(--accent); color: var(--on-accent); }
${S} .toast--good { background: var(--good); border-color: var(--ink); }

/* ---- board: the printed blocks ---- */
${S} .bg-board text { font-family: var(--font-sans); }
${S} .bg-board [data-pattern="frame"] { fill: url(#skin-${ID}-frame); }
${S} .bg-board [data-pattern="surface"] { fill: var(--board-surface); filter: url(#skin-${ID}-kozo); opacity: 0.1; }
${S} .bg-board [data-pattern="bar"] { fill: url(#skin-${ID}-bar); }
${S} .bg-board [data-pattern="tray"] { stroke: var(--board-border); stroke-width: 1.2; }
${S} .bg-board .point-shape { stroke: var(--board-border); stroke-width: 1.2; stroke-linejoin: round; }
${S} .bg-board [data-pattern="pointA"][d*=" 38 L"], ${S} .bg-board [data-pattern="pointB"][d*=" 38 L"] { fill: url(#skin-${ID}-tip-down); }
${S} .bg-board [data-pattern="pointA"][d*=" 622 L"], ${S} .bg-board [data-pattern="pointB"][d*=" 622 L"] { fill: url(#skin-${ID}-tip-up); }
${S} .bg-board .checker > circle:first-child { stroke-width: 2; }
${S} .bg-board .checker [data-pattern="checker0"] { fill: url(#skin-${ID}-chk0); }
${S} .bg-board .checker [data-pattern="checker1"] { fill: url(#skin-${ID}-chk1); }
${S} .bg-board .board-die-face > rect:first-child { stroke-width: 1.5; }
${S} .bg-board .board-die-face [data-pattern="die0"], ${S} .bg-board .board-die-face [data-pattern="die1"] { fill: url(#skin-${ID}-die); }
${S} .bg-board .board-cube .cube-face { stroke-width: 1.5; }
${S} .bg-board .board-cube [data-pattern="cube"] {
  fill: none;
  stroke: var(--board-cube-text);
  stroke-width: 1.2;
  transform: scale(0.86);
  transform-box: fill-box;
  transform-origin: center;
}
`;

const defs = `
<linearGradient id="skin-${ID}-frame" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.55" stop-color="#000000" stop-opacity="0.1"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0.3"/>
</linearGradient>
<filter id="skin-${ID}-kozo" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="0.004 0.07" numOctaves="3" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.24  0 0 0 0 0.12  0 0 0 1 0"/>
</filter>
<linearGradient id="skin-${ID}-bar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.1" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.1" style="stop-color:var(--board-surface)"/>
  <stop offset="0.13" style="stop-color:var(--board-surface)"/>
  <stop offset="0.13" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.87" stop-color="#000000" stop-opacity="0"/>
  <stop offset="0.87" style="stop-color:var(--board-surface)"/>
  <stop offset="0.9" style="stop-color:var(--board-surface)"/>
  <stop offset="0.9" stop-color="#000000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000000" stop-opacity="0"/>
</linearGradient>
<linearGradient id="skin-${ID}-tip-down" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.16"/>
</linearGradient>
<linearGradient id="skin-${ID}-tip-up" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0.16"/>
</linearGradient>
<radialGradient id="skin-${ID}-chk0" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0.66" style="stop-color:var(--board-detail0)" stop-opacity="0"/>
  <stop offset="1" style="stop-color:var(--board-detail0)" stop-opacity="0.55"/>
</radialGradient>
<radialGradient id="skin-${ID}-chk1" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.09"/>
  <stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.02"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</radialGradient>
<linearGradient id="skin-${ID}-die" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/>
  <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
</linearGradient>
`;

// A bokashi sky over washi. Kozo fibre (stretched fbm, ±0.02), an indigo wipe
// from the top whose edge drifts like a hand-wiped gradient and dips under the
// pointer, and one faint wave crest along the foot advancing at 6 px/s.
const fragment = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1;
uniform vec3  u_c2;
uniform vec3  u_c3;
uniform vec3  u_c4;
uniform float u_dark;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
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
float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}
// Signed vertical distance to a sine crest; positive above the curve.
float crest(vec2 p, float base, float amp, float period, float shift) {
  float phase = fract((p.x - shift) / period) * 6.2831853;
  return p.y - (base + amp * sin(phase));
}

void main() {
  vec2 res = u_resolution;
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / res;
  float aspect = res.x / res.y;
  float t = u_time;

  // 1. washi: kozo fibre, 3-octave fbm stretched 4:1 horizontally.
  float fibre = fbm3(vec2(uv.x * aspect * 0.4, uv.y) * 22.0) - 0.5;
  float strand = fbm3(vec2(uv.x * aspect * 0.12, uv.y) * 90.0 + 3.1) - 0.5;
  vec3 col = u_c1 + fibre * 0.04 + strand * 0.012;
  col = mix(col, u_c3, max(strand, 0.0) * 0.04);

  // 2. bokashi: asagi from the top, gone by a third of the height, the edge
  //    wiped unevenly and drifting; the pointer pushes it down up to 30 px.
  float edge = 0.68 + (fbm3(vec2(uv.x * 2.2, 3.7) + t * 0.012) - 0.5) * 0.14;
  float moved = step(0.5, length(u_pointer));
  float pd = length(px - u_pointer);
  edge -= moved * (30.0 / res.y) * (1.0 - smoothstep(0.0, 300.0, pd));
  float sky = smoothstep(edge, edge + 0.36, uv.y);
  sky *= 0.17 + 0.03 * (fbm3(vec2(uv.x * 4.0, uv.y * 3.0)) - 0.5);
  col = mix(col, u_c2, clamp(sky, 0.0, 0.18));

  // 3. one faint crest along the foot: amplitude 3% of the height, period
  //    1.3 widths, advancing at 6 px/s; a wash below it and a thin keyline.
  float shift = t * 6.0 / res.x;
  float aa = 1.5 / res.y;
  float sd = crest(uv, 0.07, 0.03, 1.3, shift);
  float wash = 1.0 - smoothstep(0.0, aa, sd);
  float line = 1.0 - smoothstep(0.0, aa * 1.4, abs(sd));
  col = mix(col, u_c2, wash * 0.05);
  col = mix(col, u_c4, line * 0.14);

  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: ID,
  name: "Woodblock Indigo",
  description: "Sumi keylines, flat indigo and ochre blocks on warm washi.",
  scheme: "light",
  tokens: {
    page: "#EFE3C8",
    surface: "#F6ECD6",
    surface2: "#E6D7B6",
    surface3: "#DCCBA4",
    glass: "rgba(246,236,214,.84)",
    line: "#C9B78F",
    lineStrong: "#1E2230",
    lineOpaque: "#C9B78F",
    controlBorder: "#1E2230",
    ink: "#1E2230",
    muted: "#54534B",
    soft: "#7A766A",
    accent: "#B3301F",
    accent2: "#1F3A5F",
    accentSoft: "rgba(179,48,31,.08)",
    onAccent: "#FBF3E2",
    good: "#2F6B3E",
    bad: "#B3301F",
    warn: "#8A5A00",
    info: "#1F3A5F",
    goodSoft: "rgba(47,107,62,.14)",
    badSoft: "rgba(179,48,31,.14)",
    warnSoft: "rgba(138,90,0,.16)",
    infoSoft: "rgba(74,120,168,.22)",
    radiusSm: "6px",
    radiusMd: "6px",
    radiusLg: "6px",
    radiusPill: "6px",
    shadowTile: "3px 3px 0 0 var(--line)",
    shadowRaised: "4px 4px 0 0 var(--line)",
    shadowSheet: "0 -1.5px 0 0 var(--ink)",
    fontSans:
      "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', 'Iowan Old Style', Charter, Georgia, serif",
    fontMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
  board: {
    frame: "#1F3A5F",
    border: "#1E2230",
    surface: "#F3E8CF",
    bar: "#1E2230",
    tray: "#E6D7B6",
    pointA: "#4A78A8",
    pointB: "#D99A3E",
    numbers: "#FBF3E2",
    caption: "#1E2230",
    checker0: "#F8F1E0",
    rim0: "#1E2230",
    detail0: "#D99A3E",
    count0: "#1E2230",
    checker1: "#1B1D24",
    rim1: "#4A78A8",
    detail1: "#F8F1E0",
    count1: "#FBF3E2",
    die0: "#F8F1E0",
    pips0: "#B3301F",
    dieBorder0: "#1E2230",
    die1: "#1E2230",
    pips1: "#FBF3E2",
    dieBorder1: "#4A78A8",
    cube: "#B3301F",
    cubeText: "#FBF3E2",
    cubeBorder: "#1E2230",
    source: "#2F6B3E",
    selection: "#B3301F",
    destination: "#1E2230",
    destinationText: "#FBF3E2",
    undo: "#7D4A0B",
    undoText: "#FBF3E2",
    hover: "#1F3A5F",
    focus: "#1F3A5F",
  },
  patterns: {},
  css,
  defs,
  shader: {
    fragment,
    colors: ["#EFE3C8", "#4A78A8", "#D99A3E", "#1F3A5F"],
    speed: 1,
    fps: 30,
    stillAt: 20,
  },
  preview:
    "linear-gradient(135deg, #EFE3C8 0 52%, #1E2230 52% 54%, #4A78A8 54% 74%, #1E2230 74% 76%, #D99A3E 76%)",
};
