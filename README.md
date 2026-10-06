# mathewseng.github.io

Static projects published at <https://mathewseng.github.io>. Every folder path is its URL.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page listing every top-level project |
| `gym/` | Gym Tracker training app (Vite + React; the only page with a build step) |
| `cards/` | Card Table Workshop |
| `microtonal-lab/` | Tuning explorer and browser instrument |
| `ofc/` | OFC hub: `play/`, `fantasyland-trainer/`, `fantasyland-ev/`, `fantasyland-report/` |
| `poker/` | Poker hub: `play/`, `rush/`, `ultimate-omaha/`, `edge-the-dealer/`, `222/`, `dodge/`, `calculations/` |
| `blackjack/` | Blackjack hub: `strategy/` |
| `backgammon/` | Backgammon hub: `play/`, `trainer/`, `solver/`, `library/`; pinned GNUbg WASM |
| `shared/` | Code shared across project families: `cards.css` + `cards.js` (the one playing-card component every page uses), `peer-room.js`, and `hub.css` + `hub.js` for the landing and hub pages |
| `jazz-piano-ml/` | Python source project; not published |
| `redirects.json` | Old URL → new URL; the deploy writes a redirect page for each entry |
| `scripts/` | Repo tooling (test runner, redirect builder); not published |

## Conventions

- Folder and file names are kebab-case, and a page's folder path is its URL.
- A group of related pages is a family with a hub `index.html` at its root (`ofc/`, `poker/`, `blackjack/`, `backgammon/`).
  The landing page and hubs share `shared/hub.css` and `shared/hub.js`; set the accent with `data-family` on `<html>`.
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

That runs every `*.test.cjs` and `*.test.mjs` outside `gym/`. The gym app has its own checks in `gym/package.json`.
Pushing to `main` runs both and deploys through `.github/workflows/deploy.yml`.

## Backgammon validation

See [backgammon/README.md](backgammon/README.md) for controls, architecture, engine licensing/builds, multiplayer, backups, offline behavior, and precise format/capability limits. `scripts/assemble-site.sh _site` is the shared deployment assembly. After assembly, `node backgammon/tests/browser.cjs` checks the actual published files with Playwright and real WASM; the deployment workflow runs this in Chromium. Root npm dependencies are test tooling only. Backgammon includes 24 readable board palettes, per-element color/pattern controls, on-board dice, combined tap/drag moves, draft reversal/reset, configurable money-session rules (Jacoby, automatic opening doubles, beavers and raccoons), local side/bot controls, last-move outlines, automatic Solver analysis with resumable Play context, opponent-approved committed undo, automatic forced turns/passes, and automatically saved/exportable game history.
