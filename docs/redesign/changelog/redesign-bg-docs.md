# `redesign/bg-docs`: Backgammon documents (step 6, documents)

Continues `redesign/bg-content` (see `redesign-bg-shell.md` and
`redesign-bg-content.md`). Pages: `/backgammon/controls/`,
`/backgammon/reports/`, `/backgammon/refresh/`.

## One stylesheet

`backgammon/docs.css` (new, 855 lines, 0 colour literals, no
`!important`) replaces `controls/controls.css` (263 lines) and
`reports/report.css` (147 lines), which are deleted. It holds one reading
layout, one contents component, one table treatment per kind (the wrapping
reference table and the kit data table), flowcharts, a callout, note cards,
measured-on lines, the device card, the settings list and the footer. It
grew because it now carries what the two files never had (contents, figure
connectors, the device card, phone cards for the case table, the kit
header), not because rules are duplicated.

Both documents link `tokens.css` → `app.css` → `styles.css` → `docs.css`.
`styles.css` stays linked: `field()`, `select()` and `button()` from
`ui/shell.mjs` and the update gate are styled there, and
`backgammon/tests/deployment.test.mjs` requires every shell HTML file to
reference `styles.css?bgv=<release>`. The offline manifest walks the
directory, so `docs.css` enters `BG_SHELL` and the two deleted files leave
it without a change to `scripts/offline-manifest.mjs`.

## Clicks & highlights (`/backgammon/controls/`)

- Kit header: skip link, `.topbar` with `.crumbs` (MS mark → Backgammon →
  Clicks & highlights), the tool nav (Play, Trainer, Solver, Library, Docs
  with `aria-current="page"`), `main#main[tabindex="-1"]`, the `is-ready`
  line, the kit footer (site, hub, source). The duplicate "← Backgammon
  hub" link is gone (the crumbs carry it).
- Tool head: eyebrow, H1, a one-line lede, and a Docs switcher (Clicks &
  highlights / Engine report) as a second `.tool-nav`.
- Contents: the jump links keep their exact names (click-guide.cjs clicks
  "Checker & point highlights ↓") and gain "More input rules ↓".
- Outline: h1, five h2 sections, h3 for every flow step and note (the
  Advanced and Beginner steps were h2; the highlights steps were already
  h3). The two unlabelled note sections are one "More input rules" section.
- Flowcharts are `<figure>`s with a `<figcaption>` (the old `aria-label`
  text); connectors are paragraphs whose arrows are `aria-hidden`; on wide
  screens the answer spans both rows so each connector line runs from its
  card to the next step; on phones the answer hangs off a left rule.
- Case table: 12px uppercase head on `--surface-3` that sticks while the
  31 rows scroll, `--line-opaque` rows, accent wash on a `:target` row;
  rows become cards under 700px (each cell labelled from `data-label`).
- Selection: text is selectable (nothing on these pages sets
  `user-select: none`; the family file scopes it to the board).

## Engine report (`/backgammon/reports/`)

- Same header, footer and Docs switcher; the Docs link carries
  `aria-current="true"` (the report is a Docs page; the link opens the
  guide) and gets the same current style.
- Sticky contents covering all six sections (was three, and "Speed"
  pointed at `#automatic` while `#speed` existed): a sticky column from
  64rem, a sticky scrolling strip with an edge fade below that. The section
  in view is marked with `aria-current` (IntersectionObserver).
- Tables (`table()` in `reports/app.js`): `figure.docs-table` with a
  visible caption line, then the kit `.table-wrap.table-wrap--sticky-col`
  (scroll shadows as the affordance, `role="region"` and the caption as its
  name, still focusable) around `table.data-table.report-table`; numbers
  right-aligned. The `<caption>` stays in the table (visually hidden) so
  research.cjs still reads `#acceleration-content caption`.
- Measured-on lines: one helper renders a "Measured <date>" chip plus the
  engine build in mono for every dataset; `#release` now reads "Engine
  build <hash>" instead of a bare hash.
- Download links are grouped per section.
- Device measurement: a kit `.panel` card with the selects and a primary
  Run measurement button, one `.progress` (indeterminate while searching,
  determinate `role="progressbar"` with trial counts for rollouts), the
  `#device-status` polite line ("Not run yet." / engine status /
  "Measurement complete." / "Measurement cancelled." / the error in
  `--bad`), and the result table with the user agent.
- Live regions: one polite (`#device-status`) and one assertive
  (`#report-alert`, which also receives section load errors). The three
  `aria-live` content containers and the dead `#toast` are gone, as are the
  dead `.metric-bar` and `.move-observations` rules.
- `viewport-fit=cover`, description meta, `is-ready` line.
- Small logic changes, presentation only: a `#section` deep link jumps
  again once the asynchronously loaded tables exist (unless the reader has
  scrolled, tapped or pressed a key); the engine worker's teardown status
  no longer overwrites the final device status line.

## Refresh (`/backgammon/refresh/`)

Still standalone (no link to `shared/` or any app file). Its inline CSS
now copies the token values (page, surfaces, line, ink, muted, the
Backgammon accent, on-accent, bad, radius, type scale, the site font
stack and `cv11`/`ss01`), the kit's primary button (44px, 8px radius,
600 weight, accent fill with `--on-accent` ink) and the 2px accent focus
ring with a 2px offset. A comment names the source so the two stay in
step. Also: `theme-color #08090d`, `data-family="backgammon"`, a skip link
and `main#main`, a crumbs row with the MS mark, a static accent aura, and
no `!important` (`#continue:not([hidden])` replaces the forced
`[hidden]`). `#refresh`, `#status` texts and `#continue` are unchanged.

## Generated files

`node backgammon/scripts/offline-manifest.mjs` regenerated
`offline-manifest.js`, `sw.js` and the `?bgv=` hashes in every Backgammon
HTML page (the release hash covers the docs pages).

## Verification

- `node scripts/run-tests.mjs`: see the structured report.
- `SHELL_PAGES=/backgammon/controls/,/backgammon/reports/,/backgammon/refresh/
  node scripts/shell-browser.cjs`: 3 pages × 3 viewports pass, 0 text under
  12px, 0 small targets, 0 missing rings, skip link and `main#main` on all
  three; the same with `SHELL_ROOT_FONT=24`.
- `node scripts/screenshots.cjs --compare --only` the three pages: all six
  pictures reviewed and copied over their baselines.
- Extra states rendered with a scratch Playwright script: report device
  card running a rollout (determinate bar, 375) and finished (1440),
  `#case-off-source` target row at 1440 and 375, report at 1024 (sticky
  column) and 844×390 (sticky strip), refresh error state, both documents
  with a 24px root font.
- `BG_MODULES=click-guide,research,adaptive,refresh,updates node
  backgammon/tests/browser.cjs`: all pass; the full suite result is in the
  structured report.

## Deferred

- `backgammon/styles.css` section 7 still has the
  `.controls-page`/`.engine-report` header compatibility block; no page
  uses those body classes now, so it is dead. The file belongs to the shell
  slice; delete it there.
- The refresh CSS is copied from the tokens by hand, not generated: the
  page must not import app files, and `scripts/offline-manifest.mjs` (or a
  test asserting the copied values) belongs to the shared tooling this
  slice may not edit. See the shared request.
