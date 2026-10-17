# Site redesign notes — every page, audited

Written 2026-10-16 against commit `8c0efdb`. This is the page-by-page record behind the overhaul brief in [prompt.md](prompt.md). The six detailed audits with file-and-line citations are in [audits/](audits/); this file is the synthesis.

How the audit was done:

- Every published page was read at the code level: `index.html`, every stylesheet it loads, and the JS that builds its DOM. Engine and solver math was skipped.
- Every page was rendered from a fresh `_site` build and screenshotted at 1440×900 and at 375×812 (phone). Lobbies were clicked through to their in-game screens where that was possible locally.
- The load-bearing claims were then re-checked by independent verifiers reading the actual files, and a completeness pass looked for screens and flows the first pass missed. Anything refuted or corrected is marked in the text.

Files:

| File | What it is |
| --- | --- |
| `notes.md` | This document: site-wide findings, then one section per page |
| `prompt.md` | The overhaul brief: a self-contained prompt for the redesign session |
| `audits/hubs-shared-gym.md` | Landing page, family hubs, `shared/hub.css`, `shared/cards.*`, Gym |
| `audits/backgammon.md` | Backgammon hub, play, trainer, solver, library, controls, refresh, reports |
| `audits/poker-tables.md` | Mixed Poker, Poker Rush, Ultimate Omaha, Edge the Dealer |
| `audits/poker-tools.md` | 222, Dodge reports, Dodge simulator, Poker calculations |
| `audits/ofc.md` | OFC Play, Fantasyland trainer, Fantasyland EV, Fantasyland report |
| `audits/standalone.md` | Blackjack Strategy Lab, Fair Dice Payout Explorer, Card Table Workshop, Microtonal Lab |

---

## 1. The big picture

### 1.1 The site has one good design language and five pages that use it

The landing page and the four hub pages built on `shared/hub.css` are the strongest surface on the site: a near-black `#08090d` page, Inter, soft glass surfaces, a family accent that tints an aura and a dot grid, 16px tiles with hover light, a breadcrumb plus family switcher, and small illustrated previews. Everything else was built before or beside it and shares nothing with it except, sometimes, the page colour and the font name.

Counting dialects from the screenshots and stylesheets:

| Dialect | Pages | Look |
| --- | --- | --- |
| Hub system (`shared/hub.css`) | `/`, `/ofc/`, `/poker/`, `/blackjack/`, `/dice/` | Dark glass, Inter, accent aura, tiles |
| Backgammon slate | `/backgammon/` and its seven routes | Warm grey-teal `#11191d`, calm, flat, own topbar, beautiful board |
| Warm-grey + teal tools | `poker/222`, `poker/dodge`, `poker/dodge/simulator` | `#111417` panels, teal `#55d7b1`, 13px root, dense tables |
| Almost-hub tools | `poker/play`, `ofc/play`, `ofc/fantasyland-*`, `poker/calculations`, `blackjack/strategy`, `cards`, `microtonal-lab` | Each its own near-black, each its own "almost the hub green" accent, 6–10px radii, own header with an `MS` monogram |
| Casino luxe | `poker/ultimate-omaha`, `poker/edge-the-dealer` | Playfair Display and Crimson Pro from Google Fonts, gold on green felt, then a cyan-violet glass layer on top for Edge the Dealer |
| Neon arcade | `poker/rush`, `microtonal-lab` | Cyan and lime gradients, glows, 70px shadows |
| Editorial data | `dice/reports` | System font, light weights, mono numerals, gold accent (the one page whose accent matches its hub) |
| Product app | `gym` | Tailwind, sidebar, light and dark themes, the most finished app shell on the site |
| Plain documents | `backgammon/controls`, `backgammon/reports`, `backgammon/refresh` | Readable articles with no relation to the app they document |

Five different hex values stand in for "the OFC green" (`#8fd9b6` hub, `#35d6a0`, `#37d99e`, `#36d39b`, `#36d399`). The poker family accent `#ff8b83` is used by no poker page at all. The blackjack hub says the family is gold and paints Hit salmon and Stand mint; the Strategy Lab is teal and paints Hit green and Stand red.

### 1.2 Tokens exist in one file and are copied, renamed or ignored everywhere else

- `shared/hub.css` is the only design-token source, and it is dark-only. No tool page links it, so its tokens cannot drift: each page simply has its own `:root` with different names (`--bg/--panel/--text` versus `--page/--surface/--ink`).
- Family accents are declared in six places (hub `[data-family]`, switcher dots, home aura, inline tile styles on the landing page, favicons, Gym's calendar colour map).
- Inter is named in three stylesheets and loaded by none. The site renders in the OS UI font, and the weights 650, 750 and 850 that the hub and Gym ask for round to 600, 700 and 800.
- Radius: 16px on the hub, 10px on backgammon, 8px almost everywhere else, 5–7px on controls, 20px on chat pills. Hex literals outside tokens: 92 in `backgammon/styles.css`, 72 in `ofc/play/styles.css`, 68 in `poker/play/styles.css`, 65 in `cards/styles.css`.

### 1.3 The type floor is far too low on desktop

Every dense page has text between 7px and 10px on desktop: Dodge tags at 8px and heatmap cells at 7–8px, dice chart labels at 8–9px, the blackjack chart's dealer-bust line at 0.34rem (about 5px), Mixed Poker seat meta at 0.58rem, backgammon equity numbers at 9px, OFC trainer variant pills at 0.54rem on phones. Several pages compensate by raising sizes in their phone breakpoints, which proves the desktop sizes were never right. Muted greys at those sizes (`#74818b`, `#6f7b8b`, `#617184`) fall below AA contrast.

### 1.4 The accessibility baseline is inconsistent and mostly missing

- Focus: four of the poker and OFC pages set `outline: none` on focus and rely on a border tint; hidden radio inputs (segmented controls) have no focus surfacing on Play, Trainer, Rush and the blackjack rule switches. Ultimate Omaha and Edge the Dealer have zero `:focus-visible` rules. Backgammon suppresses all focus outlines with `!important` unless a keyboard flag is set, and that rule leaks onto its document pages.
- Semantics: modals are `div`s on UO and ETD (no role, no Escape, no focus trap); the OFC trainer's report is a fixed `<section>`; collapsible headers, emoji pickers and card-table cards are `div`s and `span`s with click handlers; tab bars use three different ARIA treatments and none is a real tablist except the OFC EV/Report pages and Microtonal's nav.
- Reduced motion: UO, ETD and the OFC trainer have no guard at all; ETD runs three infinite animations and a continuously filtered background on the phones it targets; the shared card pop animation is only guarded by whichever page remembers to do so.
- Zoom: Edge the Dealer sets `user-scalable=no`. Backgammon disables text selection on every page including its reference tables.
- Touch targets: 17px pin buttons (Dodge), 24px reorder buttons (Mixed Poker), 28–34px segmented options (Rush, Mixed Poker), 36px toggles (Gym).

### 1.5 The stylesheets are append-only

The three biggest files were grown by appending overrides rather than editing: `backgammon/styles.css` (3,989 lines, 69 media queries, the same selectors declared two to four times), `ofc/fantasyland-trainer/styles.css` (3,399 lines, a dead "solver dashboard" base plus three later layers), `poker/rush/styles.css` (an app-shell layer that re-declares seventeen blocks and hides a panel the JS still renders). Dead CSS, dead markup and dead JS branches (an unreachable Monte-Carlo UI in the OFC EV page, ~20 cached element ids that no longer exist in the trainer) are common. A redesign that keeps these files and restyles them will inherit the mess; the brief therefore asks for rewrites on hub tokens, not restyles.

### 1.6 What is genuinely good and must survive

- The hub pages' language: tiles, breadcrumb, switcher, eyebrow labels, accent aura, view-transition morphs between hubs.
- The backgammon board, its 24 validated palettes with runtime `--board-*` properties, its offline/update shell, phone bottom sheets, decision-history grouping.
- The shared playing card (`shared/cards.js`): container-query sizing, one face everywhere, a pinned markup contract.
- Dodge's app-shell layout and phone mode (bottom-sheet inspector, sticky aggregate rows, filter builder); the simulator's option rows with centred equity bars.
- Dice's accessibility scaffolding (skip link, `aria-sort`, live regions, region scrollers), its dice canvas and the `data-effect` glow system.
- Blackjack's container-query chart sizing and the stepper-plus-range-plus-number control.
- OFC Play's drag ghost (`card-drag.js`, small and tested) and the triple input model (click row then card, drag, keyboard).
- The OFC EV tablist implementation and variant pills with real focus rings.
- Gym's focus ring system, mobile dialog accessibility, skip link, route focus management and chart screen-reader tables.
- Card Table Workshop's single reusable `<dialog>` and `openDialog` API, the `pointer: coarse` halo trick, the preset grid.
- Microtonal's `data-view`/`data-pane` state model, hash-routed views persisted to localStorage, arrow keys on its nav, and descriptive labels on every key.
- Credited only by the completeness pass: the Backgammon SVG board already has a complete keyboard and ARIA model (one tab stop with roving tabindex, geometric arrow-key navigation, Enter/Space/Shift activation, Escape to cancel a drag, state-bearing labels on dice, points, bar, off and cube; a `role="tree"` history; labelled From/To selects for touch). Dodge reports' `aria-sort`, pin buttons with `aria-pressed`, focus returned to the originating row or toggle after a sheet closes, and live regions on status text. The Dodge simulator's Space/`d` to draw and a disclosure for the bot's last decision. 222's host migration and per-room host persistence. Mixed Poker's invite link that pre-selects Join with the code filled, remembered player name, host recovery toast, and an engine that never sends opponents' hole cards to clients. Card Table Workshop's invite link with QR code and `?room=` deep link, first-visit gallery, shortcut cheat-sheet and command palette, keyboard-driven tour, and human-readable reject reasons. Dice's actionable worker-failure copy and `setBusy()` during rolls. The OFC trainer's timer that pauses on blur and saves on `pagehide`.

---

## 2. What the redesign should build (summary)

The full brief is in [prompt.md](prompt.md). In one paragraph: promote `shared/hub.css` into a real system split into tokens, chrome, components and hub-only illustration; give every page the same topbar (breadcrumb, family switcher, tool tabs, actions), the same control kit (button, segmented, switch, field, tabs, chip, stat tile, data table, bar, dialog as bottom sheet on phones, toast), one mobile model (view switcher under the topbar, one scroll region per view, one bottom action stage) and a 12px type floor with AA contrast; then rewrite each family's stylesheet on those tokens with its accent, keeping the special surfaces (felt, OFC board, backgammon board, strategy chart, dice canvas, keyboard) as components that consume the tokens.

Rollout order, by leverage: shared system and hubs → poker tables (four pages become one `poker/table.css`) → poker tools → OFC → backgammon → standalone pages → Gym → document pages.

---

## 3. Page-by-page notes

Each section: what the page is, what works, what is wrong, where the redesign should take it, and what must not break. "Constraints" lists the tests that pin DOM; the full id and class lists are in the audits.

### 3.1 `/` — landing page

- **What it is**: directory of eight tiles in three groups (Game hubs, Apps & experiments, Source only) with a hero, three fact chips and an animated card fan.
- **Works**: the hero and tile grid are the best-looking thing on the site; the per-tile illustrations and accent-per-project idea are right.
- **Wrong**: the Dice tile is orphaned alone on a second row of a five-tile grid; "Source only" is a bare row that looks like an afterthought; tile copy is clamped to two lines (one on short desktops) so the Card Table Workshop description is always truncated; counts ("8 projects, 23 live pages, 5 game hubs", "6 tools") are hand-written and already wrong; two tiles use a text arrow while the rest use an SVG arrow; the Backgammon tile art is an `<img>` with an inline style; stagger indices repeat so groups animate in sync; no skip link; entry animations use `animation-fill-mode: backwards`, so if anything stalls the page is blank.
- **Redesign**: a four-plus-one layout that gives Dice a home (or fold Dice into a "Probability" group with calculations); generate tiles and counts from one data list; one arrow glyph and one art container; room for three lines of copy or copy under 110 characters; a proper footer; reveal animations gated so content is visible by default.
- **Constraints**: `data-family="home"`; no DOM tests.

### 3.2 `/poker/`, `/ofc/`, `/blackjack/`, `/dice/` — family hubs

- **What they are**: the same template: eyebrow, H1, lede, facts, card fan, a featured tile with a live-ish illustration (poker felt, OFC board, blackjack chart), secondary tiles, footer.
- **Works**: the featured tile previews tell the visitor what they will get; the breadcrumb and switcher are the right chrome for the whole site.
- **Wrong**: the switcher omits Dice on three hubs and reorders the five links on the Dice hub; footers come in three variants; cache-bust strings differ per page; the Poker hub says "7 tools" and lists eight; the Blackjack hub's three "Reference" tiles are external GitHub links styled like app tiles; the Dice hub is a one-tile page with an empty hero column, no illustration and an accent nearly identical to Blackjack's gold; the illustration CSS (about 45% of `hub.css`) lives in the shared file though each block serves one page.
- **Redesign**: one switcher with the same five links in the same order everywhere; one footer; move illustrations to per-hub files or replace with real screenshots; show external links as a plain link list; either make `/dice/` redirect to the report or give it real sub-reports as tiles; pick a distinct Dice accent.
- **Constraints**: `data-family`; `backgammon/tests/updates.cjs` asserts `.switcher a` does not overflow at widths ≤700px; `backgammon/tests/deployment.test.mjs` hashes `hub.css`/`hub.js` into the offline cache version, so regenerate `backgammon/offline-manifest.js` after editing them.

### 3.3 `/backgammon/` — hub

- **What it is**: hero with a live `Board` render of the starting position, a Play button, "Resume your game" and recent links, three underlined tool links, a utility footer.
- **Works**: the board illustration is the strongest single image on the site; resume/recent links are a good touch.
- **Wrong**: it loads both `hub.css` and `backgammon/styles.css`, and the second `:root` wins (radius becomes 10px, page colour `#11191d` over the html `#08090d`); the aura and dot grid are disabled; the tool links are bordered text rows rather than tiles; the utility footer (Clicks & highlights · Refresh app · Engine report plus a status sentence) has no hierarchy; the decorative board carries an `aria-label` on a role-less `div`.
- **Redesign**: consume only hub tokens and tiles, with a tiny hub-only sheet for the board slot; keep the live board and resume links; move Refresh/Report into an "About" row.
- **Constraints**: link "Refresh app", "Clicks & highlights", "Resume your game", `#app-update-status[data-state]`, `#hub-board`, `#recent`; `browser.cjs` screenshots nine viewports and asserts no horizontal overflow; `index.html` is in the offline shell manifest.

### 3.4 `/backgammon/play/`, `/trainer/`, `/solver/`, `/library/` — the app shell

- **What it is**: one shell (`ui/shell.mjs`) with topbar (brand, Play/Trainer/Solver/Library nav, All projects, sound, Settings), a tool head, a stage (opponent strip, board, player strip, action area) and a right inspector that becomes a bottom sheet on phones. Play has setup, opening roll, live table, and a review section with a decision-history tree; Trainer drills hidden-answer decisions; Solver is a position editor plus GNUbg analysis and match review; Library is an IndexedDB collection with inspector.
- **Works**: calm, coherent, phone-first; board interaction and motion are behaviour, not skin; 44px targets; keyboard viewport fitting on sheets; decision-history grouping and filters.
- **Wrong**: a 3,989-line append-only stylesheet with six layout regimes for Play, 69 media queries, 19 font sizes, 17 radii, three font stacks (Inter, `system-ui` in placeholders and the update dialog, `ui-sans-serif` on keycaps) and ten dialog skins; `body, body * { user-select: none }` and a `:focus { outline: none !important }` rule; a light toast on a dark UI that also carries errors; the confirm control moves between a 144px right rail and a full-width bottom bar depending on width; the Play right rail opens with a 90-word engine-strength paragraph above the only CTA (visible in the phone screenshot); Trainer shows session progress only in a truncating subtitle; Solver hides dice/cube/score context behind a dialog; Library rows put `aria-selected` on `role="button"` and use Unicode glyphs as icons.
- **Redesign**: rebuild as layered sheets (tokens, base, shell, board, play, review, dialogs, phone) on site tokens with the family accent, one breakpoint set and container queries on the stage; one dialog component with sheet variant; one help/practice row and one decision-value component shared by Play, Trainer, Solver, Library and the review dialog; dark toast with `role="alert"` for errors; `:focus-visible` instead of the data-attribute hack; scope `user-select` to the board.
- **Also found by the completeness pass** (all verified against the code): errors thrown inside modal forms (Library import, XGID import, Save to Library) are toasted beneath the dialog's top layer, so the button appears to do nothing; the toast sits on the phone action dock with no safe-area inset, no dismiss and a fixed 5s timer, covering the primary action; the online lobby shows guests a disabled "Start match" with no "waiting for the host" copy, and the Leave and New match dialogs reference actions that are unavailable in online mode; game over is one status sentence with no result card (no single/gammon/backgammon level, no score change, no cube), and the resignation picker labels options as "1 points"; every destructive confirm is a generic accent "Continue"; the update gate's failure state is a non-dismissable dead end with only "Retry update" and no link to the refresh page; the trainer's "Session complete" shows a count although per-decision error is recorded.
- **Constraints**: the largest Playwright suite on the site (120+ files) is selector-driven; `audits/backgammon.md` lists every id, class, aria name and layout assertion. Keep `--board-*` runtime properties and the offline manifest flow. Note that `backgammon/tests/mobile-settings.cjs` asserts 16px inputs on phones and `history-return.cjs` asserts history-row border colours equal checker-dot colours, so player identity needs tokens.

### 3.5 `/backgammon/controls/`, `/reports/`, `/refresh/` — documents

- **What they are**: a click/highlight explainer with three text flowcharts and a 31-row table; a benchmark report rendered from JSON with selects and tables; a standalone service-worker recovery page.
- **Wrong**: text cannot be selected on the two reference pages; heading levels are inconsistent; the topbar is a third header variant with no `aria-current`; the report's tab list covers three of six sections and its "Speed" tab points at the wrong section; tables are `nowrap` in a scroller with no affordance; the refresh page re-declares the family colours inline with drifted font, radius and focus colour.
- **Redesign**: one `docs.css` for the family on shared document typography and the shared header; re-enable selection; real heading outline; a sticky section TOC on the report; keep refresh standalone but generate its inline CSS from the token source.
- **Constraints**: `click-guide.cjs` counts `.click-flow > li` and `#cases tbody tr`; `refresh.cjs` pins `#refresh`, `#status` text and `#continue`; `redirects.json` maps `/refresh/`.

### 3.6 `/poker/play/` — Mixed Poker

- **What it is**: peer-to-peer mixed-game cash table. Setup has three numbered panels (Table, Rotation, Table options), then a lobby with room code and six seat rows, then a game view (stat strip, opponents' seats, boards, hero hand, decision panel, results).
- **Works**: the three-step setup with phone tabs; `<dialog>` modals with `role="alert"`/`aria-live` wiring; sticky decision panel on phones; the rotation builder; it is the only one of the four poker tables on `shared/peer-room.js` (repo-wide the room module also backs 222, the Dodge simulator, OFC Play, Card Table Workshop and Backgammon).
- **Wrong**: green accent, custom brand mark and nav links to OFC and Dodge instead of a breadcrumb to `/poker/`; `outline: none` on buttons and inputs with a border tint for focus; the straddle switch has no focus indication; 24px reorder buttons and 32px segmented buttons; 0.58–0.66rem labels; the opponents are a flat strip of cards above the board, not a table, with the active player marked only by a border; the game-view grid gives the table `min-height: 0` with no floor, so on short desktops it can shrink toward zero when the hero and decision (or results) panels are tall; a connection dot with no label on phones; five chip styles and three hover greens.
- **Also found by the completeness pass**: selecting a hero card rewrites the hero row's `innerHTML`, so keyboard focus drops to `<body>` on every toggle, and with an action clock set the whole view re-renders every 500ms; a player who joins by code mid-hand (possible after anyone leaves) gets a blank game view and an error written into the hidden room view; there is no busted or table-over state, no add-chips control although the engine exposes `adjustStack`, no visible per-seat clock, and Leave is one tap that deletes the saved session and closes the room for guests.
- **Redesign**: hub tokens and chrome with coral; make the felt the hero with seats around it, a visible dealer button and bet chips, and pot/street in the felt centre; one chip; 44px controls and visible focus everywhere; `minmax()` rows so the shell never collapses; shared lobby and seat components (same ones the other three tables will use).
- **Constraints**: tests are engine-only; the id list app.js binds is in `audits/poker-tables.md`.

### 3.7 `/poker/rush/` — Poker Rush

- **What it is**: single-player seeded sprint (daily or random seed) plus a copy-paste WebRTC two-player mode; lobby with three gradient tiles and an options drawer; game view with a stat strip, a felt with up to seven numbered cards, a card matrix and a scored-hands strip.
- **Works**: container-based card sizing in the hand; number badges and hotkeys; deal/discard micro-animations; `<dialog>` for instructions.
- **Wrong**: the stylesheet is two contradictory layers and about 300 lines are dead; `html, body { overflow: hidden }` clips the lobby and options drawer on short phones, hence a stack of `:has(details[open])` compaction hacks; the history panel is hidden at every width while the JS renders it; on phones the matrix cells are forced to 27px high while the shared cards inside keep their 5:7 ratio, so they overlap; segmented radios are invisible to keyboard focus; 0.45rem metric labels; SFX toggle has no `aria-pressed`; game-over is a `div` overlay; multiplayer is hand-rolled WebRTC with textareas instead of the shared room flow; no site header.
- **Also found by the completeness pass**: "Play Again" after a two-player game silently drops the peer and starts a solo random game; game over never names a winner in two-player mode; the in-game Daily/Random/End buttons restart or end a timed run with no confirm; nothing is persisted, so a daily run leaves no best score or "played today" marker.
- **Redesign**: one-layer stylesheet with `minmax()` rows and a scrolling lobby; coral family theme with lime/gold kept only as rank colours; fix or delete the history panel; shared `.deck-matrix`; move multiplayer onto `shared/peer-room.js` and the shared lobby; `<dialog>` game-over that names the winner; confirms on restart; hub chrome.
- **Constraints**: tests are logic-only; ids and form field names are listed in the audit.

### 3.8 `/poker/ultimate-omaha/` and `/poker/edge-the-dealer/` — the casino pair

- **What they are**: two multiplayer prototypes sharing UO's `MultiplayerManager`, `poker.js` and, via `@import`, UO's stylesheet. UO: two stacked boards, players area, side column with hand, action area and log/chat tabs. ETD: dealer best-five and unused cards, players grid, hole-card slots with swipe-to-discard, 2×2 action grid, confetti.
- **Works**: UO's spacing tokens and per-context card-width tokens; ETD's sticky header plus sticky action bar on phones, the dealer best-five/unused grouping, the hand-strength and dealer-comparison readouts, swipe with haptics, compact solo mode.
- **Wrong**: serif Google Fonts, gold on felt, then ETD's cyan/violet/lime glass layer on top with six cyans and eight greys; no `:focus-visible` anywhere; `outline: none` on inputs; modals are `div`s; collapsible headers and emoji pickers are `div`s and `span`s; hole cards are not buttons; `user-scalable=no`; no reduced-motion with three infinite loops and a filtered animated background; the UO Start loader can never render (its span carries the `hidden` class, which wins over the loading rule); UO has no way to leave a running game; `--text-muted #5a5650` is about 2.7:1; emoji as icons; CSS-content "REPLACE/QUEUED" labels invisible to assistive tech; ETD's Replace All is rose (reads as destructive) and Confirm is a teal that exists nowhere else.
- **Also found by the completeness pass**: both pages inject peer-supplied player names into chat and log HTML unescaped, so any peer can put markup into every client's DOM (the lobby escapes names; the chat and log do not); UO gives a queued late joiner only a 3s toast and then an empty hand panel with disabled buttons, and never shows the street or phase (`formatPhase` is dead code); ETD's sound toggle is a dead control, there is no audio in the page; room-code copy uses the clipboard API with no fallback or failure toast.
- **Redesign**: rebuild both on a shared `poker/table.css` (felt, seat, hand chip, action bar, lobby, log) with coral and semantic win/lose; Inter; real `<dialog>`s and buttons; cards via `PlayingCards.element(..., { tag: "button" })`; a game header with title, room pill, Leave and Rules; keep gold only as the "multiplier" semantic colour.
- **Constraints**: no tests; the two pages must be changed together because of the import and script coupling.

### 3.9 `/poker/222/` — 222 simulator, spot solver, cube trainer

- **What it is**: five hash-routed tabs (Simulator, Spot solver, Cube trainer, Play online, Reports) in a utility layout: toolbar, street steps, board strip, cube panel, seat cards with three hand rows, deck picker.
- **Works**: the information model (board → cube → seats → deck); the three-hand-group layout with coloured top borders; container-query seats; sticky phone action row.
- **Wrong**: it is the one page that renders its own playing cards (own markup, own suit colours, "10" instead of "T", clickable spans); warm-grey/teal palette on a 13px root with 8–11px labels; not an app shell (the whole page scrolls); cube option tables with no overflow wrapper; tabs are buttons with `aria-current` and a hidden scrollbar, so the fifth tab is off-screen on small phones; five near-identical table styles and a dead chart stylesheet.
- **Also found by the completeness pass**: in a room, every error (host starting with one player, acting out of turn, peer errors, auto-deal failures) is written into the hidden lobby's error element, so nothing ever surfaces; prompts, progress and status are plain `div`s with no live region, and action rows are rebuilt on every render so focus is lost mid-decision; selecting a seat card gives feedback only in the deck panel at the bottom of the page, where all 52 deck buttons sit disabled at 40% opacity until a card is chosen and held cards are labelled with codes (`S1/B/b`); on phones the spot solver's result renders entirely below the fold and Solve produces no visible response; guests in a fresh room see an empty main area with no "waiting for the host" prompt, and during play are told to wait for the host even when auto-deal timers are running; at hand end the online result table is injected into the sticky action bar, and the trainer has no result screen at all.
- **Redesign**: move to `shared/cards.js` and `.deck-matrix`; hub tokens with coral for actions and green/red reserved for good/bad EV; adopt the Dodge simulator's split-scrolling shell and its option-row pattern for cube tables; proper tablist; one data table, one stat tile, one progress component with a live region; a deck sheet that opens on selection; a shared result card for showdown; room-level error and status slots; guest lobby and auto-deal copy.
- **Constraints**: engine tests only; segmented buttons are read by their digit text; ids listed in `audits/poker-tools.md`.

### 3.10 `/poker/dodge/` — Dodge hand reports

- **What it is**: the densest page on the site: topbar with wordmark, three pill tabs (Hand explorer, Population reports, Game design lab), filter strip with a metric-rule builder, four stat tiles, a sticky-header sticky-column table of 16,432 hands with sparklines, a hand inspector that becomes a bottom sheet on phones, chart panels, a draw lab.
- **Works**: a true app shell with internal scroll regions; the phone mode is the best in the group; column presets and a columns dialog; `/` focuses search; charts re-render on resize; toast.
- **Wrong**: desktop type of 8–10px throughout, dropping to 7px in heatmap cells below 1150px (the phone breakpoint bumps everything to 11–15px); sticky offsets hard-coded to row heights; 17px pin buttons; 20+ duplicated desktop/mobile label pairs in the DOM with `!important`; canvas scatter with no accessible alternative; a bespoke "d•DODGE" wordmark unrelated to the hub.
- **Redesign**: keep the layout and phone model; re-token to hub with coral and semantic green/red; 14px base and 12px floor; CSS variables for sticky offsets; one chart stylesheet shared with the simulator and 222 reports; hub chrome instead of the wordmark.
- **Constraints**: data-only test; a long id and data-attribute list in the audit; `matchMedia` breakpoints in `app.js` must match CSS if moved.

### 3.11 `/poker/dodge/simulator/` — Dodge table simulator and cube trainer

- **What it is**: four pill tabs in the topbar (Table simulator, Cube trainer, Play online, Reports); split layout with a stat strip, seat cards with sparklines, a cube panel with option rows, a deck matrix; a trainer, an online lobby and precomputed reports.
- **Works**: split scrolling layout; `.opt` option rows with centred equity bars; `--scale/--heat/--shade` colour piping; badges; arrow-key history stepping; deep links.
- **Wrong**: same palette drift; `aria-current=""` on the active tab; no reduced-motion rule; dead heading CSS; mini tables and a 14-column heatmap with 7px text and no scroll wrapper; the phone topbar becomes three rows and the link back to the reports page disappears; five equal-width 12px toolbar buttons on phones; developer telemetry ("Compute ms", "Games simulated") presented as KPIs; the "Solve a spot" disclosure never sets `aria-expanded`; prompts and status have no live region (the audit's mention of a `.review-banner` was wrong: that rule is dead, review mode is signalled through the prompt).
- **Redesign**: keep the structure; promote option rows, stat strip, bars and badges to shared components; fix tab semantics; group the phone toolbar into stepping and actions with one primary; scroll wrappers; keep a back link on phones.
- **Constraints**: engine test only; ids listed in the audit; `localStorage` key `dodge.player.name`.

### 3.12 `/poker/calculations/` — hand probability calculations

- **What it is**: a read-only dashboard: rank list, trend line chart, per-deal distribution bars, stacked map, full probability table, phone "glance" cards, solver metrics.
- **Works**: named-area grid with internal panel scrolling; rank colour piping; sticky two-column table; the phone tab model (Explore, Map, Table, Glance, Solver) in the screenshot stacks well.
- **Wrong**: green accent on a poker page; `outline: none` on focus for rank, card and source buttons and no focus style on stack segments; 0.5–0.66rem labels at weights 760–900; the H1 is ellipsis-clipped and hidden on phones; stack-segment abbreviations in 2px-wide segments; hard-coded table colours; the "Rust solver" link styled as a primary button; brand links to `/` not `/poker/`.
- **Redesign**: coral accent, hub surfaces and radius, 12px floor, real focus rings, hide segment text below a width threshold via container query, shared tab bar, breadcrumb.
- **Constraints**: no tests; ids and `data-view` hooks listed in the audit.

### 3.13 `/ofc/play/` — OFC Play

- **What it is**: a Pineapple table: lobby (01 Table, 02 Game setup), waiting room, then a table view with score strip, dealer selection, opponents' mini boards, the player's three-row board and a draw tray with Reset/Confirm, plus rules, ledger and discards modals.
- **Works**: the internal-scroll shell; the height-derived board card size; the click-row-then-card plus drag plus keyboard input model; `data-phase` driven layout; `card-drag.js` is small and tested.
- **Wrong**: its own palette and a green that is not the hub green; the lobby's setup panel is visually bigger than the primary create action; disabled buttons at 2.8:1; `outline: none` focus; hidden radios with no focus surfacing; board rows are clickable `div`s with an `aria-label` that is never announced; 0.59–0.63rem row scores and 9–10px mini scores; a bespoke blue secondary button; dead and contradictory late rules; a nested score-strip scroller on phones.
- **Also found by the completeness pass**: if the active player closes their tab mid-hand the table shows "X is setting" forever and there is no forfeit, skip or auto-set path, so the hand cannot finish short of Leave; after host loss the table view stays up with every action throwing silently and no reconnect control, and joining waits up to 20s behind a disabled button with no cancel; a 14–17 card Fantasyland tray on phones drops to about 28px cards with no hotkeys past 9; the rules modal's variant tabs silently rewrite the lobby's game setup; guests get no "waiting for the host" copy in the lobby or at showdown.
- **Redesign**: hub tokens and chrome; one control kit for the family; board rows as a real `radiogroup`; the create panel first; one shared OFC board component used by Play, the trainer, the trainer solution and the hub preview; ledger charts as HTML bars; designed states for player gone, reconnecting and waiting on host; a two-row or scrolling Fantasyland tray.
- **Constraints**: `ofc/play/tests/browser.cjs` drives the real DOM (ids, `data-row`, `aria-label="Top, selected"`, drag ghost timing, no overflow at six phone widths); full list in `audits/ofc.md`.

### 3.14 `/ofc/fantasyland-trainer/` — Fantasyland trainer

- **What it is**: daily and random Fantasyland puzzles (14–17 cards, 0–2 jokers, five variants) scored against the solver, with a share report; heading band, control bands, three-row board in a felt panel, card tray, result tiles, solution drawer, rules dialog.
- **Works**: the puzzle loop (confirm, result, report, next); hotkeys; drag with scaled ghost; the `hand-cols-N` tray sizing for two-row phone trays; live row summaries; the phone layout in the screenshot is clean.
- **Wrong**: a 3,399-line stylesheet whose real design is the last third ("trainer-first overrides"), with a dead dashboard base, a dead `.ev-page` block and ~20 stale element ids in `app.js`; the same config shown three times above the fold; Daily and Random in blue and violet, Confirm in a second green; the report is a fixed `<section>`; 0.52–0.58rem text on phones; hidden radios with no focus; `z-index: 2147483647`; UA sniffing for the notch; home link to `/` and no links to sibling tools.
- **Also found by the completeness pass**: hotkeys fire behind the open rules dialog (Space confirms or advances, C clears the board) because the handler never checks for an open dialog, which Play already does; Confirm silently fills the rest of the board in tray order with no preview or undo (the disabled guard does evaluate the fill, so a fouling fill disables Confirm, but the fill itself is never explained); any Mode/Set/Variant change wipes all results and the timer with no confirmation, and the only way to get a fresh random set is to click the already-selected Random pill; there is no end-of-set state, and the report overlay auto-opens on every confirm so the loop is confirm → close report → open solution → next, twelve times per daily set.
- **Redesign**: rewrite from the trainer-first layout only on hub tokens, target under 900 lines; one toolbar with a Setup popover; shared board, tray, segmented, buttons, dialog and rules article; a real, opt-in `<dialog>` report; a "Set complete" screen; confirms on destructive setup changes and an explicit "New random set"; auto-fill as a visible staged step or removed; hotkeys suppressed under dialogs; side/bottom sheet for the solution drawer; 11–12px floor by showing less rather than shrinking.
- **Constraints**: engine tests load `app.js` in a VM; the EV page loads this file as a library, so the `#trainer-rows` guard must stay; hard-bound ids listed in the audit. The trainer's and the EV page's brand links both point to `/`; Play and the report point to `/ofc/`.

### 3.15 `/ofc/fantasyland-ev/` — Fantasyland EV

- **What it is**: precomputed royalty EV, repeat, foul, matrix and rules tabs over five variants; bar charts, histograms, stacked repeat-source rows, a big matrix table.
- **Works**: a proper keyboard tablist with hash and localStorage persistence; variant pills with a focus ring; the switch control; aria-labels on tracks; the repeat-source stacked bars.
- **Wrong**: it loads the whole 4,300-line trainer script for a few helpers and carries an unreachable run/worker UI; three different "one joker" hues across tabs and no legend; 0.5rem histogram labels and white-on-blue in-bar labels at 2.5:1; nested scrollers inside a scrolling page on phones; a 640px-wide matrix in a 360px viewport; the lede disappears below 1360px.
- **Redesign**: hub tokens and the family switcher; one joker palette with a persistent legend; delete the dead run path and extract the helpers into `fantasyland-core.js`; natural page scroll on phones with the matrix as stacked cards; merge EV/Repeat/Foul into one overview with a metric toggle.
- **Constraints**: `ofc/fantasyland-trainer/tests/extended-ev-browser.cjs` targets this page (matrix row counts, `data-config`, `data-value` text, `#matrix-meta` position on phones, the repeat-details button label).

### 3.16 `/ofc/fantasyland-report/` — Fantasyland report

- **What it is**: a static snapshot report from a fixed-seed 24-sample dataset: summary tiles, key takeaways, matrix cells, detail histograms, band charts.
- **Works**: the cleanest sheet in the family; matrix cells (value, bar, meta) and insight cards are the better-designed versions of the EV page's tables.
- **Wrong**: its numbers disagree with the 10,000-sample EV page and the dataset date is not shown; Title Case headings; charts with no text alternative; a floating-card topbar unlike any sibling; nested scrollers on phones; cryptic "14/0" selector labels.
- **Redesign**: decide its role: fold into the EV page as an Overview tab, or regenerate from the precomputed data and show the dataset date; either way, hub tokens and the shared header.
- **Constraints**: no tests.

### 3.17 `/blackjack/strategy/` — Blackjack Strategy Lab

- **What it is**: four-column lab: strategy chart (280 cells with index badges), instant hand solver with a shared-card tray and key pad, Hi-Lo count tracker, table rules, and a display strip that also holds engine audit tiles and GitHub links; five-tab phone mode.
- **Works**: container-query chart sizing; sticky heads; the stepper plus range plus number control; segmented Soft-17; `<dialog>` for dealer outcomes; the phone chart in the screenshot is readable.
- **Wrong**: teal accent on a gold family and inverted Hit/Stand colours versus the hub; chart text from 0.34rem to 0.58rem in white on khaki and cyan cells at 2.2–2.6:1; 27 font sizes and weights up to 950; rule switches have no focus state because the focus selector cannot match their markup; `display: contents` on definition lists strips semantics; the display panel mixes chart options with engine audit and links; cryptic labels ("Alt", "Rev 2-6", "Applied TC").
- **Also found by the completeness pass**: there is no keyboard interaction model: the 280-cell chart has no roving tabindex or arrow keys, so a keyboard user tabs through ten header buttons and 280 cells to reach the solver, the card pad has no key shortcuts, and the dealer dialog lacks `aria-labelledby`; "Copy config" silently rewrites the page URL into a share permalink and sits in the Count panel although it captures rules and display settings too.
- **Redesign**: hub tokens with the gold accent; map H/S/D to `--hit/--stand/--double` and settle one Hit colour site-wide; darken cell fills for AA; a 12px floor with bust percentages and index badges on a second line or in the inspector; a chart toolbar above the chart and an "About the engine" disclosure; fix switch markup order; a roving-tabindex grid and card-pad shortcuts; an explicit "Share link" action; shared mobile view switcher.
- **Constraints**: `tests/solver-regression.test.mjs` runs all of `app.js` in a VM with a stub DOM and pre-seeds specific ids and selectors (listed in `audits/standalone.md`).

### 3.18 `/dice/reports/` — Fair Dice Payout Explorer

- **What it is**: three workspaces (Explore with results table and inspector, Matchups with six sub-tabs, Play with a 3-D dice canvas and paytable), five dialogs, a long math reference in the sidebar.
- **Works**: the best accessibility scaffolding on the site; sticky rank column; the dialog recipe; the dice canvas and glow system; reduced-motion handling; the editorial mono-numeral register is attractive.
- **Wrong**: system font instead of Inter; 8–10px labels throughout and a mobile paytable of 8–9px labels; four tab styles on one page; `<title>` says Explorer while the H1 says Lab; "↗" used on in-page actions; ~900 words of reference prose inside a 340px sidebar; dead filter disclosure and ranking note; the H1 disappears at ≤480px; a separate "Analysis" phone button instead of the shared sheet model.
- **Redesign**: hub tokens with Inter and the gold accent, mono only for numeric columns; 11/12px floor; one segmented control; a Method section for the reference text; the inspector as a bottom sheet on phones; readable paytable tiles.
- **Constraints**: four Playwright suites with a very large id, data-attribute and visible-text contract (listed in the audit); `data-view="analysis"` and `#back-to-schedules` are exercised.

### 3.19 `/cards/` — Card Table Workshop

- **What it is**: a prototyping sandbox: felt with zones and seats, a 360px side panel with seven icon tabs, a New game picker modal over it, selection bar, replay bar, phone macro dock, tour, PWA with a service worker.
- **Works**: the `.btn` size/variant system; the single reusable `<dialog>`; the `pointer: coarse` halo; felt, size, contrast and motion preferences on `body`; zone legal/illegal/drop feedback; the preset grid with mini cards.
- **Wrong**: five independently positioned fixed bottom overlays on phones with offsets computed from each other; cards are `div`s with simulated focus and only eleven `aria-label`s in 5,000 lines; tab buttons without `role="tab"`; the same mobile media query repeated five times and a "polish pass" layer; ten `!important`s; 65 hex literals; custom-card radius differs from the shared card; a flat white CSS die while the dice page has a canvas die; emoji icons; the opening modal plus onboarding popover on top of a dense UI (visible in the screenshot) is a lot for a first visit.
- **Also found by the completeness pass**: the guest view of an online room is undesigned: host-only controls (New game, bots, simulate, snapshot, record) stay enabled and only toast "Only the host can…" after the click, "Reset this game" fails silently, and connection changes ("Host disconnected; recovering table") are 2.4s toasts while the room label stays green; context menus are plain `div`s of buttons with no menu semantics, no focus management and no arrow keys, and they are the only route to many card, zone and seat actions.
- **Redesign**: one bottom "stage" region with a single `--stage-height`; cards as buttons via the shared component; proper tabs and menus; a defined guest state with a persistent connection badge; hub tokens with a chosen family accent (cards has none); four or five side tabs with 12px labels; align radii; shared dice face; SVG icons; simplify the first-run flow.
- **Constraints**: engine tests only; `sw.js` caches exact paths with a versioned cache name, so any renamed stylesheet needs a bump; `manifest.webmanifest` colours follow the page colour.

### 3.20 `/microtonal-lab/` — Microtonal Lab

- **What it is**: a three-column synth: tuning bank, instrument (root, wave, sliders, scope canvas, QWERTY key grid, pulse sequencer), builder and scale map; `data-view` panes on phones.
- **Works**: the `data-view`/`data-pane` model; preset search and family filter; pulse sequencer; readout grid; builder tabs; the "Start audio" gate; the phone screenshot shows a coherent single-column stack.
- **Wrong**: a neon multi-accent system farthest from the hub; all-caps 0.68rem/800 labels and 900-weight headings; the QWERTY-offset keyboard scrolls horizontally on phones with disabled filler keys; the nav behaves four different ways across breakpoints; three tab controls with three ARIA treatments; sliders without readouts; no home link, favicon or description; canvas colours hard-coded in JS; an unexplained "!" panic button.
- **Also found by the completeness pass**: every key sets `touch-action: none`, so on phones the overflowing keyboard cannot be panned by touch at all (the two findings cancel each other out); pulse steps increment on click and decrement only on right-click, with no touch or keyboard path and an unlabelled `+N` (N is an absolute scale index); "Start audio" is not a gate, since any key starts audio, and its label never reverts if the context is suspended.
- **Redesign**: hub tokens with one accent (or a new family entry); pitch-class colour only where it carries meaning; a straight lattice keyboard on desktop and a 44px isomorphic grid on touch with `touch-action: pan-x`; one persistent view switcher; sentence-case 12px labels; outputs on every range; steppers for pulse steps; a proper stop icon and an honest audio status; brand mark as home link; read tokens into the canvas.
- **Constraints**: no tests; the `dom` id map in `app.js` is listed in the audit.

### 3.21 `/gym/` — Gym Tracker (React)

- **What it is**: a local-first training dashboard with a sidebar, sticky header, mobile tab bar, and routes for dashboard, calendar, exercises, goals, suggested session, nutrition, notes, add workout, add nutrition and settings.
- **Works**: the most finished app shell on the site; focus ring system; mobile dialog with focus trap and `inert`; skip link; route focus management; chart screen-reader tables; `.surface` already matches the hub tile.
- **Wrong**: CSS defaults to light while the app defaults to dark via a `useEffect`, so cold loads flash; `prefers-color-scheme` ignored; viewport lacks `viewport-fit=cover` while the tab bar pads with `env()`; 59 Tailwind `!` overrides because buttons lack size and icon variants; Tailwind red/orange tints instead of the tokens; the dashboard is almost entirely hard-coded literals and about ten phone screens tall with eight equal-weight metric cards; 36px toggles; `window.confirm` for destructive actions; save messages are not live regions; first-person assistant copy shipped in Settings; marketing taglines as page titles; eight arbitrary micro font sizes.
- **Also found by the completeness pass**: save and copy failures on the Add pages are unhandled (a storage quota or clipboard denial produces no message and no navigation); the long logging form has no unsaved-changes guard or draft, and the bottom tab bar navigates away instantly; on phones the Save button, the validation list and the status sit below the entire form, and "highlighted validation issues" are never highlighted; the suggested session plan is not carried into the log form; calendar day cells have no accessible selected state and no feedback on phones; the WorkoutCard expander is a button wrapping headings and stat tiles; nutrition entries are delete-only, and an edit of an unknown or seed id silently becomes a new entry.
- **Redesign**: `Button(size, variant)`, `Chip`, `ProgressBar`, `Toast`, `ConfirmDialog`, `SearchField` primitives; a pre-paint theme script and `prefers-color-scheme`; tokens imported from the shared sheet (delete `--acid*`, add warn/danger backgrounds); a data-driven, half-length dashboard with "Log workout" as the mobile primary action; a sticky mobile save bar with per-field errors, guarded save and copy, a draft or leave guard; the plan hand-off; 0.75rem floor; 44px toggles; an error boundary.
- **Constraints**: `gym/tests/ui.test.tsx` (ScoreControl radio roles, "6 · severe" text, hash navigation); Prettier, ESLint, typecheck and tests run in CI; `#main-content`, `#mobile-menu`, `localStorage["gym-theme"]`, `.dark` custom variant.

### 3.22 `shared/` — the system itself

- **`hub.css`**: 1,594 lines, about 45% per-page illustration; 17 ad-hoc rem sizes down to 0.58rem; one radius token and five literal radii; a 28px switcher with no focus style; the Backgammon family block appended after the media queries with a `:has()` hack; always-on aura, bob, spin and glow loops; good reduced-motion handling and view transitions.
- **`cards.css` / `cards.js`**: well engineered (cqw scaling, pinned markup contract). Fix: `role="img"` for non-button cards, `aria-pressed` emitted for selected button cards (three pages render selectable button cards with no state exposed), distinct selected versus focus rings, an `@media (hover: hover)` guard on the interactive hover outline (it sticks on the last tapped card on touch), club green at about 2.9:1 under white, a reduced-motion guard for `card-pop` inside the file, tokens for the danger ring and badge backgrounds.
- **`peer-room.js`**: used by one page; should back every multiplayer lobby.

---

## 4. Shared components to extract

| Component | Today | Best existing reference |
| --- | --- | --- |
| Topbar with breadcrumb, family switcher, tool tabs, actions | ~14 header variants | `shared/hub.css` topbar plus backgammon's tool nav |
| Segmented / tab control (real tablist) | ~25 variants | OFC EV `section-tabs` (keyboard model), EV variant pills (focus ring) |
| Button (primary, secondary, quiet, danger; sm, md, icon) | ~10 systems | cards `.btn`, backgammon 44px buttons |
| Switch | 5 variants | Gym `Toggle` semantics, OFC EV `.switch-control` |
| Field (label, hint, control) and settings row | 6 variants | Mixed Poker `.number-setting`, blackjack stepper control |
| Stat tile and stat strip | 12+ variants | Dodge simulator `.summary > .stat` |
| Data table with scroll wrapper, sticky header and first column | 8+ variants | Dodge explorer table, calculations table |
| Bar, bar list, sparkline, stack bar, progress | 10+ variants | Dodge simulator `.opt-bar`, calculations `.bar-track` |
| Chart stylesheet and category palette | per page, hard-coded in JS | Dodge charts with `--scale` piping |
| Dialog (modal, bottom sheet on phones) | 10 skins in backgammon alone, `div` modals elsewhere | cards `openDialog`, backgammon sheet keyboard fitting |
| Toast with `aria-live` | 5 variants | Mixed Poker toast |
| Lobby (name, code, roster, host settings) on `peer-room.js` | 4 implementations | Mixed Poker room view |
| Seat / player box / avatar | 4 implementations | Mixed Poker seat plus Dodge seat card |
| Poker felt with board slots | 4 implementations | Mixed Poker table surface |
| Hand-strength chip (neutral, good, bad) | 5 implementations | Edge the Dealer readouts |
| OFC board row (label, slots, summary) | 4 implementations | OFC Play `.board-row` |
| Rules article and royalty tables | 3 copies | trainer `rules-article` renderer |
| Card drag ghost | 2 implementations | `ofc/play/card-drag.js` |
| Decision value row (played, best, loss) and help row | 6 and 3 in backgammon | Play `.decision-values-compact` |
| Dice face | canvas and CSS square | `dice/reports/dice-view.js` |
| Visually-hidden utility | 4 spellings | `hub.css .visually-hidden` |

---

## 5. Verification and gaps

### 5.1 Claim verification

Thirty-three load-bearing claims from the audits were handed to independent verifiers whose only job was to refute them by reading the files. Result: 26 confirmed, 7 confirmed in substance with a detail corrected, 0 refuted. The corrections, applied above and in the appendix headers:

| Claim | Correction |
| --- | --- |
| Backgammon hub overrides | The aura and dot grid are disabled at `backgammon/styles.css` 989–992 via a `.hub-backgammon` scope; the `--radius: 10px` override lives in the top `:root` block (line 12), not there. |
| Ultimate Omaha loader | The loader span carries the `hidden` CSS class, not the attribute; `.hidden { display: none !important }` beats the loading rule. |
| Mixed Poker table collapse | The decision panel and the results panel are never shown together (one hides at showdown, the other shows), so the short-viewport case is header + meta + hero + one panel, not all three. The `min-height: 0` with no floor still allows the collapse. |
| `peer-room.js` adoption | Among the four poker tables only Mixed Poker uses it; repo-wide it has six consumers (222, Dodge simulator, OFC Play, Card Table Workshop, Backgammon Play as well). |
| Dodge desktop type | Base sizes are 8–10px; the single 7px rule applies below 1150px. |
| 222 scroll regions | Besides the log, the dialog body and two horizontal scrollers (tabs, table wrap) scroll internally; the page itself still scrolls as a document. |
| OFC brand links | Both the trainer and the EV page link their brand to `/`; Play and the report link to `/ofc/`. The EV page's accent token is named `--green` like Play's and the report's. |

One audit statement was found wrong by the completeness pass and is corrected in §3.11: the Dodge simulator's `.review-banner` is dead CSS, and review mode is signalled through the prompt.

### 5.2 Completeness pass

A critic per family was asked what the audits missed, then each new finding was handed to a skeptic to refute. All 48 survived; the "Also found by the completeness pass" bullets above are the result, verified with file and line citations recorded in the session. Grouped by theme, the misses were:

- **Undesigned multiplayer states** (every multiplayer page): guest views, joining mid-game, player gone mid-hand, host loss, busted or table over, leaving. The audits described lobbies and in-game screens but not the transitions between them.
- **Errors rendered where nobody looks**: into a hidden lobby (222, Mixed Poker, OFC Play), under a modal's top layer (Backgammon), as a 2–3s toast (OFC Play, Card Table Workshop), or not at all (Gym save and copy).
- **Focus and live regions**: hero cards re-rendered under the user's focus (Mixed Poker), action rows rebuilt mid-decision (222), prompts with no `aria-live` (222, Dodge simulator), hotkeys firing under dialogs (OFC trainer), no keyboard model at all (blackjack chart, Card Table menus, microtonal pulse steps).
- **Result screens**: game over as a sentence (Backgammon, Rush), a result table injected into an action bar (222), no end-of-set state (OFC trainer), a session-complete count where per-decision data exists (Backgammon trainer).
- **Security**: peer-supplied names injected into chat and log HTML unescaped on Ultimate Omaha and Edge the Dealer.
- **Strengths not credited**: listed in §1.6.

### 5.3 How the direction was chosen

Three independent design-direction proposals were written against these notes (extend the hub system; a flat "calm instrument" system grown from the backgammon app and the dice report; a Gym-style product shell with a rail and light plus dark themes) and scored by three reviewers with different lenses (product design; front-end feasibility under the test suites; accessibility and mobile). All three picked "extend the hub system", with totals of 49/47/45 against 39–44 for the others. The ideas grafted from the runners-up and the blind spots all three shared (the Backgammon focus-suppression and selection rules, content hierarchy, an icon set, a card-width scale, visual-regression baselines, cache-busting, touch equivalents for hover delight, favicon and OG sources, target desktop viewports, 16px phone inputs pinned by tests, player-identity tokens, text-zoom resilience, the offline manifest lists, the blanket reduced-motion rule versus Backgammon's opt-in, a drift lint, font loading, `user-scalable=no`, forced-colours, live-region hygiene, colour-only encoding) are folded into [prompt.md](prompt.md).
