<!-- Correction after independent verification: the hub's aura/dot-grid suppression is at `styles.css` 989–992 under a `.hub-backgammon` scope; the `--radius: 10px` override is in the top `:root` block (line 12). -->
<!-- Detailed audit appendix. Generated 2026-10-16 from a read-only review of commit 8c0efdb; line numbers refer to that commit. See ../notes.md for the synthesized page-by-page notes and ../prompt.md for the overhaul brief. -->

# UI/UX audit — Backgammon family (`backgammon/`)

Read-only analysis, 2026-10-16. All paths are relative to the repo root unless absolute. Line numbers refer to the current `main` (commit 8c0efdb).

## Site base for comparison (`shared/hub.css`, lines 11–40)

- Page `#08090d`, surfaces `#10141c` / `#151a24`, glass `rgba(16,20,28,.66)`, lines `rgba(148,163,184,.13/.24)`, ink `#eef4ff`, muted `#9aa7b7`, soft `#6f7b8b`, `--radius: 16px`, eases `--ease` / `--spring`, Inter with `cv11`/`ss01`.
- Per-family accent via `[data-family]`; backgammon is `#9bd6c9` (hub.css:1577–1584). Decorative aura + dot grid on `body::before/after`, `@view-transition` when motion is allowed.
- The family's own stylesheet `backgammon/styles.css:2–24` defines a **different** token set: `--bg #11191d`, `--panel #172126`, `--surface #202d32`, `--line #34454a`, `--text #eeeade`, `--muted #b0c0c1`, `--accent #9bd6c9`, `--danger #ffb4a8`, `--radius 10px`, root font-size 15px, `tnum`. So the family is a warm‑grey/teal "slate" theme sitting on a site whose base is blue‑black. Only the accent matches.

---

## backgammon/index.html — Backgammon (hub)

- **Purpose & audience**: Family landing page. Launch Play, show a static starting board, link Trainer/Solver/Library, show "Resume your game"/"Recent" links and the update status line.
- **Screens / states / flows**: One screen. `app.js` runs the service‑worker gate (`startUpdates({hub:true})`), paints the board (`Board` into `#hub-board`, non‑interactive), then fills `#recent` with "Resume your game" / "Recent: <title>" links from IndexedDB. `#app-update-status` (`role=status`) shows gate messages. The update gate can show the modal `.app-update-dialog` (`ui/updates.mjs:66–70`) before anything renders. No error state beyond the status text.
- **Current visual language**: Loads **both** `shared/hub.css` and `backgammon/styles.css` (index.html:16–17); the second `:root` wins, so `--radius` becomes 10px, the body background `#11191d` sits over the html `#08090d` (visible on overscroll), and the hub.css `.eyebrow` (0.7rem/800/0.16em with a `::before` rule line) is overridden by `styles.css:204` (12px/650/1.6px) while the `::before` line survives — mismatched. The aura and dot grid are explicitly disabled (`styles.css:989–992`), so this hub is flatter than the other family hubs. Hero: `.hub-intro h1` 48px/-2px (styles.css:1006) instead of the site's gradient `.hero h1`. Tools list `.hub-tools` (1023) is three bordered‑top text blocks, not the site's `.tile` cards. `shared/hub.js` is loaded but finds no `.tile`, so it does nothing.
- **Layout**: `.hub-layout` 1.25fr/1fr grid with the board at 876/660 aspect (995–1005); collapses at 900px and 700px (1070, 1100 blocks); at ≤700px `display: contents` reorders intro → tools → board → footer (3706–3730). Topbar from hub.css (crumbs + switcher) with backgammon overrides at 1398–1440 (switcher becomes a full‑width flex strip, dots hidden).
- **Controls inventory**: crumbs, family switcher, `a.primary#hub-play`, `#recent` links, three tool links, "About & source", `.hub-update` links (Clicks & highlights · Refresh app · Engine accuracy & speed) + status.
- **Problems found**:
  - Two competing token systems on one page (hub.css vs styles.css); `--radius`, `--muted`, backgrounds and eyebrow all drift.
  - `.hub-update` is a footer of three utility links plus a status sentence with no hierarchy (index.html:81–87).
  - `.hub-intro p` max‑width 380px/17px muted copy; the primary CTA is a plain accent rectangle (styles.css:1014–1021) unlike the site's buttons.
  - Board in the hero is purely decorative but is `aria-label="Starting backgammon position"` on a `div` without a role (index.html:45–49).
- **Redesign recommendations**:
  - P1: Make the hub consume only `shared/hub.css` tokens (tiles for Trainer/Solver/Library, site eyebrow/h1), and load a tiny hub‑only sheet for the board slot. Keep the live `Board` preview and the Resume/Recent links (nice touch).
  - P2: Re‑enable the aura/grid or deliberately replace it with a board‑coloured glow so the hub matches siblings.
  - P3: Turn the utility footer into a small "More" row with icons or move Refresh/Report into the About dialog.
- **Constraints to preserve**: `tests/updates.cjs:197–199, 271–279` → link "Refresh app", `.switcher a` list; `tests/click-guide.cjs:15` → link "Clicks & highlights"; `tests/browser.cjs:374–410` screenshots `hub-<w>x<h>` and asserts no horizontal overflow at 9 viewports; `#app-update-status[data-state]`, `#hub-board`, `#recent` ("Resume your game" link text, `tests/*` via `getByRole("link",{name:"Resume your game"})`). `index.html` is in `BG_SHELL` (offline manifest) and its `?bgv=` query strings are regenerated by `scripts/offline-manifest.mjs:39–43` — keep `<link>`/`<script>` paths relative and without other query params.

---

## backgammon/play/, trainer/, solver/, library/ — shared app shell (`ui/shell.mjs`)

Each route's `index.html` is identical apart from the title (play/index.html:1–25): meta theme‑color `#11191d`, `../styles.css`, `./app.js`, and a placeholder `<main style="padding:24px;font-family:system-ui"><h1>Backgammon</h1><p>Opening play…</p>` that is replaced when `shell()` sets `document.body.innerHTML` (shell.mjs:241).

Shell DOM (shell.mjs:241): `.app > header.topbar (a.brand + .brand-mark, nav.nav[aria-label="Backgammon tools"], .header-tools: a.site-link "All projects", #sound-toggle, #preferences "Settings") + .tool-head (h1#page-title, p.subtitle#subtitle, #toolbar.toolbar-actions with #panel-toggle "Details" and #mobile-tools "Tools") + main.workspace#workspace (section.stage: #opponent.player-strip, #board.board-slot, #player.player-strip, .action-area: #message[role=status], .action-main > #actions, #draft-line; aside.inspector#inspector > #panel.panel-body)`, plus `#toast`.

- **Visual language**: `.app` = `100dvh` grid, rows `auto auto minmax(0,1fr)` (styles.css:274–284); topbar 64px with 1px bottom line (285); tool‑head 70px (407); workspace `1fr 300px` (419); stage rows `38px 1fr 38px auto` (425). Buttons: 44px min, 7px radius, `--surface` fill, 550 weight (55–78); primary = accent fill with ink `#112a26` (79–85). Dialogs: `.dialog` panel bg, `#506266` border, 14px radius (790–800), backdrop `#050b10b8` + blur. Phone sheets `.drawer` (3165, 3735–3760) 18px top radius. Toast: **light** `#d4e8df` pill on the dark UI (930–942). Loading/update gate dialog uses `font: 16px/1.5 system-ui` and 18px radius (173–195) — a third dialog style.
- **Layout**: desktop = board + right inspector in one viewport; ≤820px/≤700px = inspector hidden and opened as the `#details-dialog` sheet; landscape ≤500px tall uses an absolutely positioned side dock (1278–1333, 3404–3440, 3523–3560, 3942–3975). 69 media queries with ~20 distinct breakpoint expressions (600/640/650/700/820/900/1024/1100 widths, 500/550/600/760 heights, aspect ratio, container queries) — see cross‑page summary.
- **Controls inventory (shared)**: `.segmented` (620), `.list/.list-row` (645), `.field` label wrapper (231), `.check`, `.pair`, `.notice` (713), `.metrics`, `.probability-bar`, `.engine-status.busy` breathing dot, `.die` HTML dice (568), `.player-strip` with `.checker-dot` and `.player-status` chip, `summary` chevrons (1473), keycap badges (3905–3927), equity bar rail (3081–3140).
- **Problems found (shell‑wide)**:
  - **Focus**: `styles.css:3981` `html:not([data-focus-navigation="true"]) :focus { outline: none !important; }` — a custom re‑implementation of `:focus-visible` with `!important`; `ui/input-behavior.mjs` toggles the flag. Works, but a redesign should express this as `:focus-visible` and keep the data attribute only for the SVG board.
  - **Text selection disabled everywhere** (`3979 body, body * { user-select:none }`) — this also applies to Reports and Controls pages (see below).
  - **Three dialog skins**: `.dialog` (790), `.app-update-dialog` (173, system‑ui font, hard‑coded fallbacks `#f0eee5/#172226/#36494b/#9dd5c9/#afbec0`), and `.opening-roll` panel (1663, `#132024fa`, `#546862`).
  - **Append‑only CSS**: the same selector is redefined later with different values instead of edited: `.app` 274→1492, `.topbar` 285→1496, `.stage` 425→1499, `.board-slot` 479→1502→1532, `.die` 568→2250, `.point.destination .point-hit` 526→1567→2186→2473, `.decision-dialog[open]` 2578→2801→3330, `.review-move` 3311→3332, `.board-workspace` 3791 (grid)→3864 (flex), `.board-actions #confirm` 3794→3935, `.panel-toggle {display:none}` 617 vs `.app .panel-toggle {display:block}` 3149 (and every `.panel-toggle{display:block}` media rule is now dead). Two `:root` blocks (2, 3905).
  - **Dead CSS**: `.focus-mode*` (968–976), `.pill` (263), `.feedback-title` (2480), `.die-reveal` (1700), `.probability-bar` only in analysis view; `report.css .metric-bar`, `.move-observations` (never emitted by reports/app.js).
  - **Hard‑coded colours**: 92 hex literals; `#112a26` (accent ink) ×4, `#b6eee0` fallback ×12, `#0d1519` segmented track (620), `#223238` row hover (645), `#2c3c41` button hover (76), `#58716f` slider track (380), `#314044` progress track (187), `#e4c48b` warning (2045), loss tones `#86bfff/#8ddbad/#e4d37e/#f1b078/#ff9398` (2304–2318), shadows `#0004/#0005` ×11.
  - **Type scale**: 19 distinct px sizes (9–48); 9px (`.equity-number` on phones, 3843/3881) and 10–11px are below legible minimums.
  - **Radius scale**: 17 distinct values (0, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 50%) vs site `--radius 16px`; `--radius` token is declared and never used.
  - **Fonts**: Inter in `:root`, but `system-ui` in the route placeholders, the update dialog (173), the refresh page, and `ui-sans-serif` in keycap SVG labels (3912); `ui-monospace` for hex inputs and keycaps.
  - The `.brand-mark` (three accent triangles, 301–316) is the only logo; `icon.svg` uses the same motif with `#172126/#9bd6c9/#eee5d2`.
  - `.tool-head` taglines ("One position. One decision.") cost a 70px row on desktop and are sr‑only on Play (3985) — inconsistent value.
  - `.site-link` "All projects" is `display:none` ≤900px (1085) — the only way back to the site is Settings → All projects.
  - `#sound-toggle` is an icon‑only ghost button with `title`; fine, but it and `#preferences` are 13px text buttons in a 64px bar — low visual weight for the family's main secondary nav.
- **Redesign recommendations (shell)**:
  - P1: Rebuild `styles.css` as layered sheets (`tokens`, `base`, `shell`, `board`, `play`, `review`, `dialogs`, `phone`) with one breakpoint set (e.g. 480 / 760 / 1024 + `landscape-short`), and remove every overridden duplicate listed above. Target ≤1,800 lines.
  - P1: Adopt the site tokens (`--page/--surface/--surface-2/--line/--ink/--muted/--soft/--accent/--radius/--ease`) with the family accent; map `--bg→--page`, `--panel→--surface`, `--surface→--surface-2`, `--text→--ink`. Keep board colours entirely on `--board-*` (they are runtime‑set by `core/appearance.mjs:655–748`; do not fold them into the UI tokens).
  - P1: One dialog component (header / scrolling body / sticky footer) used by update gate, opening roll, settings, review, history, sheets. Keep the phone bottom‑sheet behaviour and keyboard‑viewport fitting (`shell.mjs` dialog(): `--dialog-visible-height`, `data-keyboard`) — tests depend on it.
  - P2: A dark toast consistent with the surface scale; `role=alert` for errors (`showError` currently uses the status toast).
  - P2: Keep the keycap system (`ui/keycap.mjs`) but let it inherit Inter.
  - P3: Replace the `<main style=…>` placeholders with a styled skeleton (brand + spinner) so the pre‑boot frame matches the app.
- **Constraints to preserve (shell‑wide; used across most of `tests/*.cjs`)**: ids `#board`, `#opponent`, `#player`, `#actions`, `#message`, `#draft-line`, `#panel`, `#inspector`, `#panel-toggle` (text "Details"/"Results"/"Practice"), `#mobile-tools` ("Tools", `aria-haspopup`, `aria-expanded`), `#toolbar`, `#preferences` (button name "Settings"), `#sound-toggle` (`aria-pressed`), `#subtitle`, `#page-title`, `#toast`, `#equity-toggle` (`aria-pressed`), `#equity-bar[data-state]`, `#details-dialog` + `.close` (button name "Close"), `.tool-menu-dialog`, `.settings-dialog` (buttons "Board colors"/"Display & controls"/"Keyboard"; labels "Playing style", "Board orientation", "Motion", "Frame hex", "Frame color picker", "Pattern", "Board element", "Pattern ink hex", "Enable game shortcuts", `#undo-theme`, `#reset-theme`, `[data-preset="…"]`, `.theme-contrast`, `.theme-warnings`, `.theme-dice-samples .teal-die`, `.color-group summary`, `.settings-updates summary`, "Check for updates", `.release-status`, `#move-hints`, `#interaction-mode`, `.shortcut-points input`, `#save-shortcuts`), `.app`, `.app[data-page]`, `.play-page/.live-table/.setup-table/.desktop-table`, `.drawer`, `.dialog-body`, `html.bg-dialog-open`, `html[data-focus-navigation]`, `html[data-motion]`, `[data-app-ready]`, `.app-update-dialog` + `progress` + `.update-message` + button "Retry update", nav links by name "Play"/"Solver"/"All projects". Layout assertions: no horizontal overflow at 320–1440px, `#board` bottom ≤ `#player` top, actions on screen (browser.cjs:386–409; mobile-layout.cjs:40–64; control-polish.cjs:51–62; assistance.cjs:235–335; responsive-parity.cjs:109–133). Computed‑style assertions: `background-focus.cjs:48–71` (no outline unless keyboard; `.point-hit`/die rect stroke equals focus colour), `control-polish.cjs:30,41` (outline none / present), `appearance.cjs:60,104–118` (`#board .bg-board > rect` fill equals preset frame; dice face/pips colours), `mobile-settings.cjs:85` (hex input font‑size 16px on phones), 44px touch targets (`mobile-settings.cjs:24`, `mobile-sheets.cjs:54`, `control-polish.cjs:59`). `deployment.test.mjs:54,102` and `offline.test.mjs:29,137` reference `styles.css` by name; `BG_SHELL` lists `controls/controls.css`, `reports/report.css` — renaming/splitting stylesheets requires regenerating the manifest (`scripts/offline-manifest.mjs`).

---

## backgammon/play/ — Backgammon · play

- **Purpose & audience**: The main game table: vs GNUbg, same device, or online peer room. Players of all levels; phone‑first.
- **Screens / states / flows**: (1) **Setup** (`setup-table`): inspector‑first form — `.segmented` Computer/Same device/Online (play/app.js:824–841), Match length, Computer strength + "Feedback & hints" `<details>`, player names `.pair`, online name/room code + Create/Join/Reconnect, `ruleControls()` details, "Resume saved match". Phones show the form inline with a full‑width `#start-match` dock (3464–3483). (2) **Opening roll** overlay `.opening-roll` inside the board slot (1663–1760) with per‑player die reveal animation. (3) **Live table** (`live-table`/`desktop-table`): board + `.board-workspace` confirm rail (`#confirm`, 144px column, 3791–3800, 3935) + `.help-cluster` (`#help-actions`: Undo last turn / Hint / Roll / Double; `#all-controls` "All controls" opens `.practice-controls-dialog`), `#actions` (Roll dice / Double / Take / Pass / Beaver / Confirm / Next game / Game review), on‑board dice with selection/undo, equity bar rail, `#analysis-jump "Analysis ↓"`. (4) **Review** `section.play-review#play-review` appended after `.app` (play/app.js:161–182): "Analysis & history" header (sticky on phones, 3395–3402), History tree, Back to board ↑, auto‑review status, All/You/Opponent `.history-filters`, decision rows (`.history-turn` → `.feedback-review[data-loss-tone]` + `.decision-values-compact`), and the relocated inspector. (5) **Dialogs**: Details sheet, Help & practice sheet, Tools sheet, Settings, hint/decision review `.decision-dialog` (Board/Comparison/Details views, ranked `.review-move` list), session review `.session-dialog`, history tree `.history-dialog`, undo request (Accept/Decline), costly‑move warning (`#pending-move-loss`, "Confirm anyway"), Save to Library, online room panel (Room code, connection status). States: engine busy (`.engine-status.busy`), analysis paused + Retry, offline/online network status via toast, game over.
- **Current visual language**: As shell, plus: giant `#confirm` button with `✓` ring and keycap (3935–3941); cube buttons `#double-cube/#immediate-redouble` styled by id with amber `--board-undo` mix (2919–2930); decision loss tones (2304–2318) with `--loss-color` on borders/values; player identity via `--board-checker0/1` on history rows (3048–3068); amber `#e9ad67` undo everywhere; dashed source rings, washes, landing rings and badges on the SVG board (1545–1620, 2180–2300); 7 keyframes (`breathe`, `opening-land`, `die-arrive`, `roll-panel-in`, `turn-ready`, `bg-sheet-enter`) plus WAAPI flights in `ui/motion.mjs`.
- **Layout**: desktop ≥1025×501: `.app` fixed `100dvh` with the review section below in document flow (page scrolls; README §"Play keeps the board…"). Phone portrait ≤700: stage rows `26px max-content 26px 60px 1fr`, board `aspect-ratio 876/660`, confirm 52px row under board, then action dock, then review (3942–3960, 3404–3440). Landscape ≤500 tall: topbar/tool‑head collapsed into a 164px right dock with absolutely positioned player strips at `top:84/108px` (3523–3560, 3942–3975). Tiny phones ≤360 get additional reflows (1335–1356, 2760–2770).
- **Controls inventory**: ~40 distinct buttons/inputs across states; segmented toggles, selects, checkboxes, text inputs, range (sound), native `<details>`, `<dialog>`s, SVG buttons (`.board-die[role=button]`, `.board-cube[role=button]`, `.dice-switch`, `.point[role=button]`), `.touch-moves` From/To selects, `.touch-destinations` one‑tap buttons, `.history-filters` pressed buttons, `.review-move` pressed rows, `.decision-choices` filled active buttons.
- **Problems found**:
  - **Six layout regimes** for one page (setup/live/desktop/phone portrait/phone landscape/tiny) expressed by stacking `.play-page.live-table …` overrides; e.g. `.play-page.live-table .action-area` is set in 5 different media blocks. This is where most of the 3,989 lines go.
  - The confirm rail is a 144px‑wide, 120px‑tall accent block beside the board (3935) — visually heavier than the board's own dice; on phones it becomes a 52px full‑width bar (3960) so the primary action moves between right rail and bottom depending on width.
  - `#message` (`role=status`) and `#draft-line` both carry status; on Play the draft line is sr‑only (3985) while Trainer shows it — duplicated status channels.
  - The help strip hides `#roll`/`#double-cube` (`3927 .action-help :is(#roll,#double-cube){display:none}`) and re‑shows them only inside the practice dialog — control placement by CSS display rules is fragile.
  - Styling by id (`#double-cube`, `#undo-turn`, `#all-controls`, `#analysis-jump`, `#equity-toggle`) instead of state classes.
  - `.toast` is light‑on‑dark and is also the error channel (`showError` → `toast`); network errors in online mode are easy to miss.
  - The light `.opening-roll` panel uses a unique near‑opaque background and border (1663–1671) rather than the dialog surface.
  - Decision review on desktop opens a 1440×900 modal (2801–2806) — effectively a second page inside a dialog; consider making review a route/section rather than a modal.
  - `.equity-number` 9–10px (3081–3100, 3843); `.equity-retry` 32px tall (3135).
  - Contrast: `.confirm-status` 12px/450 weight on accent; `.history-kind` 12px muted on tinted row; `.player-status` 12px.
- **Redesign recommendations**:
  - P1: Define the Play layout as three explicit named layouts (`table-wide`, `table-stacked`, `table-landscape`) with container queries on `.stage` instead of 20+ media blocks; keep the decision‑history grouping and filters (good UX).
  - P1: Make the confirm control part of the action bar with a consistent position (bottom‑right on wide, full‑width bottom on stacked) and let the board own the dice/undo affordances (already true); keep keycaps on desktop only (3925 rule).
  - P2: Keep the board palette system, loss‑tone colours and player‑colour identity, but declare them as `--tone-*`/`--undo` tokens derived from the site palette with the board overrides layered on top.
  - P2: Replace `.opening-roll` with the shared dialog surface (non‑modal, in‑board) and animate with `--ease`/`--spring`.
  - P3: Unify status: one `#message` line with a secondary muted draft line; stop toggling sr‑only per page.
- **Constraints to preserve**: `tests/browser.cjs:124–166` (`"Same device"`, label `"Match length"`, `#start-match`, `#confirm` enabled/disabled, `#draft-controls select`, `.board-die.consumed`, `.board-cube`, `"Take 2"`, `#resume-match`, `"Save position"`, dialog labels Name/Notes, `"Save"`, `#panel img` count 0); `mobile-layout.cjs:16–100` (`"Computer"/"Same device"/"Online"` with `aria-pressed`, `#create-room`, labels "Your name"/"Room code", `.game-rules > summary`, board aspect 660/876, `#confirm` ≥48px and above `.help-cluster`, `.touch-moves` visible, `#analysis-jump` → focus `#review-heading`, `"Back to board ↑"`, `#mobile-tools` focus return, `.tool-menu-dialog #equity-toggle`); `mobile-sheets.cjs` (`#player .player-status` text "To move"/"To roll"/"To reply", `.player-stats`, `.practice-controls-dialog` spans width and sits at bottom, `#help-actions` returns to `.help-cluster`, `#details-dialog`, `#inspector > #panel`, `html.overflow hidden under sheet`); `control-polish.cjs` (`#board .point-shortcut .keycap-face/.keycap-label` ×24, `.draft-shortcuts .keycap-art` ×2, `.moving-checker` animation duration 460ms, `#undo`/`#reset-draft` absent in Play, `#hint`, `#all-controls`, `.board-die.consumed`); `assistance.cjs:198–207` (history row `borderLeftColor`, `.value` colour, `.history-player` colour from board checker colours); `decision-ux.cjs`, `review-*.cjs` (`.decision-dialog`, `.decision-tabs [data-view]`, `.decision-choices button[aria-pressed]`, buttons "Position"/"Best move"/"Your move"/"Comparison"/"Board", `[data-best-move]`, `.review-move[data-rank]`, "Previous moves"/"Next moves", `#use-hint`, `#undo-play-best`, `#return-position`, `#save-review-position`, `.decision-caption`, `.review-preview-strip`, label "Preview evaluated move"); `history-*.cjs` (`.history-dialog`, buttons "Tree"/"Board"/"Current position", `[data-history-node]`, `#history-return`); `feedback.cjs`/`auto-review.cjs` (`#move-feedback`, `.feedback-review[data-history-side]`, `[data-history-filter]`, `#review-feedback`, `#review-session`, `#pending-move-loss`, "Confirm anyway", label "Warn before confirming a costly move", "Show move feedback"); `cube-options.cjs`/`options-ui.cjs` (`#take-cube`, `#double-cube`, `#immediate-redouble`, "Beaver to 8", "Raccoon to 16", `.opening-roll h2` text containing "tie", labels "Jacoby rule"/"Automatic opening doubles"/"Immediate redoubles"); `keyboard.cjs`/`advanced-ui.cjs` (`#board.roll-ready`, `.board-die.preferred`, `.dice-switch-hit`, `.die-forced`, `.die-check`, `[data-die-mark]`); `live-network.cjs` (`#room-code`, `#start-room`, `#accept-undo`, `#decline-undo`, `#connection-status`); `equity-bar.cjs` (`#equity-bar[data-state]`, `.equity-number`, `.equity-bottom-number`); `drag-feedback.cjs`/`touch-*.cjs` (`.drag-checker`, `.drag-origin`, `.drag-landing-ghost[data-target]`, `.drop-hover`, `.point.selected`, `.movable`, `.destination`, `.reachable`, `.arrival-resident`, `.touch-destinations [data-destination]`, labels "Select a checker"/"Move selected checker"); `last-move*.cjs` (`.last-move-arrow`, `.last-move-ghost`, `.last-roll .board-die`).

---

## backgammon/trainer/ — Backgammon · trainer

- **Purpose & audience**: Spaced practice of single decisions (checker or cube) with hidden answers; learners.
- **Screens / states / flows** (`trainer/app.js`): loads `data/exercises.json`; inspector shows "Practice" with Practice set / Session length selects, rules summary, "Accessible move selection" picker; `.trainer-help` (Hint / Undo / Reset / Skip) prepended to `.action-main` (line 66); `#actions` has Submit move (`#submit-decision`) or Pass/Take/Beaver or No double/Double. States: busy ("Evaluating your decision with GNUbg…" + Cancel), revealed ("Decision review": `.decision-loss[data-loss-tone]`, compact values, `<details>` equity table, `resultView` candidate list, Original position, Save, Next decision `#next-exercise`), empty collection ("No saved exercises…" + Mixed practice), fetch error (Retry reload), session complete (Practice again / Open Library). Phone: `.study-strip` preview chooser (study-strip.mjs) appears in the action area after reveal; `#panel-toggle` label becomes "Results"/"Practice".
- **Current visual language**: Shell. `.trainer-help` buttons 44px (3639–3640); phone grid of 4 (3645–3650). Loss tone colours as in Play.
- **Layout**: Shell desktop; phones use `.app:not(.play-page)` rules (3404–3420): tool‑head stacked, board `aspect-ratio`, 48px action buttons, `min-height: calc(100vw*.754+320px)`; landscape dock (3523–3560).
- **Controls inventory**: selects ×2, picker select, 4 help buttons, 1–3 action buttons, candidate list rows (`.list-row` buttons), details/summary, Save dialog.
- **Problems found**:
  - Two "help rows" patterns in the family: Trainer's inline `.trainer-help` vs Play's `.help-cluster`/All controls sheet — same job, different components.
  - The subtitle is the only place session progress ("2 of 5 · 7-point match") appears (`$("subtitle")`, trainer/app.js:181) and it is truncated with ellipsis at ≤700px (1117–1123) — progress deserves a real indicator.
  - After reveal, the right panel stacks loss sentence, compact values, a details table, the candidate list and a notice — a long undifferentiated column (`panel()`, trainer/app.js:302–370).
  - `.list-row` candidate buttons (645–660) have no selected state beyond hover; the chosen preview is only visible on the board.
  - Trainer's `.decision-loss` is 18px/650 (2344) while Play's review uses 16px — duplicate type decisions.
- **Redesign recommendations**:
  - P1: Share one "help/practice row" component with Play.
  - P2: A compact progress stepper (n of N) in the tool head; make the revealed result a card with best/your/loss in one row (reuse Play's `.decision-values-compact`).
  - P3: Give candidate rows a pressed state like `.review-move[aria-pressed]`.
- **Constraints to preserve**: `browser.cjs:194–207` (`#submit-decision`, text "Evaluated moves", `#draft-controls select`), `practice.cjs` (`#next-exercise`, "Skip", "Hint", `.trainer-help`, label "Practice set", dialog "Study hint", `#reset-draft`, label "Accessible move selection"), `mobile-study.cjs` (`.study-strip`, "Preview evaluated move", "Compare cube options", `#panel-toggle` text), `page-progress.cjs`, `decision-feedback` values (`.decision-values-compact`, `.decision-value .muted`).

---

## backgammon/solver/ — Backgammon · solver

- **Purpose & audience**: Position editor + GNUbg analysis + match review; the most "pro" tool.
- **Screens / states / flows** (`solver/app.js`): toolbar `#edit-position` ("Edit position"/"Done editing"), `#analyze` (primary; becomes Cancel when busy), "Source" preview control, Share, Save. Inspector: `.segmented` Position/… + "Match review" import; `#position-rules` summary; editing mode shows brush select ("Board editing tool": Place Ivory/Teal/Remove), "Edit exact point counts" dialog (`.editor-grid` 6‑col inputs, 952–966), "Dice, cube & match context" dialog (`.pair` grids, Crawford checks, "Apply context"), Starting position / Clear board; "Analysis settings" `<details>` (preset select, "Rollout trials per alternative"), `#rollout-controls` details with `#start-rollout`/`#solver-rollout` resume, result view (`resultView`), "Save as exercise", "Save this mistake", "Import / export XGID" dialog (textarea), "Play from this position". Match review mode: Previous/Next seek, "Analyze remaining decisions", "Show evaluated errors". Phone: `.study-editor` (brush + Dice & rules) and `.study-strip` in the action area. Errors: validation problems rendered into panel; load errors via toast.
- **Current visual language**: Shell. Editor cursor `crosshair` (`.bg-board.is-editor`, 512). `.editor-grid input` centered 16px (960).
- **Layout**: Shell. Landscape: `.app[data-page="solver"]` dock (3523–3560), `.study-editor` single column.
- **Controls inventory**: ~25 buttons, 6 selects, number inputs ×24 in the counts dialog, textarea, checkboxes, details ×2, segmented.
- **Problems found**:
  - The inspector is a tall mixed list of mode toggles, editing tools, analysis settings, rollouts, save/share and navigation with no grouping visuals beyond `<details>` chevrons — hierarchy is flat (solver/app.js `panel()`, 295–540).
  - Editing is modal via a toolbar toggle but there is no visible "editing" state on the board frame except the cursor.
  - Context editing (dice/cube/score) lives behind a dialog while it is the most frequently changed input in a solver.
  - `#analyze` doubles as Cancel by text swap; no progress indication except `.engine-status` text.
- **Redesign recommendations**:
  - P1: Split the inspector into tabbed/segmented groups (Position · Analysis · Save) and surface dice/cube/score as an always‑visible context strip under the board.
  - P2: Visible edit mode (frame highlight, palette chips for Ivory/Teal/Remove instead of a select).
  - P3: Analysis progress bar using the existing `.probability-bar` style.
- **Constraints to preserve**: `browser.cjs:210–217, 727–761` (`#edit-position`, "Done editing", `#analyze`, "Evaluated moves"); `research*.cjs`, `search-policy-browser.cjs` (`#analysis-budget`, text "Analysis settings", "Analysis method & limits", label "Rollout trials per alternative", `#start-rollout`, `#rollout-controls summary`, "Save as exercise"); `options-ui.cjs:123–147` ("Dice, cube & match context", labels "Decision"/"Cube value (accepted stake)", "Apply context", `#position-rules`); `mobile-study.cjs` (label "Board editing tool", "Dice & rules", "Source", `.study-editor`); `history-return.cjs` (dialog "Open the committed position?", "Confirm recovery"); `responsive-parity.cjs:97` (`#edit-position`), `tool-access.cjs`.

---

## backgammon/library/ — Backgammon · library

- **Purpose & audience**: Local IndexedDB collection of sessions, positions and mistakes; export/import.
- **Screens / states / flows** (`library/app.js`): `#workspace` becomes `.library-layout` (list + inspector); `.library-filters` (search `aria-label="Search Library"`, type select, collection select); `.library-item[role=button][aria-selected]` rows with `.item-glyph` (≡ ↺ ◇) and `.library-session-summary` (per‑player loss totals with checker dots). Empty states ("A place for your next insight." / "No matching items"). Inspector: "Local collection" intro + notice + "Review due items", or selected item: title, "Open in Solver"/"Review match in Solver", "Review decisions" (`#review-decisions`), "History tree", `.library-preview` board, Name/Notes/Tags/Collection fields, Save changes, Export item, Practice this position, Delete (danger → confirm). Toolbar: Import (dialog with file + mode select) / Export (`#export-library` → "Game history"/"Entire Library").
- **Current visual language**: Shell. Rows 18px padding, selected = `--surface` fill (760–780). Glyph tile 48px → 38px (780, 3608).
- **Layout**: `1fr 320px` (730); ≤820 single column with sticky filters (3621–3625); ≤1024 filters 2‑col (3626); ≤700 inspector hidden → `openPanel()` sheet when choosing an item.
- **Controls inventory**: search input, 2 selects, row buttons, ~9 inspector buttons, 4 fields, file input, dialogs.
- **Problems found**:
  - `aria-selected` on `role="button"` is invalid ARIA (library/app.js:220–226); rows contain `<h2>` inside a button‑role element.
  - Three different breakpoints for the same filter grid (820 at 742, 1024 at 3626, plus sticky at 820).
  - Unicode glyphs as icons (≡ ↺ ◇) depend on font coverage and have no semantic label.
  - The inspector form for a session (board preview + four text fields + 6 buttons) mixes primary actions (Open in Solver) with destructive (Delete) in one column without separation.
  - Empty‑state CTA "Open Solver →" is a plain link in the list column.
- **Redesign recommendations**:
  - P1: Use `role="option"` in a `listbox`, or plain buttons with `aria-pressed`; move the title to a `<strong>`.
  - P2: Card/list rows with real icons (SVG) and a secondary metadata line; group inspector into Open / Edit / Export / Danger sections.
  - P3: Make the list column a scroll region with the filters as a sticky toolbar at all widths.
- **Constraints to preserve**: `mobile-library.cjs` (`.library-item`, `.library-filters`, label "Search Library", "Collection filter", `.library-session-player[data-player]`, `#library-history-tree`, `#review-decisions`, "Open in Solver", "Save changes", label "Notes"), `responsive-parity.cjs:139–156`, `browser.cjs:186–192` (button "Open <title>"), `#export-library`, `#export-games`, `.library-layout`, `#library-list`, `.session-totals`, `.session-review [role=list]`.

---

## backgammon/controls/index.html + controls.css — Backgammon · Clicks & highlights

- **Purpose & audience**: Static explainer of click/tap/keyboard semantics and highlight meanings; curious players and the author's audit record.
- **Screens / states / flows**: Long document: topbar (brand, nav, All projects — no Settings/sound), `.guide-back` link, h1, `.guide-sections` jump links, three `ol.click-flow` flowcharts (Advanced / Beginner clicks / Highlights; 5 steps each, each step = `.flow-question` card + `.flow-answer` + `.flow-next` connector), `.highlight-legend`, `#cases` 31‑row `table.case-table` with `tr[id]` targets, two `.guide-notes` 3‑col sections, `.guide-footer` "Back to Play →". Loads `ui/update-page.mjs` for the update gate. No SVG illustrations; the "flowchart" is text cards.
- **Current visual language**: Inherits `styles.css` (so Inter, dark slate, `body * {user-select:none}`), plus `controls.css`: question cards `--panel` with 8px radius (controls.css:47–56), numbered circles in accent (57–66), tables with accent header text (215–225), phone table → stacked cards with `data-label` pseudo headers (237–262).
- **Layout**: `.controls-page` max 1120px / `.controls-main` 980px; flow rows 1fr/1.2fr grid, collapsed ≤600px with a left rule; `.guide-notes` 3‑col → 1‑col.
- **Controls inventory**: links only.
- **Problems found**:
  - **Text cannot be selected or copied** on a reference document (styles.css:3979 applies here).
  - Heading levels: h2 for section titles and h2 again for each flow step in `#advanced`/`#clicks` (lines 44–56, 76–142) but h3 in `#highlights` (177–242) — inconsistent outline; 15+ h2s.
  - The topbar `nav.nav` lacks `aria-current`, and the page has no Settings/sound buttons, so the header differs from the tools and from the hub (third header variant).
  - Connector copy like "No · continue ↓" is a `div` with no semantics; the flow is not a figure.
  - `.flow-question h2` 16px/550 vs `.guide-heading` clamp 22–28px; `.guide-lead` 18px; `.case-table` 14px: four type sizes for body text.
  - `controls.css` duplicates topbar sizing (`.controls-page .topbar {min-height:64px}`) and a second `.primary` link style (`.guide-footer .primary`, 7px radius vs 9px on the hub).
- **Redesign recommendations**:
  - P1: Re‑enable selection on document pages (scope `user-select:none` to `.app`/board), fix heading outline (h2 sections, h3 steps everywhere), add `aria-current` to the nav.
  - P2: Treat this as a docs page using the shared document typography (same as Reports) with real `<figure>` flow diagrams or a simple SVG per step; keep the responsive table‑to‑cards pattern (good).
  - P3: Merge `controls.css` and `report.css` into one `docs.css` for the family.
- **Constraints to preserve**: `tests/click-guide.cjs:19–25, 41–80` → `#advanced .click-flow > li` ×5, `#clicks .click-flow > li` ×5, `#highlights .click-flow > li` ×5, `#cases tbody tr` ×31, `#cases tbody td` ×93, link "Checker & point highlights ↓" → `#highlights`, `#case-off-source` row id, "Back to Play →", no engine assets loaded; `README`/docs link to `/backgammon/controls/#cases`; listed in `BG_SHELL`.

---

## backgammon/refresh/index.html — Refresh Backgammon

- **Purpose & audience**: Standalone recovery page to force a fresh service‑worker install; must not import any cached app file (comment at line 2, 130–132).
- **Screens / states / flows**: brand link, h1 "Refresh the app.", two paragraphs, `#refresh` button + "Back to Play" link, `#status[role=status][data-error]`, hidden `#continue` link that appears on success (and receives focus), noscript. States: idle, checking/downloading (button disabled, cursor wait), success (button text "Refresh again"), error (status in `#ffb4a8`).
- **Current visual language**: Fully inline `<style>` (lines 14–100) re‑declaring the family colours as literals (`#11191d`, `#eeeade`, `#9bd6c9`, `#b0c0c1`, `#ffb4a8`, `#112a26`, focus `#d3f1ac`), `font: 16px/1.6 system-ui` (not Inter), button radius 8px, focus outline 3px `#d3f1ac` (different from the app's 2px accent).
- **Layout**: centered 490px column with safe‑area padding; fine on all widths.
- **Problems found**: token duplication by necessity, but the values already drift (font, focus colour, radius). `[hidden]{display:none !important}` duplicated.
- **Redesign recommendations**: P2: keep it standalone (correct for its job) but generate its inline CSS from the same token source (a build step or a shared snippet copied by `scripts/offline-manifest.mjs`); use Inter via `font-family` fallback (no webfont needed), 2px accent focus ring. P3: a small inline SVG brand mark.
- **Constraints to preserve**: `tests/refresh.cjs:167–282` → `#refresh` (enabled/disabled), `#status` innerText ("Updated. Your saved data is unchanged." etc.), `#continue` visible + href `?updated=`, no imports of app files; `redirects.json:7` maps `/refresh/` here; `updates.cjs:197` link "Refresh app" on the hub.

---

## backgammon/reports/index.html + report.css + app.js — Backgammon · Engine report

- **Purpose & audience**: Benchmark/accuracy report rendered from `data/*.json`; technical readers.
- **Screens / states / flows**: topbar (brand/nav/All projects), kicker, h1, lead, `#release` (replaced by the engine version string, not "measurements"), `.report-tabs` (Speed / Accuracy / Method & limits), six sections: `#automatic` (browser select + table), `#acceleration` (3 selects + table), `#speed` (position select + table + optional h3 table), `#device` (Setting/Position selects + "Run measurement"/Cancel, `#device-status`, result table + UA string), `#accuracy` (tables + download links), `#method` (`dl.report-methods`). Each section catches fetch errors into `<p class="error">`. `#toast` exists but `toast()` is never imported.
- **Current visual language**: `styles.css` + `report.css`: 1080px column, h1 clamp 28–44px, 22px h2, 13px muted table headers, right‑aligned tabular numerics, accent `dt`s; `.report-tabs` underline list.
- **Layout**: single column; ≤600px tighter padding, methods list 1‑col, topbar wraps.
- **Controls inventory**: 7 `select`s via `field()`, 1 button, download links, `<details>` (none emitted currently).
- **Problems found**:
  - `.report-tabs` lists 3 of 6 sections and the "Speed" tab points to `#automatic` while a separate `#speed` section exists (index.html:33–36).
  - Table text cannot be selected/copied (styles.css:3979) — bad for a numbers page.
  - Tables are `white-space: nowrap` in an `overflow:auto` wrapper with `tabindex=0` but no visible scroll affordance (report.css:48–66).
  - `report.css:70–76 .metric-bar` and `95 .move-observations` are dead; `#toast` is dead markup.
  - Caption copy is long and technical inside `<caption>` (reports/app.js:66, 92); the `#release` placeholder text "Loading recorded measurements…" is replaced by a bare hash.
  - Viewport meta lacks `viewport-fit=cover` unlike every other page (index.html:5).
  - Header variant #3 again (no `aria-current`, no Settings).
- **Redesign recommendations**:
  - P1: Shared docs typography and header with Controls; fix the tab list to cover all sections (or make it a sticky TOC); allow selection.
  - P2: Sticky first column / horizontal scroll hint for tables; put dataset metadata (engine, date, machine) in a consistent "measured on" chip per section.
  - P3: Remove dead CSS/markup; move the device measurement into a card with a progress state.
- **Constraints to preserve**: `tests/native-backends.cjs`/`adaptive.cjs` use `#speed-content table`, labels "Browser", "Analysis setting", "Cache condition", "Automatic search browser", button "Run measurement", `getByRole("table")`, `tbody tr`; `BG_SHELL` includes `reports/report.css`.

---

## Cross-page summary

### Palettes and font stacks in use
| Where | Background | Surfaces | Text | Accent | Font |
|---|---|---|---|---|---|
| Site base `shared/hub.css` | `#08090d` | `#10141c`, `#151a24`, glass | `#eef4ff` / `#9aa7b7` | `#9bd6c9` (family) | Inter + `cv11 ss01` |
| Family `backgammon/styles.css:2` | `#11191d` | `#172126`, `#202d32`, `#0d1519` | `#eeeade` / `#b0c0c1` | `#9bd6c9`, ink `#112a26`, danger `#ffb4a8`, undo `#e9ad67` | Inter + `tnum`, 15px root |
| Update gate dialog (173) | — | `#172226` fallback | `#f0eee5` | `#9dd5c9` | `system-ui` |
| Route placeholders, refresh page | `#11191d` | — | `#eeeade` | `#9bd6c9` | `system-ui` |
| Keycaps (3912), hex inputs | — | — | currentColor | — | `ui-sans-serif`, `ui-monospace` |
| Board (runtime `--board-*`) | 24 presets in `core/appearance.mjs:191–540`, 34 roles, 11 patternable surfaces | | | | SVG text 14–30px bold |
| Loss tones (2304) | `#86bfff #8ddbad #e4d37e #f1b078 #ff9398` | | | | |
| Toast (930) | `#d4e8df` on `#182b25` | | | | |

Nine distinct greys/teals stand in for "surface" across the family; three font stacks; 19 font sizes; 17 radii; 13 shadow values.

### Duplicated components that should become one shared component
1. **Page header**: hub (hub.css crumbs + switcher) vs tool shell (`shell.mjs:241` brand/nav/Settings/sound) vs docs pages (controls/reports static topbar without Settings or `aria-current`) vs refresh (brand only). One `<header>` with site crumbs + family nav + tool actions.
2. **Dialog/sheet**: `.dialog`, `.drawer`, `.settings-dialog`, `.decision-dialog`, `.history-dialog`, `.session-dialog`, `.practice-controls-dialog`, `.tool-menu-dialog`, `.app-update-dialog`, `.opening-roll` — ten skins over `shell.mjs dialog()`. Keep one component with `size` and `sheet` variants.
3. **Help/practice action rows**: Play `.help-cluster/.action-help` + `#all-controls` sheet vs Trainer `.trainer-help` vs Solver `.study-editor`.
4. **Decision value displays**: `.decision-values-compact` (Play history), `.decision-loss`+`details` (Trainer), `.review-moves` ranked rows (review dialog), `resultView` `.list-row` (Trainer/Solver), `.session-decision` rows, `.library-session-players` — six renderings of "played / best / loss".
5. **Pressed/segmented toggles**: `.segmented`, `.settings-tabs`, `.appearance-tabs`, `.decision-tabs`, `.history-tree-tabs`, `.history-filters`, `.decision-choices`, `.mobile-tool-list [aria-pressed]`, `.review-move[aria-pressed]` — each with its own pressed colour recipe (surface fill / accent fill / inset shadow / border).
6. **Dice**: HTML `.die` (568, 2250, opening roll 1690–1740, theme samples) and SVG `.board-die` share no code; keycap SVG is already shared — do the same for dice.
7. **Player identity chips**: `.checker-dot`, `.history-player::before`, `.history-filter-label::before`, `.library-session-player strong::before`, `.opening-name i` — five copies of the same 8–12px dot.
8. **Visually‑hidden utility**: hub.css `.visually-hidden`, styles.css `.sr-only` (944), inline clip rules at 2420, 3404, 3985.
9. **Docs stylesheets**: `controls.css` and `report.css` both reinvent a reading column, h1 clamp, tables and a mobile table collapse.

### Token drift from the site base
- Different page/surface/line/ink/muted values (see table); `--radius 10px` vs 16px and never used; no `--ease/--spring` (family uses ad‑hoc `cubic-bezier(.2,.75,.3,1)`, `(0.2,0.8,0.2,1)`); 92 hex literals in `styles.css`; two `:root` blocks; `theme-color #11191d` on every page vs site `#08090d`; hub disables the site's aura/dot‑grid.
- Breakpoints: site uses 880/640/480; family uses 1100, 1024, 900, 820, 700, 650, 640, 600, 500, 360 plus height gates 500/550/600/760.
- Type: site hero `clamp(2.3rem,5.4vw,3.9rem)/800`; family h1 20px/600 in tools, 48px on hub, clamp(25–36) on controls, clamp(28–44) on reports.

### Things to keep (explicitly)
- The **board palette system** (`core/appearance.mjs`, `ui/appearance.mjs`): 24 validated presets, 34 roles, patterns, contrast warnings, `--board-*` custom properties consumed by both SVG and HTML dice. Tests cover it (`appearance.cjs`, `mobile-settings.cjs`).
- The **offline/update shell**: `sw.js`, `offline-manifest.js`, `ui/updates.mjs` gate dialog behaviour, `refresh/` standalone page, `?bgv=` cache‑busting on every `<link>/<script>`.
- Board interaction CSS (`.point.*`, `.source-ring`, `.landing-ring`, `.drag-*`, `.board-die.*`, `.dice-switch`) and motion modules — they are behaviour, not skin; only their colour sources should move to tokens.
- Reduced‑motion handling (1359–1372 + `data-motion`), 44px targets, phone bottom sheets with keyboard‑viewport fitting, decision‑history grouping/filters, keycap badges on desktop.
- Every id/class/aria name listed under "Constraints" above; the Playwright suite (120+ files) is selector‑driven.

### Three biggest wins
1. **Rebuild `styles.css` on the site tokens with one breakpoint system and no append‑only overrides** — removes ~40% of the file (duplicate selector blocks, dead `.focus-mode`/`.pill`/`.feedback-title`/`.die-reveal`, redundant `.panel-toggle` rules), fixes font/radius/colour drift, and gives the hub, tools and docs pages one header and one dialog component.
2. **Scope `user-select:none` and the focus‑suppression rule to the game surfaces** (`styles.css:3979–3981`) and use `:focus-visible`; this immediately fixes the Controls and Reports pages (unselectable reference text and tables) and removes two `!important`s.
3. **One decision‑value / ranked‑move component and one help‑row component** shared by Play, Trainer, Solver, Library and the review dialog — the family's most repeated UI, currently six and three implementations respectively, each with its own type sizes and pressed states.
