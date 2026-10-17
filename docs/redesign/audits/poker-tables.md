<!-- Corrections after independent verification: Mixed Poker never shows the decision and results panels together (one replaces the other at showdown), so the collapse risk is header + meta + hero + one panel; `shared/peer-room.js` is used by six pages repo-wide, Mixed Poker being the only one of these four; the Ultimate Omaha loader is hidden by the `.hidden` class, not the `hidden` attribute. -->
<!-- Detailed audit appendix. Generated 2026-10-16 from a read-only review of commit 8c0efdb; line numbers refer to that commit. See ../notes.md for the synthesized page-by-page notes and ../prompt.md for the overhaul brief. -->

# Group C — Poker table games (`poker/play`, `poker/rush`, `poker/ultimate-omaha`, `poker/edge-the-dealer`)

Read-only UI/UX audit, prepared for the site-wide visual redesign. All paths are repo-relative; line numbers refer to the files as of commit `8c0efdb`.

Site baseline for comparison (`shared/hub.css:11-34`): page `#08090d`, `--surface #10141c`, `--surface-2 #151a24`, `--glass rgba(16,20,28,.66)`, `--line rgba(148,163,184,.13)`, `--ink #eef4ff`, `--muted #9aa7b7`, `--soft #6f7b8b`, poker accent `#ff8b83` / `--accent-2 #ffb77a` (`hub.css:42-45`), `--radius 16px`, Inter with `cv11, ss01`, `--ease`/`--spring` curves, aura + dot-grid body background, `.topbar/.crumbs/.mark/.switcher` chrome. The shared card component (`shared/cards.css`, `shared/cards.js`) sizes from `--card-width` only and exposes wrapper states `selected / staged / dim / danger / interactive / new`, `.empty-slot`, `.card-row`, `.deck-matrix`, size classes `cards-xs…xl`.

None of the four pages loads `shared/hub.css`, sets `data-family` on `<html>`, or uses the hub topbar/crumbs/switcher. Each ships its own full reset, token set, button system, modal, toast and lobby.

---

## poker/play/ — Mixed Poker

- **Purpose & audience**: Peer-to-peer mixed-game cash table (30 variants: hold'em, Omaha, stud, draw, Badugi, Dramaha, Archie). Audience: a home-game group that wants one host to create a room and friends to join by 6-letter code; the hub features it as the flagship tile (`poker/index.html:61-88`).

### Screens / states / flows
1. **Setup view** (`index.html:29-104`): page heading "Cash table / Build a mixed game"; three panels numbered 01/02/03 — *Table* (Create/Join segmented switch, name, room code, Create/Join button, "Resume saved table", seats/stack/blinds/bets/ante inputs), *Rotation* (quick-mix chips, rotation strip with move/remove buttons, "Change every" select, catalog family tabs + game grid), *Table options* (limit raise cap, live straddle toggle, bomb pot, bomb ante, action clock). On ≤820px the three panels become a segmented tab bar (`styles.css:1416-1440`); the Rotation tab label is updated with a count (`app.js:431`).
2. **Lobby / room view** (`index.html:106-118`): room code + "Copy invite", eyebrow "Lobby", title toggles "Waiting for players" / "Table ready" (`app.js:481`), roster grid of `.roster-seat` with initials avatar and Host/Ready/Reconnecting (`app.js:482-486`), lobby mix chips, host-only "Deal first hand" (disabled until every seat is filled and connected, `app.js:488-489`).
3. **Game view** (`index.html:120-181`): game header (kicker "Hand n · Game i/N", variant title, Ledger button, room tag), 4-stat `table-meta` strip (Street / Pot / To call / Next game), `table-surface` (= opponents' `.seats` strip on top + `center-table` with one or more `board-line`s and a table message such as "No community cards" / "Bomb pot"), `hero-hand` panel (live dot, name, status, hero cards, evaluation chips), `decision-panel` (kicker Action/Draw/Discard, title, bet presets Min/½ pot/Pot/Max + amount input, Fold / Check|Call / Bet|Raise; draw controls "Select cards to discard" + Pat/Draw n; host-only "Force-fold disconnected player"), `results-panel` at showdown (title "Won x / Lost x / Break even / N won uncontested", per-player result rows, host "Deal next hand").
4. **Guide modal** (`<dialog>`, `index.html:185-189`): family tabs + two-column list of game cards. **Ledger modal** (`index.html:191-196`): stacks grid, hand-by-hand net entries, Copy ledger / Export JSON. **Toast** (`index.html:198`, `role=status aria-live=polite`).
5. **States**: `.connection[data-state=offline|reconnecting|connected]` dot in the topbar (`styles.css:140-165`); `#setup-error` / `#room-error` `role=alert` paragraphs that collapse when empty (`styles.css:411-421`); empty rotation uses CSS `content: "Add games from the catalog"` (`styles.css:558-562`); ledger empty state is a `<p class="error">No completed hands yet.</p>` (`app.js:680`); connect button text "Connecting…" while busy (`app.js:815`); disconnected seats get a red border (`styles.css:929-931`).
6. **Multiplayer**: the only page of the four that uses `shared/peer-room.js` (`app.js:7, 109`); roster/state/status callbacks drive the lobby and connection dot (`app.js:184-186`).

### Current visual language
- Own `:root` (`styles.css:1-18`): `--bg #070a0e` (hub is `#08090d`), `--panel #0c1219`, `--panel-2 #111a24`, `--panel-3 #172434`, `--line #273647`, `--text #f2f6fb`, `--muted #95a4b7`, `--faint #617184`, accent **green `#35d5a0`** plus blue/purple/amber/red. The poker family accent `#ff8b83` appears nowhere; the brand mark is green on `#0b211b` with a `#298e70` border (`styles.css:92-103`), unlike the hub `.mark` (`hub.css:189-201`).
- Font: Inter, no `font-feature-settings`. Type scale is ad hoc: ~20 distinct sizes from 0.58rem (`styles.css:959`) to 1.5rem (`styles.css:211`), most labels 0.62–0.74rem at weights 750–900. Eyebrows 0.66rem/900/0.08em (`styles.css:220-228`) vs hub 0.7rem/800/0.16em.
- Spacing: 6/7/8/10/12/14px gaps, no spacing tokens. Radius: 5–8px everywhere (`styles.css:234, 321, 352, 430`) vs hub 16px / pills. Shadows: only the modal (`styles.css:1200`) and toast. No gradients, no glass, no body aura. Flat slate-blue panels on near-black.
- "Felt": `table-surface` is `#071611` with `#244b3e` border and the seats strip `#091018` with `#1d4035` divider (`styles.css:896-914`); hero-hand border `#2a5f4e` (`styles.css:1018`). Green felt hints inside an otherwise blue-grey UI.
- Motion: no keyframes; transitions on hero cards (`styles.css:1050-1060`), toggle thumb (`styles.css:740`), toast (`styles.css:1357`). Reduced-motion block zeroes transitions with `!important` (`styles.css:1691-1697`).
- Relation to hub tokens: **drifted** — same font and dark mood, different accent, smaller radii, no glass/aura, different muted/line values.

### Layout
- `.shell` max 1380px with safe-area padding (`styles.css:65-72`); desktop ≥821px pins the shell to `height:100%` and lets `main` scroll (`styles.css:1366-1375`). Setup grid is `272px / 1fr / 256px` (`styles.css:252`), `300px / 1fr / 300px` at ≥1200 (`styles.css:1379`), two columns with Options under Table between 821–1020 (`styles.css:1392-1406`), one column + tabs ≤820.
- Game view: 6-row grid `auto auto minmax(0,1fr) auto auto auto` (`styles.css:854-858`); the table row is the only flexible one, so on short viewports with hero + decision + results showing, `.table-surface` can collapse toward 0 (its `min-height:0` at `styles.css:897`) while `main` grows a scrollbar — the "fits the viewport" promise breaks exactly at showdown.
- Mobile ≤820: seats become a horizontal scroller of 150px cards (`styles.css:1459-1467`), decision panel and bet controls go single column; ≤620: decision panel becomes `position: sticky; bottom` (`styles.css:1606-1612`), nav links and connection text are hidden (`styles.css:1501-1505`), table-meta 2×2, modals full-bleed. ≤380: catalog single column, hero cards 54px.
- Card sizing honours the shared contract: `.seat-cards --card-width: min(31px, (100% - 12px)/7)` (`styles.css:964`), `.board-cards min(55px, 7vh)` (`styles.css:1004`), `.hero-cards min(76px, 9vh, …)` with `--card-selected: var(--amber)` (`styles.css:1038-1041`). Cards are built with `Cards.html` / `Cards.emptySlotHtml` only (`app.js:745-753, 541`).

### Controls inventory
- `.button` (+ `.primary` green, `.secondary` blue, `.danger` red, `.quiet`, `.small`, `.full`, `:disabled`) `styles.css:348-409`; `.icon-button` 36px (`styles.css:167-186`); `.segmented` (`styles.css:423-455`) used for Create/Join and the mobile setup tabs; quick-mix and catalog-tab chips (`styles.css:524-543`); `.game-option` catalog cards (`styles.css:626-658`); `.rotation-item` with 24px-wide ‹ › × buttons (`styles.css:564-590`); `.number-setting` / `.toggle-setting` rows with a custom 38×22 switch (`styles.css:672-751`); inputs/selects (`styles.css:317-346`), `.paired-input`; bet `.amount-control` (4 presets + number, `styles.css:1103-1137`); `.action-buttons` 3-up; `.table-meta` stat tiles; `.seat` cards; `.evaluation-chip`; `.result-row`; `.mix-chip`/`.room-tag`; `.ledger-stack`; two `<dialog class="modal">` with header/footer; `.toast`.
- Consistency: coherent within the page (one button system, one chip style) but five slightly different "chip" components (`quick-mixes button`, `catalog-tabs button`, `mix-chip`, `evaluation-chip`, `room-tag`) and three different hover colours for the same green (`#2d8e72`, `#2c8d70`, `#2d8e70` at `styles.css:541, 642, 1235`).

### Problems found
- **Accent and chrome drift**: green accent, custom brand mark and topbar instead of hub crumbs/switcher (`styles.css:74-135`); brand links to `/` and nav links to OFC and Dodge reports (`index.html:19-21`) but not to `/poker/`; `theme-color #070a0e` (`index.html:6`) ≠ hub page colour.
- **Focus visibility**: `.button:focus-visible { outline:none }` relies on a `#4b6078` border (`styles.css:360-365`); `.icon-button:focus-visible { outline:none }` (`styles.css:181-186`); inputs set `outline:none` and a 10 %-alpha shadow (`styles.css:321, 326-330`) — practically invisible focus. The toggle `<input>` is `opacity:0` with no `:focus-visible + i` style (`styles.css:716-719`), so the Live-straddle switch has no keyboard focus indication. Segmented, chip, catalog, preset and rotation buttons fall back to the UA outline (inconsistent).
- **Touch targets**: rotation ‹ › × buttons are 24px wide (`styles.css:567`); segmented buttons 32px tall (`styles.css:435`); `.mix-chip` 30px; `.result-row` 28px; `.icon-button` 36px.
- **Micro type**: `.seat-meta` 0.58rem ≈ 9.3px (`styles.css:959`), `.number-setting small` 0.62rem, `.roster-seat small` 0.63rem, `.table-meta span`/`.mix-meta span`/`.game-option span` 0.65rem, eyebrows 0.66rem. `--faint #617184` on `#070a0e` ≈ 3.6:1 and is used for body-sized hints (`styles.css:558-562, 799-802`).
- **Connection status on phones** is a 7px dot with the label hidden (`styles.css:1502`) and no `aria-label`/`title` on `#connection` (`index.html:23`).
- **Hard-coded colours**: 68 hex literals; e.g. button variants (`styles.css:368-407`), felt (`901-913`), modal (`1196-1204`), toast (`1348-1350`), sticky decision bg `#0b1219` (`1611`) which is a near-duplicate of `--panel #0c1219`.
- **`!important`**: `[hidden]` (`styles.css:50-52`) and the reduced-motion block (`1695`).
- **Magic numbers**: column widths 272/256/300/124/132/118/100/58/42px (`styles.css:252, 469, 990, 1253, 1314, 1379, 1527, 1581, 1669`); modal list heights `calc(100dvh - 146px)` / `- 132px` (`1241, 1663`); `min(55px, 7vh)` / `min(76px, 9vh)`.
- **Information hierarchy**: the opponents' seats are a flat grid strip above the board (`styles.css:906-971`), not a table; the active player is marked only by a green border (`styles.css:924-927`); dealer button, blinds and "to act" are text badges joined by " · " (`app.js:523-526`); street bet and stack are both bold numbers in the same seat head. The `table-meta` strip repeats pot/to-call that the decision panel also implies.
- **Copy/empty states**: CSS-generated empty text (`styles.css:558`) is not selectable/translatable; the guide modal is 980px wide with a 118px label column that truncates nothing but wastes space on phones (`styles.css:1250-1257`); `#waiting-title` h1 inside a panel after the page h1 — two h1s per view.
- **Dead/duplicated CSS**: `.advanced .panel-title > span` is hidden except at ≥1200 (`styles.css:660-665, 1382-1384`); `.setup-grid > .panel { max-height:100%; overflow:auto }` is overridden on phones but `.mix-panel` also carries its own overflow rules (`styles.css:271-287, 1442-1448`); three hover greens (above).
- **Dependencies**: PeerJS from unpkg (`index.html:200`), fine but the page has no offline/CDN-failure state (app exits early at `app.js:9`).

### Redesign recommendations
- **P1** Adopt the hub token set and chrome: `data-family="poker"`, `hub.css` topbar/crumbs/switcher, coral accent for primary/active/eyebrow, `--surface/--line/--glass`, 16px radius on panels and 10–12px on controls. Replace the green brand mark with the shared `.mark`.
- **P1** Make the table the hero: a real felt region (shared "table felt" component) with seats placed around the board, a visible dealer button, bet chips next to each seat, and the hero seat at the bottom edge; move Street/Pot/To-call into the felt centre instead of a separate stat strip. Keep the opponents' card row sized by `--card-width` from the seat width.
- **P1** Fix focus and target sizes: 2px coral `outline` + offset on every interactive element, 44px minimum on rotation/segmented/preset buttons, visible focus on the switch.
- **P1** Guarantee the app-shell on desktop: give `.table-surface` a sane `min-height` and let the results panel overlay or replace the decision panel instead of adding a sixth row.
- **P2** Collapse the five chip styles into one shared chip and the three hover greens into the accent token; move hard-coded button colours into `color-mix()` with the accent; drop `!important` from `[hidden]` by not fighting it with `display` rules.
- **P2** Lobby: reuse a shared seat/avatar component (same as the in-game seat) so lobby → table is a visual continuation; make the room code a copyable pill with the share link.
- **P2** Replace the CSS-content empty text with a real element; add `aria-label` to the connection indicator; keep the label visible as a pill on phones.
- **P3** Establish a type scale (0.75 / 0.85 / 1 / 1.25 / 1.5rem) and stop using sizes under 0.7rem; `tabular-nums` on stacks and pot.
- **Keep**: the three-step setup with mobile tabs, `<dialog>` modals, `role=alert`/`aria-live` wiring, sticky decision panel on phones, the rotation builder, ledger copy/export, `Cards.html`/`emptySlotHtml` usage, PeerRoom integration.

### Constraints to preserve
- Tests: `poker/play/tests/engine.test.cjs`, `poker/play/tests/evaluator.test.cjs` require `../engine.js` / `../evaluator.js` only — no DOM selectors, ids, classes or visible text. Safe to restyle freely.
- `shared/tests/cards.test.cjs` locks the shared card markup (`playing-card suit-x`, `card-suit`, `card-rank`, `card-badge`, `card-corner`, `empty-slot`, `aria-label`) — do not override those in page CSS.
- `backgammon/tests/offline.test.mjs:164` references the URL `/poker/play/` only.
- `app.js` depends on these ids (all in `index.html`): `guide-button, connection, leave-button, setup-view, setup-tabs, rotation-tab, setup-grid, create-mode, join-mode, player-name, join-fields, room-code, connect-button, resume-button, setup-error, seats, starting-stack, small-blind, big-blind, small-bet, big-bet, ante, bring-in, mix-count, mix-cap, quick-mixes, rotation, clear-mix, hands-per-game, catalog-tabs, game-catalog, raise-cap, straddle, bomb-every, bomb-ante, action-clock, room-view, room-code-display, copy-invite, waiting-title, roster, lobby-mix, start-game, room-error, game-view, game-kicker, game-title, ledger-button, game-room-code, street-label, pot-label, call-label, next-game-label, seats-view, boards, table-message, hero-name, hero-status, hero-cards, hand-evaluation, decision-panel, decision-kicker, decision-title, bet-controls, amount-control, bet-amount, fold-button, pass-button, raise-button, draw-controls, draw-help, draw-button, force-fold-button, results-panel, result-title, results-list, next-hand-button, guide-modal, guide-tabs, guide-list, ledger-modal, ledger-stacks, ledger-entries, copy-ledger, export-ledger, toast`; data attributes `data-setup-tab, data-setup-section, data-bet-preset, data-close, data-quick, data-family, data-game, data-move, data-index, data-remove, data-guide-family, data-card-id, data-selectable`; classes toggled by JS: `active, selected, empty, show, positive, negative, seat/active/disconnected, roster-seat/empty, rotation-item, game-option, evaluation-chip, result-row, mix-chip, ledger-stack, ledger-entry, ledger-net, board-line, board-cards, seat-head, seat-meta, seat-cards, guide-game`; `--seat-columns` and `--hero-count` custom properties set from JS (`app.js:520, 551`).

---

## poker/rush/ — Poker Rush

- **Purpose & audience**: Single-player (plus ad-hoc 2-player) seeded "poker sprint": discard-and-draw as fast as possible, any straight-or-better scores and clears. Audience: casual daily-puzzle players (daily seed) and score chasers.

### Screens / states / flows
1. **Lobby** (`index.html:14-96`): logo "PR", `i` instructions button, eyebrow "Seeded poker sprint", 4.4rem title, three large tiles Play Daily / Play Random / Play Multiplayer, a `<details class="options-drawer">` with radio-segmented Cards 5/6/7, Jokers 0–4, Time 15/30/60/none, Discards select, Ends select.
2. **Game view** (`index.html:98-166`): `table-header` (score box, Time/Seen/Discards/Deck metrics, SFX / Matrix (aria-pressed) / Daily / Random / End buttons), `score-strip` (`aria-live`, "Scored hands n", optional multiplayer `players-panel`, `scored-hands` cards with mini card rows), `table-surface` (seed badge + mode badge, the `hand` grid of `hand-slot`s each holding a shared card `<button>` with a 1–7 badge, `status-line role=status`), `lower-grid` with the toggleable `matrix-panel` (deck matrix built from shared cards with counts) and a `history-panel` that is permanently `display:none` on every width (`styles.css:1101-1103`) although JS renders it (`app.js:482-501`).
3. **Instructions dialog** (`<dialog>` with `form method=dialog`), **Multiplayer dialog** (manual WebRTC: Host → invite code textarea → paste answer; Join → paste invite → answer code; `#connectionStatus` text "Idle…"), **Game-over overlay** (`div.game-over` fixed, card with title/summary, Play Again / Options).
4. **States**: `is-new` / `is-discarding` slot animations (`styles.css:634-640`), `is-empty` slot with shared `.empty-slot` (`app.js:395-398`), `score-pulse` on the felt and JS-spawned `.particle`s per rank (`app.js:944-955`, `styles.css:902-931`), `score-card[data-rank]` border colours per hand rank (`styles.css:498-521`), `score-empty` placeholder, `matrix-cell.seen/discarded/scored/active`, `player-chip.is-local`, `small-button.is-active` for Matrix; `is-muted` is toggled on the SFX button (`app.js:1020`) but has no CSS.
5. **Multiplayer**: does **not** use `shared/peer-room.js`; its own `RTCPeerConnection` with STUN and copy-paste base64 signalling (`app.js:650-720`). There is no room code or lobby roster — just two textareas per side.

### Current visual language
- `:root` (`styles.css:1-24`): `--bg #08090d` (matches hub page), `--felt #0d1117`, `--panel #121620`, `--line #2a3140`, `--text #eef4ff` (= hub ink), `--muted #8f9caf`, `--dim #5f6b7f` (unused), accents **cyan `#45d6ff`**, **lime `#bdf46b`**, rose, gold `#f4c95d` (= hub double), violet, orange, danger; `--radius 8px`; `--shadow 0 18px 70px`. Inter.
- Body: cyan radial + diagonal gradient (`styles.css:35-41`); panels `rgba(18,22,32,.86)` with `0 12px 48px` shadow (`styles.css:338-347`); primary tiles with cyan/lime, rose/gold, violet/cyan gradient fills and hover lift (`styles.css:175-216`); score box lime gradient; felt with faint vertical pinstripes (`styles.css:561-564`).
- Type: h1 4.4rem/0.96 (3rem mobile), tile labels 2.1rem/900, `.metric-label` uppercase 0.72rem/900/0.12em shrinking to 0.64 → 0.53 → **0.45rem (≈7px)** (`styles.css:1043-1045, 1246-1248, 1525-1528`); `.field-label` 0.6rem on phones (`1430-1434`); weights 780–950.
- Motion: `cardDeal`, `cardDiscard`, `scoreIn`, `tablePulse`, `particleBurst` keyframes; hover lifts on every button; reduced-motion block sets 1ms with `!important` (`styles.css:1555-1563`).
- Relation to hub: shares page colour, ink and Inter, but reads as a neon arcade (cyan/lime/rose/violet gradients, heavy shadows) — **completely different** accent story from the coral poker family.

### Layout
- The stylesheet is two layers: an original flowing layout (`styles.css:62-976`: `.shell min-height:100vh; padding 28px 0 44px`, `.lobby min-height: calc(100vh - 72px)`, `.game-view` gap grid, `.lower-grid` 1.55fr/0.75fr) and an appended **app-shell override** (`styles.css:978-1203`) that sets `html, body { height:100%; overflow:hidden }`, `.shell { height:100dvh; overflow:hidden }`, and a fixed-row grid `64px / 1fr / 170px` (+214px matrix) (`styles.css:992-1012`), `.lower-grid { display: contents }`, `.history-panel { display:none }`.
- Because `html, body` are `overflow:hidden` globally, the **lobby is also clipped**: the `.lobby` is `min-height: calc(100vh - 72px)` inside a 100dvh clipped shell, so when the options drawer opens on a phone the content cannot scroll; the many `.lobby:has(.options-drawer[open])` compaction rules (`styles.css:1373-1508`) exist to squeeze everything into one screen instead.
- Mobile ≤920: rows `112px / 1fr / 146px` (`styles.css:1217`), header becomes 84px score box + metrics + a 34px action row; the hand wraps to two rows of four (`styles.css:1283-1292`); scored hands limited to 2 by CSS (`styles.css:1324-1326`) while JS renders 4; matrix cells forced to `height:27px; aspect-ratio:auto` (`styles.css:1349-1355`) although they now contain shared cards with a 5:7 aspect and `width:100%` (`styles.css:702-704`) — the cards overflow the 27px cell and overlap the next row on phones.
- Card sizing honours the contract: `.hand` is a size container and each slot derives `--card-width: min(100%, 100cqh * 5/7)` (`styles.css:591-615`), `--card-selected: var(--cyan)`; `.mini-cards` 44px; `.matrix-cell .playing-card { width:100% }`.

### Controls inventory
- `.primary-action` tiles (+`.alt`, `.multi`, `.compact`), `.icon-button` / `.small-button` (+`.danger`, `.is-active`), `.segmented` radio groups (3/4/5 columns), native `<select>`s, `fieldset/legend`, `<details>/<summary>` drawer, `.score-box`, `.round-metrics`, `.score-card` with `data-rank`, `.player-chip`, `.matrix-cell` with `.count`, `.score-row` (hidden panel), `.seed-badge`/`.mode-badge`, `.status-line`, two `<dialog>`s, `.field-label` inputs/textareas, `.game-over-card`.
- Consistency: one button family but radius/weight/colour differ from the other three pages; the "x"/"i" glyph buttons are letters, not icons.

### Problems found
- **Duplicate/contradictory CSS**: every major block is defined twice (`.shell` 62/984, `.game-view` 333/992, `.table-header` 349/1014, `.score-box` 353/1023, `.round-metrics` 370/1033, `.metric-label` 387/1043, `.header-actions` 400/1051, `.small-button` 407/1056, `.table-surface` 556/1073, `.matrix-panel` 659/1090, `.card-matrix` 666/1105, `.matrix-row` 671/1111, `.score-strip` 413/1128, `.scored-hands` 436/1153, `.score-card` 487/1170, `.score-list` 739/1190, `html,body` 30/978). Roughly 300 lines are dead on arrival.
- **Dead UI**: `.history-panel` + `#scoreList` + `#pointsBreakdown` rendered but never visible (`index.html:158-164`, `styles.css:1101-1103`, `app.js:451, 482-501`); `.matrix-cell .suit-dot` has no element (`styles.css:1357-1361`); `.matrix-cell.seen { opacity:1 }` is a no-op (`706-708`); `--dim` is never used; `.is-muted` has no rule.
- **Global `overflow:hidden`** (`styles.css:978-990`) breaks scrolling of the lobby, the options drawer, the multiplayer dialog on short phones (`@media (max-height:740px)` hacks at `1535-1553`), and any future content.
- **Focus**: segmented radios are `opacity:0` (`styles.css:295-299`) with no `input:focus-visible + span` rule → keyboard users cannot see which option is focused; only hand cards have an explicit focus style (`styles.css:624-627`); `.small-button`/`.primary-action` rely on UA outline (acceptable but inconsistent).
- **Touch/size**: `.small-button { min-height:0 }` in the shell layer (`styles.css:1056-1060`) → 34px buttons on phones (`1232`); `.lobby:has(...)` shrinks segmented options to 28px (`1499-1502`) and selects to 30px (`1504-1508`).
- **Micro type**: 0.45rem/0.53rem metric labels, 0.56rem matrix counts, 0.58rem kicker, 0.6rem field labels.
- **Accessibility**: SFX button changes text "SFX"/"Mute" but has no `aria-pressed` (`index.html:123`, `app.js:1018-1021`); `score-strip aria-live=polite` re-renders whole card lists → noisy announcements (`index.html:131`); game-over overlay is a `div`, not a `<dialog>`, with no role or focus move (`index.html:239-249`); modal close buttons use the letter "x"; `.icon-button span` is a bordered "i".
- **Multiplayer UX**: copy-paste WebRTC offer/answer (`index.html:189-237`) with 5-row textareas and a status string; no room code, no roster, no reconnect — an outlier when `shared/peer-room.js` already exists and three sibling pages have room codes.
- **Hard-coded colours**: 33 hex + 52 rgba literals (cyan rgba repeated ~20 times, e.g. `styles.css:93-96, 177-181, 318-319, 1063-1070`); per-rank colours live in CSS attribute selectors and again in JS particle classes.
- **`!important`**: `[hidden]` (`44`), reduced-motion ×3 (`1559-1561`).
- **Magic numbers**: 64/170/214/150/112/146/128/164px grid rows; 116px/84px header columns; 122/78px score box; 34/22/18px matrix label columns; 46/52/38px cells; 260px score-card; 386px table min-height; 310px score list.
- **Copy**: "SFX" vs "Mute", "Matrix", "End" are terse; "Discards: Bottom of deck" options read as developer settings; the instruction modal says "press its number key" but the badge on the card is the only hint on desktop.

### Redesign recommendations
- **P1** Rebuild `styles.css` as a single layer: one `.shell`, one `.game-view` grid with `minmax()` rows rather than fixed px, and page scrolling allowed on the lobby and dialogs (`overflow:hidden` only on the game grid's internal panels).
- **P1** Retheme to the poker family: coral accent for primary/selected/score, hub surface/line/glass tokens, hub body aura, 16px radius; keep the lime/gold *only* as semantic rank colours (score-card borders, particles) if at all.
- **P1** Fix the mobile matrix (drop the 27px cell override; let the shared card aspect drive row height) and delete the dead history panel or surface it as a scrolling list in the score strip.
- **P1** Visible focus for the segmented radios and all buttons; `aria-pressed` on SFX; make game-over a `<dialog>`.
- **P2** Move multiplayer onto `shared/peer-room.js` with the same room-code lobby as the other pages (name + code + roster) so the four pages share one "room" UI.
- **P2** Use the shared `.deck-matrix` grid (`shared/cards.css:231-245`) and `PlayingCards.deckMatrix()` order instead of a bespoke `.matrix-row` grid with label columns.
- **P2** Replace the three gradient tiles with the hub tile style (featured + two) so the lobby reads as part of the site; move Options into a drawer that scrolls.
- **P3** Type scale with a 0.7rem floor; replace "x"/"i" glyphs with SVG icons; tokens for the rank colours.
- **Keep**: size-container card sizing in `.hand-slot` (`styles.css:591-615`), 1–7 badges and hotkeys (`app.js:983-993`), deal/discard/pulse micro-animations, `role=status` status line, seeded daily/random split, the `<details>` options drawer concept, `<dialog>` for instructions.

### Constraints to preserve
- Tests: `poker/rush/tests/poker-rush.test.cjs` requires `../game.js` only — pure logic, no DOM. Safe.
- `app.js` ids: `lobby, gameTitle, instructionsButton, dailyButton, randomButton, multiplayerButton, optionsForm, gameView, scoreValue, timeValue, seenValue, discardValue, deckValue, soundButton, matrixToggleButton, newDailyButton, newRandomButton, endGameButton, scoreStrip, scoreSummary, playersPanel, scoredHands, seedBadge, modeBadge, hand, statusLine, matrixPanel, uniqueSeenValue, cardMatrix, scoreList, pointsBreakdown, instructionsDialog, multiplayerDialog, playerNameInput, hostGameButton, inviteCode, answerCodeInput, acceptAnswerButton, joinGameButton, joinInviteCode, joinAnswerCode, connectionStatus, gameOver, gameOverTitle, gameOverSummary, againButton, backButton`; form field names `handSize, jokers, timeLimit, discardMode, endMode`; classes `hand-slot, is-new, is-discarding, is-empty, mini-cards, score-card, is-new, score-meta, score-empty, score-row, player-chip, is-local, matrix-row, jokers, matrix-label, matrix-cell, count, seen, discarded, scored, active, score-pulse, particle <rank>, matrix-visible, is-active, is-muted`; attributes `data-index, data-card-id, data-rank, data-signature, aria-pressed`; custom property `--hand-size` set from JS (`app.js:384`), `--x/--y` on particles; `button.playing-card` selector used in JS (`app.js:386, 996`).

---

## poker/ultimate-omaha/ — Ultimate Omaha

- **Purpose & audience**: Multiplayer (up to 10) two-board Omaha against fixed multiplier payouts; players check or double preflop and on the flop, must qualify with aces-up on both boards. Hub tags it "Prototype". Audience: the same home-game group; host creates a room, others join by code.

### Screens / states / flows
1. **Menu** (`index.html:23-56`): serif two-line title "Ultimate / Omaha", tagline, name input, room-code input, one "♠ Start Game" button with a (never visible, see below) loader, "Quick Rules" card.
2. **Lobby** (`index.html:59-96`): "Game Lobby", "You are: name", "Room Code: XXXXXX" + 📋 copy, players grid of `.lobby-player` (host glow, queued dashed), host-only bet amount with `$` prefix, Start Game (host) / Leave Lobby, "Waiting for host to start…".
3. **Game** (`index.html:99-222`): header shows only "Room: CODE"; `game-layout` → table column (two stacked `.board`s each with 5 `.card-slot`s + `.board-result`, then `.players-area` of `.player-box`es showing name/PnL/Bet/✓ or … and at showdown cards, hand names, equation, PnL) and side column (`.player-hand-area` with 4 hole slots, PnL, injected `.my-hand-results`; `.action-area` with "Your Bet", ? rules button, Check / Double, host "Next Bet $ + Next Hand", "Waiting for host…"; `.log-chat-container` with 📋 Game Log / 💬 Chat tabs, log entries with inline shared mini-cards, chat with emoji picker).
4. **Rules modal** (`div.modal.hidden`, `index.html:225-286`): sections, multiplier table. **Toasts** (`#toast-container` top-right, `.toast.success|error|info`, auto-fade `app.js:1157-1167`).
5. **States**: `.btn.loading` (spinner never renders: `.btn-loader` carries `hidden` whose `display:none !important` at `styles.css:1514-1516` beats `.btn.loading .btn-loader { display:inline-block }` at `281-283`; `setButtonLoading` only toggles `loading`, `app.js:549-557`); `.card-slot.dealt` with `dealCard` rotateY animation (`styles.css:657-674`); `.board-result.qualified|fouled`; `.player-box.acted|showdown|queued`; `.tab-btn.has-notification` pulse; reconnect toasts (`app.js:37-76`); `#host-controls` shown via inline `style.display` (`app.js:48, 484, 575`) while every other element uses `.hidden`.
6. **Multiplayer**: own `MultiplayerManager` (`multiplayer.js`, PeerJS ids prefixed `ultimateomaha-`, `multiplayer.js:104, 194`), with session resume, host migration, queued late joiners; shared with Edge the Dealer, **not** `shared/peer-room.js`.

### Current visual language
- "Casino Luxe" (`styles.css:1`): green felt palette `--bg-deep #0a0f0d`, `--bg-felt #0d1a15`, `--bg-card #141f1a`, `--felt-green #1a3329`, `--felt-accent #245c45`; **gold** `#d4af37/#f4d03f/#9a7b0a`; warm text `#e8e4dc / #9a958a / #5a5650`; flat-UI `--success #2ecc71`, `--warning #f39c12`, `--danger #e74c3c`.
- Fonts from Google: **Playfair Display** (display, buttons, tabs, labels), **Crimson Pro** 300–500 (body), **JetBrains Mono** (numbers, log) (`index.html:8-12`, `styles.css:30-33`). `font-family` is declared 38 times. `html { font-size:16px }` (`styles.css:61`).
- Spacing tokens `--spacing-xs…2xl` (`styles.css:36-41`) — the only page in the group with a spacing scale. Radius 8 / 12 / 16 / 20px(chat pill). Shadows `--shadow-card`, `--shadow-elevated`, `--glow-gold`. Boards and hand area: felt gradient with a 3px gold-dark border and inset shadow (`styles.css:604-613, 805-815`).
- Motion: `fadeIn` on every screen switch, `dealCard`, `spin`, `slideIn`, `notificationPulse`, `logFadeIn`, `chatBubble`, `emojiBounce`; **no reduced-motion rule**.
- Relation to hub: **completely different** — serif fonts, gold on green, warm greys; nothing from `hub.css`.

### Layout
- Mobile-first stacked flex with `order` (`styles.css:550-566`) and `.game-column { display:contents }`; ≥900px: `#game-screen.active` becomes `100dvh; overflow:hidden`, `.game-layout` a 2-column grid max 1120px, each column scrolls, the log flexes to the remaining height (`styles.css:1522-1609`); short-desktop tweak (`1612-1633`); ≤768 / ≤480 shrink `--board-card-width`/`--hole-card-width`/`--mini-card-width` (`1636-1711`).
- Fixed heights: `.tab-content 300px` (`1217`), `.chat-messages 150px` (`1309`), 240px on ≤480; `.boards-container max-width 400px`, action/log 500px, columns 460px.
- Card sizing honours the contract (`--board-card-width 60px`, `--hole 66px`, `--mini 28px`, `--log 22px` at `styles.css:45-48`, applied via `--card-width` at `616, 737, 828, 1280`); `.card-slot` wrapper reimplements a dashed placeholder (`641-650`) instead of the shared `.empty-slot`.
- Viewport meta has no `viewport-fit=cover`; no `theme-color`.

### Controls inventory
- `.btn` (+`.btn-primary` gold gradient, `.btn-secondary`, `.btn-accent` [unused], `.btn-action`, `.btn-raise` green gradient, `.btn-chat-send` pill, `:disabled`), `.btn-icon-only` (emoji/glyph, `title` only), text inputs, number inputs with custom `$` wrapper, `.tab-btn` underline tabs, `.emoji-picker-btn` **div** and `.emoji-option` **spans** (`index.html:198-216`), `.multiplier-table` (td only), `.lobby-player`, `.player-box`, `.board`, `.card-slot`, `.toast`, `.modal` (div).
- Consistency: cohesive gold/felt styling, but buttons are serif uppercase while the rest of the hub is sans; two different "pill" radii (8px vs 20px).

### Problems found
- **No focus styles at all** (0 `:focus-visible`) and `outline:none` on all inputs (`styles.css:182, 498, 520, 1392`); the rules modal is a `div` with no `role=dialog`, no focus trap, no Escape handler (no `keydown` in `app.js`); the emoji picker is not keyboard reachable; `#copy-code-btn`, `#rules-btn` have `title` but no `aria-label`; `#toast-container` has no `aria-live`.
- **Loader never shows** (see States) — the Start button just disables.
- **No reduced-motion handling** with 8 keyframes including a 3D `rotateY` deal on every card and a screen-wide `fadeIn`.
- **Contrast**: `--text-muted #5a5650` on `#141f1a` ≈ 2.7:1 for placeholders (`187-189`), waiting messages (`530-535`), modal close (`1029-1037`), timestamps (`1347-1351`), "push" log lines (`1303-1305`); Crimson Pro at weight 300 for body copy on dark.
- **Emoji as UI**: 📋 copy, 📋/💬 tab labels, 😀 picker, ⏳ queued status (`app.js:1026`), ✓/✗ results (`app.js:1097-1100`), "…" waiting — inconsistent rendering across platforms, read aloud literally.
- **Inline colour from JS**: `style="color: var(--gold-light)|var(--danger)"` (`app.js:856, 1002`) instead of win/lose classes.
- **`!important`** ×3 (`styles.css:1085, 1110, 1515`); hard-coded `#27ae60`, `white` (`962-969`), `rgba(10,15,13,.95)` backdrop.
- **Dead CSS**: `.btn-accent` (`231-238`), `.quick-chat*` (`1465-1489`), `.results-area #results-body` / `.result-item` (`1667-1674`), `.hand-pnl-inline` (`904-908`), `.my-hand-row .hand-pnl` (`867-872`), `.lobby-settings select` (`468-471`, only ETD has a select).
- **`html { font-size: 16px }`** overrides user zoom preferences (`styles.css:60-63`).
- **Hierarchy/table**: the "table" is two 400px felt rectangles; the other players are a flexible wrap of cards *below* the boards, so on desktop the left column reads boards → list, not a table. During a hand a player box shows PnL/Bet/✓ with no card backs or position. Game header has no title, no nav, **no way to leave a running game** (only the lobby has "Leave Lobby"; `index.html:99-104`).
- **Log/chat**: fixed 300px/150px heights on phones; chat input is a 20px-radius pill while every other input is 8px; `.chat-input-area` positions the emoji popover absolutely inside a scroll container.
- **Copy**: "Multipliers stack: Flush × Boat = 6x!" and "Remember: This is Omaha—you must use…" are fine but shouty (`index.html:52, 246`); menu placeholder "Room code" has no hint that blank = host (ETD adds that hint, `poker/edge-the-dealer/index.html:52`).
- **Magic numbers**: 400/460/500/600/1000/1120px max-widths; 300/240/150px heights; 36px icon buttons; 100px number inputs (`497, 516, 988`).

### Redesign recommendations
- **P1** Drop the casino-luxe theme for the site system: Inter, coral accent, hub surfaces/lines/glass and body aura; keep gold **only** as the semantic "multiplier/win" colour if desired (map to `--double #f4c95d`).
- **P1** Accessibility baseline: `:focus-visible` rings everywhere, `<dialog>` for rules (Esc, focus trap), real `<button>`s for emoji picker/options, `aria-label`s on icon buttons, `aria-live=polite` on the toast container, `prefers-reduced-motion` guard, fix `--text-muted` contrast (≥4.5:1 on `--bg-card`).
- **P1** Add a game header with title, room code pill, Leave/Quit and Rules (the same header ETD already has) and a hub crumb.
- **P2** Share the lobby (name, code, roster, host settings) and the seat/player-box component with Mixed Poker and ETD; show card backs for opponents during the hand and reveal at showdown.
- **P2** Make the two boards and the hero hand one shared "felt" component with board labels, result pills (`qualified/fouled`) rendered as chips, and multiplier shown as a badge; move the win/lose colours into classes.
- **P2** Fix the loader (remove `hidden` when loading, or render the spinner only via `.loading`), replace inline `style.display` toggles with the `hidden` class, delete dead CSS, remove `html { font-size:16px }`.
- **P3** Log/chat: flexible height, sans mono only for numbers; chat pill radius aligned to the control radius; quick-chat shortcuts either implemented or removed.
- **Keep**: spacing tokens idea, `--*-card-width` per-context tokens (`styles.css:43-48`), `fillSlot` rebuild-only-on-change logic (`app.js:930-944`), staggered deal animation, log entries with inline shared cards (`app.js:331`), toast variants, queued-player handling, session resume toasts.

### Constraints to preserve
- No `tests/` dir (only `docs/PRD.md`). **But**: `poker/edge-the-dealer/styles.css:1` `@import`s this stylesheet and `poker/edge-the-dealer/index.html:349-350` loads `../ultimate-omaha/poker.js` and `multiplayer.js` — any change to UO classes/ids/CSS cascades into ETD. Plan the two pages together (ideally a shared `poker/table.css`).
- `app.js` ids: `menu-screen, lobby-screen, game-screen, player-name, room-code-input, start-join-btn, your-name, room-code, copy-code-btn, player-count, lobby-players, host-controls, base-bet, start-game-btn, leave-lobby-btn, waiting-message, game-room-code, board-1, board-2, board-1-result, board-2-result, players-area, hole-cards, my-pnl, action-area, current-bet, rules-btn, action-buttons, check-btn, double-btn, host-showdown-controls, next-bet, next-hand-btn, waiting-next, game-log-tab, game-log, chat-tab, chat-messages, chat-input, send-chat-btn, emoji-picker-btn, emoji-picker, rules-modal, close-rules, toast-container`; `.card-slot[data-slot]` (+ `data-card` dataset written by JS), `.hole`, `.screen.active`, `.tab-btn[data-tab]`, `.tab-content.active`, `.emoji-option`, `.btn-loader/.btn-text/.btn-icon`, classes `loading, hidden, dealt, qualified, fouled, acted, showdown, queued, host, has-notification, emoji-blast, system, log-entry <type>, log-cards, player-cards, player-hands, hand-result, payout-equation, payout, win, lose, my-hand-results, my-hand-row, my-hand-equation, my-hand-total, toast success|error|info, player-name, host-badge, queued-badge, queued-status, status waiting, name, pnl, bet-amount`; `querySelector('.player-hand-area')` (`app.js:1109`).

---

## poker/edge-the-dealer/ — Edge the Dealer

- **Purpose & audience**: Multiplayer (up to 9) five-card draw against a shared seven-card open dealer hand with 1–4 draw rounds; the *lowest* hand that still beats the dealer wins. Hub tags it "Prototype". Built "iPhone-first" (`styles.css:5`) for the same home-game group; has a compact solo mode.

### Screens / states / flows
1. **Menu** (`index.html:35-74`): floating suit particles, pulsing "♠ ♥ ♦ ♣" logo line, gradient-text title "Edge the / Dealer", tagline, name, room code ("or leave blank to host"), "♠ Start Game" `.btn-glow`, Quick Rules.
2. **Lobby** (`index.html:77-123`): same as UO plus "Draws Per Hand" select (Single…Quadruple).
3. **Game** (`index.html:126-287`): sticky glass header (Room: CODE, 🔇 sound toggle, Quit); table column = collapsible **Dealer (7 Cards)** panel (`Best 5-Card Hand` 5 slots with per-suit glow, dashed `Unused` 2 slots greyed, `#dealer-hand-result` "Dealer: Pair of Kings" + mode note) and collapsible **Players** grid; side column = hand panel (5 hole slots, `hand-strength` cyan pill, `dealer-comparison` lime/rose pill "✓ Beats Dealer / ✗ Below Dealer / = Ties Dealer", `discard-help` line, PnL + win/lose streak chip, injected `.my-hand-results`), sticky **action area** (Your Bet, ? rules, "Draw Round n of N / Deck: x • Discards: y" banner, 2×2 grid Keep All / Replace All / Clear / Confirm, "Waiting for other players…", host Next Bet / Next Draws / Next Hand), log/chat (📋 Log / 💬 Chat).
4. **Overlays**: rules `div.modal`, `#winner-celebration` with 40 confetti divs (`app.js:985-1015`), toasts (UO's).
5. **States**: slot `selected-discard` (card gets shared `.dim`, slot sinks and shows a CSS-content **REPLACE** badge, `styles.css:597-627`), `confirmed-discard` ("QUEUED"), `locked`, `tap-ripple`, `unused-slot` greyscale, `data-suit` glow (`525-539`); `.player-box.confirmed`; `.winner-label` glow; `.pnl-value.animating` bounce; `#game-screen.compact-solo` hides room info and players when alone (`styles.css:252-258`, `app.js:957-969`); `.collapsible.collapsed`; swipe up/down on hole cards to select/deselect with haptics (`app.js:243-281`).
6. **Multiplayer**: UO's `MultiplayerManager` (loaded from `../ultimate-omaha/multiplayer.js`), same room-code lobby.

### Current visual language
- Inherits all of UO (fonts Playfair/Crimson/JetBrains, gold/success/danger tokens, spacing scale) via `@import` (`styles.css:1`), then overrides to a **glass "electric" theme**: cyan `#57d6ff`, violet `#a77dff`, lime `#64f7a8`, rose `#ff6b8a`, amber `#ffb347` (`styles.css:20-28`), panels `--panel-glass` gradient with `backdrop-filter: blur(12–16px)` (`styles.css:16-18, 145-154, 383-395`), body `#060c12` with three radial glows (`55-66`), an **always-running** `ambientShift` 9s filter/scale animation on the fixed background (`69-81`) and eight suit glyphs floating for 18s each (`84-119`).
- Gradient-text title cyan→violet (`178-187`), six different light-cyan text colours (`#8de8ff` 179, `#a6f0ff` 291, `#8feeff` 410, `#9de9ff` 556, `#8eeaff` 870, `#d2f7ff` 466/1028) and eight soft blue-greys (`#b7d4e5, #cae3f2, #d0e3f2, #dbf0ff, #d9f3ff, #b0c8da, #a0b8ca, #7a8d9d`).
- Buttons: lime (Keep), rose (Replace), grey (Clear), **teal `#2bd6b3` gradient** (Confirm, `938-954`) — four colours in one 2×2 grid; Quit is a red gradient uppercase 0.68rem pill (`314-329`); Start uses UO's gold gradient under a cyan glow.
- Motion: 14 keyframes (`screenIn`, `panelSlideIn`, `cardDealIn` with rotateY, `badgeIn`, `tapRipple`, `pnlBounce`, `playerBoxIn`, `winnerGlow` infinite, `btnRipple`, `resultsIn`, `confettiFall`, `suitPulse` infinite, `ambientShift` infinite, `floatParticle` infinite); **no reduced-motion rule**. Timing tokens `--ease-out-expo`, `--ease-spring`, `--duration-*` (`41-45`).
- Relation to hub: fonts and tokens are UO's, palette is a third thing (cyan/violet/lime). Shares nothing with `hub.css`; three accent systems are layered in one page (UO gold leaks through `var(--gold-light)` in inline PnL colours, `app.js:899, 1139`).

### Layout
- Phones: `#game-screen.active` max 640px (`styles.css:234-241`), sticky header at top (`262-277`) and sticky action area at bottom (`853-858`), collapsibles via `max-height: 600px` hack (`353-363`); dealer card width `clamp(34px, 10.5vw, 48px)` so 7 cards fit a 375px phone (`1307-1311`), hole cards `clamp(52px, 16vw, 80px)`; landscape phones un-stick the action area (`1451-1468`).
- Desktop ≥900: UO's two-column grid widened to 1180px, `1.1fr / 1fr`, header/action static, collapsibles `max-height:none` (`1144-1194`); short-desktop tweaks (`1197-1252`).
- `html` and `body` both get `min-height: -webkit-fill-available` (`50-53, 64-65`) on top of UO's `.screen min-height:100dvh`; `body overscroll-behavior-y:none`.
- Card sizing honours the contract (`--dealer-card-width`, `--hole-card-width`, `--mini-card-width` at `styles.css:11-13`, applied at `456, 565`); wrapper states live on `.card-slot` as the comment says (`482-484`); the shared `.dim` state is used for discards (`app.js:1068`).
- Viewport meta sets **`user-scalable=no`** (`index.html:6`).

### Controls inventory
- UO's `.btn` family + `.btn-glow`, `.btn-keep`, `.btn-replace`, `.btn-confirm`, `.btn-quit-game`; `.btn-icon-only` emoji buttons (🔇/🔊, ?, 📋); `.section-header` **div** toggles with ▾ glyph; `.card-slot` tappable/swipeable divs; `.hand-strength`/`.dealer-comparison`/`.player-streak` pills; `.discard-help` banner; `.draw-round-banner`; host `number` + `select`; tabs; chat pill input; `.hand-rankings` reversed counter list (`1121-1131`).
- Consistency: more polished than UO on phones, but introduces its own radii (10/12/14/16/18/20px) and a fourth button palette.

### Problems found
- **`user-scalable=no`** (`index.html:6`) blocks pinch zoom — WCAG 1.4.4 failure; also `apple-mobile-web-app-*` metas without a manifest.
- **Non-semantic controls**: collapsible headers are `div`s with click handlers, no `button`, `aria-expanded` or keyboard support (`index.html:143-146, 173-176`, `app.js:230-236`); hole-card slots are `div`s (card inside is a `span`, not a `button`) so discard selection is mouse/touch only; sound toggle has `title` only and emoji content; emoji picker div/spans as in UO.
- **Zero focus styles** and inherited `outline:none` on inputs; no reduced-motion guard despite three infinite animations and a continuously filtered/scaled fixed background with `backdrop-filter` on five panels — expensive on the phones it targets.
- **CSS-content labels** "REPLACE"/"QUEUED" (`styles.css:604-633`) are invisible to assistive tech; status also conveyed by colour (rose vs amber) only.
- **Colour sprawl**: 35 hex + 77 rgba literals; six cyans and eight soft greys (above); rose used both for "Replace All" (an ordinary action) and "Below Dealer" (bad outcome) so the primary draw action reads as destructive; teal Confirm is a colour that exists nowhere else.
- **Token leakage**: inline `var(--gold-light)`/`var(--danger)` from UO (`app.js:899, 1139`) on a cyan page; `--hole-card-width` is redefined with different semantics than UO's token.
- **Micro type**: Quit 0.62rem uppercase (`1291`), `.dealer-group-label` 0.68rem mono uppercase, `.draw-meta` 0.65rem, `.player-box` lines 0.68rem on phones (`1357-1362`).
- **Fixed heights**: log 220/200/170px, chat 140/105px (`994-1004, 1265-1267, 1403-1409`); collapsible `max-height: 600px` clips a tall players grid at 9 players.
- **Duplicated rules**: `.card-slot.dealt` twice (`501-511`); `.dealer-hand-result.result-mode` repeats the base colour (`1027-1029`); `.winner-celebration.active { display:block }` redundant with `hidden`.
- **Hierarchy**: the sticky header holds only "Room: CODE" + two buttons — no game title; during the draw the most important fact (the dealer's hand name) sits inside a collapsible that the user may have collapsed; the "Draw Round 1 of 1 / Deck • Discards" banner competes with `discard-help` and the two pills for the same vertical space.
- **Copy**: "Keep All" vs "Replace All" vs "Confirm" — Confirm with 0 selected equals Keep All; "Clear" has no object; help text alternates between "replace" and "discard" (`app.js:1083-1091`, `index.html:198`).

### Redesign recommendations
- **P1** Remove `user-scalable=no`; turn section headers into `<button aria-expanded>`; render hole cards with `PlayingCards.element(card, { tag: "button", interactive: true })` so keyboard/AT users can select discards; add visible text (`visually-hidden` or badge) for REPLACE/QUEUED; `prefers-reduced-motion` to stop the ambient/particle/glow loops.
- **P1** Retheme to the site system with one accent (coral) + semantic win/lose (hub `--stand`/`--hit`); collapse the six cyans and eight greys into `--ink/--muted/--soft`; make Confirm the primary (accent) button, Keep/Replace secondary, Clear quiet.
- **P1** Stop importing UO's stylesheet; both pages should import a shared `poker` table stylesheet (felt, seat, hand panel, action bar, lobby, log) and keep page-specific rules small.
- **P2** Replace glass+blur panels with hub `--surface`/`--glass` (blur only on the sticky header/action bar); drop the animated background; keep the per-suit glow as an optional accent on the dealer's best five.
- **P2** Promote the dealer hand name and "beats/below dealer" readout to a persistent strip above the hand panel; merge draw-round banner and discard-help into one status line.
- **P3** Flexible log/chat heights; shared toast with `aria-live`; align radii to the site scale.
- **Keep**: iPhone-first sticky header + sticky action bar, dealer best-five / unused grouping, `hand-strength` and `dealer-comparison` readouts (as a shared "hand-strength" component), swipe-to-discard with haptics, staggered deal via `--deal-delay`, compact solo mode, streak chip, reversed hand-rankings counter, `fillSlot` diffing.

### Constraints to preserve
- No `tests/` dir (only `docs/PRD.md`). Runtime coupling: `poker/edge-the-dealer/styles.css:1` imports `../ultimate-omaha/styles.css`; `index.html:349-350` loads `../ultimate-omaha/poker.js` and `../ultimate-omaha/multiplayer.js`.
- `app.js` ids: all of UO's plus `draw-count, sound-toggle-btn, quit-game-btn, dealer-area, dealer-toggle, dealer-used-cards, dealer-unused-cards, dealer-hand-result, players-section, players-toggle, player-hand-area, hand-strength, dealer-comparison, discard-help, player-streak, draw-round-banner, keep-all-btn, replace-all-btn, clear-discards-btn, confirm-discards-btn, waiting-draw, next-draw-count, winner-celebration`; classes `collapsible, collapsed, section-header, collapse-icon, collapsible-content, card-slot[data-slot][data-suit][data-card], dealt, unused-slot, selected-discard, confirmed-discard, locked, tap-ripple, dim (shared), compact-solo, active (sound/celebration), ripple, animating, win-streak, lose-streak, result-mode, mode-note, confirmed, acted, showdown, queued, winner-label, dealer-compare beats|misses, hand-result-line, discard-count, status confirmed|waiting, draw-meta, confetti-piece`; `--deal-delay` custom property set by JS (`app.js:1305`); `hole-cards` touch listeners rely on `.card-slot` and `dataset.slot` (`app.js:243-275`).

---

## Cross-page summary

### Palettes and font stacks in use
| Page | Page bg | Panel | Accent(s) | Fonts | Radius |
| --- | --- | --- | --- | --- | --- |
| hub baseline | `#08090d` + aura/dot grid | `#10141c` / glass | poker coral `#ff8b83`, `#ffb77a` | Inter (cv11, ss01) | 16px / pills |
| Mixed Poker | `#070a0e` flat | `#0c1219` | green `#35d5a0` (+ blue, purple, amber, red) | Inter | 6–8px |
| Poker Rush | `#08090d` + cyan gradient | `rgba(18,22,32,.86)` | cyan `#45d6ff`, lime `#bdf46b`, rose, gold, violet, orange | Inter | 8px |
| Ultimate Omaha | `#0a0f0d` green felt | `#141f1a` | gold `#d4af37`, success `#2ecc71`, danger `#e74c3c` | Playfair Display, Crimson Pro, JetBrains Mono (Google Fonts) | 8/12/16px |
| Edge the Dealer | `#060c12` + 3 radial glows, animated | glass `rgba(9,19,26,.82)` + blur | cyan `#57d6ff`, violet, lime `#64f7a8`, rose, amber, teal `#2bd6b3`, plus UO gold | UO's three Google fonts | 10–20px |

Four accent systems, three font stacks, five radius scales, and not one page uses the poker family coral. Only UO/ETD have spacing tokens; only ETD has timing tokens; only Rush has a `--radius`. Literal colours: Play 68 hex, Rush 33 hex + 52 rgba, UO 16 hex + 15 rgba, ETD 35 hex + 77 rgba.

### Duplicated components that should become one shared component
1. **Table felt / board area** — `.table-surface` (play 896-904), `.table-surface` (rush 556-567), `.board` + `.player-hand-area` felt gradient with gold border (UO 604-613, 805-815), `.dealer-area`/`.player-hand-area` glass (ETD 383-395). One `poker-felt` surface with board slots (`.empty-slot` from shared cards) and label.
2. **Seat / player box / avatar** — `.seat` + `.roster-seat` + `.avatar` (play 788-829, 916-971), `.player-chip` (rush 450-485), `.player-box` + `.lobby-player` (UO 423-447, 686-802; ETD 778-837). All show name, stack/PnL, bet, status, mini cards. One seat component with `active / folded / disconnected / confirmed / queued / host / me` states and a `--card-width` for the card row.
3. **Lobby / room** — play `.room-view` (754-851), UO/ETD `.lobby-content` (342-535), Rush's textarea dialog (804-869). One lobby: name + code inputs, create/join switch, code pill with copy, roster of seats, host settings, Start/Leave. Backend: `shared/peer-room.js` for all four (UO/ETD's `multiplayer.js` and Rush's manual WebRTC are the two outliers).
4. **Bet / action bar** — play `.decision-panel` + `.amount-control` + `.action-buttons` (1085-1156), UO `.action-area` Check/Double (911-969), ETD 2×2 grid + banner (853-986), Rush header-actions. One sticky action bar with primary/secondary/danger slots, optional amount control, optional status line, host controls variant.
5. **Hand-strength readout** — play `.evaluation-chip` (1071-1083) and `.result-row`, UO `.board-result` / `.my-hand-results` / `.payout-equation` (622-637, 847-901), ETD `.hand-strength` / `.dealer-comparison` / `.player-streak` (662-766), Rush `.status-line strong` and `.score-card[data-rank]`. One "hand chip" with `neutral / good / bad` tones and a numeric suffix.
6. **Stat tiles** — play `.table-meta` (864-894), Rush `.score-box` + `.round-metrics` (353-398), UO/ETD `current-bet-info`, PnL lines. One label-over-value tile with `tabular-nums`.
7. **Settings / options** — play `.core-settings`, `.number-setting`, `.toggle-setting` (458-751), Rush `fieldset/legend/.segmented` (260-331), UO/ETD `.lobby-settings` + `.bet-input-wrapper` (449-522). One settings row (label, hint, control) + one segmented control + one switch.
8. **Modal, toast, tabs, icon button** — four modals (two `<dialog>`, two `div`s), four toasts (one with `aria-live`), three tab styles, four icon-button styles with "?", "×", "x", "i", 📋, 🔇 glyphs. One `<dialog>`-based modal, one `aria-live` toast stack, one tab strip, one SVG icon button.
9. **Card slot / placeholder** — UO/ETD `.card-slot` dashed placeholder (UO 641-650, ETD 485-499) duplicates shared `.empty-slot`; Rush already uses `PlayingCards.emptySlot()`; play uses `emptySlotHtml()`.
10. **Topbar / brand** — play's custom `.topbar/.brand/.mark`, Rush's `.lobby-top/.logo-mark`, UO/ETD's `.game-header` → the hub `.topbar` + `.crumbs` + `.switcher`.

### Token drift from the site base
- Page colour: three of four differ from `#08090d`; none use the aura/dot-grid body.
- Ink/muted: `#f2f6fb/#95a4b7` (play), `#eef4ff/#8f9caf` (rush), `#e8e4dc/#9a958a/#5a5650` (UO), `#eff8ff/#9cb5c6/#6d8494` (ETD) vs hub `#eef4ff/#9aa7b7/#6f7b8b`.
- Lines: solid `#273647` (play), `#2a3140` (rush), `#245c45` (UO), `rgba(110,190,235,.18)` (ETD) vs hub `rgba(148,163,184,.13)`.
- Accent: green / cyan+lime / gold / cyan+violet+lime+teal vs coral `#ff8b83`.
- Radius: 6–8 / 8 / 8–16 / 10–20 vs 16.
- Fonts: Inter without feature settings ×2; serif stack ×2 (extra Google Fonts requests on UO/ETD).
- Motion: hub `--ease/--spring`; play none; rush ad-hoc cubic-beziers; UO `ease-out`; ETD its own `--ease-out-expo/--ease-spring`.
- Accessibility baseline: focus-visible rules 3 / 1 / 0 / 0; reduced-motion 1 / 1 / 0 / 0; `!important` 2 / 4 / 3 / 0.

### Three biggest wins for this group
1. **One `poker/table.css` (or `shared/table.css`) built on `hub.css` tokens** — felt surface, seat/avatar, hand-strength chip, action bar, stat tile, settings row, modal/toast/tabs/icon-button — and every page loads `hub.css` + `cards.css` + that file + a short page file. This retires four palettes, three font stacks, ~300 dead lines in Rush, UO's dead selectors, ETD's `@import` coupling, and gives all four pages the coral family accent and the hub topbar/crumbs.
2. **One lobby on `shared/peer-room.js`** for all four games (create/join, code pill, roster of the same seat component, host settings, resume). Rush's copy-paste WebRTC dialog and the UO/ETD `MultiplayerManager` become one flow; players learn it once.
3. **Accessibility and app-shell correctness pass**: visible `:focus-visible` everywhere, `<dialog>` for every modal, `<button>` for every tappable thing (collapsibles, emoji picker, hole cards), `aria-live` toasts, `aria-pressed` on toggles, no `user-scalable=no`, a `prefers-reduced-motion` guard that stops ETD's infinite loops and UO's rotateY deals, a 0.7rem type floor, and `minmax()`-based rows so the desktop shell never collapses the table (play) or clips the lobby (rush).
