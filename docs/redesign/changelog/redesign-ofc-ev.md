# redesign/ofc-ev — Step 3 (OFC), the EV and Report slice

Branch `redesign/ofc-ev`, on top of the Play and Trainer slices (`ofc/ofc.css`). Page migrated: `/ofc/fantasyland-ev/`.
Page removed: `/ofc/fantasyland-report/`, folded into the EV page and redirected to `/ofc/fantasyland-ev/#overview`.

## What changed

### `/ofc/fantasyland-ev/`

- **Head and chrome**: tokens → app → ofc → page, all `?v=20261016`; `data-family="ofc"`; `theme-color #08090d`; `viewport-fit=cover`; the `is-ready` line; a `.skip-link` to `main#main[tabindex="-1"]`; `.topbar` with `.crumbs` (MS → OFC → Fantasyland EV) and the family `.tool-nav` (Play · Fantasyland trainer · Fantasyland EV, `aria-current`). The tool head carries the eyebrow, H1, lede (no longer hidden below 1360px) and the dataset line: "10,000 samples per configuration" and "Exact trainer solver · generated 25 Sept 2026", both read from `window.OFCFantasylandPrecomputed`.
- **Control bar**: the variant picker is the kit's `.segmented` (wrapping, focus surfacing), the JJJ+ rule is the kit's `.switch`, and a persistent legend chip row sits under it: one hue per joker count (`--cat-1/3/5`) used by every chart and table on every tab, plus a hatched "Off-rule card count (hypothetical)" chip when the variant has hypothetical counts.
- **Tabs**: Overview · Repeat sources · Matrix · Rules, a real `.tabs` tablist on `shared/tabs.js` (hash + `ofcFantasylandEv.section` persistence unchanged). The old `#ev` and `#foul` hashes (and saved sections) open the Overview with that metric selected.
- **Overview** (Royalty EV, Repeat and Foul merged, plus the report's content): the report's four metric cards as a `.stat-strip`, its insight cards ("Key takeaways"), and its matrix cells as the metric matrix — card counts down, joker counts across, each cell a value, a bar in the joker hue and a companion metric — driven by a Royalty EV / Repeat / Foul metric toggle. Every number is computed from the precomputed 10,000-sample results, so the overview and the Matrix tab agree. The royalty distribution follows: one row per configuration, 12px bin labels, the mode (or the tapped / arrowed bin) read out in the row header, arrow keys and Home/End across the bins.
- **Repeat sources**: stacked bars per configuration (still `<button aria-pressed>` with the pinned aria-label), segment labels in dark ink on the light fills at 12px and shown only when they fit, the selected row's full breakdown and the frequency groups below; an empty state when a variant has no repeat-path counts.
- **Matrix**: the full table (sticky first column), definition links with the kit focus ring and 36px (fine) / 44px (coarse) targets, the definitions panel, the deck-composition EV table and the joker-draw probability table. On phones the main matrix becomes one card per configuration (the head row visually hidden, each cell labelled from `data-label`), with no horizontal scroll.
- **Rules**: the shared rules article from `ofc/ofc.css`, rules tabs on `shared/tabs.js`; they only change the article shown.
- **Layout**: one scrolling `main` at every width (the `.ofc-shell`), no per-panel `max-height`, no nested scrollers except the distribution rows' horizontal bin strip and the two small deck tables' `.table-wrap`.
- **Code**: the unreachable Monte-Carlo run path (worker pool, main-thread runner, aggregates, benchmark, estimate, progress UI, rules-dialog bindings) and `worker.js` are deleted; the page no longer loads `ofc/fantasyland-trainer/app.js`. `scenarioKey`, `choose` and `hypergeometricJokers` are exported from `ofc/fantasyland-core.js`. `app.js` 1651 → 1380 lines.
- **CSS**: `styles.css` 1911 → 1050 lines, 71 → 0 colour literals, no `!important`, no `:root`, no alias shims. Reduced motion is inherited from `tokens.css` (bar width and segment-label transitions use the token durations).
- One polite region (`#repeat-source-detail`) and one assertive region (`#alerts`, used when the engine fails to load).

### `/ofc/fantasyland-report/`

Deleted. `redirects.json` maps it to `/ofc/fantasyland-ev/#overview`. Its screenshot baselines are deleted. What moved and what did not:

- Moved: metric cards, insight cards, matrix cells (Overview), dataset size and date (tool head), joker exposure with weighted EV / repeat (the Matrix tab's deck-composition and joker-probability tables), the per-config histogram (the distribution chart, now exact).
- Dropped: the 24-sample snapshot dataset (it disagreed with the 10,000-sample results); the royalty-band stacked bars (the exact integer distribution supersedes the five bands); the row-contribution chart (the precomputed dataset has no per-row royalty averages, so it cannot be computed from the 10,000-sample results without a new precompute run).

### `ofc/ofc.css`

- `.cribbage-hand-pattern small` at 12px (the "(2 nobs)" note rendered at 10.8px in every rules article).

## Tests

- `ofc/fantasyland-trainer/tests/ev-metrics.test.cjs`: the assertions on the deleted run path (solver delegation through `solveSample`, `finalizeAggregate` / `aggregateFromResult` / `mergeAggregate`, `sampleChunkSize`, `formatDuration`) are removed; the complete-solver check now calls the trainer solver directly, the precomputed-gate check builds its aggregate literally, and new assertions cover the core helpers. The precompute scripts keep their own aggregate code.
- `ofc/fantasyland-trainer/tests/extended-ev-browser.cjs`: clicks the Matrix and Repeat sources tabs before measuring or clicking inside those panels. The page was already tabbed on `main`, where the test failed at the hidden repeat-details button; every assertion is otherwise unchanged.

## Verification

- `node scripts/run-tests.mjs`: 451/451.
- `SHELL_PAGES=/ofc/fantasyland-ev/ node scripts/shell-browser.cjs`, and again with `SHELL_ROOT_FONT=24`: no overflow, no text under 12px, no small targets, rings present, skip link and `main#main` at 1440×900, 375×812 and 844×390. A scratch audit walked every tab for High, Badeucey and Cribbage at 1440, 375, 844×390 and 320, at 16px and 24px root: no overflow, no text under 12px, no target under 36px (fine) / 44px (coarse) apart from the kit's 30px segmented pills inside their 36px track on desktop.
- `node scripts/screenshots.cjs --compare --only /ofc/fantasyland-ev/`: both pictures reviewed and copied over the baselines. Scratch renders reviewed: every tab at both viewports for High, Low, Badeucey and Cribbage, the engine-failure toast, keyboard focus on definition links and distribution bins, a 24px root font.
- `node ofc/fantasyland-trainer/tests/extended-ev-browser.cjs` against `_site`: passes at 1440×900, 390×844 and 430×932.
- `node ofc/play/tests/browser.cjs` against `_site`: passes.

## Deferred

- `ofc/index.html` still links its third Fantasyland tile to `/ofc/fantasyland-report/` (it now redirects); the hubs step retitles it "Fantasyland overview" and points it at `/ofc/fantasyland-ev/#overview`.
- `README.md` still lists `fantasyland-report/` under `ofc/`, and `shared/tests/css-literals.json` still has a row for its deleted stylesheet (a missing file is ignored by the lint); both are outside this slice's files.
- A report deep link with a hash (`/ofc/fantasyland-report/#matrix`) redirects to `/ofc/fantasyland-ev/#overview#matrix`, which the tab helper treats as unknown and opens the saved or default tab; the redirect builder appends the old hash and is not in this slice's files.
- The trainer's `#trainer-rows` library guard stays: nothing loads the trainer as a library in the browser any more, but `ofc/fantasyland-ev/scripts/precompute-config.cjs` and the tests still `require` it in Node.
