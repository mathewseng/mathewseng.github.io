# Shared requests from `redesign/bg-docs` (Backgammon documents, step 6)

Implemented locally in `backgammon/docs.css` for now. The requests in
`redesign-bg-shell.md` and `redesign-bg-content.md` still stand.

## 1. Document typography and contents (`.doc`, `.doc-toc`)

`app.css` has no reading layout, so every document page reinvents one.
Backgammon's version: `.docs-section` (32px block padding, a `--line` top
rule, h2 at `--t-xl`/700, h3 at `--t-lg`/600, paragraphs at `--t-md`/1.6
capped at 72ch, accent links) and `.docs-toc` (44px pill links that wrap;
`.docs-toc--sticky` is a sticky column from 64rem and a sticky scrolling
strip with an edge fade below, `aria-current` marks the section in view).
Pages: Backgammon controls/reports, Dice reports' Method section, the OFC
Fantasyland overview, any future docs page.

## 2. Table caption outside the scroller

A `<caption>` inside `.table-wrap` scrolls sideways with a wide table on
phones. Backgammon renders `figure > p.docs-table-caption[aria-hidden] +
.table-wrap[role=region][aria-label]` and keeps the `<caption>` visually
hidden. Request: a `.table-caption` (12–13px muted, 8px below) and the
pattern documented beside `.data-table`. Pages: every report table.

## 3. Footer text is under the floor on phones

`.foot` drops to `0.74rem` (11.8px) under 640px. Backgammon docs set it to
`--t-xs` and give footer links 44px rows. Request: `font-size: var(--t-xs)`
in the phone rule. Pages: landing, hubs, every document page.

## 4. Tool head on document pages

The short-desktop query collapses `.tool-head` and hides `.lede`, which
suits app shells but not scrolling documents. Backgammon docs restore both.
Request: scope the collapse to app shells (for example
`.app .tool-head`, or a `.tool-head--doc` opt-out).

## 5. Flowchart figure

`figure.docs-flow`: caption eyebrow, numbered question cards
(`.flow-question`), answers beside them, and connectors that run from each
card to the next step (`.flow-next` flex column with line pseudo-elements;
the answer spans both grid rows). Only Backgammon uses it today; list it
for reuse if another family documents a decision flow.

## 6. Generated refresh-page values

`backgammon/refresh/index.html` copies token values into its inline CSS by
hand (it must not import shared files). Request: either
`backgammon/scripts/offline-manifest.mjs` rewrites the `:root` block of the
refresh page from `shared/tokens.css`, or a test in `shared/tests` asserts
that the copied values match the tokens.
