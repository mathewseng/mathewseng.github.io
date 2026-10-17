# Shared requests from `redesign/backgammon-fixed`

The requests in `redesign-bg-shell.md`, `redesign-bg-content.md` and
`redesign-bg-docs.md` still stand, except item 6 of `redesign-bg-docs.md`
(generated refresh-page values), which this branch resolves inside the
family: `backgammon/scripts/offline-manifest.mjs` rewrites the page's token
block from `shared/tokens.css` and `backgammon/tests/refresh-tokens.test.mjs`
guards it.

## 1. Shell sweep: mark the Backgammon pages migrated (integrator)

`scripts/shell-browser.cjs` `MIGRATED` should list the eight Backgammon
pages once this branch is on main: `/backgammon/`, `/backgammon/play/`,
`/backgammon/trainer/`, `/backgammon/solver/`, `/backgammon/library/`,
`/backgammon/controls/`, `/backgammon/reports/`, `/backgammon/refresh/`.
They pass the strict checks today (see the changelog's verification).

## 2. An in-dialog tab bar in the kit

Backgammon's Settings, decision review and history tree switch views inside
a dialog with a compact tab bar (`tabBar()` in `backgammon/ui/shell.mjs`:
tablist/tab/tabpanel, aria-selected, roving tabindex, arrows/Home/End).
`shared/tabs.js` assumes one panel per tab with the `hidden` attribute and a
page-level script; a module export (or a `Tabs.init` option for "one region
whose content follows the tab") would let dialogs use it.
