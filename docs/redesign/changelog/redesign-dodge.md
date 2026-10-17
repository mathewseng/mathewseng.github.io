# redesign/dodge — Step 2, Dodge half (`/poker/dodge/`, `/poker/dodge/simulator/`)

Pilot migration of the two Dodge pages onto `shared/tokens.css` + `shared/app.css`, plus a new
`poker/tools.css` that the other two poker tool pages (222, Calculations) can adopt in their
own slices. This is the template for later families: what moved where, and what the numbers did.

## The numbers

| File | Before (main `3d2e4dc`) | After | Colour literals |
| --- | --- | --- | --- |
| `poker/dodge/styles.css` | 2,539 lines | 1,497 lines | 67 → 0 |
| `poker/dodge/simulator/styles.css` | 1,353 lines | 1,157 lines | 55 → 0 |
| `poker/tools.css` (new, shared by the poker tool pages) | — | 356 lines | 0 |
| `!important` outside tokens.css | 10 | 0 | |
| Page `:root` palettes and root font-size overrides | 2 | 0 | |
| Desktop/mobile duplicate label pairs in the DOM | 20+ | 0 | |

`shared/tests/css-literals.json` was not re-recorded (the test logs the lower counts); the
integrator records the baseline.

## What changed on both pages

- Head: `tokens.css` → `app.css` → `cards.css` → `../tools.css` → `styles.css`, each with
  `?v=20261016`; `<html data-family="poker">`; `theme-color #08090d`; `viewport-fit=cover`;
  the `is-ready` line; a `.skip-link` to `main#main[tabindex="-1"]`.
- Chrome: the `d•DODGE` wordmark is gone. `.topbar` with `.crumbs` (MS mark → Poker → tool) and
  a `.tool-nav` listing Dodge reports · Simulator · 222 · Calculations with `aria-current`;
  the page's own views are a real `.tabs` tablist driven by `shared/tabs.js` (keyboard model,
  sliding indicator, `aria-selected`, panels toggle `hidden`). The simulator keeps its
  `#sim/#trainer/#online/#reports` hashes and the `#spot=` / `#room=` deep links (the boot hash
  is read before the tablist initialises so a deep link is not overwritten).
- Colour: brand green → the poker accent for navigation, selection and the one primary
  action; green/red/amber → `--good/--bad/--warn`; chart series and bust categories →
  `--cat-*` through `--dodge-cat-*` aliases on `<body>` that `charts.mjs` pipes inline as
  `var()`; the scatter canvas reads its colours from `getComputedStyle`; the simulator's
  `scaleColor()` is a two-segment `color-mix()` of the semantic tokens instead of an HSL
  formula, so bars, badges and tiles share colours. No colour literal lives in CSS or JS.
- Type: root font is the browser default (16px); every rendered text node is at least 12px
  at both viewports (shell sweep, `SHELL_PAGES=/poker/dodge/,/poker/dodge/simulator/`).
- Components from the kit instead of page copies: `.btn` family (also for every button
  `app.js` builds), `.field` / `.field--select` / `.check`, `.segmented`, `.stat-strip` /
  `.stat` (summary strips, payout summary, report KPI tiles), `.panel` / `.panel-head` /
  `.panel-body` / `.panel-foot`, `.data-table` inside `.table-wrap` (the explorer table with
  `.table-wrap--sticky-col`, the detail and payout tables, every report mini table), `.bar` /
  `.bar-list` / `.bar-row` (outcome rows, texture bars, report bars), `.badge` tones, `.chip`,
  `.dialog` (+ `.dialog--sheet` on phones through `shared/sheet.js`: backdrop tap, keyboard
  viewport fitting, focus return), `.toast-stack`, `.progress` + `.bar--indeterminate` for
  the loading states, `.icon` sprite, `.sr-only`.
- Live regions: one polite `.toast-stack` per page (the simulator gained one; "Link copied."
  moved there out of the `role="alert"` error slot) and one assertive `role="alert"` per page
  (`#load-error`; `#spot-error` / `#on-error` are in mutually exclusive tab panels).
- Phone/desktop label pairs (`.desktop-only` / `.mobile-only` with `!important`) replaced by
  one label plus `.phone-sr` (visually hidden at ≤700px, still in the accessibility tree) and
  `.desk-only` / `.phone-only` where the element itself differs.

## `/poker/dodge/` (notes §3.10)

- App shell kept: the topbar, tool head, tabs, filters and summary are fixed chrome; the
  explorer table, side column, reports and lab scroll internally; tablets (≤850) scroll the
  explorer as a whole with the inspector under the table; phones keep the bottom-sheet
  inspector (`#hand-dialog`, now the kit's `.dialog--sheet`) and the `#reopen-hand` bar.
- Sticky offsets: the head, aggregate and baseline rows read `--dodge-head-h` /
  `--dodge-row-h` (40/46px desktop, 44/56px phones); no pixel literal is tied to a row height.
- Pin buttons are 36px icon buttons on desktop (44px on phones in the inspector) with
  `aria-pressed`; hidden in the phone table as before (the inspector pins).
- Heatmap cells are 28px/12px text on desktop and 44px on phones in a horizontal scroller
  with sticky row labels; colour is piped as `--t` and the value is also the cell's text.
- The scatter canvas has `role="img"`, its label, and `aria-describedby` pointing at a
  visually hidden per-suit-pattern summary (count, mean draws, mean SD) that re-renders with
  the filter.
- Summary tiles, payout summary → `.stat-strip`; outcome rows → `.bar` with the category
  colour; texture rows → `.bar` + `.mini-stack`; the mean-draws column tint is a
  `color-mix()` of `--good` by `--tint`.
- The `/` shortcut, shift-click multi-sort, column presets and the Columns dialog, the metric
  rule builder, chart re-render on resize and the toast all behave as before.
- Dead CSS deleted: the wordmark, pill tabs, dead chart stylesheet rules, hand-rolled clip
  utility, `html:has(dialog[open])`, the `.tag` eyebrows, five copies of the table styles.
- Kept in JS deliberately: `syncResponsiveLayout()` still moves the export button, the
  inspector and the chart panels between the side column and their phone homes; the
  `matchMedia` breakpoints (700 / 851) match the CSS.

## `/poker/dodge/simulator/` (notes §3.11)

- Split layout kept (both columns scroll on desktop, the view scrolls on ≤960); `.opt` option
  rows with the centred equity bar, `--scale/--heat/--shade` piping, badges (now kit tones),
  arrow-key history stepping, `#spot=` and `#room=` deep links, `dodge.player.name` storage.
- Tabs: real tablist; the previous `aria-current=""` is gone.
- Phone toolbar grouped: the step buttons sit at the end of the first row as 44px icon
  buttons (labels `.phone-sr`), the actions take a full row with one primary (`New deal` /
  `New game`); the online room toolbar wraps the same way.
- Telemetry (games simulated, compute ms) moved out of the KPI strip into a small line under
  the deck; the status tile spans the strip on phones.
- The "Solve a spot" disclosure sets `aria-expanded`; spot inputs are labelled fields.
- Prompts carry `role="status" aria-live="polite"`; action rows are rebuilt through
  `replaceActions()`, which keeps keyboard focus on the same-labelled button (or the first
  enabled one) across re-renders.
- Report mini tables and the 14-column heatmap sit in horizontal scroll wrappers; the heatmap
  floor is 12px.
- Phone deck: the 13-column deck matrix scrolls sideways at 44px per card instead of
  shrinking to 22px buttons.
- A back link to the reports page exists on phones through the tool nav ("Dodge reports");
  the "Dodge" crumb shows on desktop only.
- Dead CSS deleted: `.page-heading`, `.breadcrumb`, 30px `h1`, suit tokens, `.review-banner`;
  the 900/960 breakpoints are merged into one.

## Verification

- `node scripts/run-tests.mjs`: green (the shell sweep inside it covers both pages).
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=/poker/dodge/,/poker/dodge/simulator/
  node scripts/shell-browser.cjs`: no overflow, no target under 44px, no missing focus ring,
  no text under 12px, skip link and `main#main` on both pages at 1440×900, 375×812, 844×390;
  the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /poker/dodge/,/poker/dodge/simulator/`:
  reviewed at both viewports; the four Dodge baselines are replaced.
- A scratch Playwright script rendered 88 state pictures at 1440×900, 1366×768 and 375×812
  (filters open, metric rule, pinned comparison, columns and methodology dialogs, phone hand
  sheet, reports and lab tabs top and bottom, empty table; deal, draw, play-out, cube mode,
  spot solver with an error, trainer game and step, reports top/mid/bottom, rules sheet, the
  online lobby, a two-page room (create and join in one context), start, six actions, guest
  leaving) and audited each for overflow, text under 12px and targets under 44px.

## Deferred (with reasons)

- Moving the export button and the inspector with CSS `order` instead of JS DOM moves (notes
  §3.10 P3): the inspector must land inside the sheet dialog on phones, which CSS cannot do;
  the export button follows the same `syncResponsiveLayout()` call, so one mechanism was kept.
- A tabular alternative for the scatter plot with one row per hand class (16,432 rows): the
  per-suit-pattern text summary describes the picture; a full table would dwarf the page.
- Chart margins at 200% text zoom: `charts.mjs` sizes axis gutters in pixels, so at a 24px
  root the y-axis labels touch the panel edge. No overflow or clipping of data; a `rem`-based
  gutter is a chart.mjs change for the shared chart stylesheet step.
- `#spot-error` and `#on-error` are two `role="alert"` slots on one page; they live in
  different tab panels and only one is ever rendered, so they were left in place rather than
  merged into one slot that both views would have to share.
