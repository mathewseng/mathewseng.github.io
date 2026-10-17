# redesign/poker-play — Mixed Poker onto the shared system (step 5, Mixed Poker part)

Branch from `main` at 3d2e4dc. Pages: `/poker/play/`. New family stylesheet: `poker/table.css`.

## What changed

### `poker/table.css` (new, 970 lines, zero colour literals, no `!important`)

The poker-tables family kit on tokens, for Mixed Poker now and Rush, Ultimate Omaha and Edge the Dealer when they migrate:

- `.stage` + `.felt` (radial green from `--felt-light/--felt/--felt-dark`, inset highlight, rail mixed from the accent, `--stage-ink/--stage-muted` so felt labels never bind to `--ink`), `.felt-label`, `.felt-centre`, `.felt-pot`, `.felt-street`, `.felt-message`, `.board-stack/.board-line/.board-cards` (`--card-w-table`).
- `.seat` (avatar, name, stack/PnL, bet chip, badges, card row at `--card-w-seat`, dealer disc, per-seat clock) with states `--active --folded --disconnected --confirmed --host --me --queued --empty --busted --winner --lobby`.
- `.hand-chip` neutral/good/bad/warn and `.hand-chip-row`.
- `.lobby`, `.lobby-code-pill`, `.lobby-roster`, `.lobby-settings`, `.lobby-wait` (pulsing dot), `.lobby-actions`.
- `.action-stage` (sticky bottom, glass, safe-area padding) with `-status`, `-clock`, `-error`, `-actions`, `-host` slots and the `.amount-control` presets-plus-input row.
- `.table-log` / `.table-log-entry` / `.table-chat-form` for the pages that have a log and chat (not used by Mixed Poker).
- `.settings-row` (label + hint | control, 44px rows, 16px inputs on coarse pointers).
- `.table-banner` (warn/bad/info) and `.table-notice` (centred message on the felt).

### `/poker/play/` (index.html, styles.css 1697 → 1065 lines, app.js)

- Head: tokens → app → cards → table → page, each `?v=20261016`; `data-family="poker"`; `theme-color #08090d`; `is-ready` line; skip link; `main#main[tabindex="-1"]`.
- Topbar: crumbs MS → Poker → Mixed Poker; tool nav Mixed Poker · Poker Rush · Ultimate Omaha · Edge the Dealer · 222 with `aria-current`; connection `.badge` (`#connection` keeps its `data-state` and inner `<span>`), guide icon button, Leave as a danger button. On phones the family crumb hides and the badge collapses to a titled dot so row 1 is mark + tool + actions and row 2 the tool nav.
- Setup: `.tool-head` with H1; `#setup-tabs` is a real `.tabs` tablist driven by `shared/tabs.js` (keeps `data-setup-tab` and `.active`); the three panels are `.panel`s with `.panel-body`; Create/Join is a kit `.segmented` with `aria-pressed`; name and code are `.field`s; stakes are `.settings-row`s; quick mixes are `.btn--sm`; rotation move/remove are 44px icon buttons (focus restored after a move or remove); catalog families are a `.segmented` with `aria-pressed`; game options carry `aria-pressed`; the straddle is the kit `.switch`; the CSS-content empty text is a real `#rotation-empty` paragraph.
- Lobby: code pill (`#room-code-display`) with a copy-code button, Copy invite, roster of `.seat.seat--lobby` (same component as the table), host settings as chips, "N of M seats", host start hint, guest "Waiting for the host to deal the first hand." copy, reconnecting banner.
- Game: the felt is the hero. Opponents sit on three rails around the centre (clockwise from the hero's left) on desktops ≥ 821×561, in a wrapped grid on tablets and short windows, and on phones (≤ 640px) in one horizontally snapping strip (as the pre-redesign page had) so the pot, the board and the hero's own cards stay near the top of the felt; each seat shows a dealer disc, position badges, bet chip, status badge and (when active) a clock. Pot and street sit in the felt centre with the boards; the stat strip keeps `#street-label/#pot-label` (hidden) and shows To call and Next game. The hero seat spans the felt's bottom edge with avatar, dealer disc, status badge, clock, bet chip, cards and hand chips. The decision and results panels are `.action-stage`s (sticky bottom; a right-hand column on landscape phones). `minmax()`/flex rows keep the table at ≥ 16rem on desktop while the view is height-bounded, so the stage never collapses it.
- Dialogs: guide and ledger are kit `.dialog.dialog--sheet` opened through `shared/sheet.js` (backdrop tap, focus return, keyboard fitting); ledger stacks are a `.stat-strip`.
- Live regions: one polite `#toast` stack and one assertive `#alerts` stack (toasts have a dismiss control and pause on hover/focus); the inline error paragraphs no longer carry `role="alert"`, and errors are announced once through the assertive stack. Toasts sit above the sticky stage via `--stage-h` (ResizeObserver).
- Completeness-pass fixes (small logic, called out in the commit):
  - Hero card row rendered by diffing (`renderCardRow`): toggling a discard updates the card in place; when the row really changes focus is restored by `data-card-id`. Card buttons carry `aria-pressed`.
  - The action clock updates only `[data-clock]` text (seat clock, hero clock, status line) every 500 ms, never the whole view; at zero it reads "Timed out".
  - Busted/table-over state: results panel titles "Table over", shows the final ledger (closing stack + session net), disables Deal next hand with a hint, and shows a `.table-notice` on the felt. Host gets an add-chips form (player + amount, behind an "Add chips…" toggle unless the table is over) that sends a new host action `adjust` → `Engine.adjustStack(..., "Add-on")`, recorded in the ledger. Busted guests see "You are out of chips. Ask the host for an add-on."
  - Leave confirm (`Sheet.confirm`, verb "Close table"/"Leave", danger) that says what happens to the room and the saved session.
  - Joining mid-game: a seatless player gets the game view with the felt, all seats, results, and a "You're watching this table" notice instead of an error written into the hidden room view; the status line reads "Watching the hand".
  - Errors render in the visible view (`#setup-error`, `#room-error`, new `#game-error` in the action stage status line).
  - Reconnecting banner in the room and game views; the disconnected seat is dashed red and the host keeps the force-fold recovery action.
- Kept: every id, data attribute and class app.js binds (audit Constraints), `--seat-columns` and `--hero-count`, storage keys, the PeerRoom protocol (one additive action type), `Cards.html/emptySlotHtml` for every card.

## Continuation after the usage-limit interruption

The checkpointed work was reviewed against the brief, the notes and the audit, then verified from scratch (the checks below were rerun). Two phone defects found while looking at the designed-state pictures were fixed:

- The hero's game-summary chip (`.hand-chip`, `white-space: nowrap`) was clipped at both edges inside the felt at 375px; chips in a `.hand-chip-row` now wrap (`poker/table.css`).
- Five opponents in a two-column grid pushed the hero's cards about 400px below the fold on a 375×812 phone; opponents are now one horizontal snap strip under 640px (`poker/play/styles.css`), which leaves the board, the pot and the hero seat one short scroll away with the action stage always visible. A scroll container never grows the page's `scrollWidth`, so the shell sweep still passes.
- A no-op `escapeText` helper was removed from `app.js`.

## Checks

- `node scripts/run-tests.mjs`: 451 pass, 0 fail (lint reports `poker/play/styles.css` 72 → 0 literals; baseline not re-recorded, as instructed).
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=/poker/play/ node scripts/shell-browser.cjs`: ok at 1440×900, 375×812, 844×390 (0 small text, 0 small targets, 0 missing rings, skip link and main present); same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /poker/play/`: both pictures reviewed and copied over `scripts/screenshots/baseline/poker-play-*.png`.
- Scratchpad Playwright gallery (18 states × 3 viewports, plus 1440/375 at a 24px root): setup join, phone tabs, host and guest lobby, NLH preflop (hero to act with clock), flop with a disconnected seat, seven-card stud with 7 seats, triple-draw selection, showdown, table over, busted guest, spectator, in-game error, reconnecting, leave confirm, guide, ledger, toast — no overflow, no text under 12px, no page errors.
- Real two-tab PeerJS room (scratchpad `room.cjs`): host creates, guest joins by `#CODE` prefill, lobby copy, deal, both act to showdown, host add-on recorded in the ledger, next hand reaches the guest, guest Leave confirm, host sees the disconnected seat and the force-fold button.

## Deferred

- Reconnecting "Retry" and a cancellable "connecting" state: `shared/peer-room.js` has no cancel or retry API and shared files are out of scope for this branch; the banner, the host-gone error and the automatic migration are surfaced instead.
- Seating a late joiner: the engine has no way to add a seat to a running table, so the designed state is spectating with honest copy rather than a "wait for a seat" queue.
- Poker Rush, Ultimate Omaha and Edge the Dealer are separate slices; `table.css` already carries their lobby, seat, action-stage and log/chat components.
