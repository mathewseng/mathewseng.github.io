# redesign/hubs — Step 1, landing page and the four hub.css hubs

Branch `redesign/hubs` from `3d2e4dc`. Pages: `/`, `/ofc/`, `/poker/`, `/blackjack/`, `/dice/`.
The Backgammon hub is owned by the Backgammon family step and was not edited by hand (the
offline-manifest script restamped its `?bgv=` hash, as it does for every Backgammon page).

## One data list

- `shared/site-map.json` is the single list of families, groups, tools (README order), the
  Blackjack reference links, the Dice secondary link, the apps and the source-only project.
- `shared/tests/site-map.test.cjs` keeps the static HTML honest: per hub, group titles, tile
  order and targets, the `N tools` / `N workspaces` / `N links` group counts and the `N tools`
  fact chip; on the landing page, hub/app/source tile order, the `5 hubs / 3 apps / 1 project`
  counts, the `N tools` tile tags against each family's tool count, the `projects` / `live
  pages` / `game hubs` facts (live pages are counted from the tracked `index.html` files the
  deploy ships, so the number moves when a page is added or folded), sequential stagger
  indices, no text arrows, no inline-styled images, copy ≤ 110 characters per standard tile and
  ≤ 150 per featured tile. It also checks one footer, one switcher order, skip link, `main#main`,
  `theme-color` and the shared `?v=20261016` links.
- Favicons: `shared/favicon.template.svg` (`{{accent}}`, `{{mark}}`) is filled with each page's
  `--family-*` hex read from `tokens.css` and `--on-accent`; the test asserts every hub's
  `<link rel="icon">` equals that, and `SITE_MAP_WRITE=1 node --test
  shared/tests/site-map.test.cjs` restamps them. Marks: ♣ ♥ ♠ for OFC/Poker/Blackjack, five
  pips for Dice, `MS` for the landing page. The Dice hub's `.hub-die` faces use the same pip
  geometry.
- Counts fixed by the list: landing 9 projects / 30 live pages / 5 hubs (was 8 / 23 / 5),
  Poker "8 tools" everywhere (was 6 on the landing page and 7 on the hub), OFC 4, Backgammon 4.

## Landing page `/`

- Hub tiles follow the switcher order (OFC, Poker, Blackjack, Backgammon, Dice) in a
  four-plus-one grid (`.tiles--hubs`: four columns ≥ 881px, two by two on tablets, a list on
  phones) with Dice as a full-width `.tile--row` holding a two-dice illustration.
- Every tile's copy is under 110 characters and the tile paragraph clamps at three lines on
  every viewport (two-line and one-line clamps removed, including the short-desktop one).
- One arrow glyph: every internal tile uses the inline SVG arrow; the external Jazz Piano ML
  row keeps the diagonal external-link arrow and its visually hidden "(opens GitHub)".
- One art container: the Backgammon tile's `<img>` is `.art-image` with no inline style.
- Stagger indices run 0–8 across the page (they repeated 3/4 before, so the apps group animated
  in sync with the hubs).
- Skip link to `main#main[tabindex="-1"]`; the entry reveals are the `@starting-style`
  transitions gated on `html.is-ready` that step 0 put in hub.css (nothing uses
  `animation-fill-mode: backwards`).
- Hero fan keeps one chip (the audit asked for one).

## Hubs

- One footer on all five pages: `nav.foot-links` (All projects · Source on GitHub with the
  sprite's external icon and hidden "(opens GitHub)") plus one line of copy; the landing page
  omits the self-link. Footer text is `--muted` at 13px (app.css had `--soft` at 12.8px and
  0.74rem on phones; overridden in hub.css, see shared-requests).
- One switcher order (step 0) and one crumbs structure; `?v=20261016` on every shared link
  including `hub.js`.
- Tiles: `:active` state and, on `hover: none` devices, a static accent top edge on every tile
  with the full accent edge while pressed.
- 12px floor: facts, tags, group heads, royalty chips, felt pot, seat numbers, chart legend and
  grid labels moved from 0.58–0.78rem to `--t-xs`/`--t-sm`; the OFC preview's label column
  widened to fit 12px uppercase labels. `--soft` is no longer used under 15px on these pages.
- OFC: the third Fantasyland tile is "Fantasyland overview" → `/ofc/fantasyland-ev/#overview`;
  the preview's inline `grid-column-start` became `.art-ofc-first`.
- Poker: facts say 8 tools; 222 and Dodge Simulator copy shortened to fit three lines; the
  duplicated `--i: 5` fixed.
- Blackjack: the three GitHub references are a `.hub-links` list (underlined accent links with
  44px targets, external icon, muted description), counted as "3 links"; "~20 µs per solve"
  replaced by "Solved in your browser".
- Dice: lilac accent (tokens.css); hero gets facts (3 workspaces, 1,024 matchups, 152 events)
  and a three-dice fan (`.fan--dice`, same tilt and bob as the card fan); real tiles for
  Explore → `/dice/reports/#explore`, Matchups → `/dice/reports/#matchups`, Play →
  `/dice/reports/#play` under the group "Fair Dice Payout Explorer" (the page's one name), and
  the custom payout checker as a secondary `.hub-links` entry; title is "Dice" like the other
  hubs; the footer's source link gained `target`/`rel`.
- Compact tiles (≤ 640px) are one column: `auto-fit` still fitted two 250px columns above
  about 530px, so the icon-beside-copy row tiles sat side by side with a 190px text column and
  the three-line clamp ellipsised the OFC Fantasyland and Poker research copy (seen at 540–640px
  during the second verification pass).

## CSS

- `shared/hub.css` 650 → 780 lines (+130: `.tiles--hubs`, `.hub-links`, footer links, touch
  edge, row-tile art, one-column compact tiles). `shared/hub-art.css` 674 → 792 (+118: dice faces and fan, `.art-image`,
  `.art-ofc-first`). Zero colour literals in both (baseline unchanged).
- `backgammon/offline-manifest.js` regenerated (hashes hub.css/hub-art.css); the script also
  restamps `?bgv=` in the Backgammon pages and `sw.js`.

## Verification

- `node scripts/run-tests.mjs` green (includes the new site-map test and the shell sweep).
- `SHELL_PAGES=/,/ofc/,/poker/,/blackjack/,/dice/ node scripts/shell-browser.cjs` and the same
  with `SHELL_ROOT_FONT=24`: no overflow, no targets under 44px, no missing focus rings, no text
  under 12px, skip link and `main#main` on every page at all three viewports.
- `node scripts/screenshots.cjs --compare --only …`: all ten pictures reviewed at 1440×900 and
  375×812 and copied over `scripts/screenshots/baseline/`. Extra states rendered from a
  scratchpad script: tile hover, tile focus ring, switcher focus, skip link, link-list focus,
  dice hero hover, touch pressed state, 1366×768, 1280×720, 768×1024 and 320×568 (no overflow).
- Second pass after the interrupted run: the whole list above again (suite 459 pass / 0 fail;
  shell sweep clean at 16px and 24px roots; the ten pictures identical to the baselines), plus
  1024×768, 640×900, 600×900 and 540×900 renders, which found the two-column compact tiles.
- `BG_MODULES=updates node backgammon/tests/browser.cjs` and `BG_MODULES=mobile-quick …`
  against `_site`.

## Deferred

- Backgammon hub favicon and tiles: `backgammon/index.html` and `backgammon/icon.svg` belong to
  the Backgammon step; the site-map test skips that hub (`"hub"` note in the JSON) until it
  adopts hub tiles. Its tool list in the JSON already feeds the landing tile count.
- `/ofc/fantasyland-report/` redirect: `redirects.json` is not in this step's files; the OFC
  step adds `"/ofc/fantasyland-report/": "/ofc/fantasyland-ev/#overview"`. The hub already
  points at the overview; until step 3 lands, that hash opens the EV page.
- `/dice/reports/#explore` and `#play` routing lands in step 4 (the hub links the hashes
  regardless, per the decision); `#matchups` already routes. The custom checker has no hash of
  its own, so its link opens the Explore workspace where the "Custom payouts" button lives.
- Live regions: the hubs have no dynamic content, so no `aria-live` regions were added.
- Hero cards still carry `aria-label` inside `aria-hidden` containers (markup identical to
  `PlayingCards.html`); harmless, left for the cards step.

## Review fixes (branch `redesign/hubs-fixed`)

Each finding of the independent review of `redesign/hubs` (3c6c016), verified before acting:

- **P2 Dice "Play" tile → `/dice/reports/#play` opens Explore.** Verified (`dice/reports/app.js`
  routes only `#matchups`/`#cycles`, and `setView("play")` needs a selected schedule). The
  delegate's decision for this step is explicit: the hub links `#explore`, `#matchups` and
  `#play` regardless, and the dice page gains hash-to-view routing in step 4; `dice/reports/`
  is not in this step's files. Kept the link; reworded the tile copy so it no longer promises
  a workspace that opens on its own ("Roll a schedule or matchup you picked in Explore, with
  animated dice and a running scoreboard."). Open item for the Dice step: route `#play`
  (and `#explore`) on load.
- **P2 "Fantasyland overview" → `/ofc/fantasyland-ev/#overview` does not exist yet.** Verified
  (`SECTION_IDS` has no `overview`; the EV page opens on Royalty EV). Not changed: the
  delegate's decision names this exact target and title, and the OFC step folds the report in
  and adds the `redirects.json` entry. Until then the tile opens the EV page.
- **P2 Tile copy ellipsised at 844×390 and 1024×768.** Verified with a scratchpad sweep (every
  hub at 13 viewports plus a dense 320–1241px pass every 20px): Poker clipped three tiles at
  844 and two at 1100, the landing clipped Backgammon at 1024 and four hubs at 900. Fix in
  `shared/hub.css`: the standard `.tile p` clamp is four lines (110 characters fit three lines
  at the 250px column minimum but the landing hub row and three-column tablets narrow the
  paragraph to 180–230px; the fourth line only renders there, so the 1440×900 pictures are
  unchanged), and the phone list (≤ 640px) drops the clamp altogether (`display: block`),
  which also fixes the P3 below. After the change the dense sweep reports no clipped copy
  and no horizontal overflow on any hub at any width from 320 to 1241. The site-map test now
  guards the rules (`hub.css never ellipsises tile copy that fits the budget`), and
  shared-requests asks the shell sweep to assert `scrollHeight <= clientHeight` on `.tile p`.
- **P2 Jazz Piano ML styled as an app tile with a second arrow glyph.** Verified. The landing's
  "Source only" group is now a `.hub-links` entry (underlined accent link, external icon,
  hidden "(opens GitHub)", muted description) and the diagonal `.go` arrow is gone, so the
  page carries one arrow glyph. The dead `.tile[target="_blank"] .go` rule was removed from
  hub.css. `site-map.test.cjs`: the landing's source group is asserted as a link list with no
  tiles, no tile may carry `target="_blank"`, and no `.go` may hold the diagonal arrow.
  Stagger indices now run 0–7.
- **P3 "three table-game prototypes" vs the hub's "two".** Landing copy says two (the hub tags
  Ultimate Omaha and Edge the Dealer as prototypes; Poker Rush is a seeded sprint).
- **P3 Crumbs home link 96×32 on phones.** Verified on `/ofc/` at 375 wide. `shared/hub.css`
  phone block sets `.crumbs a { min-height: 44px }` (now 96×44); the app.css request is in
  shared-requests.
- **P3 Poker hero fan 1.3px past the viewport at 375/320.** Verified (scrollWidth 376/321
  without mobile emulation). `shared/hub-art.css` phone fan spread 15px → 14px per card
  (hover 18 → 17); the last card's right edge is now 318.8 at 320 wide and the document no
  longer scrolls sideways at 320, 375, 540 or 640.
- **P3 `livePages()` counted untracked `index.html` files.** `git ls-files --cached` only, with
  a comment; README is not in this step's files, so the convention note (edit the HTML and
  `site-map.json` together for counts, `SITE_MAP_WRITE=1` for favicons) stays in the changelog
  above for the integrator.
- **P3 Three-line clamp ellipsises most tiles at 320px.** Fixed by the phone-list unclamp
  above; the 320×568 renders of every hub show full copy.
- **P3 Deferred step-1 items (Backgammon hub tiles, OG image, switcher edge fade).** No action;
  still listed under Deferred for the Backgammon and app.css owners.

CSS: `shared/hub.css` 780 → 788 (+8), `shared/hub-art.css` 792 → 794 (+2); no colour
literals added. `backgammon/offline-manifest.js` regenerated (hub.css and hub-art.css hashes;
the script restamps `?bgv=` across the Backgammon pages and `sw.js`).

Verification repeated: `node scripts/run-tests.mjs` (460 pass), the shell sweep for the five
hubs at 16px and 24px roots, `node scripts/screenshots.cjs --compare --only …` (eight pictures
changed as expected: the landing's link list at both viewports, the Dice Play copy, and on
every phone picture the 12px taller crumbs row plus the fan shift; all reviewed and copied
over the baselines), the scratchpad
clip/overflow sweep, the extra states (1024×768 and 320×568 landing, 844×390 and 320×568
Poker, link-list focus, phone pressed tile, crumbs box) and the Backgammon `updates` and
`mobile-quick` browser suites against `_site`.
