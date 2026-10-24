// SPDX-License-Identifier: GPL-3.0-or-later
// One-Bit Dither: a 512×342 Macintosh. Every surface is paper or ink, every
// tone is an ordered-dither stipple, every edge a 1px stroke; hierarchy comes
// from stroke weight, stipple density and inversion, never from colour, grey
// or blur. The board is a bitmap drawing (pinstripe rail, stippled points,
// a solid bar with an inset paper line) and the page margins behind it are
// a slow lava-lamp field quantised through an 8×8 Bayer matrix that redraws
// in discrete steps, like a page refresh, so it never shimmers. Text columns
// and the hub sit on paper; the stipple stays in the margins.
//
// Board "ink" is --board-border and "paper" is --board-surface: the frame
// token is the paper rail (point numbers sit on it), so those two carry the
// drawing's lines and the stipple cells.
const ID = "one-bit-mac";
const S = `html[data-skin="${ID}"]`;
const P = `skin-${ID}-`;

const css = `
/* ---------- page ---------- */
${S} { scrollbar-color: var(--ink) var(--surface-2); }
${S} #skin-canvas { image-rendering: pixelated; }
${S} ::selection { background: var(--ink); color: var(--surface); }
${S} .topbar { background: var(--surface); border-bottom: 1px solid var(--line); }
${S} .tool-head, ${S} .action-area, ${S} .foot, ${S} .hero, ${S} .hub-main, ${S} .hub-tool-tabs, ${S} .docs-main, ${S} .opening-guide, ${S} .empty, ${S} .empty-state { background: var(--page); }
${S} .tool-nav a { border: 1px solid transparent; border-radius: 6px; font-weight: 700; }
${S} .tool-nav a:hover { border-color: var(--line); color: var(--ink); }
${S} .tool-nav a[aria-current="page"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
${S} .tool-head h1, ${S} .hero h1, ${S} .panel-head h2, ${S} .panel-head h3, ${S} .panel-title, ${S} .dialog-head h2 { font-weight: 700; letter-spacing: 0; }
${S} .hero h1 { background: none; color: var(--ink); -webkit-text-fill-color: var(--ink); }
@media (max-resolution: 1dppx) {
  ${S} .tool-head h1, ${S} .hero h1, ${S} .btn, ${S} .stat-value, ${S} .tabular { -webkit-font-smoothing: none; }
}

/* ---------- panels, tiles, strips ---------- */
${S} .panel, ${S} .inspector, ${S} .tile { border: 1px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: 2px 2px 0 var(--line); }
${S} .panel-head { border-bottom: 1px solid var(--line); }
${S} .panel-foot { border-top: 1px solid var(--line); }
${S} .tile:hover, ${S} .tile:focus-visible { translate: 0 0; border-color: var(--line); box-shadow: 4px 4px 0 var(--line); }
${S} .tile:active { translate: 1px 1px; box-shadow: 2px 2px 0 var(--line); }
${S} .tile::before, ${S} .tile::after { display: none; }
${S} .hub-feature { border: 1px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: 2px 2px 0 var(--line); }
${S} .hub-feature > .tile, ${S} .hub-feature > .tile:hover, ${S} .hub-feature > .tile:focus-visible, ${S} .hub-feature > .tile:active { border: 0; box-shadow: none; translate: 0 0; }
${S} .player-strip { border: 1px solid transparent; border-radius: 0; background: var(--page); }
${S} .player-strip.active { background: var(--ink); border-color: var(--ink); color: var(--surface); }
${S} .player-strip.active .player-name strong, ${S} .player-strip.active .muted { color: inherit; }
${S} .player-strip.active .checker-dot { box-shadow: 0 0 0 1px var(--surface); }
${S} .action-area { border-top: 1px solid var(--line); }
${S} .stat-strip, ${S} .list-row, ${S} .data-table td, ${S} .data-table th { border-color: var(--line); }

/* ---------- controls ---------- */
${S} .btn { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); font-weight: 700; box-shadow: none; }
${S} .btn:hover { background: var(--surface); border-color: var(--line); box-shadow: inset 0 0 0 1px var(--line); }
${S} .btn:active, ${S} .btn[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: none; }
${S} #equity-toggle[aria-pressed="true"] { color: var(--surface); }
${S} .btn--primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
${S} .btn--primary:hover { background: var(--accent); border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--on-accent); }
${S} .btn--primary:active { background: var(--surface); border-color: var(--ink); color: var(--ink); }
${S} .btn--ghost { background: var(--surface); border-color: var(--line); color: var(--ink); }
${S} .btn--ghost:hover { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: none; }
${S} .btn--danger { background: var(--surface); border-color: var(--line); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
${S} .btn--danger:hover { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: none; }
${S} .segmented { gap: 0; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
${S} .segmented > label, ${S} .segmented > button { border-radius: 0; color: var(--ink); font-weight: 700; }
${S} .segmented > label + label, ${S} .segmented > button + button, ${S} .segmented > label + button, ${S} .segmented > button + label { border-left: 1px solid var(--line); }
${S} .segmented > :first-child { border-radius: 5px 0 0 5px; }
${S} .segmented > :last-child { border-radius: 0 5px 5px 0; }
${S} .segmented > label:hover, ${S} .segmented > button:hover { box-shadow: inset 0 0 0 1px var(--line); }
${S} .segmented > label:has(input:checked), ${S} .segmented > button[aria-pressed="true"], ${S} .segmented > button[aria-checked="true"], ${S} .segmented > [aria-selected="true"] { background: var(--ink); color: var(--surface); box-shadow: none; }
${S} .tabs { gap: 4px; border-bottom: 1px solid var(--line); }
${S} .tabs > [role="tab"] { border: 1px solid transparent; border-bottom: 0; border-radius: 6px 6px 0 0; color: var(--ink); font-weight: 700; }
${S} .tabs > [role="tab"]:hover { border-color: var(--line); }
${S} .tabs > [role="tab"][aria-selected="true"] { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: none; }
${S} .tabs.has-indicator::after { display: none; }
${S} .field input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), ${S} .field select, ${S} .field textarea, ${S} .touch-moves select { border: 1px solid var(--line); border-radius: 0; background-color: var(--surface); }
${S} .field input:hover, ${S} .field select:hover, ${S} .field textarea:hover { border-color: var(--line); box-shadow: inset 0 0 0 1px var(--line); }
${S} .field > label, ${S} .field-label { color: var(--ink); font-weight: 700; }
${S} .badge, ${S} .chip { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); }
${S} .badge::before { display: none; }
${S} button.chip[aria-pressed="true"] { background: var(--ink); color: var(--surface); }
${S} .switch { border: 1px solid var(--line); background: var(--surface); }
${S} .switch::after { background: var(--ink); }
${S} .switch:has(input:checked) { background: var(--ink); }
${S} .switch:has(input:checked)::after { background: var(--surface); }
/* Keyboard focus on an ink-filled control: the kit's ring is accent (= ink)
   at a negative offset, so it draws inside the fill. Paper ring, 3px in. */
${S} .tool-nav a[aria-current="page"]:focus-visible, ${S} .tabs > [role="tab"][aria-selected="true"]:focus-visible, ${S} .segmented > [aria-pressed="true"]:focus-visible, ${S} .segmented > [aria-checked="true"]:focus-visible, ${S} .segmented > [aria-selected="true"]:focus-visible, ${S} .btn[aria-pressed="true"]:focus-visible, ${S} button.chip[aria-pressed="true"]:focus-visible, ${S} .segmented > label:has(input:checked):has(input:focus-visible) { outline-color: var(--surface); outline-offset: -4px; }

/* ---------- dialogs and toasts: System 1 modals ---------- */
${S} .dialog { border: 1px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--line); }
${S} .dialog::backdrop { background: repeating-conic-gradient(var(--ink, #111111) 0 25%, transparent 0 100%) 0 0 / 2px 2px; opacity: 0.35; }
${S} .dialog-head { border-bottom: 1px solid var(--line); background: repeating-linear-gradient(to bottom, var(--line) 0 1px, var(--surface) 1px 3px); }
${S} .dialog-head h2 { padding: 2px 8px; background: var(--surface); }
${S} .dialog-foot { border-top: 1px solid var(--line); }
${S} .toast { border: 1px solid var(--line); border-radius: 0; background: var(--surface); box-shadow: 2px 2px 0 var(--line); font-weight: 700; }
${S} .toast--good { background: var(--surface); color: var(--ink); }
${S} .toast--alert { background: var(--ink); border-color: var(--ink); color: var(--surface); box-shadow: 0 0 0 1px var(--surface), 0 0 0 2px var(--line); }
${S} .toast--alert .muted { color: inherit; }

/* ---------- equity rail: stippled track, solid fill ---------- */
${S} .equity-meter { border: 1px solid var(--ink); border-radius: 0; background: repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 100%) 0 0 / 4px 4px; }
${S} .equity-fill { background: var(--ink); }
${S} .equity-meter::after { border-top: 1px solid var(--surface); }

/* ---------- openings: idea kinds told apart by fill pattern, not hue ----------
   Each kind owns a tile (--skin-fill, --skin-tile); a card wears it as a 5px
   frame inside the border and keeps paper under its text, the alternatives
   band shows it as a 6px strip, and the legend swatches are 12px squares. */
${S} .opening-guide [data-opening-kind] { --opening-color: var(--ink); --skin-tile: auto; }
${S} .opening-guide [data-opening-kind="point"] { --skin-fill: linear-gradient(var(--ink), var(--ink)); }
${S} .opening-guide [data-opening-kind="anchor"] { --skin-fill: repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 50%); --skin-tile: 4px 4px; }
${S} .opening-guide [data-opening-kind="hit"] { --skin-fill: repeating-linear-gradient(-45deg, var(--ink) 0 1.5px, var(--surface) 0 5px); }
${S} .opening-guide [data-opening-kind="split"] { --skin-fill: repeating-linear-gradient(to right, var(--ink) 0 1px, var(--surface) 0 4px); }
${S} .opening-guide [data-opening-kind="run"] { --skin-fill: repeating-linear-gradient(to bottom, var(--ink) 0 1px, var(--surface) 0 4px); }
${S} .opening-guide [data-opening-kind="slot"] { --skin-fill: repeating-conic-gradient(var(--ink) 0 25%, var(--surface) 0 100%); --skin-tile: 4px 4px; }
${S} .opening-guide [data-opening-kind="build"] { --skin-fill: radial-gradient(circle at 2px 2px, var(--ink) 1px, var(--surface) 1.2px); --skin-tile: 8px 8px; }
${S} .opening-guide [data-opening-kind="develop"] { --skin-fill: linear-gradient(var(--surface), var(--surface)); }
${S} .opening-roll-choice[data-opening-kind]:not(:disabled), ${S} .opening-roll-choice[data-opening-kind]:not(:disabled):hover { padding: 5px; border-color: var(--line); background: linear-gradient(var(--surface), var(--surface)) content-box, var(--skin-fill, linear-gradient(var(--surface), var(--surface))) 0 0 / var(--skin-tile, auto) padding-box; }
${S} .opening-roll-choice:not(:disabled):hover { box-shadow: inset 0 0 0 1px var(--line); }
${S} .opening-roll-choice[aria-pressed="true"], ${S} .opening-roll-choice[aria-pressed="true"]:hover { border-color: var(--ink); box-shadow: 0 0 0 1px var(--surface), 0 0 0 3px var(--ink); }
${S} .opening-alternative-colors { inset-inline: 5px; bottom: 5px; gap: 2px; padding-bottom: 2px; border-top: 0; background: var(--surface); }
${S} .opening-alternative-colors > span { border-bottom: 6px solid transparent; border-left: 0; background: linear-gradient(var(--surface), var(--surface)) padding-box, var(--skin-fill, linear-gradient(var(--surface), var(--surface))) 0 0 / var(--skin-tile, auto) border-box; }
${S} .opening-color-key i, ${S} .opening-kind-dot { border: 1px solid var(--line); border-radius: 0; background: var(--skin-fill, linear-gradient(var(--surface), var(--surface))) 0 0 / var(--skin-tile, auto); }
${S} .opening-color-key i { width: 12px; height: 12px; }
${S} .opening-kind-dot { width: 8px; height: 8px; margin-top: .3em; }

/* ---------- board: a bitmap drawing ---------- */
${S} .bg-board [data-pattern], ${S} .bg-board .point-shape { shape-rendering: crispEdges; }
${S} .bg-board text { font-family: var(--font-sans); font-weight: 700; }
${S} .bg-board .point > text:not(.destination-die) { paint-order: stroke; stroke: var(--board-frame); stroke-width: 5px; stroke-linejoin: round; }
${S} .bg-board [data-pattern="frame"] { fill: url(#${P}rail); }
${S} .bg-board [data-pattern="surface"] { fill: none; stroke: var(--board-border); stroke-width: 2; }
${S} .bg-board [data-pattern="bar"] { fill: url(#${P}bar); }
${S} .bg-board [data-pattern="tray"] { fill: url(#${P}tray); }
${S} .bg-board [data-pattern="pointA"] { fill: url(#${P}stipple25); stroke: var(--board-border); stroke-width: 1.5; stroke-linejoin: miter; }
${S} .bg-board [data-pattern="pointB"] { fill: url(#${P}stipple75); stroke: var(--board-border); stroke-width: 1.5; stroke-linejoin: miter; }
${S} .bg-board .point .point-shape { stroke: none; }
${S} .bg-board .checker > circle:first-child { stroke-width: 2.5; }
${S} .bg-board .checker[data-player="1"] > circle:first-child { stroke-width: 5; }
${S} .bg-board .checker[data-player="1"] > [data-pattern="checker1"] { stroke: var(--board-border); stroke-width: 2; }
${S} .bg-board .checker[data-player="0"] > [data-pattern="checker0"] { fill: url(#${P}crescent); }
${S} .bg-board .board-die-face > rect:first-child { stroke-width: 2.5; }
${S} .bg-board .die-selection-accent { fill: none; stroke-width: 3; }
${S} .board-die.consumed .board-die-face > :not(.die-status-mark) { opacity: 1; }
${S} .bg-board .board-die.consumed [data-pattern="die0"] { fill: url(#${P}dots25); }
${S} .bg-board .board-die.consumed [data-pattern="die1"] { fill: url(#${P}paper25); }
${S} .board-die.preferred .board-die-face { filter: drop-shadow(3px 3px 0 var(--board-border)); }
${S} .board-die[role="button"]:active .board-die-face { filter: drop-shadow(1px 1px 0 var(--board-border)); }
${S} .board-cube[role="button"]:active { filter: none; }
${S} .bg-board .board-cube .cube-face { stroke-width: 1.5; }
${S} .bg-board .dice-switch-surface { fill: var(--surface); stroke: var(--ink); }
`;

// 1.5-unit cells on the 876-unit board: one bitmap pixel at the board's
// natural size, two on a 2× display. Ink is --board-border, paper is
// --board-surface so user colour overrides keep flowing into the stipple.
const INK = "var(--board-border)";
const PAPER = "var(--board-surface)";
const cell = (x, y, fill) =>
  `<rect x="${x}" y="${y}" width="1.5" height="1.5" fill="${fill}" shape-rendering="crispEdges"/>`;
const defs = `
<pattern id="${P}stipple25" patternUnits="userSpaceOnUse" width="6" height="6">
  <rect width="6" height="6" fill="${PAPER}"/>
  ${cell(0, 0, INK)}${cell(3, 0, INK)}${cell(0, 3, INK)}${cell(3, 3, INK)}
</pattern>
<pattern id="${P}stipple50" patternUnits="userSpaceOnUse" width="3" height="3">
  <rect width="3" height="3" fill="${PAPER}"/>
  ${cell(0, 0, INK)}${cell(1.5, 1.5, INK)}
</pattern>
<pattern id="${P}stipple75" patternUnits="userSpaceOnUse" width="6" height="6">
  <rect width="6" height="6" fill="${INK}"/>
  ${cell(1.5, 1.5, PAPER)}${cell(4.5, 1.5, PAPER)}${cell(1.5, 4.5, PAPER)}${cell(4.5, 4.5, PAPER)}
</pattern>
<pattern id="${P}dots50" patternUnits="userSpaceOnUse" width="3" height="3">
  ${cell(0, 0, INK)}${cell(1.5, 1.5, INK)}
</pattern>
<pattern id="${P}dots25" patternUnits="userSpaceOnUse" width="6" height="6">
  ${cell(0, 0, INK)}${cell(3, 0, INK)}${cell(0, 3, INK)}${cell(3, 3, INK)}
</pattern>
<pattern id="${P}paper25" patternUnits="userSpaceOnUse" width="6" height="6">
  ${cell(0, 0, PAPER)}${cell(3, 0, PAPER)}${cell(0, 3, PAPER)}${cell(3, 3, PAPER)}
</pattern>
<pattern id="${P}rail" patternUnits="userSpaceOnUse" width="6" height="6">
  <rect width="6" height="6" fill="var(--board-frame)"/>
  <rect width="6" height="1.5" fill="${INK}" shape-rendering="crispEdges"/>
</pattern>
<pattern id="${P}bar" patternUnits="userSpaceOnUse" x="388" y="28" width="40" height="604">
  <rect x="3.75" y="3.75" width="32.5" height="596.5" fill="none" stroke="${PAPER}" stroke-width="1.5" shape-rendering="crispEdges"/>
</pattern>
<pattern id="${P}tray" patternUnits="userSpaceOnUse" x="820" y="35" width="46" height="174">
  <rect x="0.75" y="0.75" width="44.5" height="66.5" rx="4" fill="url(#${P}stipple50)" stroke="${INK}" stroke-width="1.5"/>
</pattern>
<pattern id="${P}crescent" patternUnits="objectBoundingBox" width="1" height="1" viewBox="0 0 44 44">
  <path fill-rule="evenodd" fill="url(#${P}dots50)" d="M22 0A22 22 0 1 0 22 44A22 22 0 1 0 22 0ZM17 -5A22 22 0 1 0 17 39A22 22 0 1 0 17 -5Z"/>
</pattern>
`;

const fragment = `precision mediump float;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_pointer;
uniform vec3  u_c1;   // paper
uniform vec3  u_c2;   // ink
uniform vec3  u_c3;
uniform vec3  u_c4;
uniform float u_dark;

// 2x2 Bayer cell [[0,2],[3,1]] written without an array lookup.
float bayer2(vec2 p) {
  float x = mod(p.x, 2.0);
  float y = mod(p.y, 2.0);
  return 2.0 * mod(x + y, 2.0) + y;
}

// 8x8 Bayer threshold by bit interleave: M8 = 16 * M2(low bits) + 4 * M2(mid bits)
// + M2(high bits), 0..63, so a 1.5% coverage step is still a regular grid.
float bayer8(vec2 p) {
  return 16.0 * bayer2(mod(p, 2.0)) + 4.0 * bayer2(floor(mod(p, 4.0) / 2.0)) + bayer2(floor(mod(p, 8.0) / 4.0));
}

// One lava-lamp blob: concentric rings drifting outward from a moving centre.
float blob(vec2 q, vec2 c, float k, float t) {
  return 0.5 + 0.5 * sin(distance(q, c) * k - t * 0.3);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_resolution;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 q = vec2(uv.x * aspect, uv.y);

  // Page-refresh cadence: the field advances every 0.75 s and holds between
  // steps, so the stipple redraws in frames and never shimmers.
  float t = floor(u_time / 0.75) * 0.75;

  // Three slow blobs; sin/cos paths never reset across 0-600 s.
  vec2 c1 = vec2(0.5 * aspect + 0.35 * aspect * sin(t * 0.11), 0.55 + 0.30 * cos(t * 0.07));
  vec2 c2 = vec2(0.5 * aspect + 0.40 * aspect * cos(t * 0.05), 0.40 + 0.35 * sin(t * 0.09));
  vec2 c3 = vec2(0.5 * aspect + 0.30 * aspect * sin(t * 0.08 + 2.0), 0.60 + 0.25 * cos(t * 0.13 + 1.0));
  float v = (blob(q, c1, 7.0, t) + blob(q, c2, 9.0, t * 1.3) + blob(q, c3, 5.0, t * 0.7)) / 3.0;

  // Lighter towards the top of the page.
  v = v * 0.7 + 0.3 * (1.0 - uv.y);

  // Ink lives in the outer 15% of each axis, the page margins; the centre
  // 70%, where the board and the text columns sit, stays clean paper.
  vec2 d = abs(uv - 0.5) * 2.0;
  float edge = smoothstep(0.7, 1.0, max(d.x, d.y));

  // field is the paper level: coverage = 1 - field, 1.5-6% at the edges.
  float field = mix(0.985, 0.94, v);
  field += 0.14 * (1.0 - edge);

  // The pointer pulls a little ink: inside ~90 px the density rises by 8%.
  float moved = step(1.0, u_pointer.x + u_pointer.y);
  float pull = (1.0 - smoothstep(60.0, 90.0, distance(frag, u_pointer))) * moved;
  field -= 0.08 * pull;

  // Ordered dither on 2-px cells, so the stipple survives the layer's 1.5x scale.
  float threshold = (bayer8(floor(frag / 2.0)) + 0.5) / 64.0;
  float ink = step(field, threshold);

  vec3 col = mix(u_c1, u_c2, ink);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default {
  id: ID,
  name: "One-Bit Dither",
  description: "Pure ink on paper, shaded by stipple, drawn with 1px lines.",
  scheme: "light",
  tokens: {
    page: "#F4F4F0",
    surface: "#FFFFFF",
    surface2: "#ECECEA",
    surface3: "#E4E4E0",
    glass: "rgba(255,255,255,.9)",
    line: "#111111",
    lineStrong: "#111111",
    lineOpaque: "#111111",
    controlBorder: "#111111",
    ink: "#111111",
    muted: "#4A4A4A",
    soft: "#5E5E5E",
    accent: "#111111",
    accent2: "#4A4A4A",
    accentSoft: "rgba(17,17,17,.1)",
    onAccent: "#FFFFFF",
    good: "#111111",
    bad: "#111111",
    warn: "#111111",
    info: "#111111",
    goodSoft: "rgba(17,17,17,.1)",
    badSoft: "rgba(17,17,17,.1)",
    warnSoft: "rgba(17,17,17,.1)",
    infoSoft: "rgba(17,17,17,.1)",
    radiusSm: "6px",
    radiusMd: "0px",
    radiusLg: "0px",
    radiusPill: "6px",
    shadowTile: "2px 2px 0 #111111",
    shadowRaised: "3px 3px 0 #111111",
    shadowSheet: "0 -2px 0 #111111",
    fontSans: "Chicago, Charcoal, Geneva, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontMono: "Monaco, ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
  board: {
    frame: "#FFFFFF",
    border: "#111111",
    surface: "#FFFFFF",
    bar: "#111111",
    tray: "#FFFFFF",
    pointA: "#D9D9D9",
    pointB: "#7A7A7A",
    numbers: "#111111",
    caption: "#111111",
    checker0: "#FFFFFF",
    rim0: "#111111",
    detail0: "#FFFFFF",
    count0: "#111111",
    checker1: "#111111",
    rim1: "#FFFFFF",
    detail1: "#111111",
    count1: "#FFFFFF",
    die0: "#FFFFFF",
    pips0: "#111111",
    dieBorder0: "#111111",
    die1: "#111111",
    pips1: "#FFFFFF",
    dieBorder1: "#FFFFFF",
    cube: "#111111",
    cubeText: "#FFFFFF",
    cubeBorder: "#FFFFFF",
    source: "#111111",
    selection: "#111111",
    destination: "#111111",
    destinationText: "#FFFFFF",
    undo: "#111111",
    undoText: "#FFFFFF",
    hover: "#111111",
    focus: "#111111",
  },
  patterns: {},
  css,
  defs,
  shader: {
    fragment,
    colors: ["#F4F4F0", "#111111", "#FFFFFF", "#111111"],
    speed: 1,
    fps: 30,
    stillAt: 12,
  },
  preview: "linear-gradient(135deg, #F4F4F0 0 46%, #111111 46% 50%, #F4F4F0 50% 54%, #111111 54% 58%, #F4F4F0 58%)",
};
