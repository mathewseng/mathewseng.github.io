<!-- Corrections after independent verification: the Dodge simulator's `.review-banner` is dead CSS (review mode is signalled through `.prompt.alert`), Dodge's base desktop sizes are 8–10px with 7px only below 1150px, and 222 also scrolls its dialog body and two horizontal regions internally although the page itself is a scrolling document. -->
<!-- Detailed audit appendix. Generated 2026-10-16 from a read-only review of commit 8c0efdb; line numbers refer to that commit. See ../notes.md for the synthesized page-by-page notes and ../prompt.md for the overhaul brief. -->

# Group D — Poker tool / report pages (read-only audit)

Scope: `poker/222/`, `poker/dodge/`, `poker/dodge/simulator/`, `poker/calculations/`.
Site base for comparison: `shared/hub.css` (`--page #08090d`, `--surface #10141c`, `--surface-2 #151a24`, `--line rgba(148,163,184,.13)`, `--ink #eef4ff`, `--muted #9aa7b7`, `--soft #6f7b8b`, poker accent `--accent #ff8b83` / `--accent-2 #ffb77a`, `--radius 16px`, Inter with `cv11 ss01`, animated accent aura + dot grid on `body::before/after`).
Shared card component: `shared/cards.js` (`PlayingCards.html/element`, markup `.playing-card.suit-h > .card-suit + .card-rank`, 5:7 ratio, container-query sizing via `--card-width`) + `shared/cards.css`.

None of the four pages links `shared/hub.css`; each carries its own `:root` palette. Two of the four pages (`dodge/`, `dodge/simulator/`) use the shared card component correctly; `222/` renders its own card markup and CSS; `calculations/` has no playing cards at all (rank-level data only).

Tests: all `tests/*.test.mjs` under these pages import engine/solver modules only (no DOM, no HTML parsing). The only DOM-shaped test that touches this group's dependencies is `shared/tests/cards.test.cjs`, which pins the shared card markup. See "Constraints" per page.

---

## poker/222/ — "222 · Simulator, spot solver & cube trainer"

### Purpose & audience
Analysis workbench for the six-card flip game 222: table simulator (2–7 seats), spot solver, doubling-cube trainer vs an equilibrium bot, PeerJS online rooms, and precomputed cube reports. Audience: the author and poker-math-literate friends; dense, numbers-first.

### Screens / states / flows
- Single page, five tab views toggled with `[hidden]` (`index.html:36-42`, `app.js:14-24`), hash routed (`#sim`, `#spot`, `#trainer`, `#online`, `#reports`, or a 4–6 char room code → online lobby prefill).
- **Simulator** (`index.html:45-119`): toolbar (players segmented, precision, scoring, "Table hands" checkbox, New board / New deal), street bar (Preflop/Flop/Turn/River step buttons + Back/Next), board strip (5 card slots + meta tags such as "Tabled · perfect information" / "Hidden hands · numbers vs range" + runout counts + ms), cube panel (2 players only; cube face, title/subtitle, variant/button/cube/drop selects, option tables), seat cards grid, deck panel (13×4 button grid for swapping cards). Loading state: "Computing…" in meta; solver progress text "Solving the equilibrium… NN%" (`simulator.js:109`); error: `sim-meta` text "Computation failed: …" (`simulator.js:124`). Seats render with `.pending` (stat values at 0.55 opacity) and "…" placeholders while computing.
- **Spot solver** (`index.html:122-183`): two-column grid: form card (seat inputs generated per player count, board input, scoring, cube controls, precision, Table hands, Random spot / Copy from simulator / Solve) + result column (board strip, cube panel, seats). Empty state: `#spot-empty` paragraph. Error: `#spot-error` red text. Progress: same "Solving…" string in `#spot-meta`.
- **Cube trainer** (`index.html:186-261`): toolbar (variant, scoring, drop cost, "You are", peek checkbox, precision, Reset score / New hand), table column (score row You / cube face / Bot, street steps + review note, board strip, prompt box, action row, two seats), side column (Cube analysis, Session stats, Log). Idle prompt "Press New hand to deal."; `.prompt.alert` when it is the user's decision; action buttons become sticky bottom bar on ≤640px (`styles.css:333`).
- **Play online** (`index.html:264-337`): lobby card (name, Create room, join code + Join, Resume last table, error) → room: toolbar (room code, status, Copy invite, Leave), settings panel (host), table (street bar, board strip, compact cube panel, prompt, actions, seats), side (Players roster with online dots, Last cube decision, Log). Error if PeerJS failed: "The peer connection library did not load." (`online.js:24`).
- **Reports** (`index.html:340-342`, `reports.js`): lazy-fetches `data/cube-report.json`; renders drop-cost sweep cards, equilibrium cards with KPI tiles + report tables + inline bar cells + histogram tables, and face-up comparison cards. Loading copy "Loading cube reports…"; error paragraph.
- **Rules & method** `<dialog>` (`index.html:345-375`), full-screen on ≤640px.

### Current visual language
- Palette (`styles.css:1-22`): `--bg #111417`, `--panel #191d21`, `--panel-raised #20252a`, `--line #30363b`, `--soft-line #272d32`, `--text #eef0f2`, `--muted #9da7af`, `--faint #74818b`, `--green #55d7b1` (the accent), `--red #ff7d75`, `--amber #eeac61`, plus its own suit colours `--spade/--heart/--diamond/--club` (`#52575c/#b40d08/#3449ce/#05a82b`) that differ from `shared/cards.css` (`#504f4f/#9f2517/#2634bd/#4faa41`).
- Font: Inter stack, **root 13px** (12.5px ≤640px). Type scale: h1 24px, h2 14px, h3 13px, labels 11px uppercase tracked, metric labels 9.5–10px, tags 10px, cube owner 8px. Many sizes below 11px.
- Radius: 5–6px controls, 8px hand groups, 10px panels, 12px dialog/lobby. Shadows: nearly none except the cube face (`0 4px 10px #0008`) and selected-card ring. Backgrounds: flat panels on flat bg; no aura/dot grid.
- Animations: `pop` on new cards (0.25s, disabled under reduced motion `styles.css:340-342`); no transitions on buttons/tabs.
- Relation to hub tokens: **completely different palette and accent** (teal-green `#55d7b1` instead of poker coral `#ff8b83`; warm-grey `#111417` page instead of `#08090d`). Tokens are named differently (`--bg/--panel/--text` vs `--page/--surface/--ink`). Theme-color meta is `#111417` (`index.html:6`).
- Topbar brand: a green square "2" mark + "222" + "FLIPS & CUBE" (`index.html:16-26`), unlike the other three pages' brand treatments.

### Layout
- Document scrolls as a whole (`main { max-width: 1240px; padding-bottom: 90px }`, `styles.css:82`). Not an app shell — contradicts README's "pages are app shells: on desktop they fit the viewport and long panels scroll internally". Only `.log` has an internal scroll (`max-height: 320px`, `styles.css:240`).
- Breakpoints: 960px (grids collapse to one column; `styles.css:312-315`), 640px (font 12.5px, hide heading paragraph, 1-col seats, smaller cards, sticky action row, full-screen dialog; `styles.css:316-339`). Container queries on `.seat` at 420px/300px (`styles.css:178-186`).
- Seat grid `repeat(auto-fill, minmax(330px, 1fr))`; hand groups 3-up inside each seat; the preflop view embeds a `.preflop-table`.
- Tables: `.cube-table` (5 columns) is placed directly in the cube panel with no horizontal scroll wrapper (`ui.js:218-247`, `cube-view.js:78-92`); on a 360px phone the Option / Mix / Equity / Loss / flag columns will squeeze and the `.tag` flags wrap. Reports tables are wrapped in `.table-wrap { overflow-x:auto }` (`reports.js:75`).
- Charts: a `.chart` SVG style exists (`styles.css:294-300`, `.chart-tip`) but nothing in `reports.js` emits an SVG — histogram is a table with `.bar` divs. `.chart`, `.legend`, `.chart-tip` CSS appear unused.
- Deck grid: 13 columns, `max-width: 640px`, rank size via `clamp(12px, 2.6vw, 20px)` (`styles.css:191-195`).

### Controls inventory
- Buttons: base (raised panel), `.primary` (green fill, dark text), `.quiet` (transparent), `.danger`; min-height 36px; focus ring `2px solid var(--green)` offset 3px (`styles.css:37`).
- Tab bar: underline tabs (`.tabs > button.active` with green bottom border), horizontally scrollable, scrollbars hidden (`styles.css:87-90`). Buttons carry `aria-current="page"` (not `role="tab"`).
- Segmented control `#player-count`, `#spot-count` (active = solid green).
- Selects/inputs: dark `#12171b` fill, 1px `#394149` border, 36px min height. Spot inputs are monospace uppercase (`styles.css:252`).
- Checkbox labels `.control.check`.
- Street steps (`.street-steps > button` 32px high, 12px).
- Cards: custom `.playing-card` (36×48, 30×40 on mobile; `.sm` 28×38) with `.h/.d/.c` suit classes and `.suit/.rank` children (`styles.css:118-135`, `ui.js:70-83`). Renders "10" not "T" (`ui.js:74`) — breaks the site convention.
- Deck cards: `<button class="deck-card">` wrapping a card plus `.who` badge; disabled unless a card is selected.
- Cube face: cream gradient square with value + owner label (`styles.css:206-210`).
- Tables: `.cube-table`, `.preflop-table`, `.points-table`, `.report-table` — four near-identical table styles (`styles.css:167-170, 211-218, 243-245, 286-289`).
- Stat tiles: `.metric` (`.stat-label` + `.stat-value` with inline heat colours), `.kpi`, `.score`, `.cube-stats`.
- Progress: textual only (no bar).
- Dialog: `.dialog-head` sticky + `.dialog-body` scroll.

### Problems found
1. **Does not use the shared card component** — `ui.js:70-83` builds its own markup; `styles.css:116-136` and `:327-330` restyle it; suit colours differ from `shared/cards.css`; ten renders as "10" not "T"; no `aria-label` on cards (only `title`). This is the single biggest convention violation in the group.
2. Palette/accent drift: green `#55d7b1` accent and `#111417` page vs site poker coral `#ff8b83` on `#08090d` (`styles.css:3-13`). `theme-color` `#111417` (`index.html:6`).
3. Not an app shell; whole page scrolls (`styles.css:82`).
4. Root font 13px with many 9.5–11px labels (`styles.css:95, 148, 168, 172, 175, 210`) — legibility and WCAG contrast risk for `--faint #74818b` on `#191d21` (~3.6:1) at 10px.
5. Tabs use `aria-current="page"` on `<button>`s and no `role="tablist"`/`tab`/`tabpanel` (`index.html:36-42`, `app.js:17-19`).
6. Cube option table has no overflow wrapper → cramped/overflowing on phones (`ui.js:218-247`); `.cube-table td/th` only reduce padding at 640px (`styles.css:336`).
7. Hard-coded colours everywhere outside tokens: `#2b3339/#52616b` hover (`styles.css:35`), `#12171b/#394149` inputs (`:40-41`), `#c0c8ce` quiet text (`:59`), `#0c241b` primary text (`:60`), `#83e7c7` (`:61`), `#7a2a26/#9c3a35` (`:62`), `#0e1114` topbar (`:71`), `#1b2a26` (`:108`), `#14181b` (`:155, :284`), `#7fb5ff` (`:150, :158, :292`), `#1d2a3a`, `#2a2234/#d4b2ff` (`:150-151`), `#4a2424` (`:153`), `#2f6d5a` (`:142`), `#2a3036` (`:126, :148`), cube face gradient (`:206`), `#000a` backdrop (`:304`), `#1114170a` sticky gradient (`:333`). JS also bakes the heat scale RGB triples (`ui.js:43-62`).
8. `!important` on `[hidden]` (`styles.css:56`) — acceptable but should be a shared rule.
9. Dead / duplicated CSS: `.hand-group.whole .hand-metrics` declared three times in a row (`styles.css:164-166`); `.chart`, `.chart text`, `.chart .axis`, `.legend`, `.chart-tip` unused (`:294-300`); `.brand-mark span { display:none }` hides markup that exists only to be hidden (`index.html:18`, `styles.css:77`); `.playing-card.sm` unused by JS.
10. Magic numbers: `max-height: 320px` log, `min-height: 68px` board strip, `min-width: 110px` action buttons, 340px/300px/320px sidebar widths (`styles.css:224, 248, 265`).
11. Hover/focus: `.deck-card:hover .playing-card` inset ring but `button.deck-card:focus-visible` relies on the global outline which is clipped by nothing — fine; however the clickable `span.playing-card` in seats (`ui.js:141-144`) is a **span with a click handler**: not keyboard focusable, no role.
12. `.tabs` hides its scrollbar (`styles.css:88`) so overflow on narrow screens is undiscoverable; the fifth tab "Reports" is likely off-screen on 360px.
13. Copy: heading says "Six cards. Three hands. One cube." on desktop and just "222" on mobile (`index.html:30`); page paragraph hidden ≤640 (`styles.css:320`) — fine but mobile loses the only explanation.
14. The reports view's loading/error states are plain paragraphs; no skeleton.
15. `select` inside `.cube-controls label` lacks explicit `for`/`id` but is nested — OK; but `label hidden` for "History" (`index.html:105, 148`) toggled from JS; fine.
16. Progress for long solves is text-only and appears in two different places (meta strip vs prompt) depending on view.
17. Reduced motion: only the card pop is suppressed; no transitions elsewhere, so low risk.
18. `--spade/--heart/--diamond/--club` tokens duplicate the shared card tokens under different names.

### Redesign recommendations
- **P1** Replace `cardEl/cardBack/cardsRow` in `ui.js:70-88` with `PlayingCards.element(...)` (set `className`, `interactive`, `selected`, `title`, `attrs: {"data-card": c}`), link `shared/cards.css`, delete `styles.css:116-136, 327-330`, and drive sizes with `--card-width` on `.board-cards`, `.cards`, `.deck-grid` (use `.deck-matrix` from cards.css for the deck). Make clickable cards `<button class="playing-card">` (tag option) for keyboard access.
- **P1** Adopt `shared/hub.css` tokens: `--page/--surface/--surface-2/--line/--ink/--muted/--soft/--accent(#ff8b83)/--accent-2/--radius`. Map green "good"/red "bad" semantics to `--stand/--hit` from hub (`#8fd9b6/#ff8b83`) so EV heat scales stay readable while the UI accent becomes coral. Update `theme-color`.
- **P1** Convert to an app shell: fixed topbar + tabs, each `.view` a flex column that scrolls internally; seats/deck/cube in a two-column split like dodge simulator's `.split`. Keep whole-page scroll only on phones.
- **P1** Wrap `.cube-table` output in a `.table-wrap` (or convert to the dodge-simulator "option rows with bars" pattern, which is far more phone-friendly).
- **P2** Raise base type to 14px and set a 4-step scale (11/12/14/18/24); floor labels at 11px; use `--muted` not `--faint` for anything under 12px.
- **P2** Replace the five table styles with one `.data-table` and one `.stat-tile` component shared with the other pages (see cross-page).
- **P2** Proper tabs semantics (`role="tablist"`, `role="tab"` + `aria-selected`, `role="tabpanel"`), tab overflow indicator or wrap on phones.
- **P2** One progress component (thin bar + label) used by simulator, spot, trainer.
- **P3** Remove dead CSS (`.chart*`, `.legend`, `.chart-tip`, duplicate `.hand-metrics` rules), tokenize the remaining hex colours, consolidate `.tag` variants.
- **Keep**: the information model (board strip → cube panel → seats → deck), the 3-hand group layout with coloured top borders (`.h1/.h2/.h3`), container-query seat behaviour, the cube face motif, the sticky action row on phones, hash routing and room-code prefill.

### Constraints to preserve
- `poker/222/tests/engine.test.mjs`, `poker/222/tests/solver.test.mjs`: pure engine/solver tests, no DOM; safe for any markup change.
- JS depends on these ids/classes (keep or rename in lockstep): all `#sim-*`, `#spot-*`, `#tr-*`, `#on-*`, `#reports-body`, `#rules-dialog`, `#rules-button`, `[data-close]`, `.tabs > button[data-tab]`, `#view-{sim,spot,trainer,online,reports}`, `#player-count`/`#spot-count` segmented buttons (active chosen by `Number(x.textContent)` — `simulator.js:259`, `spot.js:79`, so button text must stay the digit), `.street-steps` button classes `active/done`, `.prompt.alert`, `.seat.me/.pending`, `.deck-card.held`, `.cube-table tr.best/.chosen`, `.tag.good/.bad/.btn-tag/.range-tag/.info-tag`.
- If cards move to the shared component, `shared/tests/cards.test.cjs` pins the shared markup — do not fork it.
- `online.js` uses `localStorage` and hash `#CODE` → keep `prefillCode` flow.

---

## poker/dodge/ — "Dodge · Hand reports"

### Purpose & audience
Static research report over all 16,432 four-card starting hands in Dodge (draw-until-you-bust): explorer table, hand inspector, population charts, and a game-design lab. Audience: the author / game designers; data-heavy, desktop-first with a carefully built phone mode.

### Screens / states / flows
- Fixed chrome: topbar (brand "d•DODGE RESEARCH", dataset status dot, Simulator link, Rules button, MS link), heading row with pill tabs (Hand explorer 16,432 / Population reports / Game design lab) and Export CSV button, filter panel (search, pairing, suits, high card, connectivity, weighting, Reset; metric-rule builder "+ Metric filter"; "Pinned hands" checkbox; population label; phone-only Filters toggle + "Show N matching hands" apply button), 4-tile summary strip.
- Load states: `#loading` pulsing dot "Loading the complete hand universe…" (`index.html:81-83`), `#load-error` role=alert; `#app` hidden until data arrives (`app.js:init`).
- **Explorer**: table panel (toolbar with column preset select + Columns dialog, sticky-header/sticky-first-column scrolling table with aggregate + baseline rows pinned under the header, pagination), side column (hand inspector `#hand-detail`, pinned comparison `#comparison-panel` shown with ≥2 pins, two overview chart panels). Empty state `.empty-cell` "No matching hands…" (`app.js:483`). On phones the inspector becomes a bottom-sheet `<dialog id="hand-dialog">` and a `#reopen-hand` bar sits under the table.
- **Reports**: 2–3 column grid of chart panels (survival line chart, hazard, scatter canvas with tooltip, 13×13 rank heatmap of buttons, texture rows with group-by select, joint distribution chart + legend).
- **Lab**: two panels — survival bet designer (range slider, house-edge number input, payout summary tiles, line chart, small table) and Draw lab (live hand with drawn-card underline, Draw random / Undo / Reset runout, live stats banner with `.busted` state, outs deck grid of `<button class="outs-card">`, legend).
- Dialogs: hand report sheet, Rules & methodology, Choose table columns; `#toast` for copy/export/pin-limit messages (`app.js:316-320`).
- Keyboard: `/` focuses search (`app.js:1182`); `shift+click` multi-sort.

### Current visual language
- Same palette as 222 minus red/amber tokens: `--bg #111417`, `--panel #191d21`, `--green #55d7b1`, `--green-dark #213e35`, `--scrollbar` (`styles.css:5-28`). Root font 13px (14px ≤700px). Inter.
- Type scale is very small on desktop: breadcrumb 9px, h1 18px, h2 14px, panel-heading p 10px, tags 8px (`:553-561`), table 11px/th 10px, td first-col sticky, outcome rows 9–10px, detail eyebrow 9px, detail dt 9px, detail note 9px, legend 9px, footer 9px, aggregate small 8px, heatmap cell 7–8px (`:1207-1215, :1589-1591`). The phone breakpoint deliberately bumps everything to 11–15px, which proves the desktop sizes are too small.
- Radius 4–8px; no shadows except dialog `0 20px 100px #0007` and toast; backgrounds flat; `dialog::backdrop` blurred.
- Animation: `pulse` loading dot; `.filter-chevron` rotate; global reduced-motion kill switch with `!important` (`:1699-1706`).
- Relation to hub: same drift as 222 (green accent, warm-grey panels). Theme-color `#111417`.

### Layout
- True app shell: `html, body {height:100%}`, `body {overflow:hidden; display:flex}`; `main` flex column; `.view {flex:1; min-height:0}`; the table scrolls in `.table-scroll`; the side column scrolls in `.explorer-side`; reports and lab views scroll themselves (`styles.css:32-43, 238-253, 636-660, 1092, 1237-1250`). `max-width: 1840px`.
- Breakpoints: ≥1300 (wider side column, card width 31px), ≥1200 (3-col report grid), ≤1299 (hide heading paragraph), ≤1150 (tighter paddings, hide breadcrumb/status), ≤850 (tablet: explorer becomes block scroll, inspector grid 2-col under table), ≤700 (phone: font 14px, 40px controls, 16px inputs, 3-col pill tabs, collapsible filters, summary 4 cols, table-only scroll, side column hidden, dialogs become bottom sheets, heatmap and outs grid scroll horizontally, footer hidden).
- Charts are inline SVG with `viewBox` computed from the container width and viewport height (`app.js:210-240`, `charts.mjs`) and re-rendered on resize (`app.js:1158-1176`); scatter is a canvas sized to `clamp(200px, 30vh, 300px)` (`styles.css:1172`).
- Tables: sticky header (z-index stack 3–7, `styles.css:715-808`), sticky first column (`min-width:199px`), aggregate and baseline rows sticky at 38px/82px (40/80 on phones) — a lot of pixel coupling to row heights.

### Controls inventory
- Buttons: base/`.primary`/`.quiet`/`.text-button`; `.reset`; `.filter-toggle`; `.filter-apply` (dark-green fill variant); pagination arrows; pin buttons (`●/○` glyph buttons, 17px wide on desktop — `styles.css:814-823`); `.hand-button` wrapping cards; `.texture-name`; `.heatmap-cell`; `.outs-card`.
- Pill tab bar with count badge (`.tabs`, `styles.css:301-337`); `aria-current="page"` and `aria-label` on buttons (`index.html:52-69`).
- Inputs: search (type=search), selects, number inputs, range slider with `<output>`, checkboxes, metric-rule rows (select/select/number/×).
- Summary strip `.summary-item` (value left, label + caption right; `styles.css:470-532`).
- Panels `.panel` + `.panel-heading` (h2 + p + optional `.tag`).
- Charts: SVG histogram / line chart (`charts.mjs`), `.outcome-row` bar list, `.spark-hist`, `.mini-stack`, canvas scatter + `.scatter-tooltip`, `.rank-heatmap` grid of buttons, `.texture-row` 5-col grid, `.heatmap-key` gradient, `.legend` swatches.
- Cards: shared component via `PlayingCards.html` (`app.js:303-307`); page sets `--card-width` on `.cards` (29/31px desktop, `clamp(25px, 7.7vw, 30px)` phone, `.large` 43/44px; `styles.css:843-853, 2098-2103`) and `.outs-card` width 100% up to 48px. Correct.
- Dialogs ×3, toast, footer.

### Problems found
1. Desktop type sizes 7–10px across the board (`styles.css:269, 549, 556, 597, 679, 693, 721, 779, 782, 969, 989, 1000, 1023, 1040-1046, 1133, 1151, 1162, 1201, 1212, 1225, 1296, 1312, 1321, 1426, 1591`) — fails readability and, with `--faint #74818b`, contrast. The 8px `.tag` with 1px tracking (`:553-561`) is illegible.
2. Palette drift from hub (same as 222); hard-coded hex outside tokens at `styles.css:62-63, 80-81, 127, 138, 141, 147-148, 174, 320, 323, 329, 336, 424, 554, 581, 585, 613, 719-724, 751-754, 770-772, 784, 804, 819, 828, 876, 1183-1184, 1232, 1356, 1363-1365, 1461, 1465, 1468, 1531-1532, 1901, 1932-1933`; in JS `app.js:464` (`rgba(62,159,118,…)` row tint), `:566-596` (`#55d7b1`, `#6c7b88`, `#eeac61` legend/series), `:636` (`#55bd99`), `:641-645` (texture palette), `:666-667, :703` (canvas axis colours), `:758-759` (heatmap RGB formula), `:792`; `charts.mjs:74` (`#70e0bb/#3a9b7d`). Engine `COLORS` for bust categories live in `engine.mjs:12`.
3. `!important`: `[hidden]` (`:122`), `.mobile-only` (`:162, :1715`), `.desktop-only` (`:1718`), `.empty-cell` (`:920-921`), reduced-motion (`:1703-1704`), `.reopen-hand` (`:2143`), `.filter-apply` (`:1937`), `.mobile-hint` (`:2283`) — the mobile/desktop visibility pair is used 20+ times in markup and JS templates (`index.html:43-78, 157-189`, `app.js:362, 412, 479`) which bakes two copies of labels into the DOM.
4. Sticky z-index ladder (`:715-808`) and hard-coded sticky `top` offsets tied to row heights (38/82, 40/80) — fragile; will break the moment row height changes in a redesign.
5. `th:first-child { min-width: 199px }` (`:762`), `.outcome-row { grid-template-columns: 107px 1fr 53px }` (`:593`), `.texture-row` 5 pixel-set columns (`:1110, :1582, :2239`), `.scatter-tooltip max-width:190px`, `.numeric-rule input width:75px` — magic widths.
6. Pin buttons are 17px wide with glyph-only content (`:814-823`); touch target far below 44px on desktop, hidden entirely on phones (`:2077-2079`) so pinning is desktop-only from the table (only the inspector offers it on phones).
7. Heatmap cells are `<button>`s with 7–8px text and `outline` only on hover (`:1207-1219`); keyboard focus uses the global ring (fine) but colour is the only encoding of value besides a tiny number.
8. Canvas scatter plot has an `aria-label` but no accessible data alternative; tooltip is hover-only.
9. `html:has(dialog[open]) { overflow:hidden }` (`:341-343`) is redundant with `body {overflow:hidden}`.
10. `.explorer-charts .tag { display:none }` then re-shown at ≤850 (`:942-944, :1625-1627`): the `.tag` is a decorative "DISTRIBUTION"/"SCENARIO" label that adds little.
11. Heading row hides the h1 text visually on phones via a hand-rolled clip (`:1786-1792`) while the page also defines `.sr-only` (`:150-160`) — two visually-hidden implementations.
12. Information hierarchy on desktop: summary strip, filter panel and the table toolbar all use 9–11px grey text; the 20px summary numbers are the only emphasis. Panel headings (h2 14px) are smaller than table values in places.
13. Two brand treatments across dodge pages: report "d•DODGE RESEARCH" vs simulator "d•DODGE SIMULATOR"; the "•" uses a 22px/30px green dot inside a 30/34px letter — in both cases an ad-hoc wordmark unrelated to the hub's brand.
14. Reduced-motion rule kills *all* animations with `!important` — acceptable, but `scroll-behavior: auto !important` is redundant with the one `behavior:"smooth"` call (`app.js:1155`).
15. Export button in the heading row (desktop) moves into the table toolbar on phones via JS DOM moves (`app.js` "syncResponsiveLayout") — extra complexity a CSS-only layout could avoid.

### Redesign recommendations
- **P1** Re-token to hub (`--page/--surface/--surface-2/--line/--ink/--muted/--soft/--accent #ff8b83`), keep green only for "survive/good" semantics (map to `--stand #8fd9b6`), red for bust (`--hit`). Update `theme-color`, canvas colours and legend swatches to read tokens via `getComputedStyle` or CSS vars on `.swatch`.
- **P1** Type: base 14px; minimum 12px for any text; labels 12px/uppercase only where they are true eyebrows; panel h2 16px; remove the 8px `.tag`.
- **P1** Keep the app-shell layout and phone mode (they are the best in the group) but remove the sticky-offset magic by using CSS variables for header/aggregate row heights, and give the pin control a ≥32px hit area.
- **P2** Replace the `.desktop-only/.mobile-only` duplicate-label pattern with single labels and `@container`/`@media` truncation; drop `!important`.
- **P2** Unify chart surfaces: histogram, line chart, bar list, heat cells, sparkline, mini-stack → one chart stylesheet shared with the simulator and 222 reports; expose the category palette as CSS custom properties (`--cat-straight …`) consumed by both CSS and JS.
- **P2** Add an accessible table alternative or `<title>` elements for the scatter canvas points; make heatmap cell text ≥11px and add a text-based value on focus.
- **P3** Fold `.sr-only` + hand-rolled clip into one utility; delete redundant `html:has(dialog[open])`; move export button with CSS `order` rather than JS.
- **Keep**: shared cards usage and `--card-width` discipline; filter-rule builder; column presets + Columns dialog; sticky aggregate/baseline rows (concept); bottom-sheet dialogs on phones; `/` shortcut; charts sized to container with re-render on resize; toast.

### Constraints to preserve
- `poker/dodge/tests/report.test.mjs`: data-only (reads `data/hands.json`, uses `../../play/evaluator.js`); no DOM.
- JS depends on ids: `#dataset-status, #method-button, #export-button, #loading, #load-error, #app, #search, #filter-toggle, #filter-count, #advanced-filters, #pairing, #suits, #high, #connected, #weighting, #reset-filters, #add-rule, #pinned-only, #pin-count, #population-label, #scope-weight, #numeric-rules, #filter-apply, #summary, #explorer-view, #column-preset, #columns-button, #hand-table (thead/tbody), #page-status, #page-size, #previous-page, #page-number, #page-total, #next-page, #hand-detail, #comparison-panel, #overview-hist, #overview-outcomes, #reopen-hand, #reopen-hand-cards, #reports-view, #survival-chart, #hazard-chart, #scatter, #scatter-tooltip, #scatter-legend, #rank-heatmap, #group-by, #texture-chart, #joint-chart, #joint-legend, #lab-view, #target, #target-label, #house-edge, #payout-summary, #payout-chart, #payout-table, #reset-runout, #live-hand, #draw-random, #undo-draw, #live-stats, #outs-grid, #outs-legend, #footer-provenance, #footer-method, #hand-dialog, #hand-dialog-content, #method-dialog, #method-content, #columns-dialog, #column-choices, #toast`; data attributes `data-tab, data-close, data-sort, data-pin, data-hand, data-row, data-rule, data-rule-field, data-remove-rule, data-group, data-group-value, data-ranks, data-use-lab, data-copy-hand`; classes toggled by JS: `.active, .filters-open, .selected, .pinned, .busted, .held, .danger, .drawn-card, .aggregate-row, .baseline-row, .empty-cell`.
- `matchMedia("(max-width: 700px)")` and `(min-width: 851px)` in `app.js:34-36` must match the CSS breakpoints if those move.
- Shared card markup pinned by `shared/tests/cards.test.cjs`.

---

## poker/dodge/simulator/ — "Dodge · Table simulator & cube trainer"

### Purpose & audience
Live table simulator (2–4 seats) with equity/bust odds, a doubling-cube trainer vs a solver bot, PeerJS online rooms, and self-play reports. Audience: the author and playtesters; the cube-analysis UI is the most "designed" piece in the group.

### Screens / states / flows
- Topbar holds brand, the pill **tab bar** (Table simulator / Cube trainer / Play online / Reports) and actions (`index.html:20-41`); `h1` is screen-reader only (`:43`).
- **Simulator**: toolbar (players segmented, Ace-high and Cube-mode checkboxes, precision select, Back/Forward stepping, Draw card, Play out, New deal), "Solve a spot ▾" disclosure bar → spot panel (per-seat text inputs, On turn / Cube / Cube value selects, Copy link / Load spot, error text), split layout: main (summary strip of 5 stat tiles: Status, Deck, Deck runs out, Games simulated, Compute; seats grid) + side (cube panel with face, title/subtitle, action buttons, option rows; deck panel using `.deck-matrix`). Compute state shows "running…" in the Compute tile (`app.js:492`); seat metrics show "…" with `.pending` colour; cube table shows "Solving…" (`app.js:617`); error → Status tile "Error: …" (`app.js:474`). Deck cards get `.danger` (bust) or `.shaded` (win-chance outline via `--shade`).
- **Trainer**: toolbar (ace-high, peek, precision, Back/Forward, Resume live, Reset score, New game), table card (score row You / cube face / Bot, seats, prompt, action row), side (Cube analysis, Session, Log). `.review-banner` when stepping back.
- **Online**: lobby as a `.report-card` with name field, two `.online-form` cards (Create: seats segmented + checkboxes + Create room; Join: code + Join + Resume), error text → room: toolbar (room code + `.conn` dot state, roster, Copy invite / Leave / Start game), summary strip, split main (prompt, actions, seats) + side (cube panel, log).
- **Reports**: "Loading precomputed reports…" → sections (`.report-section` h2 + p), `.tiles-row` KPI tiles, `.report-grid` of `.report-card`s containing `.bars` lists, `.mini-table`s, and a 14×14 `.heatmap`.
- Rules dialog (`index.html:324-402`). Keyboard: ← → step history (`app.js:1925-1940`), Enter in spot/code inputs.

### Current visual language
- Palette identical to 222 (`styles.css:1-29`), including the unused `--spade/--heart/--diamond/--club` tokens (cards come from the shared component so these are dead).
- Root 13px. h1 30px (but only used for the sr-only heading and `.page-heading` which is not in the markup — dead), h2 14px, stat labels 10px uppercase tracked 1.2px, metric values 15–20px, opt labels 13px, opt meta 11px, badge 10px, spark axis 9px, cube owner 8px.
- Radius: 5px buttons, 8px toolbar/panels, 10px seats/cube/deck, 12px trainer table, 999px pills/tabs/badges. Shadows: cube face only. Flat backgrounds.
- Colour scales: `scaleColor(t)` → `hsl(4..150 66% 58%)` and `heatColor` (`app.js:64-65`) applied as inline `--scale`/`--heat`/`--shade` custom properties — the cleanest colour-scale approach in the group, but the hue endpoints are hard-coded in JS and disconnected from the CSS tokens. `.scale-legend > i` repeats the gradient in CSS (`styles.css:971`).
- Animations: `.seat` border-color transition; `.deck-card:hover translateY(-2px)`; shared `card-pop` on `.new`. **No `prefers-reduced-motion` rule** in this stylesheet.
- Theme-color `#111417`.

### Layout
- App shell: `body {height:100%; overflow:hidden}`; `.view` flex column; `.split` two-column grid (`minmax(0,1fr) minmax(330px,420px)`) with both columns scrolling (`styles.css:33-44, 229-256`); `.trainer-grid` same idea (`:850-916`); `#view-reports` scrolls as a block.
- Breakpoints: 960px (views scroll as a whole, split and trainer become stacked), 900px (trainer grid 1-col — overlaps with 960 rule), 720px (desktop/mobile labels, topbar wraps with tabs as a full-width third row, buttons flex 1, seats 1-col, summary 2-col, heatmap 7px font).
- Seats `repeat(auto-fit, minmax(270px,1fr))`; metrics 3-col inside; sparkline 34px.
- Deck uses `.deck-matrix` (13 columns) from cards.css — on phones inside a 330px+ side column it becomes very small (`deck-grid gap 3px`), no horizontal scroll.
- Tables: `.mini-table` has no overflow wrapper (`app.js:1748, 1803, 1829`); the 6-column "Doubling window" table will overflow on phones; `.heatmap` 14 columns with 7px text at ≤720 (`:1339-1345`).

### Controls inventory
- Buttons: base, `.primary`, `.quiet`, `.danger` (Pass), disabled 0.4 opacity; Back/Forward with `title` hints; `.seat-tools` mini buttons (Edit / Draws next); `.deck-card` buttons; cube `Take/Pass/Double/Draw` actions.
- Pill tabs in the topbar (`.tabs`, `styles.css:278-303`); JS sets `aria-current` via `toggleAttribute` which yields `aria-current=""` (`app.js:259`) — an empty value, not `"page"`.
- Segmented `#player-count`, `#on-seat-count` (`data-n`).
- Selects (precision, spot turn/cube/value), text inputs (`.field input` restyled separately at `:996-1003`), checkboxes.
- Summary strip `.summary > .stat` (1px-gap grid on `--line` background — a nice "table of tiles" effect), `.tiles-row` reuses it for reports.
- Seat card: `.seat-head` (name + `.badges` pills: turn/first/bust/win/owns cube) + `.seat-tools`, `.cards` row (`--card-width: 34px`), `.metrics` grid of `.metric`, `.spark` + `.spark-axis`.
- Cube panel: `.cube-face`, `.cube-actions`, `.cube-options` → `.opt-verdict`, `.opt-section`, `.opt` rows with `.opt-bar` (centred equity bar), `.opt-tag`, `.opt-meta.loss`; `.verdict.good/.bad` in trainer.
- Reports: `.bars` (label / bar / value grid), `.mini-table`, `.heatmap` spans, `.scale-legend`.
- Log `<ol>`, `.room-code`, `.conn[data-state]` dot.
- Dialog `.dialog-head/.dialog-body`.

### Problems found
1. Palette drift from hub (same as the other dodge page); dead suit tokens (`styles.css:15-18`); hard-coded hex at `:74-75, :90-91, :137, :140-148, :150-156, :172, :494-504, :556, :627, :672-680, :700, :722, :764, :794, :978, :997-998, :1050, :1131, :1172, :1201`; JS hue scale constants (`app.js:64-65`).
2. No reduced-motion handling in this stylesheet while `.deck-card:hover` translates and seats animate borders (`:445, :611-614`); shared `card-pop` is also unguarded in `shared/cards.css` (`cards.css:214-223`) — the reduced-motion guard lives only in individual pages (222 and dodge reports), i.e. the shared component itself ignores the preference.
3. `aria-current=""` on active tab (`app.js:259`); tabs lack `role="tablist"`.
4. Dead CSS: `.page-heading`, `.breadcrumb`, `h1` 30px block (`:257-277`) — no such markup in `index.html`; `.danger:hover` fine; `.seat .seat-score` fine.
5. Overlapping breakpoints 900/960 for `.trainer-grid` (`:1231-1235` vs `:1252-1262`).
6. Mini tables and the 14-column heatmap lack overflow wrappers; heatmap text drops to 7px on phones (`:1339-1342`).
7. Stat label 10px with 1.2px tracking and `--faint` (`:412-418`) → low contrast; cube owner 8px (`:695-702`).
8. Topbar on phones: tabs become a third row (`:1279-1286`) so the chrome is ~100px tall before content; the `Hand reports` and `MS ↗` links disappear entirely ≤720 (`index.html:35, 39` + `.desktop-only`), leaving no path back to the report page on phones.
9. Toolbar buttons (`Back, Forward, Draw card, Play out, New deal`) wrap to full-width `flex:1` on phones (`:1309-1317`) producing five equal-width tiny-text (12px) buttons on one or two rows.
10. The `.summary` strip is used both as the live status bar and (as `.tiles-row`) in reports with slightly different declarations (`:395-404` vs `:1097-1105`) — duplicate.
11. `.field input` re-declares input styling that the base `select` rule already defines; `input` (non-checkbox) has no base rule here, unlike dodge reports (`:77-84` there).
12. Hover transform on deck cards and `outline` on `.deck-card.shaded` mix `outline` (ring) with `box-shadow` glow (`:953-959`): two ring mechanisms; selected/danger rings also come from cards.css `.playing-card.danger` — the page applies `.danger` to the wrapping button, not the card, so the two ring styles differ from the shared `.playing-card.danger`.
13. Copy: "Deck runs out · survivors split" tile and "Games simulated"/"Compute ms" are developer telemetry presented as first-class KPIs.
14. Spot panel inputs lack `aria-label` beyond the visible `.label` span inside `<label>` — OK; `#spot-error` doubles as a success toast ("Link copied." via `spotError`, `app.js:716`) — semantic misuse of an error slot.
15. Online lobby reuses `.report-card` as the lobby container (`index.html:228-229`) — class naming leaks.

### Redesign recommendations
- **P1** Re-token to hub; keep `scaleColor` but read the hue endpoints from CSS variables (`--scale-lo`, `--scale-hi`) so the gradient and `.scale-legend` stay in sync; coral accent for primary actions, green/red reserved for good/bad equity.
- **P1** Add `prefers-reduced-motion` guard (ideally in `shared/cards.css` for `card-pop`, plus this page's hover transform).
- **P1** Wrap `.mini-table` and `.heatmap` in a scroll container; floor text at 11px.
- **P2** Fix tab semantics (`aria-current="page"` or proper tabs); keep a back link to Hand reports on phones (e.g. move "Hand reports" into the Rules/menu or the brand).
- **P2** Phone toolbar: group into "stepping" (◀ ▶) and "actions" (Draw / Play out / New deal) with the primary action full-width, secondary as icons with labels.
- **P2** Promote `.opt` option rows, `.opt-verdict`, `.summary/.stat`, `.bars`, `.badge` to shared components (they are the strongest patterns in the group; 222's cube tables should adopt them).
- **P3** Delete dead `.page-heading/.breadcrumb/h1` block and suit tokens; merge 900/960 breakpoints; rename `.report-card` lobby container.
- **Keep**: shared cards + `.deck-matrix` usage; split scrolling layout; `.opt-bar` centred equity bar; `--scale/--heat/--shade` custom-property colour piping; badges; history stepping with arrow keys; `#spot=` and `#room=` deep links.

### Constraints to preserve
- `poker/dodge/simulator/tests/simulator.test.mjs`: engine only (imports `../engine.mjs`, `../../engine.mjs`); no DOM.
- JS-bound ids: `#player-count > button[data-n], #ace-high, #cube-mode, #cube-mode-control, #precision, #back-button, #forward-button, #draw-button, #playout-button, #deal-button, #spot-toggle, #spot-panel, #spot-seats, #spot-turn, #spot-cube-owner, #spot-cube-value, #spot-copy, #spot-load, #spot-error, #sim-split, #summary, #sum-status, #sum-deck, #sum-deckout, #sum-games, #sum-compute(-wrap), #seats, #cube-panel, #cube-face, #cube-value, #cube-owner, #cube-title, #cube-subtitle, #cube-actions, #cube-table, #deck-grid, #deck-help, #tr-* (ace-high, peek, precision, back, forward, live, reset, new, seats, prompt, actions, analysis, analysis-title, analysis-note, analysis-body, session, log, cube-face/value/owner), #score-you, #score-bot, #on-* (name, seat-count, cube, ace-high, create, code, join, resume, error, room-code, connection[data-state], roster, copy, leave, start, status, deck, deckout, games, prompt, actions, seats, cube-panel, cube-value, cube-owner, cube-title, cube-subtitle, cube-table, log), #reports-loading, #reports, #rules-button, #rules-dialog, [data-close], .tabs > button[data-tab], #view-{sim,trainer,online,reports}`.
- Classes toggled by JS: `.active, .alert, .danger, .shaded, .held, .mine, .loss, .cube-options, .on-turn, .busted, .editing, .me, .new, .pending, .scaled, .best, .chosen, .good/.bad`.
- `localStorage` key `dodge.player.name`.

---

## poker/calculations/ — "Poker Hand Probability Calculations"

### Purpose & audience
Static explorer of exact best-hand probabilities for 2–13 dealt cards from a Rust solver: rank trend chart, per-deal distribution, stacked map, full table, phone "glance" cards, solver metrics. Audience: curious players / the author showing off the solver. Read-only; no cards rendered.

### Screens / states / flows
- Single app shell `.app-shell` (`index.html:16-145`): topbar (MS brand mark + "Poker calculations", eyebrow + h1, 4 summary cards, "Rust solver" GitHub link), phone-only view tabs (Explore / Map / Table / Glance / Solver with `aria-pressed`), workspace grid: sidebar (control panel with rank buttons + cards-dealt buttons + run meta; metrics panel with intro copy, metric cards, layer chart), trend panel (SVG line), detail panel (distribution rows as buttons with bars), map panel (stacked bars of buttons per deal size), table panel (sticky-header/sticky-two-column table with `.prob-button` cells), glance panel (phone-only cards).
- Loading: "--" placeholders, "Waiting for data.", "Loading solver output...", table `Loading...` row. Error: `.error-state` row in table + "Data failed to load." (`app.js:58-62`). No empty states otherwise (data is static).
- Interaction: any `[data-rank-index]`/`[data-cards]` click updates selection and re-renders everything (`app.js:91-105`); phone control panel collapses behind `#controlToggle` (`aria-expanded`).

### Current visual language
- **Closest to the hub** of the four: `--page #08090d`, `--ink #eef4ff`, `--muted #9aa7b7`, `--green #8fd9b6`, `--blue #8ab4ff`, `--gold #f4c95d`, `--red #ff8b83` (`styles.css:11-35`) match hub values; but `--surface #121620` / `--surface-soft #1a202c` / `--line #283141` are its own, radius is 8px (hub 16px), and the **accent is green** (`.eyebrow`, `.view-tab.active`, `.method-pill`) rather than poker coral. Theme-color `#08090d` is correct. No aura/dot-grid background.
- Inter; sizes in rem: h1 1.02rem, h2 0.98rem, eyebrow 0.66rem (≈10.5px), summary labels 0.6rem (9.6px; 0.54rem/0.5rem on phones `:938, :1127`), panel-meta 0.76rem, th 0.68rem, td 0.86rem, stack segment 0.64rem, layer rows 0.72rem. Very heavy weights everywhere (760–900) on tiny text.
- Shadows: `--shadow 0 18px 58px rgba(0,0,0,.28)` on panels (desktop only). Transitions on buttons (160ms) with hover `translateY(-1px)`; no reduced-motion rule.
- 10 rank colours hard-coded in JS (`app.js:3-14`) and piped through `--rank-color` inline — good mechanism, wrong home.

### Layout
- Desktop (≥960): `.workspace` grid `236px 1fr 1fr` × 2 rows with named areas (`styles.css:216-226`); ≥1300 adds a fourth column for the map and spans the table (`:853-860`). Panels scroll internally (`.panel-body overflow:auto`). `min-height: 520px` on the workspace means short viewports scroll the page.
- ≤959: workspace becomes a flex column showing one section per `data-view` (`:969-1009`); sidebar `display: contents` so its two panels become tab sections; control panel collapsible; 2-col rank buttons, 6-col card buttons, 38px targets; table `.prob-button` 40px.
- ≤1299 hides the brand name; ≤959 hides the title block entirely (h1 gone from view on phones — only "Poker calculations" brand text remains).
- Table: `width:max-content; min-width:100%` inside `.table-wrap` with sticky header and two sticky columns (`:649-718`) — scrolls horizontally correctly; 13 rank columns at `min-width:86px` ≈ 1.3k px wide.
- SVG trend chart fixed `viewBox 720×310` scaled to width; on phones `height:auto` (`:1089-1091`).

### Controls inventory
- `.view-tab` buttons (phone only, `aria-pressed`), `.control-toggle`, `.rank-button` (swatch + label, `--active-color` tint), `.card-button` (number), `.distribution-row` buttons, `.stack-segment` buttons (abbreviations HC/P/TP…), `.prob-button` table cells, `.mobile-rank-row` buttons, `.source-link`.
- Stat tiles: `.summary-card` (topbar), `.metric-card`; bars: `.bar-track/.bar-fill`, `.layer-track/.layer-fill`, `.stack-bar`.
- No selects, no inputs, no dialogs, no toasts.

### Problems found
1. Accent is green (`--green` on `.eyebrow:128`, `.view-tab.active:964-966`, `.method-pill:725-729`) instead of the poker family coral; panel surfaces/lines are off-token (`:14-20`).
2. Tiny, heavy type: summary labels 0.6rem→0.5rem (`:171, :938, :1127`), eyebrow 0.66rem, th 0.68rem, stack segment 0.64rem at weight 900 (`:553-554`), layer labels 0.72rem — with `--muted` on `--surface-soft` the small labels sit near 4.5:1 only at larger sizes.
3. `h1` is clipped with ellipsis at any width (`:139-141`) and hidden on phones (`:915-917`); the document's only real heading disappears.
4. Focus styles: `.rank-button:focus-visible`, `.card-button:focus-visible`, `.source-link:focus-visible` set `outline:none` and rely on a border-colour change (`:204-208, :371-378`) — weak focus indication; `.stack-segment` buttons have no focus style at all (`:543-564`); `.mobile-rank-row button` none.
5. `.stack-segment` text (`HC`, `TP`…) at 0.64rem inside segments as thin as 2px — unreadable and `overflow:hidden` clips; `aria-label` is present (good) but visible labels are noise.
6. Hover `transform: translateY(-1px)` on buttons without reduced-motion guard (`:347-351, :377`).
7. `tbody tr:hover td { background:#171d28 }` and `td { color:#e6edf7 }`, `th { color:#dce6f3 }` hard-coded (`:675, :683, :692`); `.rank-button background:#161b26` (`:343`), `.control-toggle` (`:1036`), `.layer-track #232b39` (`:834`), `.grid-line #273244`, `.axis-line #59677b` (`:423, :428`), `color-mix(... #111720)` (`:383, :965`), `.method-pill` border `rgba(19,121,91,.3)` (`:725`).
8. The "Rust solver" source link is styled as a primary-looking button in the topbar (`:187-202`), competing with content; `brand` goes to `/` (home) not `/poker/` — inconsistent with the other three pages whose brand links go to `/poker/`.
9. Duplicate bar components: `.bar-track/.bar-fill` and `.layer-track/.layer-fill` are the same thing with different heights (`:490-503, :831-843`).
10. Mobile tabs are not a tab pattern (`aria-pressed` toggles) and the desktop grid ignores `data-view` entirely — two mental models; `.glance-panel` exists only for phones but is always in the DOM.
11. `innerHTML` templating with unescaped `rank.label`/`data.classification` (`app.js:139, 108`) — trusted JSON, but a redesign that moves to shared helpers should escape.
12. `.workspace { min-height: 520px }` + `.app-shell {height:100%}` → on short desktop windows the shell overflows the page with no scroll container (body has `overflow-x:hidden` only), so the bottom row can be clipped.
13. Inconsistent brand treatment vs other poker pages ("MS" mark + product name, no family breadcrumb).

### Redesign recommendations
- **P1** Switch accent to `--accent #ff8b83` for eyebrows, active tabs, method pill; adopt hub surfaces/lines/radius; keep the 10 rank colours but move them to CSS custom properties on `:root` (`--rank-0 … --rank-9`) read by JS.
- **P1** Type floor 12px; weights 600/700 max; make the h1 visible on phones (wrap, don't clip).
- **P1** Real focus rings on every interactive element (`:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`), including `.stack-segment`, `.prob-button`, `.mobile-rank-row button`.
- **P2** Drop the visible abbreviation text inside stack segments below a width threshold (container query), or render them only for segments ≥ 28px.
- **P2** Replace phone `aria-pressed` view tabs with the group's shared tab bar component; keep desktop all-panels grid.
- **P2** Reduced-motion guard for hover transforms; consolidate bar components into the shared `.bar` primitive.
- **P3** Brand link to `/poker/` + breadcrumb like the other pages; demote the source link to a text link in a footer or the metrics panel.
- **Keep**: named-area grid with internal panel scrolling; `--rank-color` piping; sticky two-column table; phone collapsible controls; `renderDynamic` single-source re-render.

### Constraints to preserve
- No tests in `poker/calculations/` (the Rust `solver/` is unpublished tooling). Nothing in `scripts/` or other test suites references the page.
- JS-bound selectors (`app.js:20-39` and handlers): `#algorithmLabel, #cardControls, #classificationNote, #detailMeta, #distributionList, #exactThrough, #layerChart, #metricsGrid, #mobileCards, #peakStates, #probabilityTable (thead/tbody), #rankControls, #runMeta, #stackedMap, #stackMeta, #totalSolve, #trendChart, #trendMeta, #workspace[data-view], #controlToggle, #controlSummary, #controlSwatch, .view-tab[data-view], .control-panel.open`; delegated clicks on `[data-rank-index]` and `[data-cards]`; classes `.active` on rank/card/segment/prob-cell/trend-point.

---

## Cross-page summary

### Palettes and font stacks in use
| Page | Page bg | Panel | Accent | Font root | Notes |
|---|---|---|---|---|---|
| hub.css (target) | `#08090d` | `#10141c` / `#151a24` | poker `#ff8b83` (+`#ffb77a`) | Inter 16px, `cv11 ss01` | aura + dot grid, radius 16 |
| 222 | `#111417` | `#191d21` / `#20252a` | green `#55d7b1` | Inter 13px | own card colours |
| dodge | `#111417` | `#191d21` | green `#55d7b1` | Inter 13px (14 phone) | shared cards OK |
| dodge/simulator | `#111417` | `#191d21` | green `#55d7b1` | Inter 13px | shared cards OK |
| calculations | `#08090d` | `#121620` / `#1a202c` | green `#8fd9b6` | Inter 16px (rem) | closest to hub, wrong accent |

Three of four pages are a copy-pasted "warm grey + teal" theme with identical `:root` blocks (`222/styles.css:1-22`, `dodge/styles.css:5-28`, `dodge/simulator/styles.css:1-29`) that pre-date `hub.css`. None links `hub.css`; none uses the family accent. Semantic colours are consistent in meaning (green = good/survive, red `#ff7d75` = bad/bust, amber `#eeac61` = warning/turn/button) and should be kept as *semantic* tokens while the *brand* accent becomes coral.

### Duplicated components that should become one shared component
1. **Page chrome**: `.topbar/.brand/.brand-mark/.brand-separator/.brand-section/.top-actions/.site-link` exists in three variants (222 square-mark, dodge "d•" wordmark ×2, calculations "MS" tile). One `shared/tool-shell.css` with brand → family breadcrumb → tabs → actions.
2. **Tab bar**: underline tabs (222), pill tabs in heading (dodge), pill tabs in topbar (simulator), phone-only boxed tabs with `aria-pressed` (calculations). All toggle `[hidden]` sections by `data-tab/data-view`; three different ARIA treatments (`aria-current="page"`, `aria-current=""`, `aria-pressed`). One tablist component + one `showTab` helper.
3. **Toolbar / parameter form**: `.toolbar > .control (.label + select | .segmented | .check) + .spacer + .buttons` is identical in 222 and simulator (`222/styles.css:91-102`, `simulator/styles.css:306-358`); dodge `.filters label > span + select` and calculations `.control-group` are the same shape. One `.toolbar`, `.field`, `.segmented`, `.check` set.
4. **Stat tiles**: `222 .metric/.kpi/.score`, `simulator .stat/.metric/.tiles-row`, `dodge .summary-item/.payout-stat/.detail-metrics`, `calculations .summary-card/.metric-card` — eight tile styles. One `.stat` (label / value / note, `big` modifier, optional `--scale` colour) and one `.stat-strip` (1px-gap grid on `--line`, from simulator `:395-404`).
5. **Report tables**: `222 .cube-table/.preflop-table/.points-table/.report-table`, `simulator .mini-table`, `dodge table/.detail-table/.small-table`, `calculations table` — all "uppercase small th, right-aligned numerics, 1px row lines, tabular-nums". One `.data-table` + `.table-wrap` (overflow-x) + optional sticky header/first column modifiers.
6. **Bars / progress**: `222 .bar i`, `simulator .bars .bar > i / .opt-bar`, `dodge .bar-track/.bar-fill / .spark-hist / .mini-stack`, `calculations .bar-track/.bar-fill / .layer-track/.layer-fill / .stack-bar`. One `.bar` primitive (track + fill with `--value` and `--bar-color`), one `.bar-list` (label / bar / value grid), one `.sparkline`, one `.stack-bar`.
7. **Long-running progress**: 222 uses "Solving the equilibrium… NN%" text in three places; simulator uses "running…"/"Solving…"; dodge uses a pulsing dot. One `.progress` (bar + label, `aria-live`) component.
8. **Cube UI**: `.cube-face/.cube-value/.cube-owner`, `.cube-panel/.cube-head/.cube-text` duplicated between 222 (`styles.css:200-222`) and simulator (`styles.css:643-702`) with slightly different sizes. The simulator's `.opt` option rows are the better presentation of cube options; 222's `.cube-table` should adopt them.
9. **Seat card**: `.seat/.seat-head/.cards/.metrics` in 222 and simulator (badges vs tags differ: `.tag` square vs `.badge` pill). One seat card + one `.badge`.
10. **Analysis sidebar**: `.analysis` section, `.session-stats`, `.log` list, `.prompt(.alert)`, `.action-row` are copy-pasted between 222 and simulator.
11. **Dialog**: `.dialog-head/.dialog-body` (222, simulator) vs `.dialog-heading/.method-content` (dodge); phone treatment differs (full-screen vs bottom sheet). One dialog style (bottom sheet on phones, as dodge does).
12. **Chart styling**: `.chart text`, `.grid-line`, `.axis-label`, `.legend .swatch` exist in dodge and calculations with different values; 222 has a dead copy. One chart stylesheet with tokenised grid/axis/label colours and a shared category palette.
13. **Utilities**: `.sr-only` (dodge ×2, simulator) vs `.visually-hidden` (hub); `.mobile-only/.desktop-only` (three pages, with `!important` in dodge); `[hidden] { display:none !important }` in three pages.
14. **Card wrappers**: `.cards` with `--card-width` (dodge 29/31/43px, simulator 34px), `.deck-grid` (222 custom 13-col vs simulator `.deck-matrix`), board slots (222 `.slot` custom dashed box vs cards.css `.empty-slot`). Standardise on cards.css `.card-row`, `.deck-matrix`, `.empty-slot`.

### Token drift from the site base
- Naming: pages use `--bg/--panel/--panel-raised/--text/--faint/--green` where hub uses `--page/--surface/--surface-2/--ink/--soft/--accent`. Calculations uses `--page/--ink/--muted` (matching) but `--surface/--line` with different values.
- Accent: all four pages use green as the brand/action colour; the family accent `#ff8b83` is unused anywhere in the group (it only appears as `--red` in calculations).
- Radius: 5–10px vs hub 16px; typography: 13px roots vs hub 16px; backgrounds: flat vs hub aura/dot-grid; shadows: none vs hub soft shadows; motion tokens `--ease/--spring` unused.
- Card colours: 222 defines its own suit tokens (`#52575c/#b40d08/#3449ce/#05a82b`); the simulator carries the same dead tokens; shared cards.css defines `#504f4f/#9f2517/#2634bd/#4faa41`.
- `theme-color`: `#111417` on three pages, `#08090d` on calculations.

### Three biggest wins for this group
1. **Move 222 onto `shared/cards.js` + `shared/cards.css`** (and the `.deck-matrix`/`.empty-slot`/`.card-row` helpers) — the only page in the group violating the hard site rule, with its own suit colours, "10" ranks and non-focusable clickable card spans. Also add the `prefers-reduced-motion` guard for `card-pop` inside `shared/cards.css` so every page inherits it.
2. **One `tool-shell` stylesheet built on `hub.css` tokens**: page chrome + tablist + toolbar/field/segmented + stat tile/strip + data-table/table-wrap + bar primitives + progress + dialog (bottom-sheet on phones) + `.sr-only`. Deleting the three identical `:root` blocks and the ~1,000 lines of duplicated component CSS across 222/dodge/simulator, switching the brand accent to poker coral while keeping green/red/amber as semantic tokens, and raising the type floor to 12px (base 14–16px) addresses nearly every contrast, legibility and consistency finding at once.
3. **Make the app-shell rule true everywhere**: 222 should adopt the dodge/simulator split-scrolling shell; cube option tables, mini tables and heatmaps on all three analysis pages need `overflow-x` wrappers or the simulator's `.opt` row pattern; tab semantics (`role=tablist/tab/tabpanel`, `aria-selected`) and real focus rings (calculations) bring the group to a consistent, keyboard-usable baseline without touching any test.
