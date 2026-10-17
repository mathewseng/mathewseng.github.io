# Shared requests from redesign/blackjack-dice

Components implemented locally that should move into `shared/app.css` or `shared/tokens.css`.

## 1. `.field--inline` — label beside a select (blackjack, dice)

Both pages put "View", "Indices" and "Rank by" selects in a panel toolbar with the label to the left. Implemented identically in `blackjack/strategy/styles.css` and `dice/reports/styles.css`:

```css
.field--inline { flex-direction: row; align-items: center; gap: 6px; }
.field--inline > label { white-space: nowrap; }
.field--inline select { width: auto; min-width: 9rem; }
@media (pointer: fine) { .field--inline::after { bottom: 10px; } } /* chevron on a 36px control */
```

On phones the label is visually hidden (`.sr-only` pattern) and the select may shrink (`min-width: 0`).

## 2. `.disclosure` — a styled `<details>` (dice; blackjack has `.bj-about`)

A summary with a 40px row, a rotating chevron and 13px/600 text; used for "Exact score probabilities", "How these cycles were found", "Recent rolls", "How the comparison works" and the blackjack "About the engine" panel.

```css
.disclosure { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 8px; }
.disclosure summary { display: flex; align-items: center; gap: 8px; min-height: 40px; color: var(--ink); font-size: var(--t-sm); font-weight: 600; cursor: pointer; }
.disclosure summary::before { content: ""; width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; rotate: -45deg; transition: rotate var(--d-fast); }
.disclosure[open] summary::before { rotate: 45deg; }
```

## 3. `.field` with a hint under a select (dice `.match-control`)

`.field--select::after` positions the chevron from the bottom of `.field`, so a `.field-hint` placed after the select inside the same `.field` pushes the chevron onto the hint. The dice Matchups controls wrap `.field` + `.field-hint` in `.match-control { display: flex; flex-direction: column; gap: 6px; min-width: 0 }`. Either anchor the chevron to the control (`.field--select select { background: … chevron … }`) or document `.field-hint` as a sibling of `.field`.

## 4. Text-style button (dice `.match-text-button`)

An accent-coloured, borderless button for in-page actions ("Browse 48 featured matchups ↓", "Use closest balance", "Analyze this matchup", "Reset counts"): 36px row, `var(--t-sm)`/600, underline on hover. A `.btn--link` variant would cover it.

## 5. `transition-property: none` under reduced motion (tokens.css)

`tokens.css` forces `transition-duration: 0.01ms !important` on every element under `prefers-reduced-motion: reduce`. With the initial `transition-property: all`, every layout change on every element (a media query flipping `min-height`, `gap` or `padding` after a resize) then runs as a one-frame transition, and Playwright suites that measure right after `setViewportSize` read the stale frame. Dice adds, in the same media query and without `!important`:

```css
*, *::before, *::after { transition-property: none; }
```

Components that declare their own `transition` shorthand keep their property lists (and their `transitionend`), so this is safe to move into `tokens.css` next to the duration rule.

## 6. App-shell heights: percentages rather than `dvh` (app.css guidance)

`100dvh` resolves one frame after a viewport resize in Chromium, so a shell sized with it reports the old height to a test that measures immediately after `setViewportSize`. Dice sizes `html, body { height: 100%; min-height: 100% }` and `.app-shell { height: 100% }`; `app.css` sets `body { min-height: 100dvh }`, which pages must override for the same reason. Consider documenting `height: 100%` as the app-shell recipe, or switching the body rule to `100%`.

## 7. Sequential (heat) scale tokens

The dice heat grid and matrix mix `var(--good)` over `var(--surface-3)` by a 0–1 `--heat`; Dodge's heatmap will need the same. A `--seq-lo` / `--seq-hi` pair (or a `color-mix` recipe) in `tokens.css` would keep every heat scale identical.

## 8. Dice hub deep links

`/dice/reports/` now routes `#explore`, `#matchups` (and `#cycles`) and `#play` on load; the Dice hub's tiles can point to them.
