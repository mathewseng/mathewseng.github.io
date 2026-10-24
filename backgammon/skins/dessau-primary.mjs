// SPDX-License-Identifier: GPL-3.0-or-later
// Dessau Primary: a printed poster, not a device. A cream field ruled with
// 2px black lines, zero radius, no tonal steps, no blur; red, cobalt and
// yellow used as material (the primary action, the two point colours, the
// cube) and never as decoration. Behind the page three flat colour fields
// drift slowly and multiply where they overlap.
const P = 'html[data-skin="dessau-primary"]';

export default {
  id: "dessau-primary",
  name: "Dessau Primary",
  description: "Cream paper, black rules, primary colours as material.",
  scheme: "light",
  tokens: {
    page: "#EFEBE1",
    surface: "#F7F4EC",
    surface2: "#E3DED1",
    surface3: "#D9D3C4",
    glass: "rgba(247,244,236,.86)",
    line: "#161616",
    lineStrong: "#161616",
    lineOpaque: "#161616",
    controlBorder: "#161616",
    ink: "#161616",
    muted: "#5A5751",
    soft: "#6E6A62",
    accent: "#C62828",
    accent2: "#1E4FA3",
    accentSoft: "rgba(198,40,40,.12)",
    onAccent: "#FFFFFF",
    good: "#1F7A3A",
    bad: "#B71C1C",
    warn: "#7A4B00",
    info: "#1E4FA3",
    goodSoft: "rgba(31,122,58,.12)",
    badSoft: "rgba(183,28,28,.12)",
    warnSoft: "rgba(122,75,0,.12)",
    infoSoft: "rgba(30,79,163,.12)",
    radiusSm: "0px",
    radiusMd: "0px",
    radiusLg: "0px",
    radiusPill: "0px",
    shadowTile: "none",
    shadowRaised: "6px 6px 0 0 rgba(22,22,22,1)",
    shadowSheet: "0 -2px 0 0 rgba(22,22,22,1)",
    fontSans:
      '"DM Sans", Futura, "Avenir Next", Jost, "Century Gothic", ui-sans-serif, system-ui, sans-serif',
    fontMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  board: {
    frame: "#161616",
    border: "#161616",
    surface: "#F7F4EC",
    bar: "#161616",
    tray: "#161616",
    pointA: "#3A6FC4",
    pointB: "#F2C230",
    numbers: "#F7F4EC",
    caption: "#161616",
    checker0: "#FFFFFF",
    rim0: "#161616",
    detail0: "#FFFFFF",
    count0: "#161616",
    checker1: "#161616",
    rim1: "#F7F4EC",
    detail1: "#FFFFFF",
    count1: "#FFFFFF",
    die0: "#FFFFFF",
    pips0: "#161616",
    dieBorder0: "#161616",
    die1: "#161616",
    pips1: "#FFFFFF",
    dieBorder1: "#161616",
    cube: "#C62828",
    cubeText: "#FFFFFF",
    cubeBorder: "#161616",
    source: "#1E4FA3",
    selection: "#C62828",
    destination: "#161616",
    destinationText: "#FFFFFF",
    undo: "#7A4B00",
    undoText: "#FFFFFF",
    hover: "#161616",
    focus: "#C62828",
  },
  patterns: {},
  css: `
/* Type: one geometric sans at medium weight, bold for labels, lining tabular
   figures, no tracking. */
${P} body { font-weight: 500; font-variant-numeric: tabular-nums lining-nums; }
${P} ::selection { background: var(--accent); color: var(--on-accent); }
${P} .tool-head h1, ${P} .hero h1, ${P} .panel-head h2, ${P} .panel-head h3,
${P} .panel-title, ${P} .dialog-head h2, ${P} .tile h3 { font-weight: 700; letter-spacing: 0; }
${P} .hero h1 { background: none; color: var(--ink); -webkit-text-fill-color: var(--ink); }

/* Topbar: a rule under the header, the mark as a black square. */
${P} .topbar { border-bottom: 2px solid var(--line); padding: 4px 0; }
${P} .mark { border: 2px solid var(--ink); border-radius: 0; background: var(--ink); color: var(--surface); box-shadow: none; }
${P} .crumbs a:hover .mark { border-color: var(--accent); background: var(--accent); color: var(--on-accent); box-shadow: none; }
${P} .crumb-current { font-weight: 700; }
${P} .tool-nav a { border-radius: 0; color: var(--muted); font-weight: 700; box-shadow: inset 0 -3px 0 transparent; }
${P} .tool-nav a:hover { color: var(--ink); background: var(--surface-2); }
${P} .tool-nav a[aria-current="page"], ${P} .tool-nav a[aria-current="true"] { color: var(--ink); background: transparent; box-shadow: inset 0 -3px 0 var(--ink); }

/* Panels: opaque white rectangles separated by rules, never shadows. */
${P} .panel, ${P} .inspector { border: 2px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: none; }
${P} .panel-head { border-bottom: 2px solid var(--line); }
${P} .panel-foot { border-top: 2px solid var(--line); }
${P} .tile { border: 2px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: none; }
${P} .tile::before, ${P} .tile::after { display: none; }
${P} .tile:hover, ${P} .tile:focus-visible { translate: 0 0; border-color: var(--ink); background: var(--surface-2); box-shadow: none; }
${P} .tile:active { translate: 0 0; }
${P} .tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
${P} .tile-icon { border-radius: 0; border: 2px solid var(--ink); background: transparent; box-shadow: none; color: var(--ink); }
${P} .tile:hover .tile-icon { scale: 1; rotate: 0deg; }
${P} .go { border: 2px solid var(--ink); border-radius: 0; color: var(--ink); }

/* Stage: the board carries its own black frame; the strips and the action
   row are ruled, the active player gets a red bar. */
${P} .board-frame, ${P} .board-slot { border-radius: 0; box-shadow: none; }
${P} .player-strip { border-radius: 0; border-left: 4px solid transparent; color: var(--muted); }
${P} .player-strip.active { border-left-color: var(--accent); background: var(--surface); color: var(--ink); }
${P} .action-area { border-top: 2px solid var(--line); padding-top: 12px; }
${P} .checker-dot { box-shadow: 0 0 0 2px var(--ink); }
${P} .badge--accent, ${P} .chip--accent { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }

/* Controls: square, 2px black outlines, solid fills for state. */
${P} .btn { border: 2px solid var(--ink); border-radius: 0; background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: none; }
${P} .btn:hover { background: var(--surface-2); border-color: var(--ink); }
${P} .btn:active { background: var(--surface-3); }
${P} .btn--primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
${P} .btn--primary:hover { background: color-mix(in oklab, var(--accent) 84%, black); border-color: color-mix(in oklab, var(--accent) 84%, black); }
${P} .btn--primary:active { background: color-mix(in oklab, var(--accent) 70%, black); }
${P} .btn--ghost { border-color: var(--surface-3); background: transparent; color: var(--ink); }
${P} .btn--ghost:hover { border-color: var(--ink); background: transparent; color: var(--ink); }
${P} .btn--danger { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: inset 4px 0 0 var(--accent); }
${P} .btn--danger:hover { background: var(--accent); border-color: var(--accent); color: var(--on-accent); box-shadow: none; }
${P} .btn[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); }
${P} #equity-toggle[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); }
${P} .segmented { gap: 0; padding: 0; border: 2px solid var(--ink); border-radius: 0; background: var(--surface); }
${P} .segmented > label, ${P} .segmented > button { border-radius: 0; color: var(--muted); font-weight: 700; }
${P} .segmented > label + label, ${P} .segmented > button + button { border-left: 2px solid var(--ink); }
${P} .segmented > label:hover, ${P} .segmented > button:hover { color: var(--ink); background: var(--surface-2); }
${P} .segmented > label:has(input:checked), ${P} .segmented > button[aria-pressed="true"],
${P} .segmented > button[aria-checked="true"], ${P} .segmented > [aria-selected="true"] { background: var(--ink); color: var(--surface); box-shadow: none; }
${P} .segmented > label:has(input:focus-visible), ${P} .segmented > button:focus-visible { outline-offset: -4px; }
${P} .tabs { border-bottom: 2px solid var(--line); gap: 0; }
${P} .tabs > [role="tab"] { border-radius: 0; font-weight: 700; }
${P} .tabs > [role="tab"][aria-selected="true"] { box-shadow: inset 0 -3px 0 var(--ink); }
${P} .tabs.has-indicator > [role="tab"][aria-selected="true"] { box-shadow: none; }
${P} .tabs.has-indicator::after { height: 3px; border-radius: 0; background: var(--ink); }
${P} .tabs--pill { border-bottom: 0; gap: 4px; }
${P} .tabs--pill > [role="tab"] { border-radius: 0; border: 2px solid transparent; }
${P} .tabs--pill > [role="tab"][aria-selected="true"], ${P} .tabs--pill.has-indicator > [role="tab"][aria-selected="true"] { background: var(--ink); color: var(--surface); box-shadow: none; }
${P} .field > label, ${P} .field-label { color: var(--ink); font-weight: 700; }
${P} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
${P} .field select, ${P} .field textarea { border: 2px solid var(--ink); border-radius: 0; background: var(--surface); }
${P} .field input:hover, ${P} .field select:hover, ${P} .field textarea:hover { border-color: var(--accent); }

/* Dialogs: a white rectangle, a black top bar, a hard offset shadow. Toasts:
   a black rectangle with white text. */
${P} .dialog { border: 2px solid var(--ink); border-top-width: 14px; border-radius: 0; background: var(--surface); box-shadow: var(--shadow-raised); }
${P} .dialog::backdrop { background: rgba(22,22,22,.42); }
${P} .dialog-head { border-bottom: 2px solid var(--ink); }
${P} .dialog-foot { border-top: 2px solid var(--ink); }
${P} .toast { border: 0; border-radius: 0; background: var(--ink); color: var(--surface); font-weight: 500; box-shadow: none; }
${P} .toast .btn { color: var(--surface); border-color: transparent; background: transparent; }
${P} .toast .btn:hover { border-color: var(--surface); }
${P} .toast--alert { background: var(--accent); color: var(--on-accent); }
${P} .toast--good { background: var(--good); color: var(--on-accent); }
${P} .docs-toc--sticky { border-bottom: 2px solid var(--line); }

/* Board: the frame and surface squared off by their overlays, hard-edged
   points with a black contour, flat discs, square dice and cube. */
${P} .bg-board [data-pattern="frame"] { fill: var(--board-frame); rx: 0; ry: 0; }
${P} .bg-board [data-pattern="surface"] { fill: var(--board-surface); rx: 0; ry: 0; }
${P} .bg-board [data-pattern="tray"] { fill: url(#skin-dessau-primary-hatch); rx: 0; ry: 0; }
${P} .bg-board .point .point-shape { stroke: var(--board-frame); stroke-width: 1.5; stroke-linejoin: miter; }
${P} .bg-board .checker > circle:first-child { stroke-width: 2; }
${P} .bg-board .board-die-face > rect:first-child { rx: 0; ry: 0; stroke-width: 1.5; }
${P} .bg-board .board-die-face [data-pattern^="die"], ${P} .bg-board .board-die-face .die-selection-accent { rx: 0; ry: 0; }
${P} .bg-board .board-die.preferred .board-die-face { filter: drop-shadow(3px 3px 0 var(--board-frame)); }
${P} .bg-board .board-die[role="button"]:active .board-die-face { filter: drop-shadow(1px 1px 0 var(--board-frame)); }
${P} .bg-board .dice-switch-surface { rx: 0; ry: 0; stroke: var(--board-frame); stroke-width: 2; }
${P} .bg-board .board-cube .cube-face { rx: 0; ry: 0; stroke-width: 1.5; }
${P} .bg-board .board-cube [data-pattern="cube"] { rx: 0; ry: 0; }
${P} .bg-board .board-cube[role="button"]:active { filter: drop-shadow(1px 1px 0 var(--board-frame)); }
${P} .drag-checker { filter: drop-shadow(3px 3px 0 var(--board-frame)); }
${P} .bg-board text { font-family: var(--font-sans); font-weight: 700; }
@media (hover: hover) and (pointer: fine) {
  ${P} .bg-board .board-die[role="button"]:not(.preferred):hover .board-die-face { filter: drop-shadow(2px 2px 0 var(--board-frame)); }
  ${P} .bg-board .board-cube[role="button"]:hover { filter: drop-shadow(2px 2px 0 var(--board-frame)); }
}
`,
  defs: `<pattern id="skin-dessau-primary-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--board-tray, #161616)"/><rect width="1.5" height="6" fill="var(--board-surface, #F7F4EC)" opacity=".55"/></pattern>`,
  shader: {
    // Three flat colour fields (a red circle, a cobalt rectangle, a long
    // yellow bar) multiplied onto the cream page at 8%, each on its own slow
    // lissajous so the overlaps keep changing hue; the nearest field leans at
    // most 1% of the viewport toward the pointer.
    fragment: `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1, u_c2, u_c3, u_c4;
uniform float u_dark;

const float TAU = 6.28318530718;

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// Two incommensurate periods (40-70 s) so the path never visibly repeats.
vec2 drift(float t, float p1, float p2, float phase, vec2 amp) {
  return amp * vec2(sin(t * TAU / p1 + phase), cos(t * TAU / p2 - phase * 0.5));
}

// The nudge toward the pointer: at most 1% of the viewport, and nothing
// until the pointer has moved.
vec2 nudge(vec2 c, vec2 ptr, float on, float aspect) {
  vec2 d = ptr - c;
  float len = max(length(d), 1e-4);
  return on * 0.01 * vec2(aspect, 1.0) * (d / len);
}

float fill(float sd, float px) {
  return 1.0 - smoothstep(-px, px, sd);
}

void main() {
  // Sized by the short side so a phone shows the same share of each field.
  vec2  res    = u_resolution;
  float unit   = min(res.x, res.y);
  float aspect = res.x / unit;
  vec2  uv     = (gl_FragCoord.xy - 0.5 * res) / unit;
  float moved  = step(0.5, length(u_pointer));
  vec2  ptr    = (u_pointer - 0.5 * res) / unit;
  float px     = 1.5 / unit;
  float t      = u_time;
  vec2  amp    = 0.04 * vec2(aspect, 1.0);

  // Resting positions: the circle upper left, the rectangle lower right, the
  // bar across the middle (tall viewports spread them vertically instead).
  float tall = res.y / unit;
  vec2 cC = vec2(-0.30 * aspect,  0.14 * tall) + drift(t, 47.0, 61.0, 0.9, amp);
  vec2 cR = vec2( 0.22 * aspect, -0.10 * tall) + drift(t, 53.0, 41.0, 2.1, amp);
  vec2 cB = vec2( 0.00 * aspect,  0.00) + drift(t, 67.0, 44.0, 4.0, amp);

  // Only the field nearest the pointer answers it.
  float dC = distance(ptr, cC), dR = distance(ptr, cR), dB = distance(ptr, cB);
  float nC = step(dC, min(dR, dB)) * moved;
  float nR = step(dR, min(dC, dB)) * (1.0 - nC) * moved;
  float nB = (1.0 - nC - nR) * moved;
  cC += nudge(cC, ptr, nC, aspect);
  cR += nudge(cR, ptr, nR, aspect);
  cB += nudge(cB, ptr, nB, aspect);

  float mC = fill(sdCircle(uv - cC, 0.34), px);
  float mR = fill(sdBox(uv - cR, vec2(0.46, 0.30)), px);
  float mB = fill(sdBox(rot(-0.42 + 0.03 * sin(t * TAU / 70.0)) * (uv - cB), vec2(0.95, 0.075)), px);

  // Multiply at 8% (12% in sRGB terms reads as a 10-20% drop in linear
  // light, too dark under a light theme): where fields overlap the inks
  // compound into new hues, and the page never leaves its cream. The cobalt
  // field is tinted rather than multiplied, toward a lighter, bluer cobalt:
  // warm cream times (or mixed a little toward) cobalt is only grey.
  vec3 col = u_c1;
  col *= mix(vec3(1.0), u_c2, 0.08 * mC);
  col  = mix(col, mix(u_c3, vec3(0.5, 0.7, 1.0), 0.6), 0.22 * mR);
  col *= mix(vec3(1.0), u_c4, 0.08 * mB);

  gl_FragColor = vec4(col, 1.0);
}
`,
    colors: ["#EFEBE1", "#C62828", "#1E4FA3", "#F2C230"],
    speed: 1,
    fps: 30,
    stillAt: 17,
  },
  preview:
    "linear-gradient(135deg, #EFEBE1 0 52%, #C62828 52% 68%, #1E4FA3 68% 84%, #F2C230 84%)",
};
