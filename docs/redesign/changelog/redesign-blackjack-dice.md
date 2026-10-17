# redesign/blackjack-dice — step 4 (standalone): Blackjack Strategy Lab and Fair Dice Payout Explorer

Pages migrated: `/blackjack/strategy/`, `/dice/reports/`.

## What changed

### `/blackjack/strategy/` (commit "Blackjack Strategy Lab onto the shared kit")

- Head: `tokens.css` → `app.css` → `cards.css` → `styles.css`, all `?v=20261016`; `data-family="blackjack"`; theme-color `#08090d`; `viewport-fit=cover`; the `is-ready` line; `tabs.js`, `sheet.js`, `cards.js`.
- Chrome: skip link to `main#main[tabindex="-1"]`; `.topbar` with crumbs MS → Blackjack → Strategy Lab, a `.tool-nav` (Strategy Lab, `aria-current`) and "Share link" in the actions; `.tool-head` with the house edge and true count as a `.stat-strip`; Chart / Hand / Count / Rules as a real `.tabs` tablist (`shared/tabs.js`) that still sets `data-view` on `.workspace` below 1000px.
- Chart: the `.matrix` stage with fills from `--hit/--stand/--double/--split/--surrender` (Hit red, Stand green as the hub), cells ≥ 28px, 12px tabular labels, index badges on a 12px second line, dealer bust percentages on a second header line, legend as `.chip`s, one tab stop with a roving tabindex and arrow keys, `aria-label` instead of `title` on cells.
- Toolbar above the chart (View, Indices, Options sheet holding the index range, decimals, "Reverse dealer order", "Colourblind palette", "Show count indices"); audit tiles, benchmark figures, solve time and the GitHub links in an "About the engine" disclosure; rule switches as kit `.switch` controls (focus works); the dealer outcome dialog as a kit `.dialog` (sheet on phones) with `aria-labelledby`.
- Logic changes the notes (§3.17) required: "Copy config" is an explicit "Share link" that copies the permalink and says so in a toast; card-pad key shortcuts (2–9, T, A); EV-view cell colours and cell text read tokens. Solver, hash config and storage untouched.
- `styles.css` 1906 → 1266 lines, colour literals 104 → 0, no `:root`, no `!important`. The regression test's stub-DOM contract is kept; no test changed.

### `/dice/reports/` (commits "Fair Dice Payout Explorer onto the shared kit" and the follow-up)

- Head: `tokens.css` → `app.css` → `styles.css` → `matchups.css` → `matchup-play.css` → `cycles.css`, all `?v=20261016`; `data-family="dice"` (lilac); favicon regenerated from the family colour; theme-color `#08090d`; `viewport-fit=cover`; the `is-ready` line; `tabs.js`, `sheet.js`.
- Chrome: skip link to `main#main`; `.topbar` with crumbs MS → Dice → Fair Dice Payout Explorer, a `.tool-nav` and "Custom payouts" (icon-only on phones) in the actions; `.tool-head` with one page name (title, H1 and crumb all read "Fair Dice Payout Explorer"); Explore / Matchups / Play as a real `.tabs` tablist (`shared/tabs.js`, `data-view` hooks and `aria-pressed` kept, `aria-selected` added).
- One control style for the four tab styles: mode, dice count, roll speed and face choice are kit `.segmented` groups (buttons with `aria-pressed`); the six Matchups sub-tabs are a second `.tabs` tablist (`data-match-tab` hooks and `aria-pressed` kept).
- Type: Inter from the token stack, mono only on numeric columns, dice values, PnL and the exact-arithmetic proofs; a 12px floor throughout (the chart axes scale their SVG font so the rendered size stays about 12px on phones).
- Explore: results table as the kit `.data-table` inside `.table-wrap--sticky-col` (rank column pinned, sortable heads with 36/44px buttons, `aria-sort` kept), featured strip and search status on tokens, `.empty-state` kept. The inspector is a `.panel` on desktop and the kit `.dialog--sheet` on phones (`shared/sheet.js`): `data-view="analysis"` and `#back-to-schedules` still drive it, Escape and a backdrop tap close it and return to Explore, arrow keys still step schedules while it is open. "How the math works" moved out of the sidebar into a Method dialog (`#method-dialog`, opened from the inspector); the per-metric notes stay in the inspector. Dead markup removed: `#filters-disclosure`, `.ranking-note`, `.live-dot`, the hidden `.contribution-bar`.
- Play: table and paytable as panels; roll speed as `.segmented`; the roll button as the primary button; phone paytable as two-column tiles at 13/15px that still scroll vertically (the browser test asserts the hit row scrolls into view); short phones (≤ 720px tall) compact the header and hide the paytable heading (the schedule select keeps its `aria-label`).
- Dialogs: filters, probabilities, ranking, method, checker and percentile are kit `.dialog--sheet`s with `.dialog-head/-body/-foot`, kit fields and switches, and the kit close button.
- Matchups: kit `.field`s (label above control), `.btn`s, `.table-wrap` + `.data-table`, `.disclosure`s, `.badge`; wins / ties / losses on `--good / --warn / --bad`; the heat grid and matrix mix `--good` over `--surface-3`; heat-cell ink reads `--on-accent`/`--ink`; charts gained a wider left gutter so axis labels fit on phones.
- Logic changes the notes (§3.18) required: hash-to-view routing on load and `hashchange` for `#explore`, `#matchups`, `#cycles` and `#play` (the Dice hub links to these; `#play` waits for the first search result); the skip link stays on `main#main` instead of being rewritten per view; "↗" removed from in-page actions; chart fills and the baseline read tokens; the contribution-bar span is no longer emitted. Engines, workers and stored state untouched.
- CSS: `styles.css` 1969 → 2141 lines (the old file packed several rules per line; this one is one declaration per line), colour literals 44 → 0; `matchups.css` 939 → 1060 lines, 6 → 0 literals; `cycles.css` 469 → 517; `matchup-play.css` 277 → 333. No `:root`, no `!important`.
- Two layout rules exist for the Playwright suites and are commented in `styles.css`: the shell uses percentage heights (dvh resolves a frame after `setViewportSize`), and under reduced motion elements without an explicit transition get `transition-property: none` (see shared requests).

## Verification

- `node scripts/run-tests.mjs`: green (the colour-literal lint reports blackjack 104 → 0, dice 44 → 0 and matchups 6 → 0 as lower than baseline; the baseline was not re-recorded).
- `node dice/reports/tests/browser.cjs`: green. It drives `matchups-browser.cjs`, which drives `matchup-play-browser.cjs` and `cycles-browser.cjs` (the three are modules, not standalone scripts).
- `SHELL_PAGES=/blackjack/strategy/,/dice/reports/ node scripts/shell-browser.cjs`: no overflow, no targets under 44px, no missing focus rings, no text under 12px, skip link and `main#main` on both pages at all three viewports; the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /blackjack/strategy/,/dice/reports/`: all four pictures reviewed at 1440×900 and 375×812 and copied over the baselines.
- Scratch Playwright scripts rendered the dialogs, the phone inspector sheet, every Matchups panel, play after rolls, the empty and error states, 320×568, 844×390 and the 24px-root views of both pages.

## Deferred, with reasons

- Dice hub tiles: the hub (`/dice/index.html`) is outside this branch's files. The page now routes `#explore`, `#matchups` and `#play` on load, so the integrator's hub tiles can deep-link to them as decided.
- The Dice H1 is hidden only on short phones (≤ 760px wide and ≤ 720px tall, the old page's compaction case) so the Play view fits 320×568 with the roll action visible; the crumb still shows the full name there.
- `styles.css` for Dice did not get shorter in line count (see above); every rule was rewritten on tokens, which was the brief's aim, but no further pass was spent compressing it.
- Inter is not self-hosted (author's decision); only weights 500–800 are used.
- Blackjack's "Could not copy" toast appears in headless runs where the clipboard is denied; the link is still in the address bar, which is the designed fallback.
