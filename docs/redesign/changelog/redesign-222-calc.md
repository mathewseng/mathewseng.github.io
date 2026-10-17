# redesign/222-calc — Step 2, 222 and Calculations half (`/poker/222/`, `/poker/calculations/`)

Second half of the poker data tools, built on the Dodge pilot's pattern (`redesign-dodge.md`):
`shared/tokens.css` + `shared/app.css` (+ `shared/cards.css` where cards are drawn) + `poker/tools.css`
+ the page stylesheet. Branch base: `redesign/dodge`.

## The numbers

| File | Before | After | Colour literals | `!important` |
| --- | --- | --- | --- | --- |
| `poker/222/styles.css` | 342 dense lines | 1,420 formatted lines | 68 → 0 | 1 → 0 |
| `poker/calculations/styles.css` | 1,138 lines | 877 lines | 31 → 0 | 0 |
| `poker/tools.css` | 356 lines | 553 lines (+197: the cube option rows, a landscape-phone tool-head rule) | 0 | 0 |
| Page `:root` palettes and root font-size overrides | 2 (+ a 12.5px phone root on 222) | 0 | | |
| Local playing-card markup/CSS | 222's own `.playing-card`, suit tokens, "10" ranks | gone: every card is `shared/cards.js` | | |

`shared/tests/css-literals.json` is not re-recorded (the test logs the lower counts); the integrator records it.

## `/poker/222/` (notes §3.9)

- Head and chrome: tokens → app → cards → `../tools.css` → `styles.css` (all `?v=20261016`),
  `data-family="poker"`, `theme-color #08090d`, `viewport-fit=cover`, the `is-ready` line, a
  `.skip-link` to `main#main[tabindex="-1"]`, `.topbar` with `.crumbs` (MS → Projects → Poker →
  222) and the `.tool-nav` (Dodge reports · Simulator · 222 · Calculations, `aria-current`); the
  green "2•222 FLIPS & CUBE" wordmark is gone. The H1 is "222" (hub tile, crumb and `<title>` agree).
- Tabs: a real `.tabs` tablist driven by `shared/tabs.js` (arrow keys, sliding underline,
  `aria-selected`, panels toggle `hidden`); `#sim/#spot/#trainer/#online/#reports` hashes and the
  room-code hash (`#ABCD` → online tab + prefilled code) are read before the tablist initialises,
  so a deep link is never overwritten. Old `aria-current` buttons are gone.
- **Cards**: `ui.js` renders every card through `PlayingCards.element` (`tag: "button"` with
  `aria-pressed` and `interactive` for the cards you can select, `role="img"` otherwise,
  `data-card` carrying the engine index, `T` for tens). Board slots are `PlayingCards.emptySlot()`;
  the deck is a `.deck-matrix` in `PlayingCards.deckMatrix()` order (suits down, A–2 across).
  Sizes: `--card-w-tray` on the board strip, 36px in seats, 44px for every clickable card on phones.
- **App shell**: the Dodge simulator's split layout. Desktop: toolbar + `.split` with the main
  column (streets, board strip, seats) and a side column (cube panel, deck) that scroll on their
  own; spot solver = form panel (scrolling body, sticky foot with Solve) | result column; trainer
  and online rooms the same way. ≤960 the view scrolls as one; ≤700 the toolbar groups into rows
  with one primary, seats go single-column, the deck scrolls sideways at 44px per card, the action
  row stays sticky at the bottom, the spot result summary sticks to the top.
- **Cube tables → option rows**: `renderOptionTable()` now emits the simulator's `.cube-options`
  / `.opt` rows (label, Best/Chosen tags, equity, centred equity bar, mix and loss vs best) instead
  of a five-column `<table>` with no scroll wrapper. The `.opt` CSS moved into `poker/tools.css`
  (the Dodge simulator keeps an identical copy until the integrator prunes it). The old
  `.cube-table` class stays on the list as a hook.
- Components from the kit: `.btn` family (also for every button `ui.button()` builds, mapped from
  `"" / primary / quiet / danger`), `.field` / `.field--select` / `.field--inline` / `.check`,
  `.segmented` (the count buttons keep bare digit text and gain `aria-pressed`), `.stat-strip` /
  `.stat` (spot summary, report KPIs, session stats stay `.metric`), `.panel`, `.data-table` in
  `.table-wrap` (preflop table, result table, every report table with real `<thead>`), `.bar` with
  `--value` / `--bar-color` (report bars), `.progress` (reports loading, spot/simulator solve
  progress with a percentage), `.badge` tones for the old `.tag` variants, `.empty-state`
  (spot solver before a solve, guest waiting room), `.dialog--sheet` through `shared/sheet.js`
  (rules, phone deck), `.toast-stack`, `.icon` sprite.
- Colour: coral is navigation, selection, the active street and the one primary action per view;
  EV and probability heat colours are `color-mix()` of `--good` / `--bad` over `--muted`, computed
  in `ui.js` (no RGB literals left in JS); hand groups 1/2/3 are `--good` / `--info` / `--warn`.
- Type: 16px root, every rendered text ≥ 12px at 1440×900, 375×812 and 844×390 (shell sweep);
  the 8px cube owner, 9.5px metric labels and 10px tags are gone.
- Live regions: one polite stack (`#toast`, also "Invite copied.") and one assertive stack
  (`#alerts`) inside one `.toast-stack`; prompts carry `role="status"`; nothing else is live.

### Completeness-pass fixes (small logic changes, each required by a §3.9 finding)

- **In-room errors render in the room.** `showError()` writes to the lobby line only while the
  lobby is shown; inside a room it fills `#on-room-error` (an `.error` box above the table) and
  raises an assertive toast. The slot clears on the next published state and on Leave.
- **Deck sheet on selection.** The deck is a side panel on desktop; on phones the panel node moves
  into `#sim-deck-dialog` (`.dialog--sheet`) which opens when a card is selected and on the
  "Open deck" button in the board strip. Closing it without a swap cancels the selection and returns
  focus to the card. The selection message ("Selected 7♠ from Seat 1 …") lives in the board strip
  with a Cancel button; deck cards are labelled "held by Seat 1" / "on the board" / "an undealt
  board card" (visible mark: seat number or B) instead of `S1/B/b`.
- **Spot solver reveals its result.** After a user-triggered Solve (submit, Random spot, Copy from
  simulator) `#spot-result` takes focus and, on phones, scrolls into view; a sticky `#spot-summary`
  shows the street and each seat's EV, or a progress bar with the solve percentage. Validation
  errors stay inline and also toast.
- **Guest lobby state.** A guest in a room with no hand sees `#on-waiting` ("Waiting for the host
  to start", player count) instead of an empty main area.
- **Auto-deal-aware prompts with a countdown.** With auto-deal on, the prompt says the next street
  "deals automatically" and `#on-timer` (outside the live region, so it never announces) counts
  down from the host's own delays (2.5 s preflop, 3.5 s later streets, 6 s between hands) on every
  peer; without auto-deal the host reads "Deal the turn when ready" and guests "Waiting for the
  host to deal". No protocol change: the delays are constants on both sides.
- **Result card.** `renderResultCard()` renders the showdown (per-hand points, scoop, net × cube,
  the viewer's row highlighted) or the drop result as a card above the seats in `#on-result` /
  `#tr-result`; the online table no longer injects a table into the sticky action row, and the
  trainer gains the same card.
- **Focus across re-renders.** `replaceActions()` keeps keyboard focus on the same-labelled button
  (or the first enabled one) when the trainer or online action row is rebuilt.

## `/poker/calculations/` (notes §3.12)

- Head and chrome as above (no cards): coral accent, crumbs with a breadcrumb to `/poker/`, the
  tool nav, a visible H1 ("Poker hand probabilities by cards dealt") with eyebrow and lede in the
  tool head; the solver summary is a `.stat-strip` in the head's right slot. The "Rust solver"
  link is a text link in the Solver panel, not a primary-looking button in the topbar.
- Phone view switcher: the `.view-tab` buttons are a `.tabs--pill` tablist run by `shared/tabs.js`
  (`aria-selected`, arrow keys); `setView()` still sets `data-view` on `#workspace`. The desktop
  grid ignores it as before.
- Focus: the `outline: none` rules are gone; every control (`.rank-button`, `.card-button`,
  `.distribution-row`, `.stack-segment`, `.prob-button`, glance rows, the source link) shows the
  kit's ring. Hover `translateY` is gone, so there is nothing left to guard for reduced motion.
- Rank colours are tokens: `--calc-rank-0 … --calc-rank-9` on `.workspace`, derived from the
  shared chart palette (`--muted`, `--cat-1..6`, `--info`, `--player-2`, `--ink`); `app.js` pipes
  `var(--calc-rank-i)` inline as `--rank-color`. No hex in JS or CSS.
- Stack segments hide their abbreviation under 27px through a container query on the segment
  (`container-type: inline-size`); the `aria-label` keeps the full text.
- 12px floor: the 0.5–0.66rem labels are `--t-xs`; weights 600/700 replace 760–900; the trend
  chart is drawn at the panel's content-box size (and redrawn on resize) so axis labels render at
  12px instead of being scaled down through a fixed 720×310 viewBox.
- Bars use the kit's `.bar` with `--value` / `--bar-color` (distribution rows, solver layers);
  "Exact" is a `.badge--good`; the table is a `.data-table` in the kit's `.table-wrap` with the
  two sticky columns kept.
- Short desktop windows (≤720px tall) let the app scroll instead of clipping the bottom row.

## Verification

- `node scripts/run-tests.mjs`: 451 tests, green.
- `sh scripts/assemble-site.sh _site && SHELL_PAGES=/poker/222/,/poker/calculations/ node
  scripts/shell-browser.cjs`: no overflow, no target under 44px, no missing focus ring, no text
  under 12px, skip link and `main#main` on both pages at all three viewports; the same with
  `SHELL_ROOT_FONT=24`. The four poker tool pages still pass together.
- `node scripts/screenshots.cjs --compare --only /poker/222/,/poker/calculations/`: reviewed at
  both viewports; the four baselines are replaced.
- Scratch Playwright scripts rendered and audited the states the landing picture does not show:
  222 at 1440×900 and 375×812 (flop dealt, a selected card and the phone deck sheet, a swap, a
  four-player river, the spot solver solved / revealed / with an error, trainer idle / mid-hand /
  hand over with the result card, the online lobby, a two-page room in one context — host room,
  guest waiting state, dealt hand on both, showdown result card on both, leaving — the reports,
  the rules sheet), plus 844×390 and a 24px root; Calculations at 375, 820, 1280×640, 1600 and a
  24px root (every phone tab, the open control panel, arrow-key tab movement, focus rings on
  stack segments and probability cells).

## Deferred (with reasons)

- Stack-map segments narrower than 44px: a segment's width is its probability, so thin slices
  (down to 2px) cannot be 44px targets. Every rank is also selectable from the rank list, the
  distribution rows and the table; the segments carry the full `aria-label`.
- The Calculations H1 is visually hidden on phones (the family pattern from `poker/tools.css`: the
  crumb names the tool, the heading block stays in the accessibility tree). The desktop H1 is
  visible and no longer clipped.
- 222's landing screenshot is non-deterministic: the simulator deals a random table on load, so
  the baseline comparison always reports a small pixel difference in the cards and numbers.
- The Dodge simulator's own copy of the `.opt` rules stays (identical to the `poker/tools.css`
  copy); pruning it touches a file outside this branch's ownership.
- `#spot-error` is plain inline text (no `role="alert"`): the assertive toast announces it, which
  keeps the page at one polite and one assertive region.
