# redesign/microtonal-cards: step 4 (standalone), Microtonal Lab and Card Table Workshop

Pages migrated: `/microtonal-lab/`, `/cards/`.

This branch also carries the Blackjack and Dice commits from an earlier run of the standalone family
(see `redesign-blackjack-dice.md`). This file covers only the two pages above.

## `/microtonal-lab/`

Commits: "Microtonal Lab onto the shared kit" and "Microtonal Lab: fit the desktop shell, touch rows, key tiles".

- Head: `tokens.css`, then `app.css`, then `styles.css`, all `?v=20261016`. Also `data-family="microtonal"`, theme-color
  `#08090d`, `viewport-fit=cover`, the `is-ready` line, a favicon in the family colour, a meta description, and
  `tabs.js` + `keycap.js`.
- Chrome: a skip link to `main#main[tabindex="-1"]`. The `.topbar` has crumbs (the MS mark is the home link, then
  Microtonal Lab), a `.tool-nav` with `aria-current`, the audio status pill and a stop icon for panic. The `.tool-head`
  has an eyebrow and the H1. On desktop the title and the view switcher share one row. On phones the topbar stays on
  one row: the page name gets an ellipsis before the pill wraps.
- One view switcher, the same control at every width. Play / Scope / Tunings / Builder are a kit `.tabs` tablist
  (`shared/tabs.js`). They keep the hash, the `microtonalLab.view` key and its precedence, and they drive `data-view`
  on `#labShell`. Phones show one view at a time. On desktop every pane stays visible: the switcher scrolls to the pane
  and gives its panels an accent edge. At 900–1279px it still picks which sidebar shows.
- The builder modes are a real tablist with tabpanels. The family filter is a `.segmented` group using `aria-pressed`
  (it filters; it does not switch panels).
- Keyboard on fine pointers: the QWERTY rows as a straight lattice. Each key has a kit keycap letter top left, the
  pitch top right and the cents along the bottom. Unmapped keys are inert dashed placeholders (`aria-hidden`), not
  disabled buttons.
- Keyboard on touch: an isomorphic grid of 44px keys holding only the mapped pitches. The row length follows the panel
  width (7 keys across a phone) and re-renders through a ResizeObserver, so the grid never scrolls sideways. It stays
  isomorphic: the row above is always one row length up. Keys use `touch-action: pan-x`, never `none`. Touch keys show
  whole cents; the readout keeps the decimals.
- Labels are sentence case at 12px/600, with weights ≤ 700. Every range has an `<output>`: volume, brightness,
  release, tempo.
- Pulse steps are steppers (−, value, +) under a visible "Pulse pattern · scale index" label, so touch and keyboard
  can step down. Each button is labelled "Step N scale index: down one / up one". Right-click still steps down.
- The audio pill reports the real `AudioContext` state: idle ("Start audio"), running, suspended after a
  `statechange` ("Audio paused", press to resume), and unavailable with an explanation that also goes to the
  assertive live region. This was checked in Chromium for each state.
- The canvas reads its colours from the tokens with `getComputedStyle` and re-reads them on resize. Pitch-class colour
  appears only on the scope canvas.
- An empty preset search shows the kit `.empty-state`. Builder errors appear next to the form and in the assertive
  region. The page has one polite and one assertive live region.
- `styles.css`: 1205 → 1071 lines, colour literals 118 → 0, no `:root`, no `!important`, no hover lift.

Small logic changes the notes required (§3.20), all in `app.js`: the tablist wiring, the touch grid, the steppers,
the honest audio state, token-read canvas colours, the empty state, and the row length that fits the panel.

## `/cards/`

Commits: two checkpoints, "wire the bottom stage, first run, sw cache", "guest add-group lock, phone topbar when
online", and "gutter fix; reviewed baselines".

- Head: `tokens.css`, then `app.css`, then `cards.css`, then `styles.css`, all `?v=20261016`. Also
  `data-family="cards"`, theme-color `#08090d` and `viewport-fit=cover`. The manifest and icon are kept.
- Chrome: a skip link to `main#main` (the workspace). The `.topbar` has crumbs (MS, then Card Table Workshop) and a
  `.tool-nav`. Undo and redo use sprite icons. The view select is a kit field. React, Log and the connection badge
  come next, then New game (primary), then More and the side toggle with `aria-pressed`. The `.tool-head` holds the
  table-name input and the turn strip.
- Connection badge: one persistent badge in the topbar (`#roomLabel[data-state]`) showing local, Hosting · CODE,
  Guest · CODE, or Reconnecting · CODE. It follows `peer-room.js` status events. Toasts only announce the change.
- One bottom stage: `#stage` (`.ct-stage`) holds the dock, the selection bar and the replay bar. It shows while any of
  them shows. A ResizeObserver measures its height into `--stage-h` on `body`; the phone side sheet and the toasts
  offset from that value. This replaces the five fixed bars with hand-tuned mutual offsets. On landscape phones the
  stage becomes a right-hand column and takes no height.
- Cards are buttons through `PlayingCards.html(..., { tag: "button", pressed, label })`. Custom cards are buttons with
  `aria-pressed`. There is one tab stop (a roving tabindex) and arrow keys walk the hand. `.kbd-focus` stays as the
  visual. Every page-owned state class is kept. The illegal-move reason is real text (`.zone-why`), not a CSS
  `attr()` string.
- `#tabs` is a real tablist (`role="tab"`, `aria-selected`, arrow keys, Home and End) with five 12px-labelled tabs:
  Play, Deck, Players, Scores, Rules. Tools and Log open the same panes in a kit sheet (`#paneDialog`), reached from
  More (and from the Log button in an online room). A saved "tools" or "log" tab falls back to Play.
- Menus have `role="menu"` with `menuitem` buttons. Opening one moves focus in; arrow keys, Home and End move within
  it; Escape and Tab close it and return focus to the opener. Disabled items carry a "Host only" hint.
- Guest state: actions a guest can never take (bots, simulate, record, replay, snapshot, seed, play again) are
  disabled. In a play-only room so are design actions (collect, rebuild deck, chips, scores, add card, player, group,
  action, trigger, scheme). Each disabled control has a lock icon and a "Host only" title, and a note at the top of
  each pane explains it. New game and "Reset this game" are disabled for guests; before, the click only toasted, or
  the reset failed silently. This was checked with a real two-context room.
- The single reusable `<dialog id="dialog">` is now the kit `.dialog.dialog--sheet`. `openDialog`'s API is unchanged,
  `aria-labelledby` points at its heading, and it opens through `shared/sheet.js`.
- Visuals: custom-card and stack radii are aligned to `cards.css` (`8% / 5.7143%`). The dice face is one CSS `.die`
  with pips for a d6 and numerals otherwise. Icons come from `shared/icons.svg`, plus a few inline glyphs on the same
  20px grid. Emoji are gone from the UI except the reaction picker, whose content is emoji. The felt noise is scoped
  to the felt.
- First run: the New game gallery is the only opening screen. The tour is offered by a toast and lives in More → How
  it works; it no longer starts on top of the table after the gallery.
- Toasts: a polite stack above the stage and an assertive stack at the top. Each toast has a dismiss button and pauses
  on hover or focus.
- Kept: the preset grid with mini shared cards, the `pointer: coarse` halo on phase pills and score badges, the felt /
  size / contrast / motion preferences on `body`, zone legal / illegal / drop feedback, the invite link + QR, the
  `?room=` deep link, the command palette, the tour and the pass screen. Every id `app.js` binds is still present.
- Targets: group tool buttons are 36px on fine pointers and 44px on touch; before they were 28/32px with a halo.
- PWA: `sw.js` CORE adds `tokens.css`, `app.css`, `sheet.js` and `icons.svg`, and the cache goes from
  `card-workshop-v6` to `v7`. The manifest colours are `#08090d`.
- `styles.css`: 1018 packed lines on main, now 4164 lines formatted one declaration per line. Declarations went from
  2152 to 2076, colour literals from 222 (lint baseline) to 0. One phone query, one landscape query, no `!important`,
  no `:root`, no polish-pass layer.

## Verification

- `node scripts/run-tests.mjs`: 451 pass, 0 fail.
- `sh scripts/assemble-site.sh _site` and `SHELL_PAGES=/cards/,/microtonal-lab/ node scripts/shell-browser.cjs`: both
  pages pass at 1440x900, 375x812 and 844x390. There is no overflow, no small targets or text, no missing rings, and
  the skip link and `main#main` are present. The same holds with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /microtonal-lab/,/cards/`: the four pictures were reviewed and copied
  to `scripts/screenshots/baseline/`.
- Scratch Playwright scripts covered the states the landing picture does not show:
  - Cards: dealt table, selection stage, menus, every side tab, the Tools sheet, the room dialog, hosting with QR, a
    `?room=` guest (table, menu, locked deck pane), the keyboard roving tabindex, the command palette, help and tour,
    on phone and desktop.
  - Microtonal: every view, the builder error, the empty search, pulse running, and the audio pill in each state, at
    1440, 1024 and 375.
- Dice suites, run as the family suites: `node dice/reports/tests/browser.cjs` passes. It drives the matchups,
  cycles and matchup-play modules, which export functions and exit 0 on their own.

## Deferred

- Cards print styles still live in an `app.js` string (P3). Moving them to `@media print` is a structural change to
  the print path with no visible gain here.
- PeerJS still loads from unpkg and is not cached by the service worker (P3). The worker only handles same-origin
  requests, and vendoring the library is a dependency decision for the author.
- Cards `icon.svg` keeps its own artwork. It is the installed-app icon, and the manifest colours follow the page.
- About 100 inline `style="..."` attributes in Cards' templated HTML remain (widths, swatch colours from data). They
  carry no colour literals except data-driven player and mark colours.
- Microtonal `#labNav` tabs have no `aria-controls`, because a view is several panes (Play is the sound panel plus the
  keyboard). The panes carry `data-pane` and the tablist drives `data-view`, as before.
- Microtonal at 1024x768: the readout panel scrolls internally to reach the sequencer. That is the app-shell rule;
  1440x900 and wider show everything.
