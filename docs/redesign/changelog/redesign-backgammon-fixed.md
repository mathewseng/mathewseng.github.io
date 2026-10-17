# `redesign/backgammon-fixed`: review fixes for the Backgammon family

Branched from `redesign/bg-docs` (02e2c69), which continues
`redesign/bg-shell` and `redesign/bg-content` (see their changelogs). Pages:
`/backgammon/`, `/backgammon/play/`, `/backgammon/trainer/`,
`/backgammon/solver/`, `/backgammon/library/`, `/backgammon/controls/`,
`/backgammon/reports/`, `/backgammon/refresh/`.

## Merge of main

`main` (e295ce8: step 1 hubs-fixed and step 2 poker tools) is merged into
this branch. Every Backgammon conflict was a `?bgv=` hash; this branch's
pages were kept and `node backgammon/scripts/offline-manifest.mjs`
regenerated the hashes, `offline-manifest.js` and `sw.js` against main's
`shared/hub.css` and `shared/hub-art.css`.

## Review fixes

Each finding of the independent review of `redesign/bg-docs`, verified before
fixing.

### P1: behind main; main's hub.css breaks mobile-quick.cjs (fixed)

Reproduced after the merge: `.hub-tools` ended at 679px on a 375×667 phone
(main's hub.css makes the phone topbar two rows, 112px, and no longer clamps
tile copy). Fixed in the hub's own rules and copy:

- `styles.css`: the hub's phone column sets `margin-top: 0` on its groups
  (the flex gap spaces them; hub.css added 10px above the study tiles).
- `index.html`: a two-line hero lede ("Play a friend or GNUbg, practice
  decisions, and study any position. It all runs on your device.") and a
  two-line Trainer description ("Make the decision first, then compare your
  move with GNUbg."). Copy only; no test pins either string.
- The tiles now end at 631px at 375×667 (36px spare), 632px at 390×844 and
  616px at 430×932; tools still precede the board at every size.
- The hub's 12px-floor override block is gone: main's hub.css now sets group
  heads, tags and the footer at `--t-xs`/`--t-sm`.
- `BG_MODULES=mobile-quick,updates` pass; baselines re-recorded.

### P2: Space removed the keyboard focus ring (fixed)

Reproduced: Tab to Settings, Space, and the focused Close button had
`outline: none`. `ui/input-behavior.mjs` (small logic change) no longer
clears `data-focus-navigation` for Space; Space or Enter on a control
(button, link, summary, select, or a button/tab/switch/checkbox/radio/
option/menuitem role) sets it to `true`, as Tab and the arrows do. Space on
a control is keyboard activation (the play shortcuts already skip it there).
Letter shortcuts and pointer taps still suppress the ring, so
`control-polish.cjs` and `background-focus.cjs` hold. Checked with a scratch
script: Tab → Settings → Space gives a solid ring on Close; ArrowRight and
Space on a Settings tab keep it; `z` clears it.

### P2: Settings, decision-review and history-tree tab bars were aria-pressed groups (fixed)

`ui/shell.mjs` gains `tabBar(list, label, panels)`: `role="tablist"`,
`role="tab"` with `aria-selected`, `aria-controls`/`aria-labelledby`, a
roving tabindex and ArrowLeft/ArrowRight/Home/End.

- Settings: Board colors / Display & controls / Keyboard are tabs, each
  section a `tabpanel`; the bar keeps the kit `.segmented` look (the kit
  styles `[aria-selected="true"]`).
- Decision review: Board / Comparison / Details are tabs over the
  `.decision-layout` panel; `data-view` is kept for the tests.
- History tree: Tree / Board are a tablist (`.history-tree-tablist` inside
  `.history-tree-tabs`) over `.history-explorer`; "Current position" stays a
  button beside it because it is an action, not a view.
- `styles.css` styles `[aria-selected="true"]` where it styled
  `[aria-pressed="true"]`.
- Tests changed in the same commit: `getByRole("button", {name})` became
  `getByRole("tab", {name})` for those labels in appearance, control-polish,
  feedback, interaction, mobile-settings, refresh, responsive-parity,
  opening-hints, history-tree, move-arrows, review-motion, review-ranked,
  review-selection and solution-polish; `history-tree.cjs` reads the
  selected node as `[role="treeitem"][aria-selected="true"]` because the
  selected tab now carries `aria-selected` too.

### P2: styles.css at 6,336 lines against the 1,800 target (partly fixed, deferred)

Deleted what is dead: the `.controls-page`/`.engine-report` header block and
the unreferenced `.separator`, `.field--select`, `.move-picker`,
`.crumb-projects`, `.study-editor` (four rules), `.confirm-status`,
`.feedback-heading` and `.editor-grid` (four rules), found by checking every
class in the file against the shipped JS and HTML. The file is 6,232 lines
(6,342 after the merge and the fixes above). The target stays deferred: the
file holds about 2,740 declaration lines in the repository's
one-declaration-per-line format, so 1,800 lines is out of reach without
either a denser format (a cosmetic change that would only move the number)
or removing per-viewport Play/Trainer/Solver/Library rules that the ~120
Playwright files pin (computed styles and layout at up to nine viewports).
Neither is a review-fix-sized change.

### P2: refresh-page CSS copied by hand (fixed)

The token values on `/backgammon/refresh/` are now generated: the page has a
marked `/* generated:tokens */ … /* /generated:tokens */` block, and
`backgammon/scripts/offline-manifest.mjs` (which already runs after every
shipped change) rewrites it from `shared/tokens.css` through the new
`backgammon/scripts/refresh-tokens.mjs` (page, surfaces, line-strong, ink,
muted, the Backgammon accent from `--family-backgammon`, on-accent, bad,
radius, type scale, `--font-sans`). The new
`backgammon/tests/refresh-tokens.test.mjs` (picked up by run-tests) fails if
the page drifts from the tokens or reads a custom property the block does
not define. The page still links nothing. The script is imported only when
`refresh/` exists, so `manifest-generator.test.mjs`'s minimal fixture is
unaffected. This resolves item 6 of `shared-requests/redesign-bg-docs.md`
inside the family's own files.

### P2: update-gate "Reinstall the app" link under 44px (fixed)

`.app-update-dialog .update-refresh-link` is an inline-flex, 44px-tall,
centred target (measured 117×44 in the injected failure-state markup).

### P3: leaving confirms (fixed)

Online "New match" passes `{ verb: "Leave", danger: true }` (it leaves the
room); local "New match" keeps "Continue" (nothing is lost and
`turn-policy.cjs` pins it). Leaving Play through a nav link is a danger
"Leave" while a live room is connected and a plain "Leave" otherwise (the
draft is saved). Trainer's "Leave this exercise?" keeps a plain "Leave": it
leaves no live game and the draft is saved.

### P3: result cards hide the final board (fixed)

Play's game-over card and Trainer's session summary carry an icon button
("Hide the result to see the board" / "Hide the summary to see the board",
44px on touch, 40px on fine pointers) at the card's top right; it hides the
card and focuses the next action (Next game / Practice again). Play keeps the
dismissal for that game only (one module variable keyed by game number and
score, a small logic change). Rendered at 375×812, 844×390 and 1440×900.

### P3: tool-head type off the brief's scale (skipped)

An eyebrow plus a 24px H1 on the app shells adds a row the suites do not
allow: mobile-quick, mobile-study and control-polish assert the board and
`#confirm` fit 320×568 to 375×667 and 1280×720/1366×768 desktops. The tool
head stays one compact row. The px font literals the review lists are in
board, keycap and editor rules sized against the SVG board; left as they are.

### P3: trainer stepper spills at 20 decisions (fixed)

`.trainer-steps` is `width: max-content` with its old clamp as the minimum
and `max-width: 100%`, with 2px gaps and 5px pills: 20 decisions take 138px
and `scrollWidth` equals the width at 320, 375 and 1440.

### P3: "Save position to Library" duplicates the toolbar Save (skipped)

The brief asks for the Solver inspector split into Position · Analysis ·
Save. Before an analysis has run, "Save position to Library" is the Save
group's only control; removing it leaves an empty group behind the "Save
section" jump button. Kept.

### P3: showError wrote unrelated errors into the open dialog and never cleared them (fixed)

Small logic change in `ui/shell.mjs`: `button()` clears its own dialog's
`.dialog-error` when its action starts and passes that dialog to
`showError(e, source)`. `showError` writes into a dialog only when the error
came from that dialog's action; engine, network and background errors go to
the alert toast.

### P3: hub chrome differs from main's hubs (partly fixed)

The hub footer is main's: `nav.foot-links` with "All projects" and "Source on
GitHub" plus the `icons.svg#i-external` mark and a visually hidden "(opens
GitHub)", and the hubs' one-line note. The two documents use the same footer
with a "Backgammon hub" link (`docs.css` styles `.foot-links`). Kept as they
are: the featured Play tile keeps the board preview outside the link
(`li.hub-feature`), because mobile-quick.cjs needs `#hub-play` to fit the
viewport and `.hub-tools` to end above `#hub-board`, which a `tile--featured`
with the board inside the link cannot satisfy on phones; and the favicon
stays `backgammon/icon.svg`, which is in the offline shell. The shell sweep's
MIGRATED list is outside this family's files (see the shared request).

### P3: colour keyword in the family sheet (fixed)

`--bg-shadow` mixes `var(--page)` instead of `black`; the docs contents
strip's fade mask uses `var(--page)` too.

## Verification

All on the final branch state after `node backgammon/scripts/offline-manifest.mjs`
and `sh scripts/assemble-site.sh _site`.

- `node scripts/run-tests.mjs`: 480 pass, 0 fail (470 before, plus main's
  site-map tests and the new refresh-tokens test).
- `BG_KEEP_GOING=1 node backgammon/tests/browser.cjs` (chromium 145): the
  integration block and 76 modules, 77 PASS, 0 FAIL, exit 0.
- `BG_MODULES=interaction-latency,play-latency node backgammon/tests/browser.cjs`:
  both pass.
- `BG_BASE_URL=http://127.0.0.1:18765 node backgammon/tests/interaction.cjs`
  (python http.server on `_site`): pass; the benchmark JSON it rewrites was
  restored.
- `BG_BROWSERS=chromium node backgammon/tests/search-policy-browser.cjs`: pass.
- `BG_BROWSERS=chromium node backgammon/tests/opening-book-browser.cjs`: pass
  (28,659 entries, 14 live cross-checks).
- `BG_BASE_URL=… node backgammon/tests/computer-game.cjs`: fails waiting for
  the hidden `#roll`, as on `main` and on `redesign/bg-docs` (the script is
  stale; `.action-help :is(#roll, #double-cube) { display: none }` predates
  the redesign). `live-network.cjs` (real PeerJS signalling) and
  `book-generator.cjs` were not run.
- `SHELL_PAGES=<the eight pages> node scripts/shell-browser.cjs`: 8 pages × 3
  viewports pass; 0 text under 12px, 0 targets under 44px, 0 missing rings,
  skip link and `main#main` everywhere. Same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only <the eight pages>`: 8
  changed (hub at both sizes: new copy, footer and spacing; controls and
  reports: footer; trainer: stepper gaps). All sixteen pictures reviewed and
  copied over the Backgammon baselines.
- Scratch Playwright renders (scratchpad `fix-states.cjs`, `hub-metrics.cjs`):
  hub metrics at 320×568–430×932 and 1440×900; Settings opened with Space
  (ring on Close), keyboard tab switching; update-gate failure actions;
  game-over card and its hidden state at 375×812 and 1440×900; Trainer
  session summary and hidden state at 375×812, 844×390 and 1440×900; the
  20-decision stepper at 320, 375 and 1440; the history tree tablist at
  390×844 (suite screenshot). No page errors.
