# Shared requests from `redesign/bg-content` (Backgammon content, step 6)

Components the Backgammon content work needed that belong in
`shared/app.css`. Each is implemented locally in `backgammon/styles.css`
under a family-prefixed or page-scoped class; the selector, CSS and pages
are listed so the integrator can lift them. The requests in
`redesign-bg-shell.md` still stand.

## 1. `.action-stage`

The brief's sticky action bar is not in `app.css`. Play's confirm stage is
`div.board-actions.action-stage.bg-action-stage` (`play/app.js`): a
full-width row under the board on stacked layouts and in the landscape
dock; on wide tables `#confirm` moves to the end of the action row instead
(bottom-right), so the primary action has one home per layout. Styled
locally as `.board-actions` / `#confirm` (section 4 of the stylesheet).

Request: `.action-stage { position: sticky; bottom: 0; display: flex;
gap: 8px; padding: 8px 0 env(safe-area-inset-bottom); background:
var(--glass); border-top: 1px solid var(--line) }` with a `--stage-h`
ResizeObserver helper. Pages: every app shell (Backgammon Play first).

## 2. Result card (`.bg-result-card`)

One overlay card for "game over" and "session complete": eyebrow, title,
a stat strip, optional note. Used by Play (`.game-over-card`, single /
gammon / backgammon, points, score, cube) and Trainer
(`.trainer-summary`).

```css
.bg-result-card { position: absolute; z-index: 3; display: grid; gap: 10px;
  width: min(520px, calc(100% - 48px)); padding: 18px 20px 16px;
  border: 1px solid var(--line-strong); border-radius: var(--r-lg);
  background: var(--surface); box-shadow: var(--shadow-raised); text-align: center; }
.bg-result-card h2 { margin: 0; font-size: var(--t-xl); font-weight: 700; }
```

Request: `.result-card` in `app.css`. Pages: Backgammon Play/Trainer,
poker tables (showdown), OFC trainer ("Set complete"), Rush game over.

## 3. Wrapping stat strip

The kit `.stat-strip` is a grid; with five stats in a narrow card it leaves
empty grid cells on the last row. Backgammon uses a flex variant:

```css
.bg-result-card .stat-strip, .trainer-summary-stats { display: flex; flex-wrap: wrap; }
.bg-result-card .stat, .trainer-summary-stats .stat { flex: 1 1 80px; }
.bg-result-card .stat-label, .trainer-summary-stats .stat-label { white-space: normal; }
```

Request: `.stat-strip--wrap`. Pages: any summary with an odd stat count.

## 4. Progress steps (`.trainer-steps`)

A segmented "n of N" indicator: `ol` of equal pills, `aria-current="step"`
on the current one, each step's result as visually hidden text, the tone
repeated as colour (`--good/--warn/--bad`, a dashed pill for skipped).

Request: `.progress-steps` (the kit's `.stepper` name is taken by the
number input). Pages: Backgammon Trainer; OFC trainer sets; Gym plans.

## 5. Inspector sections

Solver and Library group their inspectors into labelled sections (12px
uppercase muted title, 1px top rule, full-width buttons) and Library adds a
red-bordered danger zone:

```css
.solver-group, .library-group { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--line); }
.solver-group-title, .library-group-title { margin: 0; color: var(--muted); font-size: var(--t-xs);
  font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.library-group--danger { padding: 12px; border: 1px solid color-mix(in oklab, var(--bad) 40%, transparent); border-radius: var(--r-md); }
```

Request: `.panel-section`, `.panel-section-title` and `.danger-zone`.
Pages: Backgammon Solver/Library; every settings or inspector panel with a
destructive action.

## 6. Multi-line list rows

`ui/analysis.mjs` builds evaluated-move rows as a `button.list-row` holding
a `.row.spread` line (notation | value) and two secondary lines. In the
kit's three-column `.list-row` grid those children were squeezed side by
side. Local fix: `button.list-row:has(> .row.spread) {
grid-template-columns: minmax(0, 1fr) }`.

Request: a `.list-row--stacked` modifier (one column, children stack).
Pages: Backgammon Trainer/Solver results; any ranked list with metadata.
