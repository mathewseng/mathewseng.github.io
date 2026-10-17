# `redesign/bg-content` — Backgammon content (step 6, content half)

Continues `redesign/bg-shell` (the shell half, see
`redesign-bg-shell.md`). Pages changed: `/backgammon/play/`,
`/backgammon/trainer/`, `/backgammon/solver/`, `/backgammon/library/`.

## Merge of the author's Backgammon work

`origin/main` (69e4075, f2cbb64, dc3b3ff: solver position editor,
choice buttons, equity display, White/Black labels, die-specific undo,
move responsiveness, certain bearoffs) is merged into this branch
(merge commit "Merge origin/main (author's Backgammon work)…"). The
author's behaviour wins every conflict:

- `?bgv=` hashes (HTML heads, `sw.js`, `offline-manifest.js`):
  regenerated with `scripts/offline-manifest.mjs`.
- `play/app.js` game-over sentence: this branch's level label and
  singular/plural plus the author's "· certain result".
- `styles.css`: the layered rewrite kept; each author rule ported into its
  layer on tokens (source-ring halo hidden while dragging, landing rings
  and reachable glows without `vector-effect`/filters, `text.destination-die`
  on returns, `.equity-number` min-height, no return drop-hover outline,
  `.review-moves` alignment, 44px glyph pager, `.decision-loss-unit`
  hidden on phones, visually hidden landscape caption, and the whole
  position editor / choice buttons / dice choices / dice editor / solver
  study strip block in section 5 with the author's 1050/650/359px queries).
  No colour literals added.
- Two fixes the port needed: dice-choice pips stretch inside the kit
  `.btn` (it centres items, collapsing the empty pip cells), and the dice
  editor may use the full viewport height below 600px so its form never
  scrolls (`solver-editor.cjs`).

## Play

Most of this landed in the WIP checkpoint (cf0cb08) and is kept:

- Setup: the panel leads with the mode segmented (with a one-line mode
  note) and the match length; the 90-word engine-strength paragraph is
  behind an "About engine strength" disclosure everywhere it appeared
  (setup, Players dialog, live panel). Start match stays the one primary
  action (bottom-right on desktop, the full-width dock on phones).
- Confirm: one home per layout. Wide tables put `#confirm` at the end of
  the action row (bottom-right); stacked layouts and the landscape dock
  keep it in the full-width `.board-actions.action-stage` row under the
  board (`#confirm` id, ≥48px, above `.help-cluster`).
- Status: `#message` is the status line; on wide tables the draft line is
  its muted secondary on the same row.
- Game over: a result card on the board (`.bg-result-card.game-over-card`)
  naming the level (single game / gammon / backgammon from
  `s.result.level`), the points won, the score and the cube; the status
  sentence names the level too.
- Resignation: the picker lists "Single game / Gammon / Backgammon" as
  kit list rows with their point values ("1 point", not "1 points").
- Online: guests see "Waiting for the host to start" and no disabled
  Start match; hosts see whether the second player has joined. Leave and
  New match say what happens (the other player is paused until you
  reconnect; the match stays in this browser's history).
- Update gate (`ui/updates.mjs`, minimal logic): the failed state offers
  Retry, "Continue with the installed version" (releases the gate and
  reports the offline status) and a link to `/backgammon/refresh/`.
- Fix (this branch): a desktop/stacked layout change called
  `arrangeActions()`, which detached the help buttons and lost
  `#undo-turn`, `#roll` and `#double-cube`; the listener now only moves
  `#confirm`.

## Trainer

- Progress stepper in the tool head (`ol.trainer-steps`), one pill per
  decision, toned by the recorded result with a visually hidden label per
  step and `aria-current="step"`.
- Result card first in the revealed panel: the loss headline, then Best /
  Yours / Loss as kit `.list-row`s with notations; the compact and full
  equity comparisons sit in "Equity & EV details" (unchanged markup).
- Evaluated-move rows have a pressed state for the previewed move
  (`resultView(…, { selected })` in `ui/analysis.mjs`).
- Session complete (minimal logic: results accumulate in memory): a
  result card on the board and a panel summary with average loss,
  decisions within 0.020, hints, skips, mistakes saved, and one row per
  decision. Decisions answered before a reload are counted but not
  itemised (the card says so).

## Solver

The author's position editor already supplies the brush chips (editor
supplies), dice choices and the dice dialog; they keep their design.

- Inspector grouped into Position / Analysis / Save sections with a
  "Jump to" row of ghost buttons (accessible names "Position section" etc.,
  so they never collide with the mode segmented's "Position"). Real tabs
  were not used: about ten suites drive controls in different groups
  without switching tabs, and the brief prefers changing the design to
  changing tests.
- Context strip under the board on wide layouts (on roll, dice or offer,
  cube and owner, score/Crawford, Edit context). Phones keep the same
  summary in the subtitle and on the board (dice and cube are drawn
  there), because the phone stage has no spare row (`mobile-study.cjs`
  asserts the actions stay on screen at 375×667).
- Visible edit mode: an accent outline on the board while editing.
- One kit `.progress` bar under `#message` while analysis runs:
  indeterminate for searches, determinate for rollouts and match review.
- Evaluated-move rows get the pressed state.

## Library

- Rows are `<button aria-pressed>` with a `<strong>` title and span
  content (was `role="button"` + `aria-selected` with an `<h2>` inside);
  the accessible name stays "Open <title>".
- SVG kind icons (session, mistake, position) replace ≡ ↺ ◇.
- Inspector grouped into Open / Edit / Export / Danger zone; Open in
  Solver stays the first reachable control; Delete keeps its danger
  confirm.

## Also fixed

- Phones (live table): `#message` and the draft line ellipsize on one
  line each; a wrapped status line pushed the exact-fit 375×667 stage
  past the viewport (`assistance.cjs` "Arial phone layout" failed
  intermittently in full runs). Correction (integration, 2026-10-17): the
  one-line status was not the cause of that failure. The real cause was
  `#confirm` sitting in `#actions` for one rendering update after a resize,
  before the desktopTable media-query listener moved it; fixed in CSS by
  redesign/bg-assist-fix (see backgammon/styles.css, the comment above the
  two `#confirm` home rules).
- Hub: group heads, tags and the phone footer from `shared/hub.css` were
  11.2–11.8px; a hub-scoped override sets them to `--t-xs` (the shell
  sweep now reports 0 sub-12px nodes on `/backgammon/`).
- 200% text: Solver/Library inspector buttons wrap instead of overflowing
  the 320px inspector.

## CSS

`backgammon/styles.css`: 5,780 lines at the start of this slice, 6,024
after the merge, 6,336 at the end. Colour literals: 0 (baseline 92). No
`!important`.

## Verification

- `node scripts/run-tests.mjs`: 470 pass, 0 fail.
- `node backgammon/tests/browser.cjs` (chromium, `BG_KEEP_GOING=1`) on the
  final build: 77 modules, 77 pass, exit 0. `BG_MODULES=solver-editor`
  passes on the merge commit.
- Standalone scripts against `_site`: `interaction.cjs` and
  `search-policy-browser.cjs` (chromium) pass. `computer-game.cjs` fails
  clicking a hidden `#roll`: `.action-help :is(#roll, #double-cube)
  { display: none }` is the same on `main`, so the script is stale there
  too. `live-network.cjs` (needs real PeerJS signalling),
  `opening-book-browser.cjs` and `book-generator.cjs` (engine data, not
  touched) were not run.
- `SHELL_PAGES=/backgammon/,/backgammon/play/,/backgammon/trainer/,/backgammon/solver/,/backgammon/library/
  node scripts/shell-browser.cjs`: 5 pages × 3 viewports pass, 0 sub-12px
  text, 0 small targets, 0 missing rings, skip link and `main#main`
  everywhere; the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only <backgammon pages>`:
  every changed picture reviewed and copied over its baseline.
- Extra states rendered with scratch Playwright scripts at 1440×900 and
  390×844 (and 375×667 where relevant): Play setup (computer, online),
  live move with confirm, game over (gammon card), resignation picker;
  Trainer revealed result (panel and phone sheet) and session summary
  (card, panel, phone sheet); Solver analysis in progress, results with
  a pressed preview row, editing, dice editor at 320/390/667; Library
  populated list, selected item (inspector and phone sheet), danger
  confirm; all pages at a 24px root font.

## Deferred

- Documents (`docs.css`, report TOC, heading outline, generated refresh
  CSS): not in this slice's content list.
- The ≤1,800-line stylesheet target: see `redesign-bg-shell.md`.
- Real tablist semantics for the Solver inspector sections (see above).
- `live-network.cjs` needs real PeerJS signalling and was not run.
