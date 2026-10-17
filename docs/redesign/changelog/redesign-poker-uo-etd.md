# redesign/poker-uo-etd — Ultimate Omaha and Edge the Dealer onto the shared system (step 5, casino pair)

Branch built on `redesign/poker-rush` (which holds `poker/table.css`, Mixed Poker and Poker Rush). Pages: `/poker/ultimate-omaha/`, `/poker/edge-the-dealer/`, changed together.

## What changed

### CSS (tokens only, zero colour literals, no `!important`, no page `:root`)

- `poker/ultimate-omaha/styles.css` 1711 → 124 lines (31 → 0 literals): the two boards on the felt, seats under them, card widths.
- `poker/edge-the-dealer/styles.css` 1469 → 364 lines (124 → 0 literals): the `@import` of Ultimate Omaha's stylesheet is gone. Dealer best-five / unused grouping on the felt (accent glow on the best five, greyed unused), collapsibles, hole cards with tap/keyboard/swipe discard states, the 2×2 draw actions, host showdown controls, compact solo mode, streak chip, the reversed hand-rankings counter.
- `poker/table.css` 970 → 1957 lines: a "table app shell" section shared by the pair (screens, menu, lobby grid, game header, two-column game layout that fits the viewport on desktops ≥ 821px and stacks on phones with the action stage sticky at the bottom, a right-hand stage column on landscape phones, hand panel, queued notice, showdown lines, log/chat with flexible heights, rules dialog body), plus card slots (`.card-slot` with a transition-based staggered deal via `--deal-delay`, no `animation-fill-mode`), `.slot-badge`, `.money-input`, log entries and chat lines, the emoji popover, collapsible `.section-header` buttons, confetti, and the phone topbar rule.
- Net for the two pages: 3180 → 1475 lines including the whole of the new table-app section.
- Gone: Playfair Display / Crimson Pro / JetBrains Mono Google Fonts links, the gold-on-felt and cyan/violet/lime/teal palettes, ETD's animated fixed background, floating suit particles, suit pulse and winner glow loops, `html { font-size: 16px }`, `user-scalable=no`, three `!important`s, the dead selectors the audit lists. Inter stack from tokens, coral accent, `--good/--bad` for win/lose and qualify/foul, `--warn` gold only for the multiplier badges (and ETD's "Queued" / "Ties dealer").

### Markup (both pages)

- Head: tokens → app → cards → `../table.css` → page, each `?v=20261016`; `data-family="poker"`; `theme-color #08090d`; `viewport-fit=cover`; the `is-ready` line; a description; skip link; `main#main[tabindex="-1"]`.
- Topbar: crumbs MS → Poker → page; tool nav Mixed Poker · Poker Rush · Ultimate Omaha · Edge the Dealer · 222 with `aria-current`; Rules icon button (`#rules-btn`, `aria-label`); Leave (UO, new `#leave-game-btn`) / Quit (ETD, `#quit-game-btn`) as danger buttons shown only during a game. On phones the current page's entry is scrolled into view in the tool-nav strip.
- Menu: tool head (eyebrow, H1, lede), name and code as kit `.field`s with the "leave blank to host" hint on both pages, Start as the primary button with a loader that renders while loading, Quick rules panel with a "Full rules" button.
- Lobby: tool head with the room code pill and copy icon button, roster of `.seat.seat--lobby` (avatar, name, You / Host / Player / "Joining next hand" badges), Start / Leave Lobby, guest "Waiting for host to start..." line, host settings as `.settings-row`s (`.money-input`, ETD's draw select), a guest note explaining host settings and mid-hand joins.
- Game header on both: eyebrow + H1 title, a room pill, and on UO a phase badge (`#phase-label`).
- UO game: one `.stage.felt` holding the street line (`#felt-phase`), both boards (`.board-line`, `.board-result` as `.hand-chip` good/bad with a `--warn` multiplier badge and "Qualifies"/"Foul" text) and the seats; side column with the hand panel, the action stage (phase kicker, title, your bet, Check secondary / Double primary, host Next bet + Next Hand), and the log/chat panel.
- ETD game: dealer felt (collapsible, best five | unused, dealer hand chip and mode note), players panel (collapsible), hand panel (five hole cards, hand-strength and dealer-comparison `.hand-chip`s, discard help, queued notice), action stage (draw round title + deck/discards meta, your bet, Keep All / Replace All secondary, Clear quiet, Confirm primary; host Next bet / Next draws / Next Hand), log/chat.
- Rules: real `<dialog class="dialog dialog--sheet">` opened through `shared/sheet.js` (Escape, focus trap, backdrop tap, focus return), with a close icon button and "Got it"; UO's multiplier table is a kit `.data-table` with `--warn` badges.
- Log/chat: real `.tabs` tablist through `shared/tabs.js` (keeps `.tab-btn[data-tab]`, `.tab-content.active`, `has-notification`); the emoji picker is a `<button aria-expanded>` and the options are `<button>`s; chat input and Send.
- Live regions: one polite `#toast-container` (`.toast-stack`) and one assertive `#alerts`; nothing else is `aria-live`.

### app.js (both pages)

Presentation changes: seats and lobby rows render the shared seat markup beside the old classes (`player-box`, `lobby-player`, `acted`, `showdown`, `queued`, `confirmed`, `winner-label`, `status waiting|confirmed`, `host-badge`, `queued-badge`, `queued-status`…); win/lose and PnL colour by classes (`is-good`/`is-bad`, `win`/`lose`) instead of inline `var(--gold-light)`/`var(--danger)`; emoji and ✓/✗ glyphs replaced by words; board and seat results as hand chips; toasts with a dismiss control, hover/focus pause, errors to the assertive stack; `--stage-h` published from a ResizeObserver so toasts sit above the sticky stage; the rules dialog through `Sheet.open/close`; ETD's confetti colours from tokens.

Small logic changes, each required by a finding in notes.md §3.8:

- Peer-supplied names are escaped wherever they reach `innerHTML` in the chat (sender), the log (hand start, actions, showdown, PnL summary, discard confirms) and the seat avatars' initials; emoji-only chat lines use `textContent`.
- Clipboard copy with an `execCommand` fallback and a success toast or an error toast that states the code.
- Host next-bet (both) and next-draws (ETD) inputs are refilled from the table state only when not focused (ETD's version, now in UO too; UO previously refilled only when the value was exactly "1.00").
- UO: the dead `formatPhase` now drives a street/phase indicator (header badge, felt line, action stage kicker and title).
- UO: a running game can be left (`#leave-game-btn`) through a `Sheet.confirm` that says what happens to the room and the saved session; ETD's Quit uses the same confirm instead of `window.confirm`.
- Both: a queued late joiner gets a persistent explanation in their own hand panel (`#queued-notice`) and empty slots, not just a 3s toast.
- ETD: hole cards are `PlayingCards.element(card, { tag: "button", interactive: true })` with `aria-pressed`, so discards can be chosen with Enter/Space; the slot state is a visible `.slot-badge` ("Replace" / "Queued") instead of CSS `content`. Swipe-to-discard with haptics, the staggered deal, compact solo mode, the streak chip and `fillSlot` diffing are unchanged.
- ETD: the dead sound toggle (`#sound-toggle-btn`, `toggleSound`, `soundEnabled`) is removed; the page has no audio.
- ETD: collapsible headers are `<button aria-expanded aria-controls>` and toggle `aria-expanded` with `.collapsed`.
- Emoji picker: `aria-expanded` kept in sync, Escape closes it and returns focus.

## Continuation after the interruption (this run)

The checkpointed work was reviewed against the brief, the notes and the audit and verified from scratch. Fixed:

- Landscape phones (844×390): the action stage was static in the right-hand column because the desktop rule (`.table-app .side-column > .action-area { position: static }`, min-width 821px) also matched and out-specified the landscape rule, so the stage scrolled away with the page. The landscape rule now names the same selector and the stage stays sticky (`poker/table.css`).
- Phones: Edge the Dealer's own entry sat off-screen at the end of the tool-nav strip; both pages now scroll the current entry into view on load (a few lines at the end of each `app.js`; see the shared request).

## Checks

- `node scripts/run-tests.mjs`: 451 pass, 0 fail. The css-literals lint logs `poker/ultimate-omaha/styles.css 31 → 0`, `poker/edge-the-dealer/styles.css 124 → 0`, `poker/table.css 0`; baseline not re-recorded.
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=/poker/ultimate-omaha/,/poker/edge-the-dealer/ node scripts/shell-browser.cjs`: ok at 1440×900, 375×812, 844×390 (0 small text, 0 small targets, 0 missing rings, skip link and main present); the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /poker/ultimate-omaha/,/poker/edge-the-dealer/`: four pictures reviewed and copied over `scripts/screenshots/baseline/poker-ultimate-omaha-*.png` and `poker-edge-the-dealer-*.png`.
- Scratchpad state galleries driving the pages' own controllers and engines at 1440×900, 375×812 and 844×390 (UO 15 states, ETD 18 states: menu, join, loading, host and guest lobby, preflop, flop, draw open / selected / confirmed / round 2, showdown host and guest, queued late joiner, compact solo, collapsed sections, chat with emoji picker, rules, leave/quit confirm, toasts, keyboard focus on a hole card, streak), plus a 24px-root pass: no overflow, no text under 12px, no page errors; names containing markup render as text.
- Real two-tab PeerJS rooms (one browser context, two pages) for each page at 1440 and 375: host creates, guest joins by code, lobby roster, deal, UO check/double through the flop to showdown, ETD keyboard discard selection (Enter/Space on card buttons), confirm, second draw, showdown, chat with markup (escaped), next hand at a new bet, Leave/Quit confirm closed with Escape, rules dialog with focus inside and focus returned to the Rules button, guest leaves and the host keeps the table. Copy code in headless Chromium has no clipboard permission and shows the error toast with the code, as designed.

## Deferred

- Moving the pair onto `shared/peer-room.js` and the exact shared lobby flow: their `MultiplayerManager` (host migration, session resume, queued joiners) is the peer protocol, which is frozen; the lobby, seat, felt and hand-chip components are shared, the transport is not.
- Player gone mid-hand / reconnecting banner with Retry: the manager keeps a departed player's seat for reconnection and the engine waits on them; the existing "A player disconnected (may reconnect)" toast is all the page can say without protocol changes.
- Opponents' card backs during a hand (audit P2): the filtered display state carries no hole cards for other players before showdown, and each seat already shows bet and acted/confirmed status; backs would add width to every seat (and the phone strip) without adding information, so seats show cards at showdown only, as before.
- "Ties dealer" still counts as beating the dealer in the engine (`beats` class kept); only its chip tone is `--warn`.
- The "Replace"/"Queued" badge is centred over the card as the old CSS label was; it covers part of the rank on 375px phones, but the card is dimmed and selected, and moving the badge below the slot would collide with the hand chips.

## Review fixes (branch `redesign/poker-tables-fixed`)

The independent review of `redesign/poker-uo-etd` (verdict: mergeable) listed two P2s and five P3s. Each was reproduced first; all seven are fixed in commit 5555296. Play and Rush had no findings and are unchanged.

1. **P2, host Leave/Quit copy said the room closes for everyone.** That was wrong: `MultiplayerManager` moves the host to another player (`initiateHostMigration`). Reproduced with three pages: after the host left, both guests stayed on the game screen and G1 became host. The confirm now says what really happens. With others seated it says "The other players keep playing: one of them becomes the host"; alone it says "Nobody else is seated, so the room ends". The title and verb are the guest's ("Leave the table?" / "Leave" on UO, "Quit the game?" / "Quit" on ETD). Copy only, no protocol change. Re-run of `hostleave.cjs`: the confirm shows the new text, and the guests keep playing with G1 as host.
2. **P2, no cancellable Connecting state.** Both menus now have `#connect-status` (a `.field-hint` under the busy Start/Join button, not a live region; the toasts already announce the result) and `#connect-cancel-btn` (`.btn--ghost`). This is a small page-only logic change, which the brief's connecting-with-cancel state requires. Cancel calls `multiplayer.leave()`, restores the button, toasts "Connection cancelled" and puts focus back on the button. Each attempt has an id, so a promise that settles after a cancel is ignored and does not open the lobby. `startOrJoinGame` ignores clicks while connecting. No protocol change. `cancel.cjs`: Cancel shows while joining a missing room; after Cancel the menu is idle and focused, and 11 s later it is still on the menu with no stray error. Host cancel followed by a real Start opens the lobby.
3. **P3, ETD queued late joiner saw "Confirmed 0 discards".** `updateHoleCards` takes `{ queued: true }` for a player who has not been dealt in. That clears `#discard-help`, and the disabled Confirm button reads "Confirm" instead of "Confirmed". Only `#queued-notice` explains the wait (`latejoin.cjs`).
4. **P3, keyboard tab switching left `.tab-content.active` stale.** `Tabs.init(…, { onChange: (id) => this.switchTab(id) })` on both pages, so arrow keys, Home and End keep `.active` in step and the chat notification pulse no longer fires on the open tab (`room.cjs`, "after ArrowRight").
5. **P3, per-board qualify/foul shown by colour only.** On a failing board, `handResultHtml` now shows a visible "Foul" (`.board-result-state`, the class the board-level chips use). "qualifies" stays screen-reader text, since the chip without "Foul" already reads as qualifying.
6. **P3, UO phone hole cards half under the sticky stage.** At 640px and below, the board labels run up the side of each board row and the felt's street line is hidden. The header badge and the stage kicker already say the street. At 375×812 the hole cards moved from y 654–733 to 572–651, clear of the stage at 700. The seat order is unchanged (`poker/ultimate-omaha/styles.css` +20/−6).
7. **P3, ETD apple-mobile-web-app metas without a manifest.** Both metas are removed.

No test contract changed.
