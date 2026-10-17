<!-- Detailed audit appendix. Generated 2026-10-16 from a read-only review of commit 8c0efdb; line numbers refer to that commit. See ../notes.md for the synthesized page-by-page notes and ../prompt.md for the overhaul brief. -->

# Group F — standalone app pages: UI/UX audit notes

Read-only audit of `blackjack/strategy/`, `dice/reports/`, `cards/`, `microtonal-lab/` against the site base in `shared/hub.css` (dark `#08090d` page, Inter with `cv11`/`ss01`, `--surface #10141c`, `--line rgba(148,163,184,.13)`, `--ink #eef4ff`, `--muted #9aa7b7`, `--radius 16px`, per-family accent via `data-family` on `<html>`: blackjack `#f4c95d`, dice `#e9c46b`) and the shared card component (`shared/cards.css` + `shared/cards.js`).

Baseline fact that applies to all four pages: **none of them loads `shared/hub.css`**. Each page carries its own `:root` token block with different names (`--bg/--panel/--text` vs the hub's `--page/--surface/--ink`), so there is no inheritance to drift *from* — they are four independent design systems. Only `dice/reports/index.html:2` sets `data-family="dice"`, and since hub.css is not loaded it is inert.

---

## blackjack/strategy/ — Blackjack Strategy Lab

- **Purpose & audience**: rules-aware basic-strategy chart with realtime EV solver (WASM/JS), Hi-Lo count tracker, index deviations and dealer-outcome distributions. Audience: advantage-play hobbyists who already know "S17/DAS/LS" vocabulary.

### Screens / states / flows
- Single page, five regions laid out as a desktop grid (`styles.css:195-209`): **chart** (`#chart-panel`, 28×10 button grid + legend), **Decision** hand solver (`#solver-panel`: dealer select, hand tray of shared cards, 10-key card pad, decision card, cell inspector with EV bars and probability rows), **Count tracker** (`#count-panel`: readouts, apply toggle, three stepper-sliders, +1/0/−1 buttons, Reset/Copy config), **Table rules** (`#rules-panel`: preset select, decks slider with datalist ticks, segmented Soft-17, four selects, three switches, 2×2 advanced selects), and a **Display settings** strip (`#chart-settings-panel`: view mode, index group, indices toggle, dual-thumb index range, decimals, Rev 2-6, "Alt" palette, plus the engine audit/report tiles and four external GitHub links).
- Below 1000px a 5-tab bar (`.mobile-tabs`, `index.html:42-48`) shows one panel at a time via `data-view` on `.workspace` (`styles.css:1543-1576`). Tapping a chart cell on a phone jumps to the Hand tab (`app.js:1931-1946`).
- Modal: `<dialog class="dealer-modal">` dealer outcome distribution opened from column headers (`index.html:469-478`, `app.js:2165-2180`). Toast bottom-right (`#toast`, `styles.css:1329-1350`).
- States: empty hand tray shows "No cards" (`app.js:2017`); decision card shows "--" / "Add cards" / "Bust" (`app.js:2044-2047`); `#metric-speed` shows "Queued" while solving (`app.js:668`); audit tiles get `data-status="good|warn|bad"` border colours (`styles.css:766-776`). No explicit loading skeleton or WASM-failure UI beyond the toast.

### Current visual language
- Tokens `styles.css:12-38`: page `#090a0a`, surfaces `#181a1b/#222425/#2c2e30`, text `#f4f4f1`, muted `#a4a6a8`, **accent `#00b89b` (teal)** — the hub says blackjack is gold `#f4c95d`. Radius 8px (hub 16px). Shadow `0 12px 34px`. Easing matches hub `--ease`.
- Action palette: H `#70b96b` green, S `#e65252` red, D `#3f87a0`, Ds `#54bfc4`, P `#8f8976` (cream/khaki), Rh amber `#c48027`, Rs `#7e55bf` (`styles.css:1009-1036`); colourblind set `1038-1061`. **This is the inverse of the hub**: `shared/hub.css:23-25` defines `--hit #ff8b83` (salmon) / `--stand #8fd9b6` (mint) and `blackjack/index.html:72-74` paints the hub preview chart that way, so the hub card and the lab disagree on which colour means Hit.
- Hover tint is a *third* green, `rgba(119,230,182,…)`, hard-coded in nine places (`styles.css:301-302, 381-382, 639, 681, 795, 912, 1166, 1336`) and never equal to `--accent`.
- Type: Inter; h1 1.15rem, h2 0.95rem; **27 distinct font-sizes** and weights 750–950 (`font-weight: 950` ×7, `900` ×6, `850` ×9). Micro text: `.dealer-bust 0.34rem` (`865-870`, ≈5.4px), `.action-code 0.5rem` (`956-963`), `.cell-ev 0.5rem` (`1069-1076`), `.index-badge 0.54rem` (`965-979`), audit/report labels `0.56rem` (`750-756`), `.number-pair label 0.58rem` (`425-433`), `.legend-label 0.58rem` (`1107-1113`).
- Backgrounds flat; hard-coded greys bypass tokens: `#202222/#151616` topbar (`96-97`), `#202223` ×6 (`168, 372, 533, 590, 737`), `#111313` (`391, 447`), `#242627` table heads (`837, 875`), `#111` cell borders (`831-832`), `#242626` surface border (`218`), `#12171d` modal (`1369`), `#0b0d10` thumb border (`678, 691`).
- Animations: 130–180ms transitions, `translateY(-1px)` hovers, toast slide; reduced-motion blanket override (`1897-1906`).

### Layout
- Desktop (≥1000px): 4-column grid `chart | solver | count | rules` with settings strip spanning the three side columns (`198-209`); chart column width is derived from viewport height (`clamp(300px, (100vh-170px)*.5+56px, 470px)`) so cells keep aspect ratio; chart cell size uses container-query units (`800-827`), side panels scroll internally (`258-265`). `min-height: 540px` on the workspace (`201`) means short viewports scroll the whole body. Narrow-desktop tweaks at 1000–1299 (`1412-1442`), roomier ≥1300 (`1446-1462`).
- Mobile (<1000): tab bar + one panel; chart panel becomes the scroll container with 36px min cell height and 30px min width (`1661-1665`), sticky header row and sticky row heads (`843-847, 881-890`); touch targets bumped to 36–42px (`1608-1653, 1718-1722`). Status cluster becomes a 3-up grid (`1496-1516`).
- Strategy chart on narrow screens: 10 dealer columns × ≥30px = 300px + 34px head fits a 375px phone; 28 rows × 36px = ~1000px tall, so it scrolls vertically inside the panel. Works, but the index badges at 0.58rem (`1688-1690`) are unreadable at that size.

### Controls inventory
- `.icon-button` 32px (36px mobile) for reset/clear/undo/close; `.secondary-button`; `.card-pad button` and `.count-buttons button` (same recipe, `1149-1168`); `.mobile-tab` (pressed = solid accent); `.segmented` radio group (only `.two-up` variant used; the default 6-column grid at `441-448` is dead); `.switch-line` / `.mini-switch` CSS-pseudo toggles (`523-557, 698-712`); `.range-input-row` = stepper − / range / stepper + / number box (`356-416`); `.dual-slider` two overlaid ranges (`630-696`); `.toolbar-select`; `.number-pair`; `.metric-pill`, `.count-readout`, `.index-audit`, `.report-grid` (four different stat-tile recipes); `.legend-item`; `.decision-card`; `.ev-row`/`.prob-row` bars; `.report-links a` chips; `<dialog>`; toast.
- Consistency: borders/radii are consistent (8px, `var(--line)`), but there are ~6 different surface greys and three different label sizes for the same "eyebrow" role.

### Problems found
- **P1 Contrast**: white 0.5rem text on `#8f8976` (P) ≈ 2.6:1, on `#54bfc4` (Ds) ≈ 2.2:1, on `#70b96b` (H) ≈ 2.4:1 (`styles.css:928-963, 1009-1036`). The colourblind set is better but still white-on-`#7b6e45`.
- **P1 Type floor**: sizes 0.34–0.58rem listed above; nothing in the chart or audit strip reaches 12px on desktop.
- **P1 Brand**: teal accent, no `data-family`, `theme-color #0b0d10` (`index.html:7`) — none of it matches the blackjack family.
- **P2 Focus**: `.switch-line` toggles (rules panel, Apply count) have no visible focus state — the rule `input:focus-visible + span` (`344`) cannot match because the `<span>` precedes the `<input>` in that markup (`index.html:142-153, 296-299`) and the input is `opacity:0` (`458-465`). `.mini-switch` works because its input comes first.
- **P2 Semantics**: `display: contents` on `<dl class="report-grid">` and `.index-audit` (`723-727`) strips list semantics in several screen readers; `#chart-title` is an `h2` that gets truncated with ellipsis on desktop (`152-156`).
- **P2 Information hierarchy**: the header's third metric is solver speed in ms (`index.html:35-38`); the Display panel mixes chart options with an engine audit and four GitHub links (`index.html:420-465`). "Alt" (`index.html:415`) is the colourblind palette, "Rev 2-6" reverses column order, "Applied TC" — cryptic labels.
- **P2 Chart density**: 280 `<button>`s each carrying a JSON `data-cell` payload (`app.js:1961-1967`); fine functionally, but every cell has a `title` tooltip and a hover shadow (`949-954`) that makes the grid flicker on mouse move.
- **P3 Dead/duplicated CSS**: `.strategy-table.compact` is always set (`app.js:1879`) so `923-926, 945-947` are redundant; `@supports (height: 100dvh)` block (`211-215`) duplicates the rule; `.toolbar-heading` is hidden on desktop (`569-571`) and `.panel-heading .eyebrow` hidden below 1300px (`276-278`), so eyebrow copy mostly never renders; `.count-panel .number-box:focus { text-align:left }` (`402-404`) is a left-over; four `!important`s only in reduced-motion.
- **P3 Fallback card markup** in `app.js:2026` re-creates the card face by hand when `PlayingCards` is missing — harmless but contradicts "pages never render the face".
- **P3 Scrollbar colour** hard-codes the teal (`264, 813`).

### Redesign recommendations
- **P1** Load `shared/hub.css` (or a new `shared/app.css` built from the same tokens), set `data-family="blackjack"`, drop the local `:root`; map H/S/D to the hub `--hit/--stand/--double` and reconcile which colour is Hit site-wide (the hub preview and the lab currently disagree). Give the P/Ds/R actions tokens too.
- **P1** Set a 12px floor: dealer bust % and index badges become a second line at ≥11px with a toggle to hide, or move to the cell inspector; make cell text dark-on-light (or light-on-dark) with ≥4.5:1 by darkening the cell fills.
- **P1** Replace the five-tab mobile model with the site-wide pattern (see cross-page summary) but keep `data-view` on `.workspace` as the state hook.
- **P2** Rebuild the settings strip as two things: a compact chart toolbar above the chart, and an "About the engine" disclosure/footer holding audit, report and links.
- **P2** Fix switch focus by moving the input before the label text or using `:has(input:focus-visible)`.
- **P2** Reduce to ~6 type sizes and 3 weights (500/600/700); replace the 9 hard-coded hover greens with `color-mix(in oklab, var(--accent) …)`.
- **Keep**: the container-query chart sizing (`800-827`), sticky heads, the stepper+range+number control (good on touch), the segmented Soft-17 control, `<dialog>` for dealer outcomes, the toast, reduced-motion handling, the shared-card hand tray (`1117-1133`).

### Constraints to preserve
- Shared cards: `.hand-tray { --card-width: 36px }` desktop / 44px mobile (`styles.css:1118, 1708`), rendered by `PlayingCards.html(label, { tag: "button", attrs: { "data-index" } })` (`app.js:2022-2026`) as `playing-card plain`. Only wrapper hover transform is page-owned.
- `tests/solver-regression.test.mjs` runs **all of `app.js` in a `vm` with a stub DOM** (`tests/solver-regression.test.mjs:15-109`): `document.getElementById` returns a stub for any id; `document.querySelector` special-cases `".dual-slider"` and `"input[name='soft17']:checked"` (`60-64`); it pre-seeds values for ids `index-decimals`, `index-min-range`, `index-max-range`, `index-group`, `apply-count-toggle`, `true-count-slider` (`49-54`). Therefore: keep those ids and the `name="soft17"` radio and the `.dual-slider` class, and keep app.js's top-level wiring tolerant of stub elements (no new `querySelectorAll(...).forEach` that needs a real NodeList with methods beyond the stub). Test asserts solver internals only (no visible text).
- app.js addresses every control by id (`$()`), so all ids in `index.html` (e.g. `preset-select`, `decks-slider`, `decks-input`, `double-rule`, `peek-rule`, `surrender-rule`, `das-toggle`, `hsa-toggle`, `rsa-toggle`, `resplit-rule`, `charlie-rule`, `blackjack-pay`, `optimization-rule`, `strategy-table`, `legend-bar`, `chart-title`, `dealer-select`, `hand-tray`, `card-pad`, `decision-card`, `decision-label`, `decision-detail`, `cell-detail`, `running-count*`, `decks-remaining*`, `true-count*`, `count-buttons`, `reset-count`, `copy-config`, `view-mode`, `index-group`, `show-indices-toggle`, `index-min/max-*`, `index-range-value`, `index-decimals*`, `reverse-26-toggle`, `colorblind-toggle`, `audit-*`, `report-*`, `dealer-modal*`, `toast`, `metric-*`, `workspace`, `chart-panel`, `reset-rules`, `clear-hand`, `undo-count`) plus `data-step-target/dir`, `data-card`, `data-delta`, `data-view`, `.mobile-tab`, `.action-cell`, `.dealer-head`, `.selected-cell`, `.active-index`, `.index-hidden`, `.colorblind`, `.ev-mode`, `.show` must survive or be renamed in app.js in the same change.

---

## dice/reports/ — Fair Dice Payout Explorer

- **Purpose & audience**: exact-arithmetic explorer of zero-EV integer payout schedules for N dice (four scoring modes), a custom checker, an animated Play table with session percentile, and a second workspace of two-dice matchup reports (compare, 3-rule cycles, play matchup, 1,024-cell matrix, two/four-dice event odds). Audience: game designers / probability enthusiasts; dense, reference-grade.

### Screens / states / flows
- Three `<main>` workspaces swapped by `data-view` on `<body>` via the header `.view-nav` (`index.html:35-48`, `app.js:55-94`): **Explore** (`#explore-workspace`: results table + inspector sidebar), **Matchups** (`#matchups-workspace`, rendered by `matchups.js:70-140` with its own 6-tab `.match-tabs` nav and panels `compare / cycles / play / catalogue / events / four`), **Play** (`#play-workspace`: face picker, 3-D canvas dice stage, roll speed, Roll button, recent rolls, paytable sidebar). A 4th nav button "Analysis" exists only on phones to reveal the inspector (`index.html:38-44`, `styles.css:204-206, 1459-1461, 1534-1539`).
- Explore header sub-row: mode tabs (Chosen face / Single sets / Full sets / Sums), dice count tabs, Probabilities button, `#mode-description` hint (`51-86`).
- Five `<dialog>`s: Filters, Exact outcome distribution, Ranking & coverage, Custom payout checker, Session percentile (`476-891`).
- States: `#search-status` live region ("Preparing exact search…", "Partial search", "rule catalogue"); `#empty-state`; `#filter-error`/`#play-error`/`#match-error` `role=alert`; `#featured` reference schedule; `#selection-name` "Finding schedules…"; `#session-percentile[data-state="empty"]` "—"; dice stage `data-effect="ready|loss|push|win|big-win|jackpot"` drives glow colour (`styles.css:1150-1167`); `.landed` triggers halo/reveal animations and particles (`1168-1231`).
- Keyboard: arrow keys move schedule selection in the table (`#results-scroll tabindex=0`, caption text), skip link, `aria-sort` on sortable headers (`app.js:354-359`).

### Current visual language
- Tokens `styles.css:1-16`: page `#101216`, panel `#15181d`, raised `#1e232a`, ink `#f0f1f2`, muted `#a0a8b3`, line `#2c323b`, accent `#e9c46b` (matches the hub dice accent), positive `#a7d6bc`, negative `#f0a29a`. **Font: `-apple-system, BlinkMacSystemFont, "Segoe UI"` — not Inter** (`13`); base 14px; all `td`, `.mono`, `.formula` in `ui-monospace` (`97-102`). Page bg is a lighter, bluer black than the hub `#08090d`.
- Weights are the lightest of the group (350–650), letter-spacing −0.5/−0.7px on headings, uppercase eyebrow `10px/650/1.5px` (`122-128`). Visually the most "editorial/data" page; closest to a Bloomberg-terminal register.
- Radius: 6px controls (`34`), 7px mode tabs, 8px roll-speed, 12px dialogs (`696`). No shadows except roll-button glow (`1246`). Backdrop blur on dialogs (`702-705`).
- Hard-coded colours: active tab `#29261e`/`#655632`/`#756039` (`202, 274-275, 1051-1053`), input border `#414854` (`332, 695`), featured `#1c1b17` (`345`), row hover `#191d23`/selected `#25231b` (`438-441`), td border `#242a32` (`427`), neutral `#c4cbd4` (`110`), roll-speed active `#303038` (`1267`), push `#a6bcd5` / big-win `#95dacf` (`1153-1161`), the accent repeated literally as `#e9c46b` in `--glow` (`1056`), roll-button shadow (`1246`), paytable hit (`1354`), favicon; heat scale `#20272b→#79c2a0` (`matchups.css:471, 516`); SVG baseline `#454b55` in `app.js:406`; `#ffffff03` row hover (`matchups.css:562`). 35 unique hex in styles.css.
- Animation: reveal 0.2s, halo 0.5s, spark particles 1s, outcome bar width 180ms, cycle-appear 180ms; `prefers-reduced-motion` disables all and hides particles (`1946-1957`, `matchups.css:935-939`, `cycles.css:276-290` is opt-in). Good.

### Layout
- Fixed app shell: `html, body { overflow: hidden }`, `.app-shell { height: 100dvh; max-width: 1920px }` (`20-29, 151-158`); header 70px topline + controls row; Explore = `1fr | 340px` grid (`291-296`; 390px ≥1600, 290px ≤1100); Play = `1fr | 300px`; Matchups workspace scrolls as a whole (`matchups.css:5-15`, max-width 1400). At `max-height: 500px` the page falls back to normal document scroll (`1921-1945`).
- Mobile (≤760): Explore becomes a single block; inspector hidden until "Analysis"; sticky "← Back to schedules" bar (`1505-1539`); Play stacks with a 230px-max paytable in a 3-column grid of 8–9px text (`1718-1763`); landscape-phone override (`1842-1920`) hides the result detail, featured strip and table foot. Matchups: controls collapse to 3 columns, charts stack, bar column hidden (`matchups.css:756-917`); the matrix keeps `min-width: 970px` and scrolls with a sticky first column (`587-615`). Cycles switch the list to a `<select>` picker plus a filter toggle (`cycles.css:426-461`). Play-matchup actions become a sticky bottom bar (`matchup-play.css:248-257`).
- Data tables on narrow screens: `#results-table` scrolls both axes inside `#results-scroll` with sticky header and sticky rank column (`380-457`); `.match-table` wraps in a `role=region tabindex=0` scroller (`matchups.js:46`). Good mechanics, undersized type.

### Controls inventory
- Global `button` 40px min-height, 1px border, transparent (`36-58`); `.quiet-button` (12px), `.text-button` (11px link-style), `.primary-button` (gold fill, 12px, `221-231`), `.close-button` 40px "×"; `.view-nav` (pill, pressed = tinted bg), `.mode-tabs`/`.dice-tabs` (segmented in panel), `.roll-speed` (bordered segmented), `.match-tabs` (underline tabs, `matchups.css:35-51`), `#face-buttons` (38px squares), `.rank-button`, `th button` sort buttons, `.match-pick` text buttons, `.match-roll-grid`/`.match-matrix` heat buttons, `.cycle-list button` rows, `.cycle-paging` ←/→; `select`/`input` 40px with `#414854` border (`328-338`); `.toggle-label` custom switch (`774-820`); `#match-handicap-slider` range; `<details>` ×6 (`#math-reference`, filters disclosure, scoring limits, percentile method, three `.match-details`); SVG charts (`.payout-chart`, `.match-chart`, `.cycle-diagram`); canvas dice (`dice-view.js:133`); `.probability-track`, `.match-outcome-bar`, `.match-event-track` bars; `.metric-grid`, `.match-metrics`, `.pnl-block`, `.proof-badge` stat displays.
- Four distinct tab/segmented styles coexist on one page (`.view-nav`, `.mode-tabs`, `.roll-speed`, `.match-tabs`).

### Problems found
- **P1 Type floor**: 8px — `.chart-head span` (`styles.css:568`), `.contributions small` (`646`), `.paytable-row` on ≤380px (`1836`); 9px — `.exact-tag` (`376`), `th small` (`416`), `.schedule-value small` (`539`), `.metric-grid small` (`602`), `.contributions th/td` (`634, 643`), `.payout-chart text` (`581`), `.paytable-row small` (`1346`), `.sort-label` on mobile (`1553`), `.search-meta` mobile (`1583`), `.match-axis-corner` (`matchups.css:464`), `.match-metrics small` mobile (`804`); 10px — eyebrow, `.sort-label`, `th`, `.feature-name`, `.search-meta`, `.jumps`, `.formula`, `.contributions`, `.table-foot`, `.selection-bar .hint`, `.cycle-visual figcaption`, dice tab sub-labels. Muted `#a0a8b3` at 9–10px on `#101216` is below AA for that size.
- **P1 Mobile paytable** (`1744-1763`): 3-column grid, 44px rows, 8–9px labels, 15px numbers — the thing a player needs mid-roll is the least legible element.
- **P2 Reference prose inside a 340px sidebar**: `#math-reference` is ~900 words at 11px/1.7 (`index.html:202-341`, `styles.css:654-669`); the coverage dialog repeats much of it (`660-764`). Information architecture: explanatory docs should be a page/section, not a `<details>` under the inspector.
- **P2 Dead markup/CSS**: `#filters-disclosure` summary hidden (`727-729`) and `.ranking-note { display:none }` (`828-830`) make `index.html:489-490` and `593-630` unreachable; `.contribution-bar { display:none }` (`651-653`) while `app.js:425` still emits it; `.live-dot` is a decorative green dot inside the h2 (`index.html:96-99`); `[hidden] !important` (`94-96`).
- **P2 Copy**: `<title>` "Fair Dice Payout Explorer" vs `h1` "Fair Dice Payout Lab" (`index.html:14, 33`); "↗" is used on in-page actions (`Play ↗`, `Roll dice ↗`, `Play this schedule ↗`, `Analyze this matchup ↗`) where it conventionally means external link; nav `aria-label="Workspace"`.
- **P2 Heat buttons** `color:#fff` on mint at high heat (`matchups.css:469-475`) unless inline `--heat-ink` is set; the `.match-chart text { font-size: 17px }` at ≤480px is a viewBox-scaling hack (`918-922`).
- **P2 Font**: system stack while the rest of the site is Inter; mono for every `td` globally (`98`) including rule descriptions (`262-264` overrides back).
- **P3 `!important`**: `.match-slider-label { flex-direction: row !important }` (`matchups.css:411`) fights the generic `.match-shell label` column rule (`70-76`); reduced-motion `!important`s.
- **P3 Dice count tabs** hide the "1 Die" button (`index.html:64`) yet the checker select disables "1" (`796`) — two different mechanisms for the same unavailable option.
- **P3 Radius** 6/7/8/12px inconsistent; hub is 16px.
- **P3 Topbar** on ≤480px hides the h1 entirely (`matchups.css:927-929`); the page then has no visible title.

### Redesign recommendations
- **P1** Adopt hub tokens and Inter; keep gold accent; raise the type floor to 11px (labels) / 12px (body), cap muted-on-dark at ≥4.5:1 for anything under 14px; keep mono only for numeric columns.
- **P1** Unify the four tab styles into the shared segmented control; keep `aria-pressed` state and `data-*` hooks (tests).
- **P1** Redesign the mobile Play paytable as a horizontally scrolling strip of readable tiles (≥12px) with the current row highlighted; keep `[aria-current="true"]`.
- **P2** Move "How the math works" and the coverage text to a dedicated "Method" tab/section (or `dice/reports/README`-backed page); keep short per-metric tooltips in the inspector; remove dead filters-disclosure/ranking-note markup.
- **P2** Replace the standalone "Analysis" mobile button with the inspector as a bottom sheet or second tab, consistent with the other pages; keep `data-view="analysis"` and `#back-to-schedules` because the browser test exercises them.
- **P2** Tokenise the heat scale and glow colours; drop the `#e9c46b` literals.
- **Keep**: the a11y scaffolding (skip link, `sr-only` captions, `aria-sort`, live regions, `role=region` scrollers, `aria-describedby` on handicap, `role=alert` errors), the sticky rank column + header, `<dialog>` system with one `.dialog-head/.close-button` recipe, the dice canvas renderer and `data-effect` glow system, cycles diagram, reduced-motion handling, `max-height:500px` fallback to document scroll.

### Constraints to preserve
- No playing cards on this page.
- Browser tests (Playwright, run against the assembled site) are large and selector-heavy. `tests/browser.cjs` relies on ids: `#allow-zero #analysis #apply-repair #back-to-schedules #checker-mode #checker-n #checker-payouts #checker-result #choose-schedule #coverage-dialog #dice-stage #distribution #empty-state #face-picker #filter-error #inspect-feature #inspector #inspector-stdev #max-payout #max-results #min-p0 #open-checker #particles #percentile-detail #percentile-dialog #play-custom #play-inspected #play-paytable #play-schedule #play-selected #play-subtitle #play-workspace #pnl #ranking #reset-filters #reset-pnl #result-detail #result-label #result-payout #results-body #results-head #results-scroll #roll-button #round-count #search-status #selection-name #session-percentile #session-sigma-bands #session-spread #session-stdev #session-zscore #strict #sum-family`; classes `.die .die-canvas .die-value .die.match .is-rolling .payout .paytable-row .play-table .rank-button .recent-rolls .results-panel .simplicity-cell .stdev-cell .sum-rule-cell`, states `.die[data-state="rolling|settled"]`, `#results-body tr.selected`, `#play-paytable [aria-current="true"]`, `.rank-button:focus`; data hooks `[data-close=…] [data-open=…] [data-mode=…] [data-n=…] [data-view=…] [data-roll-speed=…] [data-sort=…] [data-face-choice="6"]`; counts (`#results-head th` = 7 in Sums mode); and visible text: `#analysis h2` /Rank 01/, `#analysis` /3 of 5 nonzero payouts share 2/ and /= 0 \/ 6^N = 0/, `#coverage-dialog` /50% simplicity/ and /7\/(4q)/, `#checker-result` /Exact numerator: 6/ and /Exactly fair/, `#search-status` /Partial search/ and /rule catalogue/, `#filter-error` /whole numbers|range/, `.sum-rule-cell` /Multiply by/, `#result-detail` /1 + 2 + 3 + 4 + 5 + 5 = 20/, `#pnl` "+2"/"+12"/"0"/"+60", `#round-count` "0 rolls", `#session-percentile` "—", `#session-zscore` "+1.00σ", `#result-label` per-mode labels. Tests also set viewports (1440×960 and phone) and check `#face-picker` / inspector visibility, so the responsive `data-view` mechanics must keep working.
- `tests/matchups-browser.cjs`: `#match-a #match-b #match-swap #match-reset #match-handicap #match-handicap-slider #match-handicap-note #match-balance #match-error #match-result #match-roll-detail #match-jump-featured #match-featured-title #match-featured-body #match-margin-chart rect` (21) `#match-margin-thresholds tbody tr` `#match-matrix #match-matrix-metric #match-matrix-scope #match-search #match-filter #match-sort #match-download #match-catalogue-body #match-catalogue-status #match-event-search #match-events li #match-four-search #match-four-events li #match-agreement-grid #match-agreement-summary #match-agreement-y #matchups-workspace #explore-workspace #selection-name`, `.match-metrics strong/small` (nth order), `[data-match-tab=…] [data-match-roll] [data-match-a][data-match-b]`, text /146 \/ 1,296 = 73\/648/, "0.00%", /outside the chart/, /36\/36 wins/, /0\/36 wins.*1\/36 ties.*35\/36 losses/, /44.37%.*575\/1296/, /30.56%/, CSV strings.
- `tests/cycles-browser.cjs`: `[data-cycle-id] [data-cycle-edge] [data-cycle-play] #cycle-title #cycle-detail #cycle-count #cycle-filter #cycle-search #cycle-filter-toggle #cycle-mobile-select #cycle-play-back .cycle-odds .cycle-wins > strong .cycle-ties > strong .cycle-wins > .match-exact`, text "High, sum & low", "50.23%" etc.
- `tests/matchup-play-browser.cjs`: `#match-play #match-play-a/-b #match-play-a-score/-b-score #match-play-a-detail #match-play-compare #match-play-count-wins #match-play-exact-wins #match-play-error #match-play-handicap #match-play-history li #match-play-reset #match-play-result #match-play-roll #match-play-rounds #match-play-speed .match-play-count .match-play-dice .match-play-score strong .match-play-stats .die .die-value .is-rolling canvas [data-match-panel="play"] [data-match-start]`, text /B wins by 10/, /Rule score 2 \+0.5 handicap/, "—".
- Unit tests (`*.test.mjs`) are pure logic; no DOM.

---

## cards/ — Card Table Workshop

- **Purpose & audience**: a sandbox card table / game-prototyping tool: zones, seats, decks, custom cards, macros, scoring, bots, rules documents, online rooms (PeerJS), replay, tour. Audience: designers playtesting card games, plus casual play. Installable PWA (`manifest.webmanifest`, `sw.js`).

### Screens / states / flows
- Shell: topbar (`index.html:17-47`: MS brand link, editable table-name input, live turn strip, undo/redo, "View as" select, react, Online, New game, More menu, side toggle); `.workspace` = felt `<main class="table">` (Table zones section + Seats section) and a 360px side panel with 7 icon tabs (Play, Scores, Players, Deck, Tools, Log, Rules) rendering `#pane` from `PANES[prefs.tab]` (`app.js:1154-1171`).
- Overlays: `#selectionBar` (fixed, bottom-centre; multi-select actions), `#replayBar` (fixed violet), `#dock` (phone macro bar, `app.js:5067-5078`), `#tour` spotlight + bubble, `#toasts`, `#passScreen` (hot-seat hand-off), one reusable `<dialog id="dialog">` filled by `openDialog()` (`app.js:1629-1655`) with `.dlg-head/.dlg-body/.dlg-foot`, `.menu` context menus, `.float-label` score pops, confetti, `.game-over` sticky banner, `.offers` trade banners, `.around` seating layout alternative (`styles.css:703-722`).
- States: `.zone.legal/.illegal/.drop-hover/.can-drop`, `.seat.current/.me/.out`, `.card.selected/.kbd-focus/.used/.peeked/.exposed/.private/.dragging/.armed/.flash/.flip-in`, `.eval.best/.tone-*`, `.pill.rec` recording pulse, `.empty-state`, body `data-size`, `data-felt`, `data-contrast`, `data-motion`, `.side-collapsed`.

### Current visual language
- Tokens `styles.css:1-28`: bg `#08090d` (= hub page), panels `#11151e/#161b26/#1c2230`, text `#eef4ff` (= hub ink), muted `#95a2b6`, dim `#626e82`, line `#262e3d`; accents cyan `#45d6ff` (primary), green `#bdf46b`, rose, gold `#f4c95d` (= hub blackjack accent, used for phase/lead/warn), violet, orange, danger, ok; radius 10px; felt gradients per `data-felt` (`35-39`); Inter. Closest of the four to the hub base, but the cyan primary matches no family and no `data-family` is set (`index.html:2`).
- Felt: radial gradients + a fixed fractal-noise overlay (`173`) that is `position: fixed; inset: 0` and therefore also tints the side panel.
- Type: 14px base; 24 distinct sizes (9.5–34px), weights 550–900 (`850` ×17, `800` ×11, `750` ×11). Uppercase letter-spaced micro labels at 9.5–11px (`.eval .kind` 9.5px `363`, `.menu-label` 10.5px, `.preset .fam` 10px, `.block-head h3` 12px).
- Colours: 65 unique hex, 97 occurrences — the most of the group; gold tints `rgba(244,201,93,x)` appear ~20 times inline; `#0c1017` input/dark surface literal ×8; `#04121a`, `#061015` text-on-accent literals.
- Animations: `pop` (dialogs/menus/toasts), `rise`, `flash`, `flip-in`, `shuffle-wiggle`, `slap-hit`, `roll`, `ping`, `float-up`, `confetti-fall`, `rec-pulse`; reduced-motion + `data-motion="0"` both clamp durations (`879-881`).

### Layout
- Desktop: `.app` grid rows `auto 1fr`, `html/body 100%`, `body overflow hidden` (`42-50`); `.workspace` `1fr | 360px` (320px ≤1100, `830-837`); felt scrolls (`.table overflow:auto`, 110px bottom padding for the fixed bars); pane scrolls. True app shell.
- Mobile (`≤820px` or short coarse-pointer, `838-874`): side panel becomes a fixed bottom sheet `min(72vh, 620px)` with a `.sheet-handle`; `.dock` macro bar, `.selection-bar`, `.toasts`, `.replay-bar` are all fixed at the bottom edge with hand-tuned mutual offsets (`body:not(.side-collapsed) .selection-bar { bottom: calc(min(72dvh,620px) + 8px) }`, `960-968`); topbar collapses to two rows, hides view-select/side-toggle/Online (`991-997`). Landscape phones get a third set of overrides (`1004-1013`).
- Cards: `--card-width` 70px default, 54/70/88/108 by preference (`30-33`), 42–78 on phones (`839-842`); layouts spread/grid/overlap/fan/stack/free (`262-271`).
- No data tables of note; the score table scrolls horizontally (`score-table-wrap`).

### Controls inventory
- `.btn` family: base 32px, `.primary` (cyan), `.good`, `.danger`, `.ghost`, `.sm` 26px, `.icon` 32px, `.sm.icon` 26px (`60-83`); `@media (pointer: coarse)` raises to 36/32px and adds an invisible halo to `.btn.sm/.pill.phase/.chip` (`881-900`). `.field` + inputs 32px; `.seg` segmented; `.tabs button` icon+label stacked 11px (10px ≤1100); `.pill` family (phase/round/net-on/rec/small-pill/good-pill); `.chip`, `.phase-chips`, `.unseen-chip`; `.macro` tiles; `.list-row`; `.score-table` editable inputs; `.peg-lane`; `.prob-bar`; `.stat-row`; `.die` (white 36px square); `.timer`; `.log-item`; `.preset` cards with mini shared cards (`app.js:1660-1665`); `.menu` popovers; `.dlg-*`; `.tour-*`.
- Icons: inline SVG in the topbar/tabs, but **emoji** for React (😀, `index.html:31`), Hint (💡), exposed (👁), lock (🔒 / ▦), bots (🤖), table-talk stats (👋🔍🤥👑🤝), close "✕" text.

### Problems found
- **P1 Fixed-overlay stack on phones**: five independently positioned fixed bars (side sheet, dock, selection bar, toasts, replay bar) with offsets computed from each other (`838-874, 960-968, 1004-1013`). Any size change breaks another bar; the dock and selection bar can overlap the sheet handle.
- **P1 Keyboard/AT access to cards**: cards are `div`s (`app.js:378-406`, `tag: "div"`), focus is simulated by `.kbd-focus` (`styles.css:321`); only 11 `aria-label`s and 3 `role`s in 5,146 lines of app.js; `#tabs` has `role="tablist"` but its buttons have no `role="tab"`/`aria-selected` (`index.html:74-82`); `.zone.illegal::after { content: attr(data-why) }` (`239`) is CSS-only text; the `.on` class is the only state on tabs/chips/segments.
- **P2 Append-only CSS**: the `(max-width: 820px), (max-height: 500px) and (pointer: coarse)` query is repeated five times (`838, 960, 969, 991, 1000`); `.dock` (`780, 927`), `.offer` (`907-908`), `.topbar` (`125, 918`) are each defined twice; a "polish pass" section (`915+`) layers overrides instead of editing the base. 10 `!important`s — `.title-input` ×4 (`137-141`) plus again at `996`, `.zone-here` ×2 (`253`), `.inspect-card .card` (`662`), `.desktop-only` (`843`), `[hidden]` (`51`).
- **P2 Touch targets**: `.btn.icon` 32px desktop/36px coarse; `.zone-tools .btn` 22px (`250-251`, 28px coarse); `.btn.sm` 26px; `.tabs button` 10–11px text with 3px padding at ≤1100px (`833-834`).
- **P2 Density of the side panel**: seven tabs in 320–360px; tab labels at 10–11px; each pane is a long `grid gap 14px` of `.card-block`s; the "Tools" tab is a grab-bag.
- **P2 Radius mismatch with the shared card**: custom cards, `.stack-depth` and `.mini-custom` use `border-radius: 10% / 7.1429%` (`273, 290-302, 540`) while `shared/cards.css:51` uses `8% / 5.7143%`, so custom and standard cards in the same hand have different corners.
- **P2 Dice**: `.die` here is a flat white square with a numeral (`463`), while `dice/reports` has a canvas 3-D die — two dice renderers on the site.
- **P3 Emoji icons** render differently per OS and cannot be themed; mixed with SVG.
- **P3 `peerjs` from unpkg** (`index.html:106`) is the only third-party runtime script in the group; it is not in the SW cache list, so "offline" rooms silently fail.
- **P3 Felt noise overlay** is `position: fixed` and covers the whole viewport (`173-181`), not just the table.
- **P3 Print** CSS lives in an app.js string (`app.js:4505`).

### Redesign recommendations
- **P1** Collapse the bottom overlays into one bottom "stage" region: a single sheet with a persistent 48px action row (macros / selection actions / replay transport swap in by state) and toasts anchored above it; compute one `--stage-height` custom property and let everything offset from it.
- **P1** Make cards `button`s via the shared component (`tag: "button"`), keep `.kbd-focus` as a visual for the roving tabindex, add `role="tab"/aria-selected` on `#tabs`, `aria-pressed` on toggles, and visible text for `data-why`.
- **P1** Adopt hub tokens; pick a family accent (cards has none — propose the hub's generic `--accent-2 #8ab4ff` or a new `data-family="cards"` entry in hub.css rather than cyan `#45d6ff`); keep `--gold` only for "phase/lead" semantics.
- **P2** Rewrite the responsive section once: one mobile query, one landscape query; remove the "polish pass" layer and the duplicated selectors; replace `!important`s on `.title-input` by scoping the input reset.
- **P2** Reduce the side panel to 4–5 tabs (Play, Table/Deck, Players & Scores, Rules, More) with text labels ≥12px; move Log into a drawer.
- **P2** Align custom-card and stack radii to `8% / 5.7143%`; share the dice face with `dice/reports/dice-view.js` or a new `shared/dice.css`.
- **P3** Replace emoji with the existing SVG icon style; move print styles to a `@media print` block.
- **Keep**: the `.btn` size/variant system, the single reusable `<dialog>` with `method="dialog"` forms and focus handling, `openDialog` API, the `pointer: coarse` halo trick, felt/size/contrast/motion preferences on `body`, zone legal/illegal/drop feedback, `.card.armed` touch pick-up, the preset grid with mini shared cards, SW network-first strategy.

### Constraints to preserve
- Shared cards: standard, joker and face-down cards come from `Cards.html(spec, { tag:"div", className:"card …", selected, attrs:{data-card-id,data-index,data-zone,data-mark}, style })` (`app.js:378-394`); custom cards draw their own face (`.card.custom`, `styles.css:290-316`) in the same box; `--card-width` is set on `:root`/`body[data-size]`/`.card-preview`/`.preset .mini`/`.inspect-card` (`25-33, 727, 538, app.js:3878`). Page-owned states: `.selected .kbd-focus .used .peeked .exposed .private .rot90/180/270 [data-mark] .dragging .armed .flash .flip-in`.
- `cards/tests/*.cjs` are engine/evaluator/preset tests only (`require("../engine.js")` etc.); **no DOM selectors** — the UI can change freely without breaking tests.
- app.js binds to ids in `index.html` (`titleInput turnStrip undoBtn redoBtn viewSelect reactBtn roomBtn roomLabel newBtn menuBtn sideToggle table gameOver offers around tableZones addSeatBtn seats side tabs pane selectionBar replayBar dock tour toasts passScreen passName passReady dialog`), `data-add-zone`, `data-tab`, and classes `.on .side-collapsed .mobile-only .desktop-only .sheet-handle .tour-spot .tour-bubble`; renames must be done in app.js too.
- PWA: `sw.js:2-3` caches `./styles.css` and the shared files by exact path with cache name `card-workshop-v6`; any new/renamed stylesheet or font must be added to `CORE` and the cache version bumped, or installed clients keep the old CSS. `manifest.webmanifest` `theme_color/background_color #08090d` should follow the new page colour.

---

## microtonal-lab/ — Microtonal Lab

- **Purpose & audience**: browser synth for exploring tunings: preset bank (EDO/just/world/free), a QWERTY-mapped pitch grid, a canvas "scope" visualisation, pitch readouts, an 8-step pulse sequencer, and a tuning builder (equal / list / generator) with a scale map. Audience: musicians/tuning hobbyists on desktop keyboards; touch is secondary.

### Screens / states / flows
- Single `<main class="lab-shell" data-view="play">` (`index.html:12`): topbar (brand mark, eyebrow + h1, 4-tab `.lab-nav` Play/Scope/Tunings/Builder, transport "Start audio" + "!" panic); `.workbench` 3 columns: **Tunings** aside (`data-pane="tunings"`: count pill, search, 5 family tabs, preset list), **instrument** column (command panel `data-pane="play"` with root frequency, wave, volume/brightness/release ranges, Hold/Drone/Pulse toggles; `.visual-layout data-pane="scope"` with canvas + overlay meters and a readout panel with readout grid, pulse steps, tempo; keyboard panel `data-pane="play"` with range −/+ and the key grid), **Builder** aside (`data-pane="builder"`: 3 mode tabs, form sections, "Load tuning", scale map).
- Mobile (<900): `data-view` on `.lab-shell` shows one pane set at a time (`styles.css:1119-1123`); at 900–1279 the nav only switches the single sidebar between Tunings and Builder (`989-1025`); ≥1280 the nav is hidden entirely (`254-255`).
- States: `.preset-button.active`, `.key-button.active` (playing), `.is-white-key/.is-black-key/.is-unused-key/.is-harmonic-key/.is-octave-key/.is-anchor`, `.pulse-step.active`, `.scale-step.active`, `.toggle-button[aria-pressed]`, `.builder-form.error-flash` (`952-965`). No explicit empty state for an empty preset search (count pill goes to 0). No tests directory.

### Current visual language
- Tokens `styles.css:1-32`: bg `#08090d` (= hub page), translucent panels `rgba(19,22,29,.9)`, text `#f4f7fb`, muted `#a4afbf`, dim `#6e7888`; accents cyan `#57d6ff`, lime `#a7f06d`, rose `#ff5d92`, amber `#f7c75c`, violet, mint, danger; radius 8px; heavy shadow `0 20px 70px rgba(0,0,0,.38)` on every panel (`20, 408-415`); Inter.
- Body: three stacked gradients (cyan/rose corners + vertical) plus a fixed 44px grid overlay (`47-67`) — its own "aura" that parallels but doesn't match the hub's radial accent aura + 24px dot grid (`hub.css:78-100`).
- Neon multi-accent idiom: active states use a lime→cyan gradient recipe copy-pasted four times (`288-294, 387-394, 511-517, 1019-1025`), primary button cyan→lime gradient with glow (`327-335`), brand mark three glowing bars (`185-222`).
- Type: h1 1.35rem, h2 1rem; **every label is uppercase 0.68rem/800** (`224-239`), eyebrow 0.62rem lime; weights 800–900 almost exclusively (`900` ×8); `.key-cents 0.6rem` dim (`855-862`). 17 sizes, 25 unique hex.
- Focus: inputs get border + cyan box-shadow on `:focus` (`132-138`); `.nav-button:focus-visible` custom (`283-286`); other buttons rely on the UA default ring (not reset — acceptable but inconsistent).
- No favicon (`index.html:8` `href="data:,"`), no meta description, no `data-family`, no link back to the site home (the brand mark is not a link).

### Layout
- Desktop ≥1280: `272px | 1fr | 300px` fixed-height shell (`149-158, 398-406`); preset list and scale map scroll internally; command grid is 6 columns (`575-580`); visual layout `1fr | 300px` (`592-598`); keyboard panel at the bottom with rows `width: max-content` → horizontal scroll (`741-756`). Short desktops (≤860px tall) shrink keys (`969-979`).
- 900–1279: 2 columns, sidebar swapped by nav (`989-1052`), readout grid 4-up.
- <900: everything stacks inside `.workbench { overflow: auto }` (`1108-1113`); `.instrument { display: contents }` (`1115-1117`) so command panel, scope and keyboard become siblings; keyboard keys 52×62px with 12–13 keys per row (`1057-1062`) ≈ 700px wide → the keyboard scrolls horizontally on a phone, and rows are offset like a QWERTY layout (`--row-offset`, `754`), which is meaningless without a physical keyboard. Unused keys still occupy cells as disabled buttons (`app.js:949-965`).
- Canvas `width=1200 height=700` attributes (`index.html:110`) stretched to 100%/100% (`610-614`); the app repaints it but tokens are hard-coded in JS (`app.js:1490-1654`: `#080b10`, `rgba(87,214,255,.58)` etc.), so a palette change needs a JS edit or `getComputedStyle` reads.

### Controls inventory
- `.primary-button` (gradient), `.icon-button` 38px (`342-362`, "!" glyph for panic), `.small-button`, `.toggle-button[aria-pressed]`, `.tab-button.active` (family + builder tabs), `.nav-button[role=tab]`, `.preset-button` (name + badge + meta chips), `.key-button` (letter circle + step + cents), `.pulse-step`, `.pill` (`<output>`), `.field` inputs/selects 38px, ranges (cyan accent, no value readout except tempo `<output>`), `.check-field` checkbox, textarea, `.readout-grid`/`.mini-meters` stat tiles, `.scale-step` rows.
- Three tab controls with three different ARIA treatments: `#labNav` has `role=tablist/tab` + `aria-selected` (`index.html:26-31`) but no `aria-controls`/tabpanels; `#familyTabs` and `#builderTabs` are `role=tablist` with plain buttons and `.active` only (`56-62, 200-204`).

### Problems found
- **P1 Keyboard on touch**: QWERTY-offset rows, 52px keys, horizontal scroll, disabled filler keys — on a phone the main instrument is unusable; nothing adapts the grid to a straight row/column pitch lattice.
- **P1 Brand drift**: a self-contained neon cyan/lime/rose system with gradients and 70px shadows — the farthest from the hub's flat surfaces + single family accent; multi-accent gradients on *active* states fight the "one accent" rule.
- **P2 Type**: all-caps 0.68rem/800 labels and 900-weight headings everywhere; `.key-cents` 0.6rem (~9.6px) in `--dim #6e7888` on near-black (<3:1).
- **P2 ARIA**: inconsistent tab semantics (above); `role="tab"` buttons without `aria-controls`; toggles fine. Range sliders for volume/brightness/release lack `<output>` readouts (`index.html:85-98`), so there is no value feedback.
- **P2 Navigation inconsistency**: the nav exists on narrow screens only; at 900–1279 it shows two buttons that switch a sidebar while "Play/Scope" vanish (`1014-1017`) and the "Tunings" button is force-styled active (`1019-1025`); on wide desktop no nav at all. Four behaviours for one control.
- **P2 Copy/iconography**: "!" for "Stop all notes" (`index.html:35-37`); eyebrow "microtonal instrument" lowercase then CSS-uppercased; "Free" family label unexplained; no home link.
- **P3 Dead CSS**: `@media (min-width: 1280px) .readout-grid` duplicates the base 2-column rule (`981-985`); `.key-button.is-unused-key { opacity: 1 }` (`789`) is a no-op; `[hidden] !important` (`38-40`) but no `hidden` attributes are used in index.html.
- **P3 Favicon/description missing**; `theme-color #08090d` is right.
- **P3 Hover** `translateY(-1px)` on every button including keys (`376-385`) causes jitter while playing.

### Redesign recommendations
- **P1** Adopt hub tokens (flat `--surface`, `--line`, 16px radius or the shared app radius), one accent (suggest the hub's `--accent-2 #8ab4ff` or a new family colour), kill gradients/shadows on controls; keep colour-coding only for *pitch classes* on keys/scope where it carries meaning.
- **P1** Rework the keyboard: on pointer-fine devices keep QWERTY mapping but render as a straight lattice with the letter as a small corner hint; on touch render a scrollable isomorphic grid sized from `--key-size` ≥ 44px with no filler keys; add `aria-controls` panels.
- **P2** One nav: a persistent segmented view switcher (Play / Scope / Tunings / Builder) with the same `data-view` hook, and on desktop show panes side-by-side with the nav acting as "focus" rather than hiding it.
- **P2** Labels: sentence case 12px/600; headings 600; add `<output>` to every range; proper stop icon for panic; brand mark becomes the home link; add favicon + description.
- **P3** Read palette tokens into the canvas via `getComputedStyle(document.documentElement).getPropertyValue(...)` so the scope follows the theme.
- **Keep**: `data-view`/`data-pane` state model, preset list with search + family filter, pulse sequencer, readout grid, builder tabs/sections, canvas scope with overlay meters, `error-flash` feedback, `--key-size/--key-height/--key-gap` custom-property sizing, `pointer`/`touch-action: none` on keys, `Start audio` gesture gate.

### Constraints to preserve
- No playing cards; no tests directory (no automated DOM constraints).
- app.js binds via a `dom` map of ids; keep or rename together: `labShell labNav audioButton panicButton presetCount presetSearch familyTabs presetList baseFrequency waveform volume brightness release holdButton droneButton pulseButton tuningCanvas activePresetName periodReadout stepReadout lastNoteReadout focusedNote frequencyReadout centsReadout ratioReadout familyReadout indexReadout shufflePulse pulseSteps tempo tempoReadout rangeDown rangeReadout rangeUp keyboard builderTabs builderForm customDivisions customEqualPeriod customEqualSize customListType customListPeriod customListValues customGeneratorStep customGeneratorSize customGeneratorRepeat customGeneratorPeriod scaleMap`; attributes `data-view data-pane data-family data-builder data-builder-panel data-preset-id data-key data-index data-slot data-pulse-index`; classes toggled by JS: `.active` (nav/tab/preset/key/pulse/scale/builder-section), `.key-row .key-button .is-used-key .is-white-key .is-black-key .is-harmonic-key .is-octave-key .is-anchor .is-unused-key .key-letter .key-step .key-cents .preset-button .preset-name-row .preset-name .preset-badge .preset-meta .pulse-step .scale-step .error-flash`; `aria-selected` on nav tabs and `aria-pressed` on toggles are set by JS (`app.js:857-861`).

---

## Cross-page summary

### Palettes in use
| Page | Page bg | Surface | Text / muted | Accent(s) | Radius |
|---|---|---|---|---|---|
| hub (`shared/hub.css`) | `#08090d` | `#10141c` / `#151a24` | `#eef4ff` / `#9aa7b7` | per family (`#f4c95d` blackjack, `#e9c46b` dice) | 16px |
| blackjack/strategy | `#090a0a` | `#181a1b` | `#f4f4f1` / `#a4a6a8` | teal `#00b89b` + mint hover `rgba(119,230,182)` | 8px |
| dice/reports | `#101216` | `#15181d` | `#f0f1f2` / `#a0a8b3` | gold `#e9c46b` ✓ | 6–12px |
| cards | `#08090d` ✓ | `#11151e` | `#eef4ff` ✓ / `#95a2b6` | cyan `#45d6ff`, gold `#f4c95d`, green `#bdf46b` | 10px |
| microtonal-lab | `#08090d` ✓ | `rgba(19,22,29,.9)` | `#f4f7fb` / `#a4afbf` | cyan `#57d6ff`, lime `#a7f06d`, rose `#ff5d92` | 8px |

Four different "white"s, four muted greys, three line recipes, four radii, two cyans that are not the same cyan.

### Font stacks
- Inter + system fallback: blackjack, cards, microtonal (none set the hub's `font-feature-settings: "cv11","ss01"`).
- `-apple-system, BlinkMacSystemFont, "Segoe UI"`: dice (`dice/reports/styles.css:13`).
- Mono: dice `ui-monospace` globally for `td`; cards `ui-monospace, Menlo` for rules/formula; none elsewhere.
- Weight registers: dice 350–650 (light), cards 550–900, blackjack 750–950, microtonal 800–900. Any shared type scale must pick one register (recommend 400/500/600/700).

### Duplicated components that should be one shared component
1. **App topbar** — brand/home link (`MS` box in blackjack `styles.css:115-127` and cards `127-134`; `⚄` glyph in dice; non-link bar mark in microtonal), title, status cluster, actions. Microtonal has no way home.
2. **Segmented / tab control** — 12 implementations: blackjack `.segmented .mobile-tabs`; dice `.view-nav .mode-tabs .dice-tabs .roll-speed .match-tabs`; cards `.seg .tabs .phase-chips`; microtonal `.lab-nav .tab-row .builder-tabs .toggle-cluster`. State hooks differ (`aria-pressed`, `.active`, `.on`, `aria-selected`).
3. **Toggle switch** — blackjack `.switch-line/.mini-switch::after` (`537-557`), dice `.toggle` (`793-820`); cards/microtonal use `aria-pressed` buttons or native checkboxes.
4. **Dialog** — blackjack `.dealer-modal/.modal-card`, dice `dialog/.dialog-head/.close-button`, cards `dialog/.dlg-head/.dlg-body/.dlg-foot`; microtonal none. Three close-button styles.
5. **Toast** — blackjack bottom-right slide, cards top-centre pop (bottom on phones); dice uses live regions only.
6. **Stat tile / metric** — blackjack `.metric-pill .count-readout .index-audit .report-grid`; dice `.metric-grid .match-metrics .pnl-block .proof-badge`; cards `.stat-row .pill`; microtonal `.mini-meters .readout-grid .pill`.
7. **Eyebrow / kicker label** — four recipes (0.68rem/800 uppercase, 10px/650/1.5px, 12px/850/.06em, 0.62rem lime).
8. **Buttons** — primary exists in three colours (gold, cyan, gradient) and blackjack has none; icon buttons 32/36/38/40px.
9. **Form field** — label-above-input in all four with heights 32/38/40/42px.
10. **Range + readout** — blackjack stepper+range+number (best), dice plain range + `<output>`, microtonal range with no readout.
11. **Probability / progress bar** — blackjack `.prob-track .ev-bar`, dice `.probability-track .match-outcome-bar .match-event-track`, cards `.prob-bar .peg-lane`.
12. **Dice face** — dice canvas renderer vs cards CSS square.
13. **Mobile view switching** — four mechanisms (blackjack 5 tabs + `data-view`; dice nav + extra "Analysis" button; cards bottom sheet + dock; microtonal nav tabs) and four scroll-region strategies.

### Token drift from the site base
- None of the four pages imports `shared/hub.css`; each redefines `:root` with different token names, so drift is total rather than incremental. Blackjack is the only page whose family accent is defined by the hub and it uses a different colour (teal vs gold) and inverts the hub's Hit/Stand colours. Dice matches its accent but not the page background, font, or radius. Cards and microtonal match the page background and ink but add 3–5 accents of their own.
- `!important` count: cards 10, blackjack 4, dice 5 (4 + 1), microtonal 1. Unique hex literals: cards 65, blackjack 40, dice 35 (+4), microtonal 25.
- Sub-11px text exists on every page except cards (which bottoms out at 9.5–10.5px).

### Three biggest wins for this group
1. **One token source + one app chrome stylesheet.** Load `shared/hub.css` (page, surface, ink, muted, line, radius, ease, family accent via `data-family`) and add a `shared/app.css` for the app-shell parts these pages share (topbar, segmented tabs, buttons, fields, switch, stat tile, dialog, toast, scroll regions). That removes most of the ~5,900 lines of page CSS in this group, fixes the blackjack accent/Hit-colour contradiction, and makes cards/microtonal pick a family colour instead of their own cyans.
2. **A type and contrast floor.** Minimum 11px for labels / 12px for body, muted text ≥4.5:1 at those sizes, three weights. This directly fixes the dice 8–10px data labels and mobile paytable, blackjack's 0.34–0.58rem chart text and white-on-khaki cells, and microtonal's dim 0.6rem cents.
3. **One mobile model.** A single segmented view switcher under the topbar driving `data-view`, one scrolling region per view, and one bottom "stage" for contextual actions (replacing cards' five stacked fixed bars and dice's separate "Analysis" button) — keeping every page's existing `data-view`/id hooks so the dice browser tests and the blackjack solver test keep passing.
