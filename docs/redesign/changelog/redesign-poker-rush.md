# redesign/poker-rush — Poker Rush onto the shared system (step 5, Rush part)

Branch from `redesign/poker-play` (which holds `poker/table.css` and the Mixed Poker migration). Pages: `/poker/rush/`.

## What changed

### `poker/rush/styles.css` (1563 → 1160 lines, 90 → 0 colour literals, no `!important`, no `:root` palette)

One layer on `shared/tokens.css` + `shared/app.css` + `shared/cards.css` + `poker/table.css`:

- The app-shell override layer, the seventeen re-declared blocks, the `html, body { overflow: hidden }`, the `.lobby:has(.options-drawer[open])` compaction hacks and the dead rules (`.history-panel { display: none }`, `.suit-dot`, `.seen` no-op, `--dim`, `.is-muted`) are gone. The lobby and the room are document-style views that scroll inside `<main>`; the game view is a height-bounded flex/grid on desktops (felt | scores, matrix beneath the felt when open) and a stacked column on phones with a fixed-height felt (`clamp(15rem, 46svh, 24rem)`) so the hand's size container always has a height.
- Coral family theme through `data-family="poker"`; the old lime/gold survive only as rank colours, aliased from semantic tokens on `.game-view` (`--rank-straight: var(--info)`, flush `--cat-6`, full house `--good`, four of a kind `--accent-2`, straight flush `--cat-5`, royal flush `--warn`) for score-card borders and particles.
- Kept: the size-container card sizing in `.hand-slot` (`--card-width: min(100%, 100cqh * 5/7)`), `--hand-size` from JS, the 1–7 badges, `cardDeal` / `cardDiscard` / `scoreIn` / `tablePulse` / `particleBurst`; the badge is floored at 12px (`max(var(--t-xs), 15cqw)`), as is the joker corner label in the matrix.
- The matrix cell override (`height: 27px; aspect-ratio: auto`) is gone; the shared card aspect drives row height. On phones cards keep the 36px floor and the matrix scrolls sideways inside its panel.

### `poker/rush/index.html`

- Head: tokens → app → cards → table → page, each `?v=20261016`; `theme-color #08090d`; `viewport-fit=cover`; the `is-ready` line; a description.
- Topbar: crumbs MS → Poker → Poker Rush; tool nav Mixed Poker · Poker Rush · Ultimate Omaha · Edge the Dealer · 222 with `aria-current`; a connection badge (shown only in a room), the SFX toggle (`#soundButton`, `aria-pressed`, sound/sound-off icons) and a help icon button (`#instructionsButton`). The "PR" logo mark, the "i" and "x" glyph buttons are gone.
- Lobby (`#lobby`): tool head with eyebrow, H1 `#gameTitle`, lede and a records strip (best score, today); three hub-style tiles as `<button>`s (featured Daily with the day's seed and a "Played today · N pts" badge, Random, Multiplayer); an Options button that opens a kit sheet holding `#optionsForm` (same field names `handSize, jokers, timeLimit, discardMode, endMode`, kit `.segmented` radiogroups with focus surfacing, `.field--select` selects) and a chip summary of the current options.
- Room (`#roomView`, new): the shared `.lobby` — code pill with copy, Copy invite, roster of two `.seat.seat--lobby`, Start race (host) or "Waiting for the host to start the race." (guest), race options as chips with a host-only Change button, Leave room, an info banner slot.
- Game (`#gameView`): tool head with the seed and mode kicker (`#seedBadge`, `#modeBadge`), Matrix (`aria-pressed`) / Daily / Random / End as kit buttons, and a `.stat-strip` for Score / Time / Seen / Discards / Deck (inline pills on phones); a `.table-banner` slot; the felt `.stage.felt.table-surface` holding `#hand` and `#statusLine` (`role="status"`, the page's polite region); the scores `.panel` with `#playersPanel` (two-player seats), the recent `#scoredHands` cards and the formerly hidden history (`#scoreList` / `#pointsBreakdown`) as a scrolling list of the whole run; the matrix `.panel` with `.deck-matrix` and a legend.
- Dialogs: instructions, options, multiplayer and game over are kit `<dialog class="dialog dialog--sheet">` opened through `shared/sheet.js` (backdrop tap, focus return, keyboard fitting). The copy-paste WebRTC textareas and their ids (`answerCodeInput`, `acceptAnswerButton`, `joinAnswerCode`) are gone with the signalling they served; `inviteCode` is now the room-code pill, `joinInviteCode` the code field, `hostGameButton`/`joinGameButton` the Create/Join segmented, `connectionStatus` the room's status line.
- Live regions: exactly one polite (`#statusLine`) and one assertive (`#alerts` toast stack with dismiss and hover pause). `#scoreStrip` no longer carries `aria-live` (it re-rendered whole card lists).

### `poker/rush/app.js`

Rendering, sound, hotkeys, deal/discard/score animations, the seeded daily/random split and the matrix state logic are the same code. Logic changes, each from a finding in `docs/redesign/notes.md` §3.7 and the completeness pass:

- Multiplayer runs on `shared/peer-room.js` (`namespace "poker-rush"`, `maxPlayers 2`, `storageKey "poker.rush.session.v1"`): the host creates a room and publishes a `rush-lobby` state with the options; the guest joins by code (or the `#CODE` deep link, which opens the dialog in join mode with the code filled); the host starts the race from the room; discards and End travel as room actions (`room.sendAction`) into the same host-side queue (`enqueueHostAction` → `PokerRushMultiplayerGame`); the host publishes `{ kind: "rush", views }` with a per-client view. Two-player game semantics are unchanged.
- Game over is a `<dialog>` that names the winner or a tie in two-player mode, with a stat strip (both scores and the seed; score / hands / discards / seed solo). The host's "Race again" starts a new race with the same peer; "Back to room" returns both players to the room; the guest sees "Waiting for the host to start another race." No path drops the peer silently.
- Daily, Random and End during a run go through `Sheet.confirm` with a danger verb ("Restart" / "End") and copy naming the score and time left. In a room the solo Daily/Random buttons are hidden (a solo run would close the room); they return after Leave.
- Best solo score and today's daily result persist in `localStorage["poker.rush.records.v1"]` and feed the lobby's records strip, the Daily tile's "Played today" badge and the game-over note ("New best score"). The player name reuses `poker.player.name` like Mixed Poker.
- `aria-pressed` on the SFX button (the icon swaps; `.is-muted` is still toggled).
- Designed multiplayer states: connecting (busy button), guest waiting for the host, player disconnected mid-race (banner + `.seat--disconnected`, the race continues), host disconnected (banner, PeerRoom migration; if this player becomes host mid-race the race ends locally with the result shown and the room stays open), host closed the room (race-over dialog + alert, back to a solo footing), leaving (confirm that says what happens to the race and the room), errors inside the open dialog (`Sheet.setError`) or the visible view plus the assertive stack.
- Hotkeys are ignored while any dialog is open; keyboard focus stays on the discarded slot when its card button is rebuilt; unseen matrix cards are dimmed (the old `.seen` rule was a no-op).

## Checks

- `node scripts/run-tests.mjs`: pass (the css-literals lint logs `poker/rush/styles.css 90 → 0`; the baseline is not re-recorded).
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=/poker/rush/ node scripts/shell-browser.cjs`: ok at 1440×900, 375×812, 844×390 (0 small text, 0 small targets, 0 missing rings, skip link and `main#main`); same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only /poker/rush/`: both pictures reviewed and copied over `scripts/screenshots/baseline/poker-rush-*.png`.
- Scratchpad Playwright gallery (13 solo states × 3 viewports, plus 1440/375 at a 24px root): lobby, options sheet, instructions, multiplayer create/join, game, matrix with jokers, keyboard focus, End confirm, game over, records in the lobby, restart confirm — no overflow, no text under 12px, no page errors.
- Real two-tab PeerJS room (scratchpad `room.cjs`, 1440 and 375): create, join by `#CODE`, roster states, start, race with the players panel, guest End → race-over on both sides naming the winner, host Race again, Back to room on both, guest Leave confirm, host back to "Waiting for a player", host closes the tab mid-race → guest's race-over dialog and alert, wrong code → error inside the dialog.

## Deferred

- Reconnecting "Retry" and a cancellable "connecting" state: `shared/peer-room.js` has no cancel or retry API and shared files are out of scope; the banner and PeerRoom's automatic migration are surfaced instead.
- Continuing a race after host migration: the engine lives on the host, so the guest-turned-host ends the race with the scores as they stand and keeps the room for another race.
- A session Resume control: the page never had one; PeerRoom saves a session anyway (harmless).
- Ultimate Omaha and Edge the Dealer are a separate slice.
