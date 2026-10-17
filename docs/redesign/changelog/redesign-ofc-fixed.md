# redesign/ofc-fixed — Step 3 (OFC), review fixes

Branch `redesign/ofc-fixed`, from `redesign/ofc-ev` (Play, Trainer and EV slices; see `redesign-ofc-play.md`, `redesign-ofc-trainer.md`, `redesign-ofc-ev.md`). Pages touched: `/ofc/fantasyland-ev/` and the trainer's rules dialog on `/ofc/fantasyland-trainer/`.

## Review fixes

An independent review of `redesign/ofc-ev` returned "needs fixes". Each finding was checked against the branch before it was fixed.

| # | Sev | Finding | What was done |
| --- | --- | --- | --- |
| 1 | P2 | Phone matrix: Tab lands on the definition links in the visually hidden head row, and sighted phone users cannot reach the column definitions | Confirmed at 375×812. At ≤680px (`matchMedia`, the same width as the stacked-card pass) the head row's `.definition-link`s get `tabindex="-1"`. Their names stay in the accessibility tree as column headers. A visible "Column definitions" chip row (`.matrix-definitions`, five 44px `button.chip.definition-chip[data-definition]`) above the cards replaces them. The click binding now selects `button[data-definition]`. |
| 2 | P2 | The distribution plot gets focus with no visible ring because the scroller clips the outside outline | Confirmed. `.distribution-plot:focus-visible` uses `outline-offset: -2px` (an inset ring). Keyboard focus also marks the mode bin (`.is-active`) and scrolls it into view, so the arrow keys start from a visible bin. |
| 3 | P2 | At 320px the Matrix tab scrolls sideways inside `main` | Confirmed (main 300 vs 296). `.ev-grid--matrix` uses `minmax(min(300px, 100%), 1fr)`. At 320 main is now 296 / 296 for High, Badeucey and Cribbage. |
| 4 | P2 | The repeat-source colours reuse the joker hues, which contradicts the always-visible joker legend | Confirmed. With six categorical tokens, the three joker hues plus seven source hues cannot all be distinct. So the joker legend (`#joker-legend`, now `role="group"`) moved from the control bar to just under the tab bar, and it shows only on Overview and Matrix, the tabs that use the joker hues (`JOKER_LEGEND_SECTIONS` in `app.js`). Because it sits under the tabs, hiding it never moves the tab bar. Repeat sources keeps its own source legend. |
| 5 | P2 | Clicking a definition link changes copy that is off-screen on desktop | Confirmed (copy at y=1067 in a 900px viewport). From `74em` (1184px at the default text size) the Matrix tab is a two-column grid: the matrix, deck and joker tables on the left, and `#definitions-panel` as a sticky side column on the right across all three. `.section-panel--matrix > .ev-grid--matrix` uses `display: contents`, so the markup order is unchanged. When a click leaves the copy outside the viewport (narrower screens, phones), the panel scrolls into view with `block: "nearest"`. Every swap is also announced in the polite status line. Measured: 1440×900 copy at 426–521, 1280×720 at 351–447, and after a deck-table click at 146–222 (sticky). |
| 6 | P2 | The rules-article renderer exists twice (EV and trainer) | Fixed. `createRulesArticle(document, variant, { repeatExtra, note })` is now exported from `ofc/fantasyland-core.js`, together with its private helpers (royalty groups, the cribbage 24+ list, rule-line tokenising). It is DOM-optional: it builds nodes only through the `document` passed in and returns `null` without one. The EV Rules tab (JJJ+ line through `repeatExtra`) and the trainer rules dialog (seed note) both call it, and each `app.js` loses about 170 duplicated lines. The output is unchanged: same classes, text and structure (checked in the trainer dialog and the EV tab for High and Cribbage at 1440 and 375). Play's rules dialog renders a different, HTML-string format with table rules, and the play browser suite pins it, so it is left alone. |
| 7 | P2 | The report was deleted and redirected without recorded author sign-off, and some report content was dropped | The decision is recorded here. The author's delegate decided, for this redesign run, that the Fantasyland report is folded into the EV page as an "Overview" tab and `/ofc/fantasyland-report/` redirects to `/ofc/fantasyland-ev/#overview`. That answers prompt.md's "fold or regenerate" question as **fold**. The dropped report pieces are listed in `redesign-ofc-ev.md`: the 24-sample snapshot, royalty-band bars, row-contribution chart, and the per-config detail panel with its config selector. The 10,000-sample data supersedes the snapshot and the bands. Row contribution needs a new precompute run, and the per-config detail is covered by the Overview matrix cells, the distribution row and the Matrix tab. The hub copy that still says "row mix" is in `ofc/index.html`, which the hubs step owns (see Deferred). |
| 8 | P3 | Engine-failure state: tabs dead, misleading badge | Fixed. `init()` now maps legacy hashes and binds the section tabs *before* the engine check. Without the engine, `showEngineFailure()` sets the badge to "Engine not loaded" (`badge--bad`), turns every `.empty-chart` placeholder, both table metas, the repeat empty state and the Rules panel into "Unavailable: the Fantasyland engine did not load.", and still raises the assertive toast. |
| 9 | P3 | Report deep links with a hash or query produce malformed URLs | Fixed on the EV side (a small logic change the finding requires). The redirect target stays `/ofc/fantasyland-ev/#overview`, as the delegate decided, and the redirect builder is not in this slice's files. On load, `normalizeHash()` reduces a chained fragment (`#overview#matrix`, `#overview?x=1`) to the last known section and rewrites the URL with `replaceState`. `/ofc/fantasyland-report/#matrix` now opens Matrix, `?x=1` and the bare link open Overview, and the report's old `#charts` maps to Overview (`LEGACY_SECTIONS.charts`). |
| 10 | P3 | Repeat-source percentages are hidden from assistive tech by the pinned aria-label | Fixed. The pinned `aria-label` stays. Each row now has `aria-describedby="repeat-values-<key> repeat-track-<key>"`, pointing at the repeat/SF totals and at the track, whose `aria-label` lists every source percentage. |
| 11 | P3 | aria-label on generic divs, and a verbose live region | Fixed. `#dataset-meta`, `#summary-grid`, `#joker-legend` and the repeat-source legend are `role="group"`. `#repeat-source-detail` is no longer `aria-live`. The page's one polite region is now a visually hidden `#ev-status` (`role="status"`), which announces only short confirmations: the selected hand ("Showing repeat details for 13 cards and 2 jokers.") and a definition swap. `#alerts` stays the assertive region. |
| 12 | P3 | Distribution bins are 32px targets on touch | Fixed. On `(pointer: coarse)` the bin tracks are built at 44px (`minmax(44px, 1fr)`, row min-width `n × 48px`), and the row already scrolls sideways. The old CSS `min-width: 32px` on bins, which overflowed its 30px track, is removed. Measured: 45px bins at 375×812 with touch. |
| 13 | P3 | Deferred cross-slice clean-up still pending (hub tile, README, css-literals row) | Not fixed: outside this branch's files. See Deferred. |

Also found while re-verifying at a 24px root font: at 320px the dataset badge and the "Off-rule card count (hypothetical)" chip did not wrap (main scrolled sideways by 32px), and at 375px the phone matrix's `::before` cell labels were `nowrap` (4px). Both now wrap (`white-space: normal` on `.ev-dataset .badge`, `.joker-chip--hypothetical` and the cell labels). At 16px nothing changes: single-line chips keep their kit height.

## Verification

- `node scripts/run-tests.mjs`: 451/451.
- `sh scripts/assemble-site.sh _site`, served on 127.0.0.1:
  - `OFC_EV_TEST_URL=…/ofc/fantasyland-ev/ node ofc/fantasyland-trainer/tests/extended-ev-browser.cjs`: passes at 1440×900, 390×844 and 430×932.
  - `OFC_TEST_URL=…/ofc/play/ node ofc/play/tests/browser.cjs`: all 11 checks pass.
- `SHELL_PAGES=/ofc/fantasyland-ev/,/ofc/play/,/ofc/fantasyland-trainer/ node scripts/shell-browser.cjs`: 3 pages × 3 viewports, 0 drift. With `SHELL_ROOT_FONT=24` (EV and trainer): 0 drift.
- `node scripts/screenshots.cjs --compare --only` the three OFC pages: the EV pictures changed (the legend now sits under the tabs). Both were reviewed and copied over the baselines. The trainer differs by 0.01% (its timer), so its baseline is unchanged.
- Scratch Playwright renders, reviewed:
  - phone Matrix (chip row, Tab order: chips, then the deck-table links; no hidden-head stops) and a definition click that scrolls into view;
  - Matrix at 1440, 1280 and 1100 (side column and sticky after a deck-table click);
  - 320 Matrix for High, Badeucey and Cribbage;
  - distribution focus with the inset ring and the mode bin marked;
  - Repeat sources at 375 and 1440 (no joker legend);
  - the five redirect/hash cases;
  - engine failure at 375 (tabs switch, badge and placeholders);
  - the EV and trainer Cribbage rules articles;
  - every EV tab at 1440, 1200, 375 and 320 with a 24px root (no overflow in `main` or in the document).

## Deferred

- `ofc/index.html` (hub tile still "Fantasyland Report", links to the redirect, says "row mix"), `README.md:13` (`fantasyland-report/`) and the `shared/tests/css-literals.json` row for the deleted stylesheet: owned by the hubs step and the integrator. The redirect keeps the old link working until then.
- `shared/tabs.js` calls `active.scrollIntoView({ block: "nearest", inline: "nearest" })` when the tablist overflows. At 320px with a 24px root that also scrolls `main` vertically on load, so the page opens slightly below the head. This is a shared file: it is requested in `docs/redesign/shared-requests/redesign-ofc-fixed.md`.
