# mathewseng.github.io

Static projects published at <https://mathewseng.github.io>. Every folder path is its URL.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Illustrated project homepage with grouped links and created and updated dates |
| `gym/` | Gym Tracker training app (Vite + React; the only page with a build step) |
| `cards/` | Card Table Workshop |
| `microtonal-lab/` | Tuning explorer and browser instrument |
| `music/` | Music hub, ear training, perception tests, EWI fingerings, ChordNet prototype, and Musical Masterpieces |
| `games/` | Games hub, Blu’s Adventure, and the archived Aperiodic Minesweeper, Cardsweeper, GuessJack, Word Hunt, and TFT prototypes |
| `tools/` | Tools hub, Mandelbrot explorer, Sbeve text experiment, and Bank Discrepancy Allocator |
| `scoundrel/` | Solo dungeon card game: 44 Ash & Briar encounters, an animated card collection in `gallery/`, hidden-deck action EVs, and an outcome report in `reports/` |
| `ofc/` | OFC hub: `play/`, `fantasyland-trainer/`, `fantasyland-ev/` (its Overview tab replaced the old Fantasyland report); `ofc.css` is the family stylesheet |
| `poker/` | Poker hub: `play/`, `rush/`, `ultimate-omaha/`, `edge-the-dealer/`, `222/`, `video-poker/` (35 single-draw variants and a payout lab with exact hold EVs), `dodge/`, `calculations/`; `table.css` (felt, seats, lobby, action stage) is shared by the four tables and `tools.css` by the four research tools |
| `blackjack/` | Blackjack hub: `strategy/` |
| `dice/` | Dice hub: `reports/` (exact fair payouts, custom checker, two-dice matchup and probability reports) |
| `backgammon/` | Backgammon hub: `play/`, `trainer/`, `solver/`, `openings/`, `library/`, plus the `controls/`, `reports/` and `refresh/` documents (styled by `docs.css`); pinned GNUbg WASM |
| `shared/` | Code shared across project families: `tokens.css` (design tokens, loaded first on every page) and `app.css` (site chrome and the component kit), `cards.css` + `cards.js` (the one playing-card component every page uses), `peer-room.js`, `hub.css` + `hub-art.css` + `hub.js` for the landing and hub pages, `icons.svg`, and the behaviour helpers `tabs.js`, `sheet.js`, `card-drag.js`, `keycap.js`; `shared/preview/` is the kitchen-sink page for the kit and is not published |
| `jazz-piano-ml/` | Python source project; not published |
| `redirects.json` | Old URL → new URL; the deploy writes a redirect page for each entry |
| `scripts/` | Repo tooling (test runner, redirect builder); not published |

## Conventions

- `shared/site-map.json` is the project catalog. Its `projects` entries include category,
  description, source paths, and dates; `origin` records the original repository, pinned
  import commit, and historical dates for the matheweon.github.io collection. `legacyPaths`
  records its original page URLs. Source-only helpers are linked individually as well.
  Run `node scripts/build-project-directory.mjs` after editing the catalog. It generates
  the homepage from `scripts/templates/home.html` and the Music, Games, and Tools hubs,
  and stamps the imported page headers. The homepage preserves the original card fan
  and illustrated tiles, with additional projects in matching groups; `home.css`
  styles its illustrations, date labels and added tiles. The Backgammon thumbnail is
  a static export of a legal midgame from the real board renderer; regenerate
  `home-backgammon.svg` with `node scripts/render-home-backgammon.cjs` (Playwright required).
  Search is available in the category hubs.
  The homepage and category directories share `shared/dither.css` and `dither.js`:
  cached sea-glass/blue dither artwork with a gentle CSS transform on desktop.
  Phones, reduced motion and data saver use a still background; the desktop footer
  control pauses the drift, and hidden tabs pause it automatically. Visitors never
  load a shader or create a WebGL context. To regenerate the two WebP textures from
  @pennadenoiz's OpenShaders source in `scripts/art/dither-shader.mjs`, run
  `node scripts/render-dither-field.cjs` with Playwright installed.
  Creation follows the earliest recorded primary-file commit, following renames but
  stopping at copied templates; updates
  follow changes under each project's source paths. Imported creation dates are preserved;
  the migration itself is an update. Dates use UTC calendar days. Deploy refreshes them
  automatically using full Git history.
- Imported poker projects live in `poker/pokerdle/`, `poker/shot-clock/`,
  `poker/preflop-ranges/`, `poker/preflop-classic/`, `poker/preflop-classic-v2/`,
  `poker/heads-up-preflop/`, `poker/three-pick-two/`, `poker/range-converter/`, and
  `poker/source-tools/`. Unfinished projects are explicitly labeled as prototypes.
  Their interfaces retain their original character, with `shared/legacy.css` supplying
  common navigation. Pinned browser dependencies and licenses live in `shared/vendor/`.
- Imported legacy paths, including case-sensitive `.html` filenames, redirect on this
  domain through `redirects.json`. The original matheweon.github.io domain is unchanged.

- Folder and file names are kebab-case, and a page's folder path is its URL.
- A group of related pages is a family with a hub `index.html` at its root (`ofc/`, `poker/`, `blackjack/`, `backgammon/`, `dice/`).
  The landing page and hubs share `shared/hub.css`, `shared/hub-art.css` and `shared/hub.js`; set the accent with `data-family` on `<html>`.
- Every page links `shared/tokens.css` first, then `shared/app.css`, then its own stylesheets. Pages never redefine a token;
  they pick a family accent with `data-family`. Shared stylesheets are linked with one `?v=<date>` query per page head
  (Backgammon's `?bgv=` release hash covers them through its offline manifest), bumped whenever a shared file changes.
  The site-wide redesign that introduced this is documented in `docs/redesign/`.
- Each page has `index.html`, `app.js` as its entry script, `styles.css`, and role-named modules
  (`engine.js`, `game.js`). Tests go in `tests/*.test.cjs` or `tests/*.test.mjs`, and notes go in
  `README.md` or `docs/`.
- Pages in the same family may load each other's files (`../fantasyland-core.js`, `../ultimate-omaha/poker.js`).
  Code used by more than one family belongs in `shared/`.
- `tests/`, `scripts/`, development `solver/`, `simulation/`, Markdown, and package manifests are not published.
  The exact `/backgammon/solver/` application route is the sole solver-directory exception.
  Link to source on GitHub instead of relative paths.
- When a page moves, add its old path to `redirects.json`.
- Every playing card on the site is rendered by `shared/cards.js` (`PlayingCards.html` / `.element`) with
  `shared/cards.css`; pages only set `--card-width` and wrapper states, never the card face. Ten is `T`.
- Pages are app shells: on desktop they fit the viewport and long panels scroll internally; on phones they
  stack with minimal scrolling.

## Checks

```bash
node scripts/build-project-directory.mjs
node scripts/run-tests.mjs
```

That runs every `*.test.cjs` and `*.test.mjs` outside `gym/`, including the colour-literal drift lint
(`shared/tests/css-literals.test.cjs`, baseline in `css-literals.json`; lower a count and re-record it with
`CSS_LITERALS_UPDATE=1`) and, when Playwright is installed, the shell sweep below. The gym app has its own checks in `gym/package.json`.

```bash
sh scripts/assemble-site.sh _site
node scripts/shell-browser.cjs      # every page at 1440x900, 375x812 and 844x390: overflow, 44px targets, focus rings, 12px floor
node scripts/project-directory-browser.cjs # homepage links, category search, and no-JavaScript links
node scripts/screenshots.cjs --compare   # every page at 1440x900 and 375x812 against scripts/screenshots/baseline/
```

`scripts/screenshots/baseline/` holds the pre-redesign pictures; review a change by eye and copy the new picture over
its baseline deliberately. Backgammon's offline manifest hashes `shared/`, so run `node backgammon/scripts/offline-manifest.mjs`
after any shared change.
Push directly to `main` to publish. `.github/workflows/deploy.yml` compiles Gym, versions
Backgammon's offline assets, assembles static files and redirects, and deploys to GitHub Pages.
There is no manual build or release step. Pages still needs a short time to publish after a push;
a compilation or publishing failure is reported in that workflow.

`.github/workflows/validate.yml` runs site tests, assembled-site browser tests, and Gym checks
independently on pushes and pull requests. Validation failures stay visible in Actions but do
not block publication. Check both workflows when diagnosing a release.
The browser-test job is pinned to Ubuntu 24.04, which is supported by the locked
Playwright version. Review that runner image together with Playwright upgrades.
It uses Ubuntu's primary package mirror for browser dependencies to avoid slow
downloads from the runner's Azure mirror.

The two Backgammon study workflows share the `backgammon-research` concurrency
group and run at most 16 of their 20 shards at once. This leaves four standard
runner slots available for Pages publishing, validation, and other short jobs
on an account with a 20-job limit. Further study runs queue without interrupting
the active study. Workflow changes affect newly dispatched runs only; a study
already using all 20 slots must release a runner before a queued publish can start.

For an urgent publish while hosted runners are full, the Publish GitHub Pages
manual dispatch accepts a `runner_label`. A temporary self-hosted runner with
that unique label can run the same build and deployment. Register it without
default labels, use a separate checkout, and remove it after publishing. Pushes
and manual runs with the default input continue to use `ubuntu-latest`.
Dependency caching is disabled on self-hosted runs so a local machine's npm cache
is never uploaded by the publishing workflow.

## Backgammon validation

See [backgammon/README.md](backgammon/README.md) for controls, architecture, engine licensing/builds, multiplayer, backups, offline behavior, and precise format/capability limits. `scripts/assemble-site.sh _site` is the shared deployment assembly. After assembly, `node backgammon/tests/browser.cjs` checks the actual published files with Playwright and real WASM; the independent validation workflow runs this in Chromium. Root npm dependencies are test tooling only. Backgammon includes 24 readable board palettes, per-element color/pattern controls, on-board dice, combined tap/drag moves, draft reversal/reset, configurable money-session rules (Jacoby, automatic opening doubles, beavers and raccoons), local side/bot controls, last-move outlines, automatic Solver analysis with resumable Play context, opponent-approved committed undo, automatic forced turns/passes, and automatically saved/exportable game history.

Browser automation uses `scripts/quiet-browser.cjs` to mute automated Chromium,
Firefox and WebKit output without changing saved game sound preferences. Use
`launchQuietBrowser(browserType, options)` for new browser scripts. Real-time
Web Audio runs through a silent output; offline audio rendering remains testable.
