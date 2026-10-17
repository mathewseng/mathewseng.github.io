# redesign/ofc-trainer — Step 3 (OFC), the Trainer slice

Branch `redesign/ofc-trainer`, from `redesign/ofc-play` (which holds the Play slice and the family stylesheet `ofc/ofc.css`). Page migrated: `/ofc/fantasyland-trainer/`.

## What changed

### `ofc/fantasyland-trainer/styles.css` (3399 → 759 lines, 135 → 0 colour literals)

Rewritten from the "trainer-first" layout only (the old ≥981px and ≤980px override blocks) on `shared/tokens.css` + `shared/app.css` + `shared/cards.css` + `ofc/ofc.css`. The dashboard base, the `body.ev-page` block, the dead solver classes (`.deck-grid`, `.sim-*`, `.progress-shell`, `.rules-grid`, `.assumptions-panel`, …), the five `!important`s, the `z-index: 2147483647` ghost and the `ios-notch-device` padding are gone. One phone pass (≤ 640px) plus a 390px card-size tweak and one short-desktop pass; no page `:root`, no alias shims left.

- Card sizes: one `--trainer-card-w` for the board and the bank, the smaller of "17 cards in one bank row" and "three rows plus the bank fit a 720px-tall window"; the script sets `--tray-count` (cards in this puzzle) and the `hand-cols-N` class, which the phone pass turns into `--tray-columns` for the two-row bank grid (≥ 36px cards, scrolling sideways only when even that cannot fit, as Play does).
- Board: `.ofc-board` / `.ofc-row` / `.ofc-row-head` / `.ofc-row-cards` / `.ofc-row-summary` from `ofc.css` inside the `.ofc-felt` stage; the active row is the kit's `.target` / `[aria-checked="true"]` state; `.drag-over` from the shared drag.
- Score summaries are `.hand-chip`s (good / bad tones), including the split-score variants (one chip per component, quiet `+`, `=`, `·` separators, a total chip for cribbage).
- Setup, report, solution and rules are kit `.dialog`s (`.dialog--sheet` on phones). The solution board reuses `.ofc-row` with a label | cards | chip grid, stacking to label + chip over cards on phones.
- The set-complete screen: a `.panel` with a grade tile, a `.stat-strip` and `.list-row`s.

### `ofc/fantasyland-trainer/index.html`

- Head: tokens → app → cards → ofc → page, all `?v=20261016`; `data-family="ofc"`; `theme-color #08090d`; `viewport-fit=cover`; the `is-ready` line; a `.skip-link` to `main#main[tabindex="-1"]`; the OFC favicon.
- Chrome: `.topbar` with `.crumbs` (MS → OFC → Fantasyland trainer) and the `.tool-nav` (Play · Fantasyland trainer · Fantasyland EV, `aria-current`); the Setup button and the Rules icon button in `.topbar-actions`.
- One toolbar (`.tool-head`): eyebrow, H1 (`#trainer-title`), the config line (`#trainer-config`, now "14 cards / 0 jokers · High") and Time / Points / Puzzle as a `.stat-strip`. The three control bands that repeated the config are gone.
- The Setup dialog (`#trainer-setup`) holds Mode, Set, Cards, Jokers, the "Current puzzle" read-out (`.trainer-current-config-control`, scope All) and Variant with its summary, plus an explicit **New random set** button and Done. The radio names, `#trainer-all-label`, `#trainer-card-count-options`, `.trainer-single-control` and `#trainer-variant-summary` are unchanged.
- The felt stage holds `#trainer-rows` (now `role="radiogroup"`, heads are `role="radio"`) and `#trainer-message` (the page's one polite live region). The bank panel has a "Cards · n of N" label and the Rank / Suit sort as a kit `.segmented` group (same ids, `aria-pressed`).
- The shell's `.action-stage` holds Clear set · Fill rest · Confirm, then Report · Solution · Next / Finish set after a confirm, each with a keycap from `shared/keycap.js` (hidden on coarse pointers).
- `#trainer-report`, `#solution-drawer` and `#variant-rules-dialog` are native `<dialog class="dialog dialog--sheet">`s with the kit head/body/foot; the rules tabs are a real `.tabs` tablist driven by `shared/tabs.js`. `#trainer-alerts` is the one assertive region.
- `#trainer-complete`: the "Set complete" screen (grade, score, time, max count, missed FLs, one `.list-row` per puzzle) with Copy report, Report, New random set and Back to the board.

### `ofc/fantasyland-trainer/app.js` (4301 → 3914 lines)

Engine untouched (the eight engine tests still load the file in a VM and pass; `window.OFCSolverCore` and `module.exports` are unchanged, so the EV page keeps loading it as a library behind the `#trainer-rows` guard).

- Deleted the ~20 stale element ids from `cacheElements` and every branch that only they reached: the deck grid, card input parser, Solve/Random/Clear hand buttons, repeat/five-kind selects, the Monte-Carlo simulation matrix (`runSimulationMatrix`, `SCENARIOS`, `yieldFrame`, `formatPct`), `dealIds`/`shuffle`, and the UA-sniffing `applyMobilePlatformClasses` (`env(safe-area-inset-top)` in `ofc.css` replaces it).
- Drag: `startTrainerPointerDrag` and its fourteen helpers (ghost, lift/drop transitions, click suppression, native `dragover`/`drop` handlers that could never fire with `draggable="false"`) are replaced by `shared/card-drag.js`: `canDragTrainerCard` / `resolveTrainerDrop` / `dropTrainerCard` keep the same rules (append to a row or return to the row's own index, drop on the bank to recall, 13-card cap). The bank placeholder now carries `data-bank-id` (not `data-card-id`) so the controller never lifts an empty slot.
- Board rendering adds the kit classes beside the old hooks (`.trainer-row.ofc-row`, `.trainer-row-head.ofc-row-head[role="radio"]`, `.trainer-slots.ofc-row-cards`, `.trainer-row-summary.ofc-row-summary`), restores focus to the checked head after a re-render, and renders summaries through one `handChip()` helper.
- Rules: the tabs are built once and driven by `shared/tabs.js`; `renderVariantRulesArticle` renders the article.

### Behaviour changes required by notes.md §3.14 (completeness pass)

Each is the smallest change that fixes the listed finding; everything else (puzzle loop, hotkeys 1/2/3/R/S/C/Space, sort, `hand-cols-N`, live row summaries, the share text format, `ofcFantasylandTrainerState.v1` resume, daily seeds) is unchanged.

1. **Hotkeys under dialogs**: `shouldIgnoreTrainerHotkey` returns early while any `dialog[open]` exists, while a drag is in progress and on the complete screen (Play's guard pattern). The report dialog keeps its own C-to-copy listener; Escape closes it (Space no longer does).
2. **Auto-fill as a staged step**: Confirm no longer fills the board silently. A **Fill rest** button (hotkey F) fills the remaining slots from the bank in its sort order and says what it did in `#trainer-message`; Confirm enables only when the board is complete and legal, and a complete-but-fouling board says so in the message. (`fillTrainerSetFromBankOrder` is unchanged; the pending-evaluation guard that evaluated the hidden fill is gone with it.)
3. **Opt-in report**: a confirm no longer opens the report; it shows the result sentence (now with "n of N royalties") and the Report / Solution / Next actions. `reportOpen` is still saved but a saved page never reopens the report on load.
4. **Set complete**: after the last puzzle's confirm, **Finish set** (Space) shows the summary screen built from the recorded results (`trainerShareAggregate`: grade, score, time, missed FLs) with a row per puzzle; `complete` is saved in the snapshot (version 4 field; older snapshots read as not complete). "Back to the board" returns to the last puzzle.
5. **Confirm on destructive setup changes**: a Mode / Set / Variant change, a Cards / Jokers change in Single scope, or New random set asks "Start a new set?" (kit confirm with a danger verb) whenever a result exists or cards are on the board; cancelling puts the radios back. Clicking the already-selected Random pill no longer reshuffles; **New random set** (in Setup and on the complete screen) does.
6. **Rules tabs only change the article**: the old tab click also checked the matching variant radio and dispatched `change`, which restarted the set; with the confirm above that would have prompted from inside the rules dialog. The Setup dialog is the one place the variant changes.

### Live regions, focus, floor

`#trainer-message` (polite) and `#trainer-alerts` (assertive, used for a failed clipboard copy) are the only `aria-live` regions; `#hand-message` inside the solution dialog is plain text. Every control is a kit control with the kit's focus ring; the row heads are 44px on phones; keycaps and the eyebrow hide on phones instead of shrinking; nothing renders under 12px at 1440, 375 or 844×390.

## Deferred

- The landscape-phone (844×390) layout keeps the action stage as the sticky bottom row rather than a right-side column; `main` scrolls and nothing overflows, and the prompt lists the side column as a refinement, not a requirement.
- The archived split-middle variants (BadugiJack, Double Blackjack) keep their render paths and a minimal token-only style block; they cannot be selected (`ACTIVE_VARIANT_ORDER` excludes archived variants and saved states with them are rejected), so they were not redesigned.
- The hub tile still says "Fantasyland Trainer" (title case) while the tool nav and crumb say "Fantasyland trainer"; the hub is not in this slice's files.

## Verification

- `node scripts/run-tests.mjs`: 451/451 (the eight trainer engine tests included; the colour-literal lint logs the trainer's drop to 0).
- `SHELL_PAGES=/ofc/fantasyland-trainer/ node scripts/shell-browser.cjs`: no overflow, no text under 12px, no target under 44px on the phone viewports, focus rings present, skip link and `main#main` at 1440×900, 375×812 and 844×390; the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /ofc/fantasyland-trainer/`: both pictures reviewed (landing state) and copied over the baselines. A scratch Playwright script rendered the partial, filled, setup, confirm-discard, rules, confirmed, report, solution and set-complete states at all three viewports and at a 24px root font, and a second one exercised the shared pointer drag (bank → row → row → bank), the 1/2/3/C hotkeys and the dialog guard; no console errors.
- `node ofc/play/tests/browser.cjs` (against the assembled site): passes.
- `node ofc/fantasyland-trainer/tests/extended-ev-browser.cjs` (targets `/ofc/fantasyland-ev/`): fails at its "Show repeat details for 13 cards and 2 jokers" click (the row resolves but Chromium reports it not visible) **both with this slice's `app.js` and with the pre-slice `app.js` served in its place**, and the EV page's own files are untouched on this branch, so the failure is inherited and belongs to the EV sub-step. Every assertion before that click (matrix rows, charts, samples, precomputed EV values, no NaN, no overflow) passes with the new library file.
