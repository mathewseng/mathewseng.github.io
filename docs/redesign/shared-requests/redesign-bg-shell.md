# Shared requests from `redesign/bg-shell` (Backgammon shell, step 6)

Things the Backgammon shell needed that belong in `shared/`. Each one is
implemented locally in `backgammon/styles.css` or `backgammon/ui/shell.mjs`
for now; the selector, the CSS and the pages are listed so the integrator
can lift them.

## 1. Reduced motion: no transitions, not 0.01ms transitions

`shared/tokens.css` shortens every transition to `0.01ms !important` under
`prefers-reduced-motion: reduce`. A transition still starts on the next
style recalculation, so a property that changes (a theme colour, a padding
from a media query, a focus stroke) reports its *old* computed value in the
frame the change happens. Every Playwright suite that reads computed styles
synchronously after a change sees stale values; Backgammon has a dozen such
tests (`background-focus`, `history-return`, `mobile-layout`,
`mobile-sheets`, `appearance`).

Local rule (`backgammon/styles.css`, section 6):

```css
@media (prefers-reduced-motion: reduce) {
  body:not(#bg-motion),
  body:not(#bg-motion) *,
  body:not(#bg-motion) *::before,
  body:not(#bg-motion) *::after { transition-property: none; }
}
```

Request: add `transition-property: none` to the reduced-motion rule in
`tokens.css` (keep the near-zero `animation-duration` so scripts awaiting
`animationend` still finish; nothing on the site awaits `transitionend`).
Then the `:not(#…)` specificity hack above can go. Applies to every family.

## 2. Hub group heads and tags are under the 12px floor

`shared/hub.css` sets `.group-head h2` to `0.72rem` (11.5px) and
`.tags span` to `0.7rem` (11.2px). The shell sweep reports 12 text nodes
under 12px on every hub. Request: `--t-xs` (12px) for both; the Backgammon
hub hides the Play/Study heads on phones for a different reason (fit) and
keeps the shared sizes otherwise.

## 3. Dialog controls at 44px on every pointer

`.dialog .btn` and `.dialog .field :is(input, select)` are 40px on fine
pointers. Settings-style dialogs are opened from the keyboard on desktops
and measured by touch contexts at desktop sizes (`mobile-settings.cjs`), so
Backgammon forces 44px inside `.bg-dialog`. Request: make 44px the dialog
default in `app.css` (`.dialog .btn, .dialog .field :is(input, select,
textarea) { min-height: 44px }`). Pages: every page with a settings or form
dialog.

## 4. Icon button with a visually hidden label on phones

The Backgammon topbar's Settings button is text on desktop and a 44px icon
on phones, keeping its accessible name through a `.topbar-label` span that
becomes visually hidden under 700px. Request: a kit modifier
(`.btn--collapse` or `.topbar-label`) in `app.css` so other tool pages can
do the same without copying the clip rule. Pages: every app shell with text
actions in the topbar.

## 5. Dialog body as a stretched grid row

`.dialog-body` is `overflow: auto` with no layout of its own. A dialog whose
body must not scroll but hold a bounded stage (the decision review's board,
the history tree) needs `display: grid; grid-template-rows: minmax(0, 1fr)`
on the body, which Backgammon adds for `.decision-dialog` and
`.history-dialog`. Request: a `.dialog--stage` modifier in `app.css`.
Pages: Backgammon decision review and history tree; any future dialog with a
board or chart inside.

## 6. Board frame

The brief names a `.board-frame` material for `.stage`; `app.css` does not
define it. Backgammon's `#board.board-slot.board-frame` is styled locally
(the SVG board keeps its own frame on `--page`). Request: either define
`.board-frame { background: var(--page); border-radius: var(--r-lg) }` in
`app.css` or drop the name from the brief.
