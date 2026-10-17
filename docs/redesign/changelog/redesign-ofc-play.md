# redesign/ofc-play — Step 3 (OFC), the Play slice

Branch `redesign/ofc-play`, from `main` at 3d2e4dc. Pages migrated: `/ofc/play/`.
New family stylesheet: `ofc/ofc.css` (tokens only, zero colour literals).

## What changed

### `ofc/ofc.css` (new, 733 lines, 0 literals)

The OFC family layer on `shared/tokens.css` + `shared/app.css`, for every OFC page to share:

- `.ofc-shell`: the app shell grid (topbar / one scrolling `main` / `.action-stage` row), safe-area padding, tool nav on its own row on phones, `grid-template-columns: minmax(0, 1fr)` so no row's min-content can widen the page at 320px.
- `.ofc-board / .ofc-row / .ofc-row-head / .ofc-row-cards / .ofc-row-summary`: the board component (label | slots using `cards.css .empty-slot` | summary), `data-row`, `.target` / `[aria-checked="true"]` / `.drag-over` states, sizes via `--card-width` (page sets `--card-w-board`), label and summary columns via `--ofc-label-w` / `--ofc-summary-w` read from any ancestor; `.ofc-board--mini` for display-only boards (opponents, history).
- `.hand-chip` (+ `--good` / `--bad`): the one score summary (hand name | points).
- `.ofc-felt` + `.ofc-stage-head`: the felt stage material on the `--felt-*` tokens, accent only for selection.
- `.ofc-tray / .ofc-tray-slot / .ofc-tray-key`: the draw tray with fixed slot positions and hotkey captions.
- `.ofc-seat`, `.ofc-code`, `.ofc-banner` (+ `--bad` / `--info`), `.ofc-inline-error`, `.ofc-dbar` (diverging bar on the kit's `.bar` idea), `.segmented--wrap` (the kit's segmented control allowed to wrap, with the kit's `:has(input:focus-visible)` surfacing).
- The rules article (`.rules-article` / `.rule-section` / royalty groups / cribbage reference): one copy for Play's rules dialog, the trainer's dialog and the EV Rules tab.

### `/ofc/play/` (`index.html`, `styles.css` 1572 → 779 lines, 82 → 0 colour literals, `app.js`, `game.js`)

- Head: tokens → app → cards → ofc → page, all `?v=20261016`; `data-family="ofc"`; `theme-color #08090d`; `viewport-fit=cover`; the `is-ready` line; skip link + `main#main[tabindex="-1"]`.
- Chrome: `.topbar` with `.crumbs` (MS → OFC → Play) and `.tool-nav` (Play · Fantasyland trainer · Fantasyland EV, `aria-current`); the connection badge, a rules icon button and Leave in `.topbar-actions`. Each view has a `.tool-head` (eyebrow + H1).
- Lobby: the create panel first and full width, the setup panel below it (hidden while joining); every control from the kit (`.field`, `.segmented`, `.switch-row`, `.check`, `.btn`); the seven-variant picker is a wrapping segmented control that never truncates; the dealer-choice toggles are native checkboxes in 44px rows; "Available choices" and the Badeucey card count use kit fields.
- Waiting room: room code panel with Copy invite (clipboard fallback + toast), roster as `.ofc-seat` rows with status badges, config chips, Start (host) or "Waiting for the host to start the game…" copy (guest), a reconnecting banner with Retry.
- Table: `.stat-strip` score strip (BTN and "away" badges), opponents as quiet panels with `.ofc-board--mini`, the player's board as a felt stage holding a real `role="radiogroup"` whose row heads are `role="radio"` buttons (the single target per row, 44px on phones, focus restored after re-render), the tray under the stage, Reset / Confirm with keycaps in the shell's `.action-stage` (sticky bottom row, safe-area padded), showdown as a `.list` of `.list-row`s with the result sentence in the panel head and guest "Waiting for the host to deal the next hand." copy.
- Fantasyland tray: hands past five cards become a two-row grid at ≥36px cards on phones (`.ofc-tray--grid`, `--tray-columns`), scrolling sideways only if even that cannot fit; hotkeys 1–9 only, stated in the rules' Controls section.
- Dialogs: rules, ledger and discards are native `<dialog class="dialog dialog--sheet">` opened through `shared/sheet.js` (bottom sheets on phones, backdrop tap, Escape, focus return); the rules tabs are a real `.tabs` tablist via `shared/tabs.js` and only change the article (they no longer rewrite the lobby's variant radio); ledger charts are HTML `.bar-list` rows with the diverging `.ofc-dbar` and token series colours, with a text alternative in `aria-label`.
- Toasts: one polite stack (`#toast`) and one assertive stack (`#alerts`), each toast with a dismiss control and a timer that pauses on hover/focus; nothing else on the page is `aria-live`.
- Drag: `shared/card-drag.js` replaces `ofc/play/card-drag.js` (deleted); the ghost lift/drop timing the browser test asserts is unchanged.
- Type floor: row scores and mini scores are `.hand-chip`s at 12px; nothing renders under 12px at any viewport (hotkey captions and the connection badge text are hidden, not shrunk, on phones).

### Behaviour additions required by notes.md §3.13 (completeness pass)

- **Player gone mid-hand**: the host watches each seat's connection (closed, or quiet for 9s against the room's 2.5s pings) and the roster's `connected` flag; when the active seat is gone, a banner names the player and offers the host "Set their cards" / "Choose for them". The new `auto_set` host action calls `Game.autoSetActive` (new in `game.js`: a legal bottom → middle → top placement of the draw, or the first enabled variant while BTN is choosing) and the hand continues. Guests see the same banner without the action. Covered by `tests/game.test.cjs` ("Auto-set recovery tests").
- **Reconnecting banner with Retry** in both the waiting room and the table (`room.resume()` by hand), a **cancellable connecting state** (Cancel tears down the pending peer and ignores a late result; the status line says it can take up to 20s), **guest waiting copy** in the lobby and at showdown, and **errors in the open view** (`showError` writes to the table/room/setup error slot that is actually visible and announces once through the assertive stack).

### Tests

- `ofc/play/tests/browser.cjs`: the ledger-chart assertion changed from reading canvas pixels to counting `.ofc-dbar` bars and checking the `aria-label` text alternative, because the charts are HTML bars now (the brief asks for this). Everything else it pins is unchanged.
- `ofc/play/tests/game.test.cjs`: a new block for `autoPlacement` / `autoSetActive`.

## Deferred

- The trainer, EV and report pages are other slices of Step 3; `ofc/ofc.css` is written so they can adopt the board, hand chip, segmented, dialog and rules-article styles without changes.
- `ofc/index.html` (the hub) still inlines card markup for its tile preview; the brief wants the hub preview on `.ofc-board` at `--card-w-preview`, but `shared/hub*.css` and the hub page are not in this slice's files.
- Keyboard shortcuts for cards 10–17 in Fantasyland: none by design, stated in the rules' Controls section (the brief allows either).
- `node ofc/fantasyland-trainer/tests/extended-ev-browser.cjs` fails on this branch exactly as it does on `main` (the "Show repeat details" button it clicks sits in the hidden `#section-repeat` tabpanel at 1440px); the EV page, trainer and `shared/` are byte-identical to `main` here, so the fix belongs to the EV slice.
