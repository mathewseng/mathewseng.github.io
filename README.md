# mathewseng.github.io

Static projects published at <https://mathewseng.github.io>. Every folder path is its URL.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page listing every top-level project |
| `gym/` | Gym Tracker training app (Vite + React; the only page with a build step) |
| `cards/` | Card Table Workshop |
| `microtonal-lab/` | Tuning explorer and browser instrument |
| `ofc/` | OFC hub: `play/`, `fantasyland-trainer/`, `fantasyland-ev/` (its Overview tab replaced the old Fantasyland report); `ofc.css` is the family stylesheet |
| `poker/` | Poker hub: `play/`, `rush/`, `ultimate-omaha/`, `edge-the-dealer/`, `222/`, `video-poker/` (27 single-draw variants and a payout lab with exact hold EVs), `dodge/`, `calculations/`; `table.css` (felt, seats, lobby, action stage) is shared by the four tables and `tools.css` by the four research tools |
| `blackjack/` | Blackjack hub: `strategy/` |
| `dice/` | Dice hub: `reports/` (exact fair payouts, custom checker, two-dice matchup and probability reports) |
| `backgammon/` | Backgammon hub: `play/`, `trainer/`, `solver/`, `library/`, plus the `controls/`, `reports/` and `refresh/` documents (styled by `docs.css`); pinned GNUbg WASM |
| `shared/` | Code shared across project families: `tokens.css` (design tokens, loaded first on every page) and `app.css` (site chrome and the component kit), `cards.css` + `cards.js` (the one playing-card component every page uses), `peer-room.js`, `hub.css` + `hub-art.css` + `hub.js` for the landing and hub pages, `icons.svg`, and the behaviour helpers `tabs.js`, `sheet.js`, `card-drag.js`, `keycap.js`; `shared/preview/` is the kitchen-sink page for the kit and is not published |
| `jazz-piano-ml/` | Python source project; not published |
| `redirects.json` | Old URL → new URL; the deploy writes a redirect page for each entry |
| `scripts/` | Repo tooling (test runner, redirect builder); not published |

## Conventions

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
node scripts/run-tests.mjs
```

That runs every `*.test.cjs` and `*.test.mjs` outside `gym/`, including the colour-literal drift lint
(`shared/tests/css-literals.test.cjs`, baseline in `css-literals.json`; lower a count and re-record it with
`CSS_LITERALS_UPDATE=1`) and, when Playwright is installed, the shell sweep below. The gym app has its own checks in `gym/package.json`.

```bash
sh scripts/assemble-site.sh _site
node scripts/shell-browser.cjs      # every page at 1440x900, 375x812 and 844x390: overflow, 44px targets, focus rings, 12px floor
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

## Backgammon validation

See [backgammon/README.md](backgammon/README.md) for controls, architecture, engine licensing/builds, multiplayer, backups, offline behavior, and precise format/capability limits. `scripts/assemble-site.sh _site` is the shared deployment assembly. After assembly, `node backgammon/tests/browser.cjs` checks the actual published files with Playwright and real WASM; the independent validation workflow runs this in Chromium. Root npm dependencies are test tooling only. Backgammon includes 24 readable board palettes, per-element color/pattern controls, on-board dice, combined tap/drag moves, draft reversal/reset, configurable money-session rules (Jacoby, automatic opening doubles, beavers and raccoons), local side/bot controls, last-move outlines, automatic Solver analysis with resumable Play context, opponent-approved committed undo, automatic forced turns/passes, and automatically saved/exportable game history.

Browser automation uses `scripts/quiet-browser.cjs` to mute automated Chromium,
Firefox and WebKit output without changing saved game sound preferences. Use
`launchQuietBrowser(browserType, options)` for new browser scripts. Real-time
Web Audio runs through a silent output; offline audio rendering remains testable.
