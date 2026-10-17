# Shared-kit requests from redesign/dodge

Everything below is implemented locally in `poker/tools.css` (family-prefixed or family-scoped)
or in the Dodge page stylesheets and should move into `shared/app.css` when the integrator
is ready. Selectors are the ones in use today, so a move is a cut and paste.

## 1. Segmented options need a minimum width on coarse pointers

`shared/app.css` gives `.segmented > label, .segmented > button` a 44px height on coarse
pointers but no width, so a digit-only option renders 32px wide and fails the shell sweep.
Pages: Dodge simulator (`#player-count`, `#on-seat-count`), 222 (same digit buttons).

```css
@media (pointer: coarse), (max-width: 700px) {
  .segmented > label,
  .segmented > button {
    min-width: 44px;
  }
}
```

(Implemented in `poker/tools.css`; the breakpoint should become the kit's 640px when it moves.)

## 2. A breakpoint-scoped visually-hidden utility (`.phone-sr`)

The kit has `.sr-only`; the tool pages need "visible on desktop, screen-reader-only on
phones" for button text beside an icon and field labels the phone layout drops. Replaces
the old desktop/mobile duplicate-label pattern everywhere.

```css
@media (max-width: 700px) {
  .phone-sr { /* same declarations as .sr-only */ }
}
```

Pages: Dodge reports (search label, Export CSV text, Rows / Page labels), Dodge simulator
(Back / Forward text). 222 and Calculations will want it for the same reasons.

## 3. `.field--inline`

A label beside its control for toolbars and pagination footers.

```css
.field--inline { flex-direction: row; align-items: center; gap: 10px; }
.field--inline > label { white-space: nowrap; }
.field--inline.field--select::after { bottom: 12px; }
```

Pages: both Dodge pages; 222's precision select and Calculations' selects fit the same slot.

## 4. `.hand-button`

A `<button>` whose content is a `.cards` row from `shared/cards.js` (explorer rows, pinned
comparison, 222's seat cards once it moves to the shared component).

```css
.hand-button { display: flex; align-items: center; padding: 0; border: 0; border-radius: var(--r-sm); background: none; cursor: pointer; }
```

## 5. `.empty-cell` for a data table's empty row

```css
.empty-cell { padding: 48px 16px; color: var(--muted); font-size: var(--t-sm); text-align: center; white-space: normal; }
```

Pages: Dodge reports; any `.data-table` with a filter.

## 6. Inline sparks for table cells: `.spark-hist` and `.mini-stack`

The kit's `.sparkline` is an SVG line and `.stack-bar` a 10px block; dense tables need an
inline bar histogram and an inline share bar at 28px and 12px tall. Both take their colours
from `--good` / `--swatch`.

```css
.spark-hist { display: inline-flex; align-items: end; gap: 2px; width: 78px; height: 28px; vertical-align: middle; }
.spark-hist > i { width: 4px; border-radius: 1px 1px 0 0; background: var(--good); }
.mini-stack { display: inline-flex; width: 96px; height: 12px; border-radius: 3px; overflow: hidden; vertical-align: middle; }
.mini-stack > i { display: block; height: 100%; background: var(--swatch); }
```

Pages: Dodge reports; 222 and Calculations reports.

## 7. Chart hooks: `.chart`, `.hist-bar`, `.legend`, `.swatch`, `.scaled`, `.heat`

The "one chart stylesheet shared with the simulator and 222 reports" from notes §3.10 now
lives in `poker/tools.css` (SVG text/grid/value-label classes, histogram bar hooks, legend
rows with `--swatch`, `.scaled` text and `.heat` cells fed by `--scale` / `--heat`). The
Dice report and the OFC EV charts could consume the same hooks.

## 8. Error text and the load-error box: `.error-text`, `.error`

```css
.error { margin: 16px 0; padding: 14px 16px; border: 1px solid color-mix(in oklab, var(--bad) 50%, transparent); border-radius: var(--r-md); background: var(--bad-soft); font-size: var(--t-sm); line-height: var(--lh-body); }
.error-text { color: var(--bad); font-size: var(--t-sm); line-height: var(--lh-body); overflow-wrap: anywhere; }
```

The kit has `.dialog-error` and `.field-error`; a page-level alert box and an inline error
line under a form are missing.

## 9. `.mobile-hint`

A phone-only "swipe to see more" line under a horizontal scroller (heatmap, outs grid, the
simulator deck).

## 10. Option rows (`.opt`, `.opt-bar`, `.opt-verdict`, `.opt-section-title`, `.opt-tag`)

The Dodge simulator's cube option rows (label, centred equity bar, points, loss versus best,
`.best` / `.chosen` states) are the notes' preferred pattern for 222's cube tables. They stay
in `poker/dodge/simulator/styles.css` until 222 adopts them; then they belong in
`poker/tools.css` or the kit's `.list-row` family.

## 11. Crumb visibility

`.crumbs a { display: inline-flex }` in app.css outranks a bare `.desk-only { display: none }`
in a later file, so a crumb link that should disappear on phones needs
`.crumbs a.desk-only { display: none }` (done in `poker/tools.css`). The kit could carry
`.crumbs .desk-only` itself, or the tool pages could agree never to put a visibility class on
a crumb anchor.

## 12. `.stat--status`

A stat tile whose value is a sentence rather than a number (`font-size: var(--t-md);
font-weight: 600`), used for the simulator's Status tile. Small, but every live table page
has one.
