# Backgammon skins: the contract

A **skin** restyles every Backgammon page (hub, Play, Trainer, Solver, Library, Openings, the
two docs pages) and every element on the board, and runs a WebGL fragment shader behind the
page. Twelve skins ship plus `classic` (the pre-skin look, no shader). The user picks one in
Settings → Board colors; the choice is saved in `settings().skin` and applied before first
paint on the next visit.

Standing rules: no eyebrow labels, taglines or decorative copy anywhere (memory
`less-is-more-no-eyebrows`); identity comes from material, colour, light, type and shape.
Every colour literal lives in JS (skin modules) or `shared/tokens.css`, never in a tracked
stylesheet (`shared/tests/css-literals.test.cjs`). Restyle, never rename: every id, class and
data attribute the tests pin stays.

## 1. Files

| Path | Role |
| --- | --- |
| `backgammon/skins/<id>.mjs` | One module per skin, DOM-free data (`export default {...}`). |
| `backgammon/skins/index.mjs` | Registry: imports every skin, exports `SKINS`, `SKIN_IDS`, `DEFAULT_SKIN`, `skinById(id)`, `SKIN_PRESETS` (board palettes as `BOARD_PRESETS` entries). Owned by the parent session. |
| `backgammon/ui/skin.mjs` | DOM applier: `applySkin(id)`, `selectSkin(id)`, pre-paint boot cache, style/defs injection, meta theme-color, shader start/stop. |
| `backgammon/ui/shader-layer.mjs` | One page-level `<canvas>` with a WebGL1 context, the render loop and its guards. |
| `backgammon/core/storage.mjs` | New top-level `skin` setting with `normalizeSkin()` (allow-list of ids, default `DEFAULT_SKIN`). |
| `backgammon/core/appearance.mjs` | `BOARD_PRESETS = [...the 24 existing, ...SKIN_PRESETS]` (36 in all; `classic` reuses `slate`). |
| `backgammon/ui/appearance.mjs` | The skin picker grid at the top of the Board colors tab. |
| `backgammon/tests/skins.test.mjs`, `backgammon/tests/skins.cjs` | Unit and browser suites (the latter registered in `tests/browser.cjs`). |

Everything under `backgammon/` outside `tests/ scripts/ docs/ source/ refresh/` is precached by
the service worker automatically; after any change run `node backgammon/scripts/offline-manifest.mjs`
and commit its rewrites.

## 2. Skin module

```js
// SPDX-License-Identifier: GPL-3.0-or-later
export default {
  id: "ember",                 // kebab-case, equals the file name, 2–24 chars
  name: "Ember",               // one or two words; the only user-visible text
  description: "Charcoal and forge light.", // aria-label/title only, one short sentence
  scheme: "dark",              // "dark" | "light" → color-scheme and <meta theme-color>
  tokens: {                    // page chrome; hex "#RRGGBB" unless noted
    page: "#0E0B0A", surface: "#1A1512", surface2: "#241C18", surface3: "#2E2420",
    glass: "rgba(26,21,18,.72)",             // rgba allowed here only
    line: "rgba(255,255,255,.08)", lineStrong: "rgba(255,255,255,.16)", lineOpaque: "#3A2F29",
    controlBorder: "rgba(255,255,255,.2)",
    ink: "#F4EBE4", muted: "#B9A99E", soft: "#8A7A70",
    accent: "#FF8A3D", accent2: "#FFC14D", accentSoft: "rgba(255,138,61,.16)", onAccent: "#1A0F08",
    good: "#8EDB9C", bad: "#FF8E8E", warn: "#FFCE6B", info: "#8AB4FF",
    goodSoft: "rgba(142,219,156,.16)", badSoft: "rgba(255,142,142,.16)",
    warnSoft: "rgba(255,206,107,.16)", infoSoft: "rgba(138,180,255,.16)",
    // optional shape/type tokens
    radiusSm: "6px", radiusMd: "10px", radiusLg: "16px", radiusPill: "999px",
    shadowTile: "0 1px 0 rgba(255,255,255,.04), 0 10px 30px rgba(0,0,0,.5)",
    shadowRaised: "…", shadowSheet: "…",
    fontSans: "…", fontMono: "…",         // system stacks or var(--font-sans); no webfont downloads
  },
  board: { /* all 34 keys, uppercase hex: frame border surface bar tray pointA pointB numbers
             caption checker0 rim0 detail0 count0 checker1 rim1 detail1 count1 die0 pips0
             dieBorder0 die1 pips1 dieBorder1 cube cubeText cubeBorder source selection
             destination destinationText undo undoText hover focus */ },
  patterns: {},                // optional, same shape as boardTheme.patterns (see core/appearance.mjs PATTERN_*)
  css: `…`,                    // structural rules; every selector starts with html[data-skin="ember"]
  defs: `…`,                   // SVG <defs> children; every id starts with skin-ember-
  shader: {
    fragment: `…`,             // GLSL ES 1.0 fragment shader, see §4
    colors: ["#0E0B0A", "#FF8A3D", "#2E2420", "#FFC14D"], // u_c1..u_c4
    speed: 1,                  // multiplies u_time
    fps: 60,                   // 60 or 30; phones are capped at 30 by the layer anyway
    stillAt: 7.5,              // seconds: the frame drawn under reduced motion
  },
  preview: "linear-gradient(135deg, #0E0B0A, #2E1A10 60%, #FF8A3D)", // picker thumbnail background
};
```

Token → CSS variable mapping (the applier sets them inline on `<html>`):
`surface2→--surface-2`, `surface3→--surface-3`, `lineStrong→--line-strong`, `lineOpaque→--line-opaque`,
`controlBorder→--control-border`, `onAccent→--on-accent`, `accent2→--accent-2`, `accentSoft→--accent-soft`,
`goodSoft→--good-soft` (and bad/warn/info), `radiusSm→--r-sm`, `radiusMd→--r-md`, `radiusLg→--r-lg`,
`radiusPill→--r-pill`, `shadowTile→--shadow-tile`, `shadowRaised→--shadow-raised`, `shadowSheet→--shadow-sheet`,
`fontSans→--font-sans`, `fontMono→--font-mono`; everything else is `--<key>`.

Validation (unit test, every skin): unique id/name; all 34 board keys uppercase hex with zero
`paletteWarnings()`; `contrastRatio(ink, surface) >= 7`, `(muted, surface) >= 4.5`,
`(onAccent, accent) >= 4.5`, `(ink, page) >= 7`; `good/bad/warn/info` vs surface `>= 3`;
`css` has no `!important`, no `position: fixed`, no `@import`, no `url(http`, and every rule
selector starts with `html[data-skin="<id>"]`; `defs` ids all start with `skin-<id>-`;
`shader.fragment` contains `gl_FragColor`, `u_time`, `u_resolution` and no `#extension`;
`preview` is a gradient string.

## 3. What `css` and `defs` may style

The board is one `<svg class="bg-board" viewBox="0 0 876 660">`; colours are inline
`fill="var(--board-…)"` attributes, and CSS `fill`/`stroke` rules beat them. Allowed and
expected per skin:

- Frame and surface art: `.bg-board [data-pattern="frame"]`, `[data-pattern="surface"]`,
  `[data-pattern="bar"]`, `[data-pattern="tray"]` (the overlay siblings; give them
  `fill: url(#skin-<id>-…)` gradients/patterns, `opacity`). Never restyle the first `<rect>`
  (the frame; a test reads its flat fill) and never reorder children.
- Points: `.bg-board .point-shape` (fill gradient, stroke, `stroke-width`), `[data-pattern="pointA"|"pointB"]`.
  Do NOT touch `.point-hit`, `.point-wash`, `.point-glow`, `.point-number-hit` (stroke-based
  highlight rules are pinned: no `filter`, no `clip-path`, strokes stay).
- Checkers: `.bg-board .checker > circle:first-child` (face: gradient fill, stroke, stroke-width),
  `.checker [data-pattern="checker0"|"checker1"]`, the detail ring/count text via their `--board-*`
  tokens. Keep `pointer-events`, keep the first child a `<circle>`.
- Dice: `.bg-board .board-die-face > rect:first-child` (gradient fill, rx via `rx` is an attribute —
  leave it; use `stroke`), `[data-pattern="die0"|"die1"]`. Status marks (`.die-forced`, `.die-check`,
  `.die-blocked`) keep their literal colours.
- Cube: `.bg-board .board-cube .cube-face`, `[data-pattern="cube"]`, `.cube-key`.
- Point numbers/caption: `.bg-board text` font-family/weight (size stays).
- Highlights keep their tokens (`--board-source/selection/destination/undo/hover/focus`) — set
  them in `board`, do not restyle `.source-ring`, `.landing-ring`, `.destination-badge`, `.last-move-*`.
- Page chrome under `html[data-skin="<id>"]`: `.topbar`, `.crumbs`, `.tool-nav a`, `.tool-head h1`,
  `.panel`, `.inspector`, `.stage`, `.board-frame`/`.board-slot` (border, shadow, padding, radius),
  `.player-strip`, `.action-area`, `.btn`, `.btn--primary`, `.btn--ghost`, `.segmented`, `.tabs`,
  `.field`, `.dialog`, `.toast`, `.tile`, `.hero h1`, `.docs-*`. Shapes, borders, shadows,
  backdrop-filter, letterforms, text-transform **off** (sentence case only), radii. Colours only
  through `var(--…)` tokens so user colour overrides keep flowing.
- Performance: no `filter:` on `.checker`, `.point`, `.board-die*` or anything repeated 15–30
  times; filters are fine on the four surface overlays and page chrome. No CSS `transition` on
  SVG board elements. No `animation` inside the SVG.
- Never: `!important`, `position: fixed`, `z-index` above 10, changing sizes of controls below
  44px, text below 12px, hiding `#board`, `.topbar`, `.skip-link`, focus outlines.

`defs` is injected once into `<svg id="skin-board-definitions" aria-hidden="true">` at the
end of `<body>` (separate from `#board-pattern-definitions`, which `applyBoardTheme` rebuilds).
Use `gradientUnits="objectBoundingBox"` so one gradient fits every checker/point; `<pattern>`
tiles use `patternUnits="userSpaceOnUse"`.

## 4. Shader

GLSL ES 1.0 fragment shader, drawn on a fullscreen triangle:

```glsl
precision mediump float;
uniform float u_time;        // seconds × speed
uniform vec2  u_resolution;  // canvas px
uniform vec2  u_pointer;     // last pointer position in canvas px (0,0 until moved)
uniform vec3  u_c1, u_c2, u_c3, u_c4; // shader.colors as 0–1 rgb
uniform float u_dark;        // 1.0 for scheme "dark", 0.0 for "light"
void main() { vec2 uv = gl_FragCoord.xy / u_resolution; … gl_FragColor = vec4(c, 1.0); }
```

60–160 lines, original, no textures, helpers inlined (hash/noise/fbm/sdf). Must read well
as a *background*: low-frequency, the UI's surfaces sit on top; average luminance close to
`tokens.page`; nothing that flickers or strobes; calm at `u_time` from 0 to 600 (no visible
reset). The layer caps devicePixelRatio at 1.5 (1.0 on coarse pointers), runs at 30 fps on
phones, renders one still frame at `stillAt` under reduced motion (`html[data-motion="reduce"]`
or `prefers-reduced-motion`), pauses while `document.hidden`, stops on `webglcontextlost`,
and removes the canvas if WebGL is unavailable (the page then shows `--page`). The canvas is
`position: fixed; inset: 0; z-index: -1; pointer-events: none; aria-hidden` as the first child
of `<body>`; `html.skin-shader body { background: transparent }` and the kit's aura/dot
pseudo-elements are hidden while a shader runs. A skin may set `shader: null` (classic).

## 5. Settings and application

- `settings().skin` (string id, allow-listed, default `DEFAULT_SKIN`); `saveSettings({ skin })`.
- `selectSkin(id)` saves `skin` **and** `boardTheme = { version: 1, preset: id, colors: {} }`
  (`classic` → preset `slate`), then applies both and dispatches `bg-skin`. Users may still
  override individual board colours or patterns afterwards; the skin keeps its chrome.
- `applySkin(id)` is idempotent: sets `html[data-skin]`, inline tokens, `color-scheme`, the
  `<meta name="theme-color">` content (= `tokens.page`), `<style id="skin-style">`, the defs svg,
  starts or stops the shader layer, and writes `localStorage["backgammon.v1.skin-boot"]`
  (`{"id","page"}`) for the pre-paint script.
- Pre-paint script in every page head (not `refresh/`): reads that cache, validates
  `/^[a-z][a-z0-9-]{1,23}$/` and `/^#[0-9A-Fa-f]{6}$/`, sets `data-skin` and `--page` inline.
- Call sites: `ui/shell.mjs shell()` (after the body is built), `backgammon/app.js` (hub),
  `openings/app.js`, `reports/app.js`, `ui/update-page.mjs` (controls); each also re-applies on
  the `storage` event for `backgammon.v1.settings`.

## 6. Picker

At the top of the Board colors tab: `section[aria-label="Style"]` → `div.skin-grid` of
`button.skin-choice[data-skin][aria-pressed]`, each ≥ 44 px tall, with a `.skin-thumb`
(`background: preview`, two small checker discs in `board.checker0/checker1`, a point sliver in
`board.pointA`) and the name (≥ 12 px). Selecting calls `selectSkin(id)` and updates the
editor's state so `#theme-name`, the `[data-preset]` pressed state and the sample board follow.
The three Settings tabs keep their names; no fourth tab.

## 7. Tests that pin the surroundings (do not break)

`tests/appearance.cjs` (preset grid iterates `BOARD_PRESETS`; count assertion becomes 36;
frame flat fill; `.teal-die` colours; `.theme-contrast` hidden), `tests/options.test.mjs` (count
36), `tests/appearance.test.mjs` (every preset: 34 keys, zero warnings), `tests/mobile-settings.cjs`
(tabs reachable at 320 px), `tests/highlight-rendering.cjs`, `tests/mobile-performance.cjs`,
`tests/confirm-latency.cjs`, `tests/background-focus.cjs`, `tests/deployment.test.mjs`,
`scripts/shell-browser.cjs` (12 px text, 44 px targets, focus rings, no overflow),
`shared/tests/css-literals.test.cjs`, `shared/tests/shell.test.cjs`.
