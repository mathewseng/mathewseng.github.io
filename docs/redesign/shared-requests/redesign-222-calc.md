# Shared-kit requests from redesign/222-calc

Everything below is implemented locally (in `poker/tools.css` or the two page stylesheets) and
should move into `shared/app.css` when the integrator is ready. The Dodge requests
(`redesign-dodge.md`) still stand; 222 and Calculations now use items 1, 2, 3, 8, 9, 10 and 12
from that list.

## 1. Cube option rows are shared now (`.cube-options`, `.opt`, `.opt-*`, `.verdict`)

Dodge request #10 is done on the family side: the option rows live in `poker/tools.css` and both
the Dodge simulator and 222 render them. They are the brief's "decision-value and ranked-move"
row for a cube decision and belong in the kit next to `.list-row` (or as a `.list-row--bar`
variant with the centred bar). Selector list: `.cube-options`, `.opt`, `.opt.best`,
`.opt.chosen`, `.opt-head`, `.opt-label`, `.opt-tag` (+ `.best/.good/.bad`), `.opt-value`,
`.opt-bar > i` (fed by `--scale`), `.opt-meta` (+ `.loss`), `.opt-verdict`, `.opt-section`,
`.opt-section-title`, `.opt-summary`, `.verdict` (+ `.good/.bad`).

## 2. Two live regions in one toast stack (`.toast-region`)

The kit's `.toast-stack` is one positioned region. A page needs one polite and one assertive
region in the same bottom-centre spot, so 222 wraps two `.toast-region` children:

```html
<div class="toast-stack">
  <div id="toast" class="toast-region" role="status" aria-live="polite"></div>
  <div id="alerts" class="toast-region" role="alert" aria-live="assertive"></div>
</div>
```

```css
.toast-region { display: flex; flex-direction: column; align-items: center; gap: 8px; max-width: 100%; }
.toast-region:empty { display: none; }
```

Every page with both a status toast and an alert toast will want this.

## 3. Toast dismiss button

`ui.toast()` on 222 appends a 36px `.btn.btn--ghost.btn--icon.btn--sm` "✕" (aria-label
"Dismiss") and pauses the timer on hover. The brief asks for a dismiss control on `.toast`; the
kit could ship the markup helper so pages stop writing it.

## 4. Landscape-phone tool head

Added to `poker/tools.css`: at `(min-width: 701px) and (max-height: 560px)` the `.tool-head`
collapses to one 40px row and hides the lede, exactly like the kit's short-desktop query
(`min-width: 881px and max-height: 820px`). 844×390 is a sweep viewport, so the kit's own query
should cover it.

## 5. Result card (`.result-card`, `.result-head`, `.result-title`, `.result-table`, `.result-nets`)

The showdown / hand-over card 222 renders above the seats (headline with `.is-good/.is-bad`,
reason line, a `.data-table` breakdown with the viewer's row `.is-selected`). The brief wants the
same card for Backgammon, Rush and Mixed Poker game-over states.

## 6. Hand-group metric rows (container query)

A `.metric` that turns into a `label | value` row when its container is narrower than 190px
(`@container group (max-width: 190px)`). Dense seat cards on every table page have the same
problem of three stacked metrics not fitting side by side.

## 7. Rank/category colour tokens per page

Calculations defines `--calc-rank-0 … --calc-rank-9` on `.workspace` from `--cat-*`, `--info`,
`--player-2`, `--muted`, `--ink`; Dodge defined `--dodge-cat-*` the same way. A documented
convention (page-prefixed aliases on the workspace element, never on `:root`) or a longer shared
`--cat-7..10` set would stop each page inventing the mapping.

## 8. Phone sheet for a side panel (the deck)

222 moves `#sim-deck-panel` between the split side column and `#sim-deck-dialog` with a
`matchMedia("(max-width: 700px)")` listener. Dodge reports does the same for the hand inspector.
A tiny helper in `shared/sheet.js` (`Sheet.dock(node, dialog, mediaQuery)`) would remove the
copies.

## 9. Sticky result summary (`.spot-summary`)

`position: sticky; top: 0` strip at the top of a scrolling result column (a `.stat-strip` or a
`.progress` on an opaque surface). Any solver page with a long result wants it on phones.
