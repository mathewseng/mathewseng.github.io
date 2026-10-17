# `redesign/bg-shell` — Backgammon shell (step 6, shell half)

Branch from `main` at 3d2e4dc. Pages migrated: `/backgammon/`,
`/backgammon/play/`, `/backgammon/trainer/`, `/backgammon/solver/`,
`/backgammon/library/`; `/backgammon/controls/` and `/backgammon/reports/`
link the tokens and kit (their document restyle is the other half of step 6).
`/backgammon/refresh/` is untouched (standalone recovery page by design).

## What changed

### `backgammon/styles.css` (3970 → 5698 lines)

Rewritten from scratch as one file in eight labelled layers: aliases and
base, shell, board, play, review and tools, dialogs and toast, hub and
documents, breakpoints. Every colour is a token from `shared/tokens.css`, a
runtime `--board-*` property or a `color-mix()` of those: the colour-literal
count falls from 92 to 0 (`shared/tests/css-literals.test.cjs` logs the
drop; the baseline was not re-recorded). No `!important`, no root
font-size, no `:root` palette: `--bg`, `--panel`, `--text` and `--danger`
are aliases of `--page`, `--surface`, `--ink` and `--bad` because
`ui/board.mjs` paints the dice switch with `--panel` and `--line`. Player
identity comes from `--bg-seat-0/1`, which read the board's checker colours
with `--player-1/2` as fallbacks; checker dots, history-row borders, filter
dots and Library summaries all read those two names (history-return.cjs).
Loss tones map to `--info/--good/--warn/--bad`.

One breakpoint set: 480 (tiny phones), 700 (phones; portrait adds
`min-height: 501px`), 1024 (stacked tablets), the landscape-short rule
(`max-height: 500px and min-width: 650px`), the kit's short-desktop query,
plus container queries on `.stage` and the review section. 17 `@media` /
`@container` blocks against 69. The append-only duplicates and dead rules
the audit lists (`.focus-mode`, `.pill`, `.feedback-title`, `.die-reveal`,
the redundant `.panel-toggle` rules, the two `:root` blocks, the four
`.point.destination .point-hit` declarations) are gone.

Kept untouched in spirit: the board palette system (`--board-*` from
`core/appearance.mjs`), every board interaction and motion rule
(`.point.*`, `.source-ring`, `.landing-ring`, `.drag-*`, `.board-die.*`,
`.dice-switch`), the `data-motion` opt-in, 44px targets, bottom sheets with
keyboard-viewport fitting (the local `shell.mjs` implementation keeps the
`--dialog-visible-height` / `data-keyboard` contract the tests assert, so
`shared/sheet.js` is not used), keycap badges on desktop.

Focus: the kit's `:focus-visible` ring everywhere. `data-focus-navigation`
remains only for the SVG board's own focus marks and to suppress the ring
on controls focused by a game shortcut or a pointer tap (background-focus
and control-polish assert both). Selection: `user-select: none` is scoped
to the board, player strips and action area; `ui/input-behavior.mjs`
mirrors the split so the inspector, dialogs and the review are selectable.

Reduced motion: transitions are removed entirely under
`prefers-reduced-motion` and `data-motion="reduce"` (see shared request 1):
tokens.css's 0.01ms transitions report stale computed values in the frame a
change happens, which a dozen suites read synchronously. The SVG board never
transitions except where a rule names one.

### `backgammon/ui/shell.mjs`

- Topbar: skip link, kit `.topbar` with `.crumbs` (MS mark → Backgammon →
  tool), the Play/Trainer/Solver/Library nav as `.tool-nav` plus a Docs entry
  (`/backgammon/controls/`), sound and Settings as kit buttons (Settings is an
  icon with a visually hidden label on phones).
- `main#main[tabindex="-1"]` wraps the workspace; the inspector is a kit
  `.panel`; the board slot carries `.board-frame`.
- One dialog component: kit markup (`.dialog-head`, scrolling `.dialog-body`
  with a `.dialog-error` slot, `.dialog-foot`) beside the old
  `.dialog-header` / `.drawer` / `.close` hooks; `options.sheet` opens the
  bottom-sheet variant. The ten skins (settings, decision, history, session,
  practice controls, tool menu, details, save, opening roll, update gate)
  are variants of it.
- `showError` renders inside the open dialog's `.dialog-error` (role=alert)
  and only falls back to the toast.
- Toast: dark kit toast in a `.toast-stack` with safe-area inset, a dismiss
  button, pause on hover/focus, `role="status"` by default and `role="alert"`
  / `aria-live="assertive"` for errors (`showError`). One polite and one
  assertive live region per page.
- `confirmDialog(title, text, action, { verb, danger })`; callers pass
  "Delete" (Library delete), "Replace" (Library import), "Leave" (leaving a
  live game, New match).
- `button()` emits kit classes (`.btn`, `.btn--primary/ghost/danger`) beside
  the old `primary/ghost/danger` tokens the tests select.
- The turn badge is a kit `.badge`; the Library empty state is a kit
  `.empty-state`.

### `backgammon/ui/updates.mjs`

The update gate dialog is the kit dialog (`.dialog.app-update-dialog`) with
a `.dialog-body`, the kit progress colours and the site font.

### `backgammon/index.html` (hub)

Hub tiles: `tokens + app + hub + hub-art` linked as the other hubs do, the
hero with lede and facts, a featured Play tile (`#hub-play`) whose art slot
holds the live Board preview (`#hub-board`), three study tiles in
`.hub-tools`, a "Docs & app" group with Clicks & highlights and the engine
report, the update status line with "Refresh app", and the kit footer with
the GitHub link. Resume/Recent links stay in `#recent`. On phones the tiles
precede the board and the Play/Study group heads are hidden so the three
study tiles fit a 375×667 viewport (mobile-quick.cjs). The static aura and
dot grid are back (nothing suppresses them any more).

### Route pages

`play/`, `trainer/`, `solver/`, `library/`: `data-family="backgammon"`,
`theme-color #08090d`, tokens.css → app.css → styles.css with the `?bgv=`
hash, the `is-ready` line, a styled `.app-boot` placeholder with
`main#main`. `controls/` and `reports/`: the same head (plus
`viewport-fit=cover` on the report); their bodies are unchanged.

### Tests

`backgammon/tests/review-ranked.cjs`: the user-select assertion moved from
`<body>` to the board, because the brief scopes `user-select: none` to the
board and drag surfaces. No other test changed.

## Verification

- `node scripts/run-tests.mjs`: see the structured report.
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=<the eight backgammon
  pages> node scripts/shell-browser.cjs`: 8 pages × 3 viewports pass (no
  overflow, no targets under 44px, no missing focus rings, no text under
  12px on the shell pages, skip link and `main#main` on the five app pages).
  The hub reports 12 sub-12px text nodes from `shared/hub.css` on desktop
  (shared request 2). Same result with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only <pages>`: every picture at
  1440×900 and 375×812 reviewed and copied over the baselines.
- Extra states rendered and reviewed with a scratch Playwright script:
  online lobby, live table with a selection, game over, Details / Tools /
  All-controls sheets, Save dialog with an in-dialog error, danger confirm,
  status and alert toasts, Settings (Board, Display, Keyboard, keyboard
  viewport), update gate, populated Library with the inspector sheet,
  trainer hint, decision review at 1366×768 / 390×844 / 844×390, landscape
  setup, live table, trainer and Library.
- `node backgammon/tests/browser.cjs` (full chromium suite, `BG_KEEP_GOING=1`):
  72 modules run, 72 passed, exit 0 on the final branch state.

## Deferred

- The ≤1,800-line target: the rewrite is 5,698 lines in the repository's
  one-declaration-per-line style (about 2,470 declarations and 910
  selector lines). Reaching the target needs either a denser format or dropping
  the per-viewport Play/Trainer/Solver/Library rules the 84 Playwright
  suites pin; both were out of reach without risking the contracts, so the
  file is left layered and deduplicated but long.
- Player strips as kit `.stat-strip` rows: the strips keep their own
  `.player-strip` flex layout (name, identity dot, turn badge, score and
  pips) because mobile-sheets.cjs measures the badge against the name and
  the stats in one row at seven viewports; the identity dots already derive
  from `--bg-seat-*`.
- `shared/sheet.js`: not adopted; the local `dialog()` keeps the
  `--dialog-visible-height` / `data-keyboard` contract and the nested
  scroll lock (`html.bg-dialog-open`) that mobile-sheets.cjs asserts.
- The Play content work (setup panel leading with the mode segmented and the
  engine-strength paragraph behind a disclosure, the game-over result card,
  the resignation picker labels, guest lobby copy, "Continue with the
  installed version" on the update gate), the Trainer progress stepper and
  session summary, the Solver inspector split and context strip, the
  Library listbox/aria-pressed rows and the documents (`docs.css`, heading
  outline, report TOC, generated refresh CSS) are the other halves of step 6
  and were not part of this slice.
- `last-move-entry.cjs` is timing-sensitive (a 320ms exit fade read after
  the engine's reply); it failed once under the first full run's load and
  passed alone and in the second and third full runs. Nothing in this branch
  touches the WAAPI animations it measures.
