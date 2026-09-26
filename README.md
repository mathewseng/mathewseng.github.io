# mathewseng.github.io

Static projects published at <https://mathewseng.github.io>. Every folder path is its URL.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Landing page listing every top-level project |
| `gym/` | Form & Function training app (Vite + React; the only page with a build step) |
| `cards/` | Card Table Workshop |
| `microtonal-lab/` | Tuning explorer and browser instrument |
| `ofc/` | OFC hub: `play/`, `fantasyland-trainer/`, `fantasyland-ev/`, `fantasyland-report/` |
| `poker/` | Poker hub: `play/`, `rush/`, `ultimate-omaha/`, `edge-the-dealer/`, `dodge/`, `calculations/` |
| `blackjack/` | Blackjack hub: `strategy/` |
| `shared/` | Code shared across project families (`peer-room.js`, and `hub.css` + `hub.js` for the landing and hub pages) |
| `jazz-piano-ml/` | Python source project; not published |
| `redirects.json` | Old URL → new URL; the deploy writes a redirect page for each entry |
| `scripts/` | Repo tooling (test runner, redirect builder); not published |

## Conventions

- Folder and file names are kebab-case, and a page's folder path is its URL.
- A group of related pages is a family with a hub `index.html` at its root (`ofc/`, `poker/`, `blackjack/`).
  The landing page and hubs share `shared/hub.css` and `shared/hub.js`; set the accent with `data-family` on `<html>`.
- Each page has `index.html`, `app.js` as its entry script, `styles.css`, and role-named modules
  (`engine.js`, `game.js`). Tests go in `tests/*.test.cjs` or `tests/*.test.mjs`, and notes go in
  `README.md` or `docs/`.
- Pages in the same family may load each other's files (`../fantasyland-core.js`, `../ultimate-omaha/poker.js`).
  Code used by more than one family belongs in `shared/`.
- `tests/`, `scripts/`, `solver/`, `simulation/`, Markdown, and `package.json` files are not published.
  Link to source on GitHub instead of relative paths.
- When a page moves, add its old path to `redirects.json`.

## Checks

```bash
node scripts/run-tests.mjs
```

That runs every `*.test.cjs` and `*.test.mjs` outside `gym/`. The gym app has its own checks in `gym/package.json`.
Pushing to `main` runs both and deploys through `.github/workflows/deploy.yml`.
