# redesign/poker-tools-fixed — review fixes for the poker data tools

Branch base: `redesign/222-calc` (which carries `redesign/dodge`). Pages: `/poker/dodge/`,
`/poker/dodge/simulator/`, `/poker/222/`, `/poker/calculations/` and `poker/tools.css`. The family's
step-2 work is described in `redesign-dodge.md` and `redesign-222-calc.md`; this file covers only
the fixes for the independent review of `redesign/222-calc`.

CSS delta against `redesign/222-calc`: +115 / −28 lines over four stylesheets (`222/styles.css`
+53/−21, `calculations/styles.css` +31, `dodge/simulator/styles.css` +30/−7, `tools.css` +1).
No colour literals added; the four named `black` / `white` `color-mix()` literals and the two
`font-weight: 800` rules in 222 and the Dodge simulator are gone. No test changed;
`shared/tests/css-literals.json` not re-recorded.

## Review fixes

| # | Sev | Finding | What I did |
| --- | --- | --- | --- |
| 1 | P1 | Dodge simulator: arrow keys on the view tablist also stepped the Simulator / Trainer back and forward | Verified (draw undone after ArrowLeft onto "Table simulator"). The document keydown handler now returns early when `e.defaultPrevented` or the target is inside `[role="tablist"]` (`simulator/app.js`). Small logic fix required by the finding. Re-ran the reviewer's probe: the deck stays at 47 cards through two ArrowLeft/ArrowRight round trips. |
| 2 | P2 | 222 seat and deck cards lose their suit mark (colour-only suits) | Seat cards (`.cards`) are 44px everywhere, the smallest size at which `shared/cards.css` keeps the suit mark; the trainer and online seats get the same. The desktop deck (13 columns in a ~430px side column, so ~29px cards) cannot reach 44px, so each deck row now opens with an `aria-hidden` suit mark (`.deck-suit`, an extra `max-content` grid column on the page's `.deck-grid` wrapper); the rows are suits, so every card's suit is readable without colour. On phones the deck is already 44px per card with suit marks, so the row marks hide. Deck buttons keep their full `cardLabel` aria-labels. I applied the same row marks and 44px seat cards to the Dodge simulator, which had the identical pattern. |
| 3 | P2 | 222 deck: idle free cards dimmer than held cards | Removed the `.deck-card:disabled:not(.held)` dimming: while the deck waits for a selection only held (0.5) and undealt (0.22) cards are dimmed, so free cards read as available. P3 part: the holder mark (seat number / B) moved under the card (reserved bottom padding on every deck button) instead of over the rank glyph; it uses `--ink` on the panel, weight 700, no black scrim. |
| 4 | P2 | 222 spot solver on phones: Solve below the fold | The form foot (Random spot / Copy from simulator / Solve) is `position: sticky; bottom: 0` with a surface background whenever the layout stacks (≤960px). At 375×812 `#spot-solve` now sits at y≈746–790 on load. The stage is bounded by the form, so it never covers the result column below. |
| 5 | P2 | 222 phone deck sheet: focus fell to `main#main` after a swap | `swapIn()` records the swapped-in card; the sheet's `onClose` focuses it (falls back as before). `render()` also keeps keyboard focus on the same card button across rebuilds (or on the swapped-in card after a desktop swap), since every render replaces the card buttons. Small logic fix required by the finding. Reviewer's probe now ends on the swapped-in seat card. |
| 6 | P2 | Calculations H1 hidden on phones | `calculations/styles.css` (≤700px) undoes the family's visually-hidden heading block for this page: the H1 shows at `--t-lg` and wraps; the eyebrow and lede hide to save height. Measured: H1 351px wide at 375×812. |
| 7 | P2 | Calculations view tabs had no tab panels | Each panel (`#panel-controls`, `#panel-trend`, `#panel-detail`, `#panel-map`, `#panel-table`, `#panel-glance`, `#panel-solver`) has `role="tabpanel"` (its existing heading label kept); each tab has an id and `aria-controls` (Explore lists its three panels). `shared/tabs.js` toggles `hidden` on single-id panels, so `setView()` clears `hidden` again: `data-view` still picks the phone section in CSS and the desktop grid still shows every panel. |
| 8 | P3 | Result card border always coral | `.result-card` uses `--line-strong`; `renderResultCard()` adds `.result-card--good` / `--bad` from the viewer's net, which tint the frame with `--good` / `--bad`. |
| 9 | P3 | Named colour literals and weight 800 | 222 and Dodge simulator: the cube-face shadow mixes `--page` / `--ink`, the owner scrim is gone (222) or mixes `--page` (Dodge), `.cube-value` and `.owner` are weight 700. |
| 10 | P3 | Trainer hand end: two primaries; "You (you)" | The toolbar's New hand is `btn--primary` only while the trainer is idle and `btn--ghost` once a hand is live (the action row carries the primary). The result table no longer appends " (you)" to a name that already reads "You". |
| 11 | P3 | Seat card aria-label used the engine code | Seat cards use `cardLabel()` ("K♦: select to swap"), matching board and deck cards. |
| 12 | P3 | Tool nav position and page names | `body.app-shell > .topbar` is `justify-content: flex-start` in `poker/tools.css`, so the tool nav sits beside the crumbs on all four pages (topbar actions keep `margin-left: auto`). One name per page in `<title>` and H1, matching the hub tiles: "Dodge Reports" / "Dodge reports", "Dodge Simulator" / "Dodge simulator", "Poker Calculations" / "Poker calculations" (the simulator footer link reads "Dodge reports"). Crumbs keep the short tool-nav label inside the Poker family. |
| 13 | P3 | Dodge simulator room errors went to the hidden lobby `#on-error` | `renderOnline()` moves the one `#on-error` node (still `role="alert"`) under the room's summary strip while a room is open and back into the lobby when it closes. Verified with a two-step script: error visible in the room, node back in the lobby after Leave. |
| 14 | P3 | 222 auto-deal delays defined twice | The host timer reads `AUTO_DELAY`; the const now sits after the imports. |
| 15 | P3 | Phone hierarchy: setup controls fill the first screen | Calculations: the solver telemetry strip hides on phones (the Solver tab carries algorithm, peak states and solve time), so the view switcher follows the H1. **Deferred for 222**: moving precision / scoring / variant / drop cost / "You are" behind a Setup sheet is a new interaction (a sheet, a trigger and a summary per view) across the Simulator, Spot solver and Trainer toolbars, not a cheap fix; left for a follow-up. |

## Deferred

- 222 Setup sheet on phones (finding 15): see above.
- Dodge reports' table hand cards (30px) are rank-only on a four-colour face, the same pattern as
  finding 2; the reviewer did not flag it and widening the sticky hand column to 4×44px changes
  the table layout. The inspector and the phone selected-hand bar show full-size cards with suit
  marks. Worth a follow-up in the Dodge pass.
- The Dodge simulator keeps its own owner badge over the deck card (the finding was 222-specific).

## Verification

- `node scripts/run-tests.mjs`: 451 tests, 451 pass, 0 fail.
- `sh scripts/assemble-site.sh _site` then
  `SHELL_PAGES=/poker/dodge/,/poker/dodge/simulator/,/poker/222/,/poker/calculations/ node scripts/shell-browser.cjs`:
  passed on 4 pages × 3 viewports (overflow, text under 12px, targets under 44px and missing focus
  rings all 0; skip link and `main#main` present). Same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only <the 4 pages>`: 7 pictures changed (the expected
  edits; 222's are also random deals); all 8 reviewed and copied to the baselines.
- Scratchpad Playwright (`scratchpad/impl/redesign-poker-tools-fixed/`): the reviewer's
  `probe3.cjs` (phone sheet focus) and `probe4.cjs` (tablist arrows), `drive222.cjs` (simulator,
  spot solver incl. error and phone reveal, trainer to hand end, reports, rules sheet, phone deck
  sheet, landscape), `online222.cjs` (two pages in one context: host start error in the room,
  guest waiting, auto-deal countdown, showdown result card on both, leave), plus
  `dodgeroom.cjs` (Dodge in-room error) and `look.cjs` renders of the 222 desktop deck idle /
  7-player selection, the phone spot solver, Calculations phone tabs, and the Dodge simulator deck
  and seats on desktop and phone.
