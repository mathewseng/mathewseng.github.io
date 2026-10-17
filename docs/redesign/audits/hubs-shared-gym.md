<!-- Detailed audit appendix. Generated 2026-10-16 from a read-only review of commit 8c0efdb; line numbers refer to that commit. See ../notes.md for the synthesized page-by-page notes and ../prompt.md for the overhaul brief. -->

# UI/UX audit — Group A: landing, family hubs, shared design files, Gym app

Read-only analysis of `/Users/mathewseng/Documents/GitHub/mathewseng.github.io` (ignoring `_site/`, `node_modules/`, `gym/dist/`). Line numbers refer to the files as read on 2026-10-16.

---

## shared/hub.css + shared/hub.js — Shared hub design system

- **Purpose & audience**: The only "design system" on the site. Styles the landing page and five hubs (`ofc/`, `poker/`, `blackjack/`, `dice/`, `backgammon/`); `data-family` on `<html>` picks the accent. `hub.js` is decorative only (pointer-follow light on tiles, hero fan tilt).

### Current visual language (hub.css)
- **Tokens** (`:root`, lines 11-35): dark-only (`color-scheme: dark`). `--page #08090d`, `--surface #10141c`, `--surface-2 #151a24`, `--glass`, `--line rgba(148,163,184,.13)`, `--line-strong .24`, `--ink #eef4ff`, `--muted #9aa7b7`, `--soft #6f7b8b`, `--accent`, `--accent-2`, `--radius 16px`, `--ease`, `--spring`. Blackjack-only semantic colours `--hit/--stand/--double` live globally (24-26).
- **Family accents** (37-55, 943-946, 1578-1581): ofc mint/blue, poker coral/peach, blackjack gold, dice gold, home blue/violet, backgammon teal. The same hex values are re-declared for switcher dots (57-59, 257-267, 1582-1584), hard-coded in the home aura (952-954) and in every landing tile's inline `--accent` (`index.html` 67, 80, 93, 106, 121, 137, 150, 163, 185) and favicons. Six sources of truth for one palette.
- **Font**: `Inter, ui-sans-serif, system-ui…` (30-31) with `cv11/ss01` features — but Inter is never loaded (no `@font-face`, no font link anywhere on the site), so it renders as SF/Segoe unless the visitor has Inter installed. Weights 650 and 750 (218, 240, 363, 840) only exist on a variable font; with the fallback they snap to 600/700.
- **Type scale**: no scale. 17 distinct rem sizes between 0.58rem and 1.04rem plus three `clamp()` h1s. Sub-0.7rem text at 863-869 (0.58rem ≈ 9px), 814-820 (0.62rem), 835-841 (0.66rem), 762-770 (0.68rem).
- **Spacing/radius**: ad hoc px (2/3/4/5/6/8/10/12/14/16/18). Radii 16 (`--radius`), 12 (714), 11 (581), 10 (993), 9 (196, 1528), 3 (866), 999 (pills). Only one radius is a token.
- **Shadows/backgrounds**: all literal rgba (403-406, 506-508, 553-555, 745-749, 784-786). Fixed `body::before` 88vmax aura with a 26s infinite animation (89-99) and dot grid (101-106).
- **Motion**: 13 keyframes (1152-1273). Infinite loops on every hub page: `aura` 26s, `bob` 6s per fan card, `spin` 40-48s chips, `glow` 7s, `breathe` 2.4s, `ping` 2.2s, `turn` 9s (poker seats), `eq` (hover-only). Reduced-motion is handled by a blanket `animation: none !important; transition-duration: .01ms !important` (1275-1282) — the only two `!important`s in the file, acceptable. `@view-transition { navigation: auto }` is correctly gated behind `prefers-reduced-motion: no-preference` (5-9); `view-transition-name: hub-title` (326) and `hub-switcher` (229) give cross-document morphs between hubs.

### Layout
- `.shell` = `min(1200px, 100% - 32px)` column, `min-height: 100dvh`, footer pushed to bottom (144-156). Pages scroll normally; the "fit the viewport" app-shell rule in README does not apply to hubs, though a "short desktop" media query (1286-1359, `min-width: 881px and max-height: 820px`) shrinks everything and clamps tile copy to **one line** (1343-1345).
- Breakpoints: 880 (tablet), 640 (phone), 480 (backgammon-only `:has()` hack 1585-1593), 881×820 (short desktop). Not shared with gym (Tailwind 640/768/1024/1280).
- Phone (1405-1576): tiles become 3-column grids (`art | text | arrow`) via `display: contents` on `.tile-foot`/`.tile-main` (1497, 1516); `.tags` are hidden entirely (1520); featured previews hidden (1568); chips hidden (1474).
- Tablet: `.tile--featured` collapses to one column (1398) but keeps the preview, so the OFC/Poker/Blackjack featured tile is very tall between 641-880px.

### Controls inventory
- `.switcher` pill nav (221-283): links with coloured dots; `aria-current` state. **Touch target ≈ 28px tall** (padding 6px 12px, 0.82rem) — below 44px. No `:focus-visible` style (UA default only). On phones it stretches to full width (1411-1420).
- `.crumbs` (170-219) with `.mark` monogram; no focus style.
- `.tile` (493-573): hover lift, pointer light (`::before`), accent edge (`::after` with `mask-composite: exclude`, 533-547), `:focus-visible` outline 2px accent (565-568) — good. `.go` arrow pill 30px (647-680).
- `.tags span` chips (636-645), `.facts li` chips (349-365), `.eyebrow` (295-313), `.group-head` (452-474).
- No buttons, inputs, tables or forms exist on hub pages.

### Problems found
1. **~45% of the file is per-page illustration code living in the shared file**: poker table (728-793), OFC board (795-847), blackjack chart (849-939), landing `.art-*` (985-1108), hero fan/chips (367-444). Each block is used by exactly one page. Duplicates: `.ofc-row .empty-slot` (827-831) ≡ `.art-ofc .empty-slot` (1039-1043); `.chart-grid span.hit-me` (903-909) ≈ `.art-chart span.hit-me` (1062-1068); `.preview .playing-card` (722-726) ≡ `.tile-art .playing-card` (1000-1004); `.H/.S/.D` selectors doubled (888-901).
2. **Hard-coded colours outside tokens**: `#fff` (110, 322), `#0b0d12` (673, 1220), `#232a37` (782, 1228), `#e2e8f0` (765), `#f8fafc` (435), felt `#1b5e45/#0f3527/#0a2119/#2a1d17` (744-746), `rgba(148,163,184,…)` repeated at 17, 18, 271, 281, 640, 847; `rgba(8,9,13,…)` at 405, 718, 996; `rgba(226,232,240,.07)` at 103; home aura literal accents 952-954.
3. **Backgammon family block appended at the end** (1578-1593) after the media queries, with a `:has(a[data-to="backgammon"])` selector to wrap the switcher only on pages that include that link — a magic conditional that will break as soon as the switcher is made consistent. The dice dot rule sits before the reset (57-59) while other dots are at 257-267.
4. **Contrast / size**: `--soft #6f7b8b` on `#08090d` ≈ 4.6:1 — passes AA for body text but it is only ever used at 0.58-0.76rem (9-12px) (470-474, 814-820, 863-869). `.chart-grid b` 0.58rem is effectively unreadable at `aria-hidden` sizes but it is decorative.
5. **Hover-only content**: `.fan:hover` (421-424), `.tile:hover .art-fan` (1021-1025), `.tile:hover .art-wave` play-state (1106-1108), tile light (`hub.js` gated to `pointer: fine`). Touch users get a static page; no harm but means the "delight" layer is desktop-only.
6. **Infinite animations on fixed full-viewport pseudo-elements** (`aura`, 98) keep compositor work running on idle hub pages; `body::before` at 88vmax with two radial gradients plus `backdrop-filter: blur` on the switcher/facts (228, 354) is heavy on low-end phones.
7. **`text-wrap: balance/pretty`** (124-132) and `color-mix(in oklab…)` are fine in 2026 browsers but there is no fallback for `mask-composite` on older Safari (only unprefixed `mask`, 540-543).
8. **Cache-busting drift**: `hub.css?v=20261003` on landing/ofc/poker/blackjack, `?v=20261007` on dice, `?bgv=<hash>` on backgammon; `cards.css?v=20261004`. Manual query strings are already inconsistent.
9. `.tiles > .wide` (489-491) and `.tile--row` (1111-1124) exist for exactly one tile each.
10. `hub.js` is fine (29 lines, rAF-throttled, respects reduced motion and coarse pointers). Only nit: it writes `--mx/--my` in px while the CSS default is `50% / 0%` (494-495) — units differ but it works.

### Redesign recommendations
- **P1** Split into `shared/tokens.css` (colour incl. light scheme, 6-step type scale with a 0.75rem floor, 4/8-based spacing scale, 3 radii, 2 shadows, motion tokens), `shared/chrome.css` (shell, topbar, crumbs, switcher, footer, focus ring), `shared/tiles.css` (tile, tags, go, group), and move illustrations to per-page files (`ofc/hub-art.css`, …) or drop the static previews in favour of one real screenshot/`<img>` per tool.
- **P1** Make family accents a single map (`[data-family]` only); let the switcher dots, favicons and landing tiles read `--family-<name>` tokens instead of literals.
- **P1** Fix the switcher: ≥44px targets, visible `:focus-visible`, same five links in the same order everywhere (see hub notes), wrap rule not dependent on `:has()`.
- **P2** Either load Inter (self-hosted woff2, `font-display: swap`) or switch the stack to `system-ui` and drop weights 650/750.
- **P2** Replace the always-on aura/bob/spin loops with one-shot entrance motion; keep `rise/deal` entrances and view transitions (they are the best part).
- **P3** Keep: the tile hover/focus treatment, `view-transition-name` morphs, `.eyebrow`, `.facts`, the dot-grid texture, the dark palette values (they are reused by gym dark mode and read well).

### Constraints to preserve
- `shared/hub.css` + `shared/hub.js` are hashed into Backgammon's cache version: `backgammon/tests/deployment.test.mjs:106-112` requires `BG_CACHE_VERSION` to equal a hash over `shared/hub.css`, `hub.js`, `peer-room.js`; any edit must be followed by `node backgammon/scripts/offline-manifest.mjs` (the deploy workflow does this; `validate.yml:27-28` too).
- `backgammon/tests/updates.cjs:262-280` locates `.switcher a` on `/backgammon/` at widths ≤700 and asserts the text does not overflow each link's box and that `scrollWidth <= innerWidth`. Keep the `.switcher a` class and keep links from wrapping/overflowing on narrow screens.
- `backgammon/index.html` (not in this group) also consumes `.shell/.topbar/.crumbs/.switcher/.eyebrow` and overrides `--surface/--line/--muted/--accent/--radius` in `backgammon/styles.css:6-12, 986-987`.
- `data-family` on `<html>` is the documented convention (README line 27).

---

## shared/cards.css + shared/cards.js — Shared playing-card component

- **Purpose & audience**: the single card face used by 14 pages (landing, ofc/poker/blackjack hubs, ofc play/trainer, poker play/rush/ultimate-omaha/edge-the-dealer/dodge/dodge-simulator, blackjack strategy, cards). GTO-Wizard-style four-colour deck, 5:7 ratio, sized by `--card-width` with container-query units.

### Current visual language
- Tokens at `:root` (cards.css 17-35): `--card-spade #504f4f`, `--card-heart #9f2517`, `--card-diamond #2634bd`, `--card-club #4faa41`, `--card-joker #6a3fc9`, back `#1f2128`, text white, focus/selected white, `--card-staged #35d6a0`, `--card-width 56px`.
- Everything inside scales with `cqw` (104, 115, 146, 184) — excellent; sub-43px cards drop the suit mark (127-140). Size presets `.cards-xs…xl` (267-271). `.card-row` gap scales with width (238-243). `.deck-matrix` 13-column grid (251-264).
- Own font stack declared (62-69) rather than inheriting — consistent face everywhere, but it is the third copy of the Inter stack on the site.

### Problems found
1. **`aria-label` on a `<span>` with no role** (cards.js 96; cards.css header comment 8-10). Generic elements with `aria-label` are ignored by most screen readers; the card is announced as "K" or nothing. Needs `role="img"` (or visually-hidden text) on the non-button variant. Buttons (`tag: "button"`) are fine.
2. **`.selected` and `:focus-visible` are the same ring** (201-211): a keyboard user cannot tell "focused" from "selected" on a hand of cards.
3. **Club green `#4faa41` under white rank text ≈ 2.9:1** — fails AA even for large text at small card sizes (the rank is 92-100cqw so it is large at ≥48px cards, marginal below).
4. Hard-coded non-token colours: `#ff6673` danger outline (222), `#06281c` on `.latest` badge (172), `rgba(0,0,0,.55/.5)` badge backgrounds (148, 162), `rgba(255,255,255,.18/.03)` empty slot (196-197).
5. `card-pop` (226-235) is not gated by reduced motion inside this file; only hub.css's blanket rule covers it on hub pages — the game pages that load cards.css alone will animate regardless.
6. `button.playing-card` resets `font-size: 100%` (84) — fine; but `.playing-card.plain` (98) is identical to spade and renders a blank `.card-suit` span (test asserts this, cards.test.cjs:18).
7. The hub pages hand-write the card markup instead of calling `PlayingCards.html()` (index.html 50-53, 68, 81, 138; ofc/index.html 44-46, 73-75; poker 182-186, 214; blackjack 381-382). Works, but any markup change in cards.js must be mirrored in ~40 inline spans.

### Redesign recommendations
- **P1** Keep the component API and markup contract exactly (tests). Add `role="img"` via `attrs` is not possible without changing `html()` output → coordinate with the test file if the markup changes.
- **P1** Distinct selected vs focus treatment (e.g. selected = lift + accent ring, focus = white double ring).
- **P2** Darken club to ≥3:1 (e.g. `#3e8f35`) or add a text shadow; tokenise `--card-danger`, `--card-badge-bg`.
- **P3** Add `@media (prefers-reduced-motion: reduce) { .playing-card.new { animation: none } }` inside cards.css so it is self-contained.
- Keep: cqw scaling, 5:7 ratio, `--card-width` API, deck-matrix order, `.back` monogram.

### Constraints to preserve
- `shared/tests/cards.test.cjs` asserts **exact HTML strings**: line 23-26 `<span class="playing-card suit-h" aria-label="King of hearts"><span class="card-suit" aria-hidden="true">♥</span><span class="card-rank">K</span></span>`; line 28 `<button class="playing-card suit-s selected deck-card" type="button" aria-label="Ace of spades" data-card="As">`; line 31 `<span class="playing-card back" aria-label="Face-down card"></span>`; line 38 `<span class="card-corner">JK</span><span class="card-badge">3</span>`; line 48 `<span class="empty-slot" aria-hidden="true"></span>`. Class names `playing-card, suit-s/h/d/c, back, joker, plain, selected, staged, dim, danger, interactive, card-suit, card-rank, card-badge, card-corner, empty-slot` and attribute order are load-bearing.
- README lines 37-38: pages only set `--card-width` and wrapper states; never restyle the face.

---

## index.html — Mathew Seng Projects (landing)

- **Purpose & audience**: project directory for visitors/recruiters; eight tiles in three groups (Game hubs, Apps & experiments, Source only).
- **Screens/states**: single static page: topbar (crumbs + 5-link switcher), hero with headline + lede + 3 "facts" chips + animated card fan with two chips, three tile groups, footer. No states beyond hover/focus. No loading/empty/error.
- **Visual language**: pure hub.css with `data-family="home"` (blue/violet accent), hero `em` gets a coral→gold→mint gradient (hub.css 966-973), aura uses three family colours. Each tile carries its own inline `--accent/--accent-2` (lines 67-185) and a mini illustration (`.art-fan/.art-ofc/.art-chart/.art-bars/.art-wave`).
- **Layout**: hero 1.35fr/1fr → on phones the fan shrinks to 120×92 beside the title and lede/facts span full width. Tiles `auto-fit minmax(250px,1fr)` (4-up at 1200px, 1-up list on phones). Short-desktop media clamps descriptions to 1 line.
- **Controls**: 5 switcher links, 8 tile links, 1 footer link. Backgammon and Dice tiles use a text `→` (116, 124) while every other tile uses the inline SVG arrow (75, 88, …) — visibly different arrow weight. Backgammon tile art is an `<img>` with an inline `style` (108) instead of a `.art-*` block.
- **Problems**
  1. Hard-coded counts in copy: "8 projects / 23 live pages / 5 game hubs" (43-45), "5 hubs" (63), "3 apps" (133), "6 tools" for Poker (74) vs "7 tools" on poker hub (poker/index.html:175) vs 8 actual tiles there. These drift every time a tool ships.
  2. The Card Table Workshop description (141) is ~190 chars; `.tile p` clamps to 2 lines (hub.css 617) and 1 line on short desktops → always truncated.
  3. Hero fan cards carry `aria-label`s inside an `aria-hidden` container (48-53) — harmless but noisy; same on every hub.
  4. Stagger index reuse: `--i: 3` and `--i: 4` are used twice (106/137, 121/150) so the Apps group animates in sync with the hubs group rather than after it.
  5. No skip link, `<main>` has no id; the switcher dots are the only "which hub is which colour" cue and are 6px.
  6. The page mixes description voice: "Browser tools, card games, and small experiments." (37) vs hub-ese ("Rules-aware basic strategy and Hi-Lo count indices from a Rust solver compiled to WebAssembly", 97) — the latter is jargon for a first-time visitor.
- **Recommendations**: P1 generate the tile list and counts from one data source (even a small JSON + build step, or just remove the counts). P1 unify the arrow glyph and the art container (`<img>` art via a `.art-image` class, no inline style). P2 give each tile room for 3 lines or shorten copy to ≤110 chars. P2 add a skip link / landmark id. P3 keep the hero fan (reduce to one chip), keep the group/eyebrow structure, keep the tile accent-per-project idea but source it from tokens.
- **Constraints**: `data-family="home"`; no tests target this page (the dice/backgammon browser tests only visit `/dice/reports` and `/backgammon/`).

---

## ofc/index.html — OFC Tools

- **Purpose**: hub for Play OFC + three Fantasyland tools.
- **Screens**: topbar, hero (eyebrow "Open-face Chinese poker", h1 "OFC", lede, facts "4 tools / 14–17 card Fantasyland / 0–2 jokers", 3-card fan Qh Qs JK + chip), "Play" group with one `.wide .tile--featured` (text + `.preview` OFC board illustration), "Fantasyland" group with 3 icon tiles, footer.
- **Visual**: `data-family="ofc"` mint/blue; featured preview uses `.ofc-board/.ofc-row/.royalty` from hub.css 795-847 with 30px cards.
- **Layout**: as hub.css. The featured tile's preview is hidden on phones (hub.css 1568) so the "Play" group becomes one row tile.
- **Controls**: 4-link switcher — **no Dice link** (22-27) although the landing (index.html 24-30) and dice hub (dice/index.html 508-514) have five; 4 tiles; footer with two links.
- **Problems**: switcher inconsistency (above); crumbs/footer differ from landing (`<a href="/">mathewseng.github.io</a>` vs `<span>Static pages on GitHub Pages.</span>`); preview cards hand-written (73-75) with `grid-column-start: 3` inline (73); facts "14–17 card Fantasyland" is insider shorthand; SVG icons are inline Feather paths repeated per tile (61, 90, 103, 116) with no sprite.
- **Recommendations**: P1 same switcher everywhere (5 links, fixed order, include Dice). P2 replace the CSS-built preview with a real screenshot of `/ofc/play/` or drop it. P3 keep the featured/secondary split and the facts strip.
- **Constraints**: `data-family="ofc"`; `view-transition-name: hub-title` on `#hub-title`.

---

## poker/index.html — Poker

- **Purpose**: hub for 5 play tools + 3 research tools.
- **Screens**: hero (facts "7 tools / 30 mixed games / Peer-to-peer rooms", royal-flush fan + chip), "Play" group (featured Mixed Poker with animated felt/seats preview + Rush, Ultimate Omaha, Edge the Dealer, 222), "Research" group (Dodge Reports, Dodge Simulator, Poker Calculations), footer.
- **Visual**: `data-family="poker"` coral/peach; felt preview uses literal greens + walnut rail (hub.css 744-749); seat "turn" animation loops forever (791-793).
- **Problems**: facts say **7 tools** (175) but the page lists 8 tiles and the group heads say 5 + 3 (195, 284); the landing says 6 (index.html 74). Two tiles share `--i: 5` (288, 301). "222" tile description is the longest on the site (271) and gets clamped. The 4-link switcher again omits Dice (160-165). Six seats animate in a loop with `color: #0b0d12` literal (hub.css 1220).
- **Recommendations**: P1 fix counts (or remove them). P2 group the five play tools by "multiplayer" vs "prototype" using the tags as a visible filter rather than only chips. P3 keep the felt as an optional static illustration.
- **Constraints**: `data-family="poker"`; `backgammon/tests/offline.test.mjs:164, 242` and `updates.cjs:224` reference `/poker/` and `/poker/play/` URLs only (service-worker tests) — paths, not DOM.

---

## blackjack/index.html — Blackjack

- **Purpose**: hub for Strategy Lab plus three GitHub reference links.
- **Screens**: hero (facts "280 chart cells / ~20 µs per solve / Hi-Lo indices", As Kh fan + chip), "Tools" group with one featured tile (chart-grid preview + key "16 v 10 · Hit"), "Reference" group with 3 external tiles (Solver Report, Metrics Notes, Rust Solver → GitHub), footer.
- **Visual**: `data-family="blackjack"` gold; preview grid uses `--hit/--stand/--double` and a `ping` loop on the highlighted cell.
- **Problems**: external GitHub links are styled identically to app tiles; only the `.go` arrow glyph (diagonal) and visually-hidden "(opens GitHub)" distinguish them (427-463). "~20 µs per solve" is engineering trivia for a hub fact. 100 `<span>` cells with inline `--c` (409) make the file heavy for a static picture. Switcher omits Dice (359-364).
- **Recommendations**: P1 visually separate "Reference" as a plain link list (not tiles). P2 one static chart image. P3 keep the hit/stand/double key — it is the clearest "what you get" preview of the four hubs.
- **Constraints**: `data-family="blackjack"`.

---

## dice/index.html — Dice · Probability tools

- **Purpose**: hub for a single tool (Fair Dice Payout Explorer).
- **Screens**: topbar (5-link switcher in a *different order*: Poker, OFC, Blackjack, Backgammon, Dice), hero with eyebrow/h1/lede only (no facts, no fan), "Tools" group with one `.tile--row` whose icon is a bare `⚄` glyph, footer (`<span>Runs locally in your browser.</span>` + "Source on GitHub ↗" without `target/rel`).
- **Visual**: `data-family="dice"` gold (same hue as blackjack: `#e9c46b` vs `#f4c95d` — the two yellow hubs are hard to tell apart). Does not load `cards.css` (correct, no cards). Prettier-formatted HTML (`><span` chains) unlike the other hubs.
- **Problems**: a hub for one tool is an extra click with no content; the hero's two-column grid keeps an empty right column on desktop; `.tile-icon` glyph has no explicit size so `⚄` renders at body size inside a 36px box; `.tile--row` on phones turns into the generic 3-col grid; no `--i` stagger; switcher order differs from every other page; `hub.css?v=20261007` differs from the rest; title format "Dice · Probability tools" differs from "OFC Tools"/"Poker"/"Blackjack".
- **Recommendations**: P1 either make `/dice/` the report itself (redirect `/dice/` → `/dice/reports/` via `redirects.json`) or give the hub real content (sub-reports as tiles: fair payouts, custom checker, two-dice matchup, probability). P1 align switcher order and footer. P2 pick a distinct accent from blackjack (e.g. a warm orange or lilac). P3 if it stays a hub, give it a fan-equivalent illustration (pips) and facts.
- **Constraints**: `data-family="dice"`; `dice/reports/tests/browser.cjs` only visits `/dice/reports` (line 150) — the hub itself is untested.

---

## gym/ — Gym Tracker (Vite + React + Tailwind v4 + Recharts)

- **Purpose & audience**: personal, local-first training dashboard (calendar, history, exercise progress, goals, session builder, nutrition, notes, settings). Audience is one user on a phone plus the author's laptop.

### Screens / states / flows
- Routes (App.tsx 33-44, hash router): `/` Dashboard, `/workouts` Calendar+history, `/exercises`, `/goals`, `/suggested`, `/nutrition`, `/notes`, `/add` (log/edit workout), `/add-nutrition`, `/settings`. Unknown → redirect `/`. Lazy-loaded with a pulse loader (`PageLoading`, App.tsx 18-29, `role="status"`).
- Shell (AppShell.tsx): desktop (`lg` ≥1024) fixed 16rem sidebar with brand crumbs, 7 nav links, "Log workout" primary, "Data & settings"; sticky 64px header (page name, bench-goal pill, theme toggle, hamburger); mobile bottom tab bar with 5 of 9 destinations (Dashboard, Calendar, Exercises, Suggested, Add) — Goals, Nutrition, Notes, Settings are only reachable via the hamburger dialog (228-238, 253-355). Dialog has focus trap, Escape, `inert` on siblings, `aria-modal` — good.
- Skip link (147-158), focus moves to `#main-content` on route change (107-110), `document.title` per route — good.
- Dashboard: hero "Suggested next session" feature card + Bench trajectory + "October 6 context" cards; 8 metric cards; compact calendar + weekly bar chart; 5 Recharts line/area charts; "Improvement ledger"; "Nearest milestones"; backup notice. **Almost all of it is hand-written literals**, not derived from state: chart series (Dashboard.tsx 27-233), hero copy (360-367), badges "Pull → Legs next" (356), checkpoint copy (416-421), context card (428-446), all 8 metric values (451-501), "five undated sessions" (507), ledger numbers (622-654), milestone 5/10 (670-676).
- Workouts: full calendar (month nav, Latest, day detail panel) + search + type chips + context filter chips + expandable `WorkoutCard`s + collapsible "Undated history". Delete via `window.confirm` (234).
- Exercises: searchable list with category chips, selection scrolls/focuses the detail heading on mobile (Exercises.tsx 38-50 — nice), feature card, 4 metrics, progression chart, rules/integrity cards.
- Goals: 6 goal cards with progress bar, milestone ladder, "Next action" footer.
- Suggested: 8 `ScoreControl` radiogroups, previous/session type selects, 5 duration buttons, plan feature card with a CSS "gauge", warnings surface, exercise list, reasons/guardrails, disclaimer.
- Nutrition: 4 metrics, 4 charts, creatine notice, entries list with delete, `EmptyState`.
- Add workout: date/time/duration/type/title fields, `ExerciseEditor` → `SetEditor` (weight/reps/RIR/quality + 5 `Toggle` switches + note), 8 `ScoreControl`s, notes/quality, sticky summary aside with validation list, Save/Copy/Download ×2, Clear form; Preview mode renders a `WorkoutCard`. Add nutrition is the same shape.
- Settings: 3 stat cards, JSON/Markdown export/restore, creatine acknowledgement + target, "Clear local data" (`window.confirm`), fixed toast `role="status"` (Settings.tsx ~384-396).
- Empty states: `EmptyState` component (ui.tsx 144-169) used in calendar day panel and Nutrition; Workouts rolls its own (Workouts.tsx 251-259). Error state: only Settings surfaces `storageError`; there is no React error boundary, so a failed lazy chunk or render error is a blank page.

### Current visual language (gym/src/index.css)
- Tailwind v4 `@theme` with the same Inter stack (6-8, never loaded) and `--font-weight-black: 800` to "match the hub pages" (10-11). `.metric-value` still uses 850 (285).
- **Light theme is default in CSS** (16-49, `color-scheme: light`, page `#f4f6fa`, accent `#2f62d8`, accent-2 `#1f9d74`, orange `#b8571f`, danger `#c2413b`); `.dark` (51-77) copies hub.css values (`#08090d/#10141c/#151a24/#eef4ff/#9aa7b7`, accent `#8ab4ff`, accent-2 `#8fd9b6`, orange `#ffb77a`, danger `#ff8b83`). Extra names `--surface-raised/--surface-soft/--faint/--acid/--acid-soft/--accent-ink/--chart-grid/--focus/--focus-outer/--glow/--dots/--shadow/--shadow-raised`. `--acid`/`--acid-soft` are just aliases of accent (30-31, 65-66) — leftover naming from an earlier neon palette.
- Reuses hub's aura + dot grid (97-127) and `rise` entrance per section (159-174); same `--ease`.
- Components layer (192-462): `.surface` (radius 18), `.surface-raised`, `.surface-feature`, `.eyebrow`, `.eyebrow-accent` (copy of hub `.eyebrow`), `.page-title` gradient text, `.mark` (copy of hub `.mark`, 34px vs 32px), `.metric-value`, `.label`, `.field` (radius 12, min-height 2.75rem), `.button-primary/secondary/ghost/danger` (pill, 44px min), `.score-track` range (unused by the current `ScoreControl`, which uses radio buttons — dead CSS 382-413), `.calendar-grid/.calendar-cell/.day-number`, `.dot-grid`.
- Focus: global `:focus-visible` 2px outline + 5px `box-shadow` halo (144-152) — good and consistent, though the halo clobbers `.button-primary`'s glow shadow.
- Type in TSX: `text-xs` (12px) is the dominant body size; arbitrary micro sizes `text-[0.68rem]` ×13, `0.66` ×5, `0.65` ×2, `0.62` ×2, `0.58` ×2 (≈9px: Dashboard.tsx 552, Suggested.tsx gauge "of 6"), `0.67`, `0.7`, `0.92`.
- Radii: surfaces 18, fields 12, buttons 999, inner cards `rounded-2xl` (16) / `rounded-xl` (12) / `rounded-3xl` (24, mobile menu) / `rounded-lg` — six radii.

### Layout
- Scrolling document, not a fit-to-viewport shell (diverges from README's "app shells fit the viewport" but is right for a dashboard). `max-w-[1500px]`, `pb-28` on mobile for the tab bar.
- Breakpoints: Tailwind `sm/md/lg/xl/2xl` plus custom `min-[360px]` (ui.tsx 79), `min-[420px]` (ScoreControl.tsx 81), `max-width: 767px` (index.css 464) and a JS `(max-width: 1023px)` check (Exercises.tsx 40).
- Sticky asides at `xl:top-24` on Add pages (AddWorkout.tsx 787, AddNutrition.tsx 391).
- **`gym/index.html:5` viewport lacks `viewport-fit=cover`**, yet the bottom bar pads with `env(safe-area-inset-bottom)` (AppShell.tsx 360) — on iPhones the env() is 0 without `viewport-fit=cover`, so the tab bar sits under the home indicator. The hubs do set it.

### Controls inventory
- Buttons: 4 CSS variants; **59 Tailwind `!important` overrides** to make icon buttons and chips out of them: `!min-h-11` ×14, `!px-3` ×11, `!p-0` ×7, `!h-11` ×7, `!w-11` ×6, `!min-h-9` ×5, `!px-2` ×4, `!pl-10` ×2, `!w-9`, `!pr-10`, `!h-9` (AppShell.tsx 84, 231, 279; WorkoutCalendar.tsx 117, 125, 136, 235; Workouts.tsx 142, 164-165, 175, 200-201; Exercises.tsx ~133, ~145-146; AddWorkout.tsx 133-137, 331, 344; AddNutrition.tsx 340; Suggested.tsx 236; Dashboard.tsx 679).
- Chips/segmented filters: `aria-pressed` buttons built from `button-primary/secondary` in Workouts.tsx 157-171 & 191-208, Exercises.tsx ~140-155, Suggested.tsx ~228-240 — four copies.
- `Toggle` (`role="switch"`, AddWorkout.tsx 113-144) — **36px tall** (`!min-h-9`), below the 44px the rest of the app enforces. Set remove button `h-8 w-8` = 32px (AddWorkout.tsx ~160); exercise remove 36px (~331).
- `ScoreControl` radiogroup with roving tabindex/arrow keys (ScoreControl.tsx 29-47) — good. Issues: `id` is only placed on the checked radio (90) so no stable label target; a `<button>` inside `<legend>` (55-62) is valid but awkward for AT; the numeric value pill uses `bg-red-500/15` (71).
- Inputs: `.field` for text/number/date/time/select/textarea; native checkbox unstyled (Settings.tsx ~318); `select` chevron is a lucide icon overlaid only in `ExerciseEditor` (AddWorkout.tsx 343-370) while all other selects keep the UA arrow.
- Search inputs with absolute icon: Workouts.tsx 133-155 and Exercises.tsx ~123-135 (two copies).
- Charts: `ProgressChart` (Recharts line/area, sr-only data table, `role="img"`) — solid. Weekly frequency is a hand-rolled flex bar chart (Dashboard.tsx 533-557). Progress bars are implemented three times (Dashboard.tsx 288-293, 405-410; Goals.tsx 83-88). Readiness "gauge" is a rotated-border hack (Suggested.tsx ~285-300).
- Feedback: Settings uses a fixed toast with `role="status"`; AddWorkout (880-884) and AddNutrition (421-425) render an inline `<p>` with no live region, so "Workout saved" is not announced; `window.confirm` for all destructive actions (Workouts.tsx 234, Nutrition.tsx ~247, Settings.tsx ~360).
- Badges: `Badge` tones neutral/accent/warm/danger/quality (ui.tsx 25-52) — warm/danger use Tailwind `orange-500/12`, `red-500/12` backgrounds with `--orange/--danger` text, so the tint hue (#f97316/#ef4444) does not match the token hue (#ffb77a/#ff8b83 dark, #b8571f/#c2413b light).

### Problems found (beyond the inventory)
1. **Theme flash**: default is dark (AppShell.tsx 96-99) but CSS `:root` is light; `.dark` is applied in a `useEffect` after mount, so every cold load paints a white `#f4f6fa` page then flips. `prefers-color-scheme` is never consulted. `<meta theme-color>` is pinned to `#08090d` even in light mode (gym/index.html 6). No favicon (hubs have one).
2. **Hard-coded colours**: `WorkoutCalendar.tsx 56-63` type→hex map ("Colours from the site's shared palette") and `sm:text-[#0b0d12]` (178); `Suggested.tsx 55` `#f4c95d`; Tailwind palette leaks in 15 places (`bg-red-500/8|10|12|15`, `bg-orange-500/10|12|15`, `border-orange-500/50`, `border-red-500/30`: ui.tsx 36-37, ScoreControl.tsx 71, AddWorkout.tsx 135, 163, 821, AddNutrition.tsx 266, 406, Dashboard.tsx 431, Nutrition.tsx 144, 155, Settings.tsx 116, 394, Suggested.tsx 304).
3. **Copy**: "Build the next rep." / "Every movement has a story." / "Meet today where it is." page titles are marketing taglines on a personal tool; "honest-to-source undated sessions" (WorkoutCalendar.tsx 212), "honestly undated" (Workouts.tsx 128); Settings.tsx ~262 contains first-person assistant text ("When you send me your next daily workout, I'll add one repository JSON log… and push the updated site to main") in the UI. Mobile menu hard-codes "145 lb bench goal" (AppShell.tsx 331) next to a data-driven value.
4. **Information hierarchy**: Dashboard is ~10 screens tall on a phone with 8 metric cards of equal weight, 5 charts, two h2-level hero cards and a marketing h1; the real primary action ("Log workout") is the fifth tab. Charts' descriptions are 12px and often longer than the chart title.
5. **Dead/duplicated code**: `.score-track` CSS unused (index.css 382-413); `downloadText` (AddWorkout.tsx 104, Settings.tsx 28), `localToday` (AddWorkout.tsx 63, AddNutrition.tsx 17), `numericValue` (AddWorkout.tsx 98, AddNutrition.tsx 25) duplicated; nav item class strings repeated three times (AppShell.tsx 172-178, 299-305, 315-321); Settings stat cards (Settings.tsx ~128-178) re-implement `MetricCard`.
6. **Reduced motion**: `router.tsx:86` always calls `window.scrollTo({behavior:"smooth"})` (CSS `scroll-behavior` override does not affect JS options). Section `rise` animations are correctly killed by the media query.
7. **Magic numbers**: Recharts `margin.left: -18` (ProgressChart.tsx 80), tick font 10/9 px (115-170), `width={46}/{42}`; calendar `min-height: 5.6rem/4.25rem`; gauge `260deg - 130` (Suggested.tsx ~292); `max-h-[18rem] lg:max-h-[38rem]` list (Exercises.tsx ~158); `z-[70]/z-50/z-40/z-30/z-20` stack.
8. Contrast: `--faint #6b7686` on white (light) ≈ 4.7:1 at 9-11px sizes (calendar weekday labels 0.68rem, week labels 0.58rem) — technically passes but is very small; dark `--faint #7a8696` on `#08090d` ≈ 5.3:1.
9. `aria-hidden` legend on charts (ProgressChart.tsx 92) hides the only visible series key from AT; the sr-only table compensates.

### Redesign recommendations
- **P1** Component primitives in `ui.tsx`: `Button` with `size="sm|md|icon"` and `variant`, `Chip`/`SegmentedControl` (`aria-pressed`), `ProgressBar`, `Toast` (one live region in `AppShell`), `ConfirmDialog` (replace `window.confirm`), `SearchField`, `StatCard`→`MetricCard`. This removes all 59 `!` overrides and the four chip copies.
- **P1** Tokens: delete `--acid*`, add `--warn/--danger-bg/--warn-bg` and use them instead of Tailwind palette; move the workout-type colours into `--type-push…` tokens shared with the hubs' family map; one `--radius-sm/md/lg`.
- **P1** Theme: inline `<script>` in `gym/index.html` that sets `.dark` from `localStorage`/`prefers-color-scheme` before paint; `viewport-fit=cover`; dynamic `theme-color`; add a favicon.
- **P1** Dashboard: derive hero/metrics/ledger from `useAppState()` + `personalRecords.ts`/`workoutSuggestions.ts` instead of literals; cut to one hero, 4 metrics, calendar, 2 charts, goals; make "Log workout" the floating primary action on mobile.
- **P2** Type: establish 0.75rem as the smallest UI text; replace `text-[0.58–0.68rem]` with `text-xs`; body copy `text-sm`. Load or drop Inter (same as hubs).
- **P2** Toggle/remove buttons to ≥44px; `ScoreControl` legend without nested button (move Clear beside the group); stable `id` on the group.
- **P2** Error boundary around `Suspense`; announce save/copy messages via the shared toast.
- **P3** Keep: focus-ring system, mobile dialog a11y, skip link, route focus management, `ProgressChart` sr-only table, `WorkoutCalendar` cell `aria-label`s, `.surface` visual (it already matches the hub tile), hub-dark palette for the dark theme.

### Constraints to preserve
- `gym/tests/ui.test.tsx`: `ScoreControl` must expose `role="radio"` buttons with `aria-checked`, accessible names "0"…"6", keyboard ArrowRight moving selection, and render the literal text `6 · severe` (lowLabel/highLabel format `"{n} · {label}"`); router `Link` must render an `<a>` with the visible text and update `window.location.hash` to `#/workouts?date=…`; harness uses `data-testid="path"`.
- Other gym tests (`coreLogic`, `storageAndExport`, `validation`, `seedData`, `workoutSuggestions`, `nutritionCalculations`) are pure logic — no DOM dependencies.
- IDs/keys the shell depends on: `#main-content` (skip link + CSS stagger, index.css 160-174), `#mobile-menu`, `localStorage["gym-theme"]`, `.dark` class via `@custom-variant dark` (index.css 3), hash routes listed in App.tsx.
- `vite.config.ts` `base: "/gym/"`; `validate.yml:52-82` runs `format:check`, `lint`, `typecheck`, `test` — Prettier formatting is enforced.

---

## Cross-page summary

### Distinct palettes in use
1. **Hub dark** (hub.css 11-26) — also gym `.dark` (index.css 51-77) with ~identical values. The de-facto site palette.
2. **Gym light** (index.css 16-49) — exists nowhere else on the site; hubs have no light mode.
3. **Backgammon override** (backgammon/styles.css 6-12: `--surface #202d32`, `--line #34454a`, `--muted #b0c0c1`, `--radius 10px`, `theme-color #11191d`) — a greener, flatter variant layered on hub.css.
4. **Card deck** (cards.css 17-35) — GTO-Wizard four-colour; shared and stable.
5. **Tailwind default red-500/orange-500** leaking into gym tints.
6. **Illustration literals**: poker felt greens/walnut, `#232a37` seats, `#0b0d12` on-accent ink (hub.css) — `#0b0d12` also appears as `--accent-ink` in gym dark and as a literal in WorkoutCalendar.tsx 178.
Family accents (ofc/poker/blackjack/dice/backgammon/home) are declared in **six** places: hub.css `[data-family]`, hub.css `.switcher a[data-to]` dots, hub.css home aura, index.html inline tile `--accent`, each hub's favicon SVG, gym `WorkoutCalendar.typeColor`.

### Font stacks
- One stack, three copies: hub.css 30-31, cards.css 62-69, gym index.css 6-8 (`Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`). **Inter is never loaded**, so the site actually renders in the OS UI font; weights 650/750 (hub) and 850 (gym) silently round. Gym also declares `--font-mono` (index.css 9).

### Duplicated components that should become one shared component
| Pattern | Copies |
| --- | --- |
| Topbar: brand mark + crumbs + switcher | hub.css 160-283 (6 pages), backgammon/index.html 22-36, gym `Brand` (AppShell.tsx 48-76) + `.mark` (index.css 260-281) |
| Eyebrow label | hub.css 295-313, gym `.eyebrow` + `.eyebrow-accent` (index.css 221-258) |
| Card/tile surface | hub `.tile` (493-517), gym `.surface/.surface-raised/.surface-feature` (192-219) — same gradient and shadow recipe |
| Tag/badge chip | hub `.tags span` (636-645), `.facts li` (349-358), `.royalty` (833-847); gym `Badge` (ui.tsx 25-52) |
| Footer | three variants (index.html 201-204, ofc/poker/blackjack 131-134, dice 556-562) |
| Progress bar | Dashboard.tsx ×2, Goals.tsx ×1 |
| Filter chips | Workouts ×2, Exercises, Suggested |
| Metric/stat card | `MetricCard` vs Settings.tsx stat cards vs WorkoutCard totals (116-131) |
| Toast/status | Settings fixed toast vs inline `<p>` in both Add pages |
| Aura + dot-grid background | hub.css 80-106, gym index.css 97-127 |

### Token drift
- Radius: hub `--radius 16px` + literal 12/11/10/9; gym 18 (surface) / 12 (field) / 999 (button) / 16 / 24; backgammon 10.
- Surface naming: hub `--surface-2`; gym `--surface-raised` + `--surface-soft`; backgammon `--surface`.
- Tertiary text: hub `--soft #6f7b8b`; gym `--faint #7a8696` (dark) — different name and value.
- Line: hub `--line-strong .24`; gym `.26`.
- Colour mixing: hub `color-mix(in oklab…)`; gym `color-mix(in srgb…)`.
- Focus ring: hub tiles only (2px accent, offset 3); gym global (2px + 5px halo); cards white 2px.
- Breakpoints: hub 640/880/881×820/480; gym 640/768/1024/1280/1536 + 360/420/767/1023.
- Type: hub 17 ad-hoc rem sizes; gym Tailwind steps + 8 arbitrary micro sizes; both bottom out around 9px.
- Theme: hubs dark-only; gym light+dark with a light default in CSS and dark default in JS.

### Three biggest wins for this group
1. **One token sheet, both schemes, consumed by everything** (`shared/tokens.css`: colour incl. light, family-accent map, 6-step type scale with a 12px floor, spacing/radius/shadow/motion). Hub pages, Gym (Tailwind `@theme` can import it), Backgammon and the favicons all read from it; delete the six duplicate accent declarations and the Tailwind palette leaks. Either self-host Inter or stop pretending to use it.
2. **One site chrome**: extract `.shell/.topbar/.crumbs/.switcher/.foot` into `shared/chrome.css` (with ≥44px, focus-visible, five links in one order on every page including Dice and the Gym header), and move each hub's illustration CSS out of `hub.css` (cuts it by ~700 lines) or replace the CSS dioramas with screenshots. Fix copy counts by generating tiles from one data file.
3. **Gym primitives + shell fixes**: `Button(size/variant)`, `Chip`, `ProgressBar`, `Toast`, `ConfirmDialog`, `SearchField` in `ui.tsx` (removes 59 `!` overrides, four chip copies, three progress bars, `window.confirm`); pre-paint theme script + `prefers-color-scheme` + `viewport-fit=cover` + favicon; make the Dashboard data-driven and half as long, with "Log workout" as the mobile primary action.
