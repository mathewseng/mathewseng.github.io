# Site-wide UI/UX overhaul — the brief

This is a self-contained prompt for the session that will redesign every published page of mathewseng.github.io. Paste it as the opening instruction. It assumes the session can read the repository, run its tests, and render pages in a browser.

---

## Your role and goal

You are redesigning every published page of this static site so that the whole site reads as one product: the landing page, the five family hubs (`/poker/`, `/ofc/`, `/blackjack/`, `/backgammon/`, `/dice/`), every tool and game page under them, the standalone apps (`/cards/`, `/microtonal-lab/`) and the Gym React app (`/gym/`). The outcome is a site that looks and feels like its best current surface, the landing page and hubs built on `shared/hub.css`, extended into a real design system that every page consumes. What each page does must not change.

Before touching anything, read in this order:

1. `README.md` and `AGENTS.md` (repo conventions, checks, and the rule that you commit and push to `main` after each verified step).
2. `docs/redesign/notes.md` (site-wide findings and a section per page, including what is good and must survive).
3. The family audit in `docs/redesign/audits/` for whichever family you are about to touch. Each one lists, per page, the ids, classes, aria names and visible strings that tests depend on. Treat those lists as contracts.
4. `shared/hub.css`, `shared/cards.css`, `shared/cards.js`, `shared/peer-room.js`.

Then build `_site` (`sh scripts/assemble-site.sh _site`, and `npm run build` in `gym/` first) and look at every page you are about to change at 1440×900 and 375×812 before you start. Screenshots of the current state are your baseline; keep them.

---

## Non-negotiables

1. **Behaviour is frozen.** Keep every feature, flow, keyboard shortcut, deep link (`#sim`, `#spot=`, `#room=`, hash routes, `?edit=`), `localStorage` and `sessionStorage` key, PeerJS room protocol, service worker and offline behaviour. You change presentation, information hierarchy, copy, markup semantics and interaction polish. Where a finding in the notes requires a small logic change to fix a real defect (an unescaped name, a lost focus, an error written into a hidden element), make the smallest change that fixes it and say so in the commit message.
2. **Tests stay green.** `node scripts/run-tests.mjs` after every family. `cd gym && npm run format:check && npm run lint && npm run typecheck && npm test` after touching Gym. `node backgammon/tests/browser.cjs` and the other Playwright suites after touching Backgammon, OFC Play, OFC EV or Dice. The DOM contracts those suites pin are listed per page in the audits: ids, classes, aria names, visible text, computed-style assertions (outline presence, 44px targets, 16px inputs on phones, board rect fills), layout assertions (no horizontal overflow from 320px to 1440px, board above player strip). Restyle, never rename. Add new classes beside old hooks. If a contract must change, change the test in the same commit and explain why.
3. **One playing card.** Every card on the site is rendered by `shared/cards.js` with `shared/cards.css`; pages only set `--card-width` and wrapper states. `poker/222/` currently violates this and must be moved onto the shared component. The markup pinned by `shared/tests/cards.test.cjs` does not change unless that test changes with it.
4. **Repo conventions.** Kebab-case paths; a page's folder is its URL; hubs set `data-family` on `<html>`; every page has `index.html`, `app.js`, `styles.css`; pages are app shells on desktop (fit the viewport, long panels scroll internally) and stack on phones; moved pages get a `redirects.json` entry; Backgammon's offline manifest is regenerated with `node backgammon/scripts/offline-manifest.mjs` whenever a shipped file (including anything in `shared/`) changes. Commit and push to `main` after each verified step; fetch first and reconcile without force-pushing.
5. **Accessibility floor, enforced by the shared stylesheet and checked per family.** 12px minimum rendered text size everywhere, including desktop data views. WCAG AA contrast for text (ink ≥ 13:1, muted ≥ 6.9:1 on surfaces; the tertiary grey only at 15px or larger). Non-text contrast ≥ 3:1 for control boundaries. 44px minimum touch targets on coarse pointers, 36px minimum on fine pointers. A visible focus ring on every interactive element, implemented as `outline: 2px solid var(--accent); outline-offset: 2px` plus an optional box-shadow halo, because Backgammon's tests assert outline presence. Real `role="tablist"/"tab"/"tabpanel"` with `aria-selected` on every tab bar. `prefers-reduced-motion` honoured by shared styles, using near-zero durations rather than `animation: none` so JS that awaits `animationend`/`transitionend` (Backgammon board, OFC trainer) never stalls. A skip link and `main#main[tabindex="-1"]` on every page. No `user-scalable=no` anywhere. Text selection enabled except on the board and drag surfaces. Every page keeps working at 200% text zoom and 320px wide.
6. **Do not invent features.** Fix the defects and gaps the notes list, make the content hierarchy right, and unify. Do not add new capabilities beyond what a finding requires.

---

## Design direction

The direction was chosen by comparing three candidates (extend the hub system, a flat "calm instrument" system, and a Gym-style product shell) against the audits; all three reviewers picked extending the hub system, with specific ideas grafted from the other two. The result:

**Thesis.** The whole site is one dark, warm, slightly glassy instrument panel. The hub's `#08090d` page with a soft family-accent aura, Inter, glass panels with a 1px line and 16px radius, and exactly one family accent as the only thing that changes between pages. Dense tools and game tables live inside that language as "stages" (a felt, a board, a matrix, a chart) framed by the same topbar, type scale, buttons, tabs and panels as the hubs, so opening `/poker/dodge/` from `/poker/` feels like opening a drawer, not leaving the building. Motion is ambient on hubs and calm on tools.

### Tokens: `shared/tokens.css` (new; every page loads it first)

Cut lines 11–59 of `shared/hub.css` into it and extend. Root font size 16px on every page (remove the 13px roots in 222, Dodge and the simulator, and the 15px root in Backgammon).

Colour (dark only; `color-scheme: dark`):

- `--page #08090d`, `--surface #10141c`, `--surface-2 #151a24`, `--surface-3 #1b2130` (inset wells, segmented tracks, table heads), `--glass rgba(16,20,28,.66)`, `--line rgba(148,163,184,.13)`, `--line-strong rgba(148,163,184,.24)`, `--line-opaque #262c36` (data-table rows, matrix borders, sheet dividers; alpha lines wash out over `--surface-3`), `--control-border #4a5563` (inputs and selects need a ≥ 3:1 boundary), `--ink #eef4ff`, `--muted #9aa7b7`, `--soft #6f7b8b` (tertiary; never on data, never under 15px), `--on-accent #0b0d12`.
- Family map, one source for the six copies that exist today: `--family-ofc #8fd9b6/#7cc8ff`, `--family-poker #f28b82/#ffb77a` (slightly shifted from `#ff8b83` so it is distinguishable from the "bad" red), `--family-blackjack #f4c95d/#ffe7a3`, `--family-dice #c4a7ff/#8ab4ff` (lilac, so Dice stops colliding with Blackjack gold; regenerate its favicon and `theme-color` in the same commit), `--family-backgammon #9bd6c9/#7cc8ff`, `--family-home #8ab4ff/#b6a6ff`, `--family-cards #b6a6ff/#8ab4ff`, `--family-gym #8ab4ff/#8fd9b6`, `--family-microtonal #f0abfc/#b6a6ff`. `[data-family=x]` sets `--accent`/`--accent-2` from the map. The three accents chosen here for cards, gym and microtonal have no hub behind them; confirm them with the author before step 4 of the rollout.
- Semantic, family-independent: `--good #8fd9b6`, `--bad #e5655f`, `--warn #f4c95d`, `--info #7cc8ff`; soft fills via `color-mix(in oklab, var(--good) 14%, transparent)`. Rule: the accent is for brand, navigation, selection and the primary action only; outcomes always use good/bad/warn. This matters most in the poker family, where the accent and the bad colour share a hue.
- Blackjack chart: `--hit: var(--bad)`, `--stand: var(--good)`, `--double: var(--warn)`, `--split: var(--info)`, `--surrender #b6a6ff`. This settles the Hit/Stand contradiction between the hub preview and the lab in favour of the hub.
- Chart categorical `--cat-1..6`: `#8ab4ff #8fd9b6 #f4c95d #e5655f #b6a6ff #f0abfc`; `--chart-grid rgba(148,163,184,.12)`. Backgammon loss tones map to info/good/warn/accent-2/bad. Player identity: `--player-1`, `--player-2` (Backgammon tests assert that history-row borders equal checker-dot colours, so derive both from the same tokens). Board colours stay on the runtime `--board-*` system in `backgammon/core/appearance.mjs`, untouched.
- Write the contrast ratio of every token pair in a comment next to it.

Type:

- Self-host Inter as one variable file `shared/fonts/InterVariable.woff2`, latin subset, `font-display: swap`, with `size-adjust` fallback metrics so dense tables do not shift on swap. Declare it in `tokens.css` with the existing stack as fallback. Keep the font out of Backgammon's `BG_SHELL` precache. Add `shared/fonts` to `scripts/assemble-site.sh` if it is excluded, and verify Gym's Vite build resolves `../../shared/tokens.css`. The Playwright screenshot harness must await `document.fonts.ready`.
- `font-feature-settings: "cv11", "ss01"` site-wide; `font-variant-numeric: tabular-nums` on `:root` of tool pages (Backgammon already does this and it is what keeps mixed prose and numbers aligned).
- Scale: `--t-xs .75rem` (12px, the floor: tags, axis labels), `--t-sm .8125rem` (dense data cells, secondary UI), `--t-md .9375rem` (body, controls), `--t-lg 1.125rem` (panel titles), `--t-xl 1.5rem` (tool page H1), `--t-hero clamp(2.3rem, 5.4vw, 3.9rem)` (hubs only). Weights 500/600/700 for tools, 800 reserved for the hub hero. Line heights 1.2 headings, 1.3 data, 1.45 body. Text inputs are 16px on coarse pointers (Backgammon tests assert it, and it stops iOS zooming).
- Phone rule for the floor: hide a label rather than shrink it. Collapse to an icon with visually-hidden text, or move the value into a tap/focus readout.

Spacing, radius, shadow, motion:

- 4px base: `--s-1 4`, `--s-2 8`, `--s-3 12`, `--s-4 16`, `--s-5 24`, `--s-6 32`. Page gutter `min(1200px, 100% - 32px)` on hubs; app shells use full width with a 12px outer gap.
- `--r-sm 8px` (buttons, fields, matrix cells), `--r-md 12px` (nested panels, sheet controls), `--r-lg 16px` (tiles, panels, stages, dialogs), `--r-pill 999px`. Cards keep their own radius from `cards.css`.
- `--shadow-tile` (the hub tile recipe), `--shadow-raised` (hover, dialogs), `--shadow-sheet`. `--focus-ring` as outline plus halo (above).
- `--ease cubic-bezier(.2,.8,.2,1)`, `--spring cubic-bezier(.34,1.4,.64,1)`, `--d-fast 150ms`, `--d-base 300ms`, `--d-slow 450ms`. Entrance "rise" is implemented with `@starting-style` plus transitions and an `html.is-ready` class, never `animation-fill-mode: backwards`, so stalled animations can never leave content at opacity 0 (this was observed in the audit). Ambient infinite loops (aura, bob, spin, glow, turn, ping) are hub-only; tool pages get a static aura and no `backdrop-filter` on app shells, so SVG boards, canvases and drag ghosts stay at 60fps. The reduced-motion rule moves from `hub.css` to `tokens.css` and uses `animation-duration: 0.01ms` rather than `animation: none`. Add a `forced-colors` fallback: `outline: 2px solid transparent` on focus rings and borders on glass surfaces.
- Card width scale as tokens, since `--card-width` is the only card API: `--card-w-preview 22px`, `--card-w-seat 32px`, `--card-w-tray 44px`, `--card-w-table clamp(44px, 6vw, 72px)`, `--card-w-board` per page. Cards floor at 36px on phones.

Themes: dark only for the site; light and dark inside Gym only. Gym imports `tokens.css` for its `.dark` block and keeps its light `:root` as a local override, with a pre-paint inline script that sets `.dark` from `localStorage["gym-theme"]` or `prefers-color-scheme`. Leave a documented `:root[data-theme="light"]` hook in `tokens.css` with a note that light accents must be re-derived (several candidate light accents fail AA on white). Every page sets `meta theme-color #08090d`.

### Chrome: `shared/app.css` (new)

Move the topbar, crumbs, mark, switcher and footer out of `hub.css` (which keeps hero, tiles and art only) into `app.css`, and use the same chrome on every page.

- **Topbar**, 56px on desktop, three zones. Left: `a.mark` (32px MS monogram, links `/`) → family link (`Poker` → `/poker/`) → current tool name. Centre: on hubs, the existing switcher pill with the same five entries in the same order on every hub (OFC, Poker, Blackjack, Backgammon, Dice), each link 44px tall. On tool pages, a `.tool-nav` listing the family's tools in README order with `aria-current` (Backgammon's existing Play/Trainer/Solver/Library nav is already this; Backgammon also gets a `Docs` entry for Controls and Reports). The page's own view tabs go in the tool head below, never in the topbar, so navigation is identical on `/poker/dodge/` and `/backgammon/play/`. Right: status badge (Offline, engine busy, connection), 40px icon buttons (sound, rules, settings) from one SVG sprite (`shared/icons.svg`, 20px grid), Gym's theme toggle. No page keeps its own wordmark; the serif casino headers, the DODGE and 222 marks, the Rush logo and the dice glyph all go.
- **Tool head** (tool pages): H1 24px/700 with `view-transition-name: hub-title` + a right slot for a stat strip or the primary action, with the page's `.tabs` beneath. Collapses to one 40px row under the existing short-desktop query (`min-width: 881px and max-height: 820px`) so app shells still fit 1440×900, 1366×768 and 1280×720; state those three as the target desktop viewports.
- **Hub hero** unchanged, and the Backgammon hub adopts it (live board preview in the featured tile's art slot, Resume/Recent links kept; keep `.hub-tools`, `#hub-board`, `#hub-play` and tools-before-board order on phones because `backgammon/tests/mobile-quick.cjs` pins them).
- **Footer** on hubs, landing and document pages only: source on GitHub · family hub · All projects. App shells have no footer; those links live in the rules/about dialog.
- **Phones** (≤ 640px): topbar is two rows. Row 1: mark + current tool + actions. Row 2: the view switcher as a 44px horizontally scrolling pill strip with `scroll-snap-type: x mandatory` and an edge fade, never a wrapped grid. A scroll container does not grow `scrollWidth`, so Backgammon's no-overflow tests still pass.
- Touch gets a real equivalent of the hover delight: tiles get an `:active` state and a static accent edge; the pointer-follow light stays desktop-only.
- Cache-busting: one rule. Shared stylesheets are linked as `/shared/tokens.css?v=<date>` from a single constant in each family's `index.html` head, and Backgammon's `?bgv=` hash covers them through its manifest. Record the rule in `README.md`.

### Components (in `shared/app.css`, plus tiny shared JS where noted)

Class names are new, so test-pinned ids and classes remain in the markup untouched beside them. For each, the best existing reference on the site is named; start from it.

1. `.topbar/.crumbs/.mark/.switcher/.tool-nav` — `hub.css` 160–283, Backgammon `ui/shell.mjs` nav.
2. `.tabs` — real tablist with sliding underline, hash and localStorage persistence helper `shared/tabs.js` lifted from `ofc/fantasyland-ev/app.js` 185–247.
3. `.segmented` — radio-group pill, 36px desktop / 44px phone, `:has(input:focus-visible)` focus surfacing; reference `poker/222` and the blackjack Soft-17 control.
4. `.btn` — primary (accent fill, `--on-accent` ink), secondary, ghost, danger (`--bad`); sizes sm 36 (only under `@media (pointer: fine)`), md 40, lg 44 (phones always 44); `.btn--icon` square; keycap slot. Reference Backgammon buttons and Gym `.button-primary`. No hover `translateY` on buttons or keys.
5. `.field` — label 13px/600 above a 40px control, `--control-border`, select with inline SVG chevron, range with `<output>`; reference the blackjack stepper-plus-range-plus-number control.
6. `.switch` — `role="switch"`, 44×24; reference `dice/reports` toggle.
7. `.chip` and `.badge` (good/bad/warn/info/accent tones) — hub tags and Gym `Badge`.
8. `.stat` / `.stat-strip` — label over tabular value, 1px-gap grid on `--line`; reference the Dodge simulator strip.
9. `.panel` — the tile without link affordance; `.panel-head` and `.panel-body` (`min-height: 0; overflow: auto`).
10. `.data-table` + `.table-wrap` — sticky head on `--surface-3`, `--line-opaque` rows, right-aligned tabular numerics at 13px, sticky-first-column modifier, sticky offsets expressed as CSS variables (never the 38/82px literals Dodge uses today), horizontal scroll with an edge fade; never shrink type to fit.
11. `.bar / .bar-list / .sparkline / .stack-bar` — track `--surface-3`, fill via `--value` and `--bar-color`; never colour-only: pair with a label or pattern.
12. `.progress` — bar + label, one polite live region.
13. `.list-row` — label | tabular value | delta, 1px `--line-opaque`, pressed state; the one decision-value and ranked-move component for Backgammon Play/Trainer/Solver/review, 222 cube options, OFC row scores and the blackjack hand solve. Reference `backgammon/styles.css` 645–662.
14. `.dialog` — native `<dialog>` with header, scrolling body, sticky footer, backdrop; `.dialog--sheet` bottom sheet at ≤ 700px (one threshold, matching Dodge and Backgammon), 18px top radius, drag handle, max-height 85dvh, keyboard-viewport fitting lifted from `backgammon/ui/shell.mjs` into `shared/sheet.js`, focus trap, `inert` on siblings, Escape, return focus (lift from Gym `AppShell.tsx`). Destructive confirms take a verb and a danger variant ("Delete", "Replace", "Leave"), never a generic accent "Continue". Errors raised inside a modal render inside it, not in a toast underneath the top layer.
15. `.toast` — one bottom-centre `role="status"` stack with safe-area inset, a dismiss control, pause on hover/focus; `.toast--alert` uses `role="alert"`. One polite and one assertive live region per page; nothing else is `aria-live`.
16. No eyebrows, ledes or taglines anywhere (2026-10-21, after Jakub Krehel's "Less is more, more or less"): the crumbs name the family and the tool; section headings are plain sentence-case headings; labels are small muted sentence-case text, never uppercase-tracked micro type.
17. `.lobby` — name and code fields, create/join segmented, code pill with copy (with a clipboard fallback and a toast), roster of `.seat`, host settings, Start/Leave, guest "waiting for the host" copy, deep link `#CODE` prefill; all on `shared/peer-room.js`. Reference `poker/play` room view.
18. `.seat` — avatar, name, stack/PnL, bet, status badge, card row via `--card-w-seat`; states active/folded/disconnected/confirmed/host/me/queued.
19. `.stage` + materials `.felt`, `.board-frame`, `.matrix` — see Surfaces. `.stage { color: var(--stage-ink) }` so labels on stages are never bound to `--ink`.
20. `.ofc-board / .ofc-row / .hand-chip` — label | slots | summary with `data-row`; drag from `ofc/play/card-drag.js` promoted to `shared/card-drag.js`.
21. `.action-stage` — sticky bottom action bar; see Mobile.
22. `.keycap` — `backgammon/ui/keycap.mjs` promoted to `shared/keycap.js`.
23. `.die` — one CSS dice face for Card Table Workshop and Backgammon theme samples; the dice page's canvas reads the same tokens.
24. `.empty-state` — icon, title, hint; reference Gym `EmptyState`.
25. `.sr-only` (alias of `.visually-hidden`), `.desktop-only/.mobile-only`, `[hidden] { display: none }` once, no `!important`.

### Surfaces

A stage is a `.panel` with no padding and `overflow: hidden` whose inside is a different material; the panel frame ties it to the hub tiles. The family accent never colours the material; it colours selection, the active seat or row, the dealer button and the primary action.

- **Poker felt** `.felt`: radial green gradient, inset highlight, border mixed from the accent; felt labels 12px uppercase at 35% white; seats as glass chips around the felt with the active turn ringed in accent; `--card-w-table` and `--card-w-seat`. The same felt serves Mixed Poker, Rush, Ultimate Omaha, Edge the Dealer and OFC Play. The serif/gold casino dialect and the Google Fonts links go.
- **OFC board rows**: a felt stage holding three rows (96px label | card slots using `cards.css` `.empty-slot` | hand chip); active row gets the accent border; the trainer tray is a glass panel below the stage; the hub tile preview uses the same component at `--card-w-preview`.
- **Backgammon board**: the SVG board and its runtime palette are untouched (appearance tests check rect fills); the board slot becomes a `.board-frame` on the site page colour; player strips become stat-strip rows with seat identity dots; the inspector is a `.panel`; ivory text becomes `--ink`; the static teal aura returns.
- **Strategy chart** `.matrix`: CSS grid, cells ≥ 28px, fills mixed at 18% from the semantic colour over `--surface`, 1px border at 40%, 12px tabular label in the full semantic colour, index numbers 12px muted, legend as chips; arrow-key movement with a roving tabindex. Keep blackjack's ids and `data-view` hooks.
- **Data tables and charts**: always inside `.panel > .panel-body > .table-wrap`; SVG charts use `--chart-grid`, 12px muted axes, `--cat-*` series, accent only for the selected series or row; heatmap and histogram values surface in a focus/tap readout rather than 8–9px labels; canvas scatter gets a text alternative.
- **Dice canvas**: keeps its renderer and reads colours with `getComputedStyle` (`--surface-2` face, `--ink` pips, `--accent` match).
- **Keyboard** (Microtonal): `.keycap` tile grid, 13px key label, 12px muted cents, pressed = accent 18% fill; a straight lattice on fine pointers and a 44px isomorphic grid on touch with `touch-action: pan-x`, never `none`.

### Mobile: one model for every app shell (≤ 640px)

- `.app--shell` is a 100dvh grid: topbar / view switcher / `minmax(0, 1fr)` active view / `.action-stage`; body `overflow: hidden`. Hubs and document pages keep normal document scroll.
- View switching: the 44px scrollable `.tabs`/`.segmented` strip sets `data-view` on the workspace element (blackjack, dice, calculations and Dodge already do this; Backgammon's Tools sheet maps onto the same strip plus a sheet for the overflow). Exactly one scroll region per view: `.view[data-active] { overflow-y: auto; overscroll-behavior: contain }`. Nested scrollers (OFC EV and Report panels, Play's score strip, the trainer tray) are flattened into it.
- `.action-stage`: `position: sticky; bottom: 0`, glass, 1px line on top, `padding-bottom: env(safe-area-inset-bottom)` (`viewport-fit=cover` on every page including Gym), holding at most a 44px primary, a secondary and an overflow icon button. Its height is measured into `--stage-h` with a ResizeObserver so content never hides beneath it. It replaces Card Table Workshop's five stacked fixed bars, Dice's separate "Analysis" button and Backgammon's mixed keycap-and-button row (keycap hints hidden on touch). Landscape phones (`max-height: 560px`): the action stage becomes a right-side column; Backgammon tests already exercise 844×390.
- Sheets: every secondary panel (settings, inspector, rules, hand inspector, schedule inspector, cube options) opens as `.dialog--sheet`.
- Tables: `.table-wrap` horizontal scroll with sticky first column; never shrink type.
- Desktop: `.app--shell` grid `minmax(0, 1fr) 320px` (stage | inspector panel), every column `min-height: 0` with its own `overflow: auto`.

---

## Content and hierarchy fixes (not just skin)

The judges' sharpest criticism of all three candidates was that a restyle leaves the usability findings untouched. Each family's work order below therefore includes "what the page shows first". The site-wide rules:

- The primary action is visible without scrolling on every screen size, and there is exactly one of it per view.
- Explanatory prose (engine strength paragraphs, maths references, methodology) lives behind a disclosure, a sheet or a Docs page, never above the primary action.
- Settings that are rarely changed sit behind a Setup popover or sheet; context that changes every turn (dice, cube, score, street, pot) is always visible near the stage.
- Every multiplayer page has designed states for: connecting (with cancel), waiting for host (guest copy), reconnecting (banner with Retry), host gone, player gone mid-hand (with a recovery action), joined mid-game (spectate or wait), busted/table over, and leaving (confirm, and what happens to the saved session).
- Every long-running computation shows one progress component with a live region; every error renders where the user is looking (inside the open dialog, next to the control, or in the room, never into a hidden lobby element).
- Naming: one name per page in `<title>`, H1, hub tile and breadcrumb ("Fair Dice Payout Explorer" vs "Lab" today). Counts on the landing page and hubs are generated from one data list, not typed.
- External links (GitHub) look like links, not like app tiles.

---

## Rollout: one family per PR, in this order

Each step: branch from `main`, make the change, run the checks listed, compare screenshots at 1440×900 and 375×812 against your baseline, commit with a message that names the pages and the CSS line delta, push. Migrated pages use alias shims in their `:root` (`--bg: var(--page); --panel: var(--surface); --green: var(--good)` and so on) so old selectors keep working while duplicate CSS is deleted; shims are removed when the file is rewritten.

### Step 0 — Foundation (shared/)

- Create `shared/tokens.css`, `shared/app.css`, `shared/hub-art.css` (the per-hub illustration CSS cut out of `hub.css`), `shared/fonts/InterVariable.woff2`, `shared/icons.svg`, `shared/tabs.js`, `shared/sheet.js`, `shared/card-drag.js`, `shared/keycap.js`.
- Slim `hub.css` to hero, tiles and the hub-only motion. Fix the switcher (five links, one order, 44px, focus ring) and remove the `:has(a[data-to="backgammon"])` hack.
- `cards.css`/`cards.js`: `role="img"` on non-button cards, `aria-pressed` emitted for selected button cards, selected ring (accent + lift) distinct from focus ring (white), club green darkened to ≥ 3:1 under white, `@media (hover: hover)` guard on the interactive hover outline, reduced-motion guard for `card-pop` inside the file, tokens for the danger ring and badge backgrounds. Update `shared/tests/cards.test.cjs` in the same commit for the attribute changes.
- Add the new shared files to the three hard-coded lists: `backgammon/scripts/offline-manifest.mjs`, `backgammon/tests/deployment.test.mjs`, `backgammon/tests/manifest-generator.test.mjs`; regenerate the manifest; keep the font out of `BG_SHELL`.
- Build a kitchen-sink preview page outside the published tree (the scratchpad, or `shared/preview/` excluded by `assemble-site.sh`) showing every component at 375, 1024 and 1440; review it before any page is migrated.
- Tooling (see QA gates): `scripts/shell-browser.cjs`, `shared/tests/shell.test.cjs`, the hex-literal lint, screenshot baselines.
- Checks: `node scripts/run-tests.mjs`; hubs render pixel-identical except the switcher.

### Step 1 — Landing page and hubs

- Link `tokens.css` + `app.css` + `hub.css` + `hub-art.css`. Five-entry switcher everywhere. One footer. Tiles and counts generated from one data list (a small JSON consumed by a build step in `scripts/`, or hand-maintained in one file that the hubs read; counts must not be typed twice).
- Landing: four-plus-one grid that gives Dice a home; three lines of tile copy or copy under 110 characters; one arrow glyph; one art container; skip link; `@starting-style` reveals.
- Blackjack hub: the three GitHub references become a link list. Dice hub: either `redirects.json` `/dice/` → `/dice/reports/` or real sub-report tiles; lilac accent; favicon regenerated from the family map (one SVG template reading `--family-*` generates every favicon and the OG image).
- Backgammon hub onto hub tiles, keeping `.hub-tools`/`#hub-board`/`#hub-play` and tools-before-board on phones.
- Checks: `run-tests.mjs`, `backgammon/tests/updates.cjs` and `mobile-quick.cjs`, screenshots.

### Step 2 — Poker data tools (`dodge`, `dodge/simulator`, `222`, `calculations`)

Pilot `dodge` and `dodge/simulator` first (closest to the shared "data dialect"), then `222`, then `calculations`.

- All four: link tokens + app + cards; replace the copied `:root` blocks with alias shims; swap the wordmark topbar for crumbs + tool nav (Dodge reports · Simulator · 222 · Calculations under Poker); brand green becomes the poker accent for navigation and selection only, green/red/amber become good/bad/warn; 16px root; stat tiles → `.stat-strip`; tables → `.data-table` with CSS-variable sticky offsets and scroll wrappers (cube option tables, mini tables, 14-column heatmap); tabs → real `.tabs`; desktop/mobile duplicate labels replaced by one label and container queries; delete dead chart CSS and `.review-banner`.
- 222: move onto `shared/cards.js` and `.deck-matrix` with clickable cards as buttons; become an app shell (Dodge simulator's split layout); adopt the simulator's option rows for cube tables; keep the segmented count buttons' bare digit text (the JS reads it).
- Calculations: coral accent, real focus rings on every control including stack segments, visible H1, segment text hidden below a width threshold, brand link to `/poker/`.
- Content: 222's deck becomes a side panel or sheet that opens on card selection, with the selection message in the board strip and seat names instead of `S1/B/b` codes; the spot solver scrolls to and focuses the result after Solve with a sticky result summary on phones; every in-room error renders in the room (status slot or toast), never in the hidden lobby; guests get a lobby state and auto-deal-aware prompt copy with a countdown; the online showdown result becomes a result card above the seats instead of a table injected into the sticky action bar, and the trainer gets the same card; `.prompt` carries `role="status"` and action rows preserve focus across re-renders; the simulator's spot disclosure gets `aria-expanded`; developer telemetry (compute ms, games simulated) moves out of the KPI strip.
- Target: `dodge/styles.css` from 2,539 lines to under 1,500; record the delta as the template for every later family.
- Checks: `run-tests.mjs`, screenshots at 375 and 1440, the shell sweep.

### Step 3 — OFC (`play`, `fantasyland-trainer`, `fantasyland-ev`, `fantasyland-report`)

- Family stylesheet `ofc/ofc.css` on tokens with the OFC accent; hub header with a tool nav listing all four pages; shared `.ofc-board`, `.hand-chip`, rules article renderer (one copy, in `fantasyland-core.js` or `shared/ofc-rules.js`), `shared/card-drag.js`, one segmented control with focus surfacing, one dialog.
- Play: create panel first; board rows as a real `radiogroup` with the head button as the single target; disabled buttons ≥ 3:1; row and mini scores ≥ 12px; ledger charts as HTML bars; the FL tray as a two-row tray at ≥ 36px cards or a scrolling tray with fixed card size, with hotkeys covering cards 10–17 (or none past 9 by design, stated in the help).
- Play content and states: a mid-hand "player gone" state with a recovery action (host can skip or auto-set the departed seat; this is the one behaviour addition the finding requires), a reconnecting banner with Retry and a cancellable connecting state, guest "waiting for the host" copy in the lobby and at showdown, errors shown in the table view, rules tabs that no longer rewrite the lobby setup silently.
- Trainer: rewrite from the trainer-first layout only, target under 900 lines; delete the dashboard base, the `.ev-page` block, dead solver classes and the stale ids in `app.js`; one toolbar with a Setup popover (Mode, Set, Cards, Jokers, Variant), a report that is a real `<dialog>` and opt-in rather than auto-opening on every confirm, a "Set complete" screen with grade and per-puzzle rows, a confirm on setup changes while results exist, an explicit "New random set" action, auto-fill on Confirm either dropped or shown as a staged "Fill rest" step, hotkeys suppressed while any dialog is open, `env(safe-area-inset-top)` instead of notch sniffing, 12px floor by showing less.
- EV: delete the unreachable run/worker path and stop loading the trainer script (expose the helpers from `fantasyland-core.js`); one joker palette with a persistent legend; natural page scroll on phones with the matrix as stacked cards; merge EV/Repeat/Foul into one overview with a metric toggle. Report: fold into the EV page as an Overview tab, or regenerate from the precomputed data and show the dataset date; sentence-case headings; text alternatives for every bar group.
- Checks: `run-tests.mjs`, `node ofc/play/tests/browser.cjs`, `node ofc/fantasyland-trainer/tests/extended-ev-browser.cjs`, screenshots.

### Step 4 — Standalone pages (`blackjack/strategy`, `dice/reports`, `microtonal-lab`, `cards`)

- Blackjack: tokens with the gold accent; `.matrix` with semantic fills and a roving-tabindex keyboard model; 12px floor with bust percentages and index badges on a second line or in the inspector; a chart toolbar above the chart and an "About the engine" disclosure for audit tiles and links; switch markup fixed so focus works; plain labels ("Colourblind palette", "Reverse dealer order", "Applied true count"); card pad key shortcuts; `aria-labelledby` on the dealer dialog; "Copy config" becomes an explicit "Share link" in the toolbar. Keep the stub-DOM contract of `tests/solver-regression.test.mjs`.
- Dice: tokens with Inter and the lilac accent, mono only for numeric columns; one segmented control for the four tab styles; 11/12px floor; the maths reference becomes a Method section; the inspector becomes a sheet (keep `data-view="analysis"` and `#back-to-schedules`); readable paytable tiles; one name for the page; "↗" only on external links. Keep every id, data hook and visible string its four Playwright suites assert.
- Microtonal: tokens with its accent; keyboard as a lattice (fine pointer) or 44px isomorphic grid (touch) with `touch-action: pan-x`; one persistent view switcher; sentence-case 12px labels; `<output>` on every range; pulse steps as steppers with a visible "scale index" label; a real stop icon; "Start audio" either a true gate or a status pill that reverts on suspend and explains "unavailable"; brand mark as home link; favicon and description; canvas reads tokens.
- Cards: one bottom stage with `--stage-h`; cards as buttons via the shared component; `role="tab"` on the side tabs and menu semantics with focus management on popovers; a defined guest state (host-only actions disabled with a "host only" hint, persistent connection badge in the topbar); four or five side tabs with 12px labels; shared `.die`; SVG icons; simplified first run (the New game gallery and the tour do not stack); `sw.js` cache list and version bumped; manifest colours updated.
- Checks: `run-tests.mjs`, `node dice/reports/tests/*.cjs`, screenshots.

### Step 5 — Poker tables (`play`, `rush`, `ultimate-omaha`, `edge-the-dealer`)

- One `poker/table.css` on tokens: felt, seat, hand chip, action stage, stat strip, settings row, lobby, log/chat, dialog, toast. Every page loads tokens + app + cards + table + a short page file. Edge the Dealer stops importing Ultimate Omaha's stylesheet; the two pages are changed together.
- Mixed Poker: hub chrome with coral; the felt as the hero with seats around it, a visible dealer button and bet chips, pot and street in the felt centre; 44px controls and visible focus everywhere; `minmax()` rows so the shell never collapses the table; the hero card row rendered by diffing or with focus restored by `data-card-id`, and the action clock no longer re-rendering the whole view twice a second; a busted/table-over state with final ledger and an add-chips control (the engine already exposes `adjustStack`), a visible per-seat clock with a timed-out message, a Leave confirm that says what happens to the saved session, a designed state for joining mid-game, errors shown in the game view.
- Rush: one-layer stylesheet with `minmax()` rows and a scrolling lobby; coral theme with lime/gold only as rank colours; the matrix cell override removed; history panel surfaced or deleted; multiplayer on `shared/peer-room.js` and the shared lobby; game-over as a `<dialog>` that names the winner in two-player mode and does not silently drop the peer; confirms on Daily/Random/End during a timed run; `aria-pressed` on SFX; best score and "played today" persisted.
- Ultimate Omaha and Edge the Dealer: Inter, coral, semantic win/lose, gold only as the multiplier colour; real `<dialog>`s, buttons for collapsibles and the emoji picker, hole cards via `PlayingCards.element(..., { tag: "button" })`, visible text for REPLACE/QUEUED, `user-scalable=no` removed, reduced-motion guard, contrast fixed; a game header with title, room pill, Leave and Rules on both; a street/phase indicator on UO; a persistent explanation for queued players; the loader fixed or removed; the dead sound toggle removed; peer-supplied names escaped in chat and log; clipboard copy with fallback and toast; host inputs only refilled when not focused (keep ETD's version).
- Checks: `run-tests.mjs`, manual two-tab room test for each page, screenshots.

### Step 6 — Backgammon shell and documents

- Rebuild `backgammon/styles.css` as layered sheets (`tokens`, `base`, `shell`, `board`, `play`, `review`, `dialogs`, `phone`) on site tokens with the family accent, one breakpoint set (480 / 700 / 1024 plus the landscape-short rule) and container queries on the stage; delete every overridden duplicate and dead rule; target ≤ 1,800 lines. Keep the board palette system, offline shell, board interaction CSS, reduced-motion `data-motion` opt-in, 44px targets, bottom sheets with keyboard fitting, keycap badges.
- Scope `user-select: none` to the board and drag surfaces; replace the `data-focus-navigation` outline suppression with `:focus-visible` (keep the attribute only for the SVG board's custom focus styling, which `background-focus.cjs` asserts).
- One dialog component with sheet variant replacing ten skins; dark toast with safe-area inset, dismiss and `role="alert"` for errors; errors from modal forms rendered inside the dialog; confirm dialogs with a verb and danger variant.
- Play content: the setup panel leads with the mode segmented and Start match, the engine-strength paragraph moves behind a disclosure; the confirm control lives in the action stage with one consistent position; one status line; a game-over card naming the result level (single/gammon/backgammon), the score change and the cube; a resignation picker labelled by level; guest lobby copy ("Waiting for the host to start") and accurate Leave/New match copy in online mode; the update gate gains "Continue with the installed version" and a link to `/backgammon/refresh/`.
- Trainer: a progress stepper in the tool head, a result card with best/your/loss as a `.list-row`, candidate rows with a pressed state, and a session-complete summary (average loss, within-threshold count, hints, skips, mistakes saved) built from the per-decision results already recorded.
- Solver: inspector split into Position · Analysis · Save; dice/cube/score as an always-visible context strip under the board; a visible edit mode; a progress bar for analysis. Library: rows as a listbox or buttons with `aria-pressed`, real icons, inspector grouped into Open / Edit / Export / Danger.
- Documents: one `docs.css` on shared document typography with the shared header (`aria-current`, Docs entry in the tool nav), selectable text, correct heading outline, a sticky section TOC on the report, refresh page CSS generated from the token source.
- Checks: `node backgammon/scripts/offline-manifest.mjs`, `run-tests.mjs`, `node backgammon/tests/browser.cjs` and the rest of the suite, screenshots at every viewport the suite uses, the 24 board presets screenshotted.

### Step 7 — Gym

- `@theme` reads `tokens.css` for the dark scheme; delete the copied values and `--acid*`; add warn/danger backgrounds; workout-type colours from the family map; one radius scale.
- `ui.tsx` primitives: `Button(size, variant)`, `Chip`/`SegmentedControl`, `ProgressBar`, `Toast` (one live region in `AppShell`), `ConfirmDialog` (replaces `window.confirm`), `SearchField`; remove all `!` Tailwind overrides and the four chip copies.
- Pre-paint theme script, `prefers-color-scheme`, `viewport-fit=cover`, dynamic `theme-color`, favicon, an error boundary around `Suspense`.
- Dashboard derived from state and half as long; "Log workout" as the mobile primary action; Add pages with a sticky mobile action bar, per-field errors (`aria-invalid`, `aria-describedby`), guarded save and copy with visible failure messages, an unsaved-changes guard or draft, a confirm on Clear form; the suggested plan carried into the log form via query string; nutrition edit; a not-found state for `?edit=` of an unknown id; calendar cells with `aria-pressed`/`aria-current` and feedback on selection; WorkoutCard expander as a button containing only the summary line; 44px toggles; 0.75rem floor; the first-person copy removed from Settings.
- Checks: the four Gym npm scripts, `gym/tests/ui.test.tsx` contracts.

---

## QA gates and tooling (built in step 0, run at every step)

1. `scripts/shell-browser.cjs` (Playwright): visits every page in `_site` at 1440×900, 375×812 and 844×390, awaits `document.fonts.ready`, and asserts `scrollWidth <= innerWidth`; every `.btn`, `.field` control, `.tabs > *` and `.switcher a` ≥ 44px on the phone viewport; no rendered text under 12px; `.topbar` and a skip link present; a focus ring on the first 20 tabbable elements; `main#main` exists. Wire it into `scripts/run-tests.mjs` and `.github/workflows/validate.yml`.
2. `shared/tests/shell.test.cjs`: `tokens.css` defines every token name the components use; no page stylesheet redefines a token; every `index.html` links `tokens.css` before anything else.
3. Hex-literal lint in `validate.yml`: counts hex and rgba literals per stylesheet outside `tokens.css`, `cards.css` and the board palette module, fails if a file's count rises, and reports the number so the drift cannot recur.
4. Screenshot baselines: Playwright `toHaveScreenshot` per page per viewport (and per Backgammon board preset) taken from the pre-redesign build and reviewed, not auto-accepted, when they change. With behaviour frozen, this is the real gate for a restyle.
5. Contrast check: a script that reads `tokens.css` and prints the ratio of every ink/surface pair; fails under the floors in the non-negotiables.
6. Text zoom: `browser.cjs` already sets the root font to 24px; run the shell sweep once at that size and fix anything that breaks.
7. Backgammon: `node backgammon/scripts/offline-manifest.mjs` after any shared change; the deployment test fails otherwise.

---

## Process rules

- One family per PR or commit series; never a big-bang rewrite. Each commit message names the pages touched, the CSS line delta and any test changed and why.
- Before each family: screenshots of every screen (not just the landing state: lobbies, in-game, showdown, dialogs, sheets, error states) at both viewports.
- After each family: the gates above, then the screenshots again, then a short diff note in the commit.
- Restyle, never rename. New class names sit beside test-pinned ids and classes. If a JS file selects by a class you want to delete, keep the class.
- When a finding needs a logic change (listed in the work orders), make the smallest one that fixes it and say so.
- Stop and ask the author only for: the three new family accents (cards, gym, microtonal), the Dice hub's fate (redirect or sub-reports), the Fantasyland report's fate (fold or regenerate), and whether Inter is self-hosted or dropped in favour of the system stack. Everything else is decided here.
- If a test contract blocks a change the brief requires, prefer changing the design to changing the test; if the test is clearly asserting an incidental detail (an exact pixel offset, a literal colour), change the test and say so.

---

## Definition of done

- Every published page links `shared/tokens.css` and `shared/app.css`, sets `data-family`, uses the shared topbar/tool nav, has no page-local `:root` palette (alias shims removed), no text under 12px, a focus ring on every control, real tabs, real dialogs, a skip link, `meta theme-color #08090d`, `viewport-fit=cover`, no `user-scalable=no`, no `!important` outside the reduced-motion and `[hidden]` rules in `tokens.css`.
- `poker/222` renders cards through `shared/cards.js`. Every multiplayer page uses `shared/peer-room.js` and the shared lobby.
- The three biggest stylesheets are rewritten: `backgammon/styles.css` ≤ 1,800 lines, `ofc/fantasyland-trainer/styles.css` ≤ 900, `poker/rush/styles.css` one layer. Site-wide CSS falls from roughly 34,000 lines to well under half.
- Every state listed under "Content and hierarchy fixes" exists on every multiplayer page; every P1 and P2 finding in `docs/redesign/notes.md` §5 is either fixed or explicitly deferred with a reason in the commit.
- All gates pass; the screenshot baselines are updated and reviewed; `docs/redesign/notes.md` gets a closing section that records what changed per family and what was deferred.
