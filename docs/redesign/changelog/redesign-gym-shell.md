# `redesign/gym-shell` — Step 7 (Gym), shell half

Page: `/gym/` (one built React app; hash routes `#/`, `#/workouts`, `#/exercises`, `#/goals`,
`#/suggested`, `#/nutrition`, `#/notes`, `#/add`, `#/add-nutrition`, `#/settings`).

## What changed

### Tokens and stylesheet (`gym/src/index.css`, 479 → 1,250 lines)

The stylesheet grows because the component kit (buttons, chips, segmented control,
switch, badge, progress, dialog, sheet, toast, calendar, topbar) moved out of per-element
Tailwind class strings in the TSX and into named classes that mirror `shared/app.css`;
the TSX shrank by about the same amount and the 76 `!` overrides are gone.

- The dark scheme is `shared/tokens.css`, imported with `@import "../../shared/tokens.css"`
  after Tailwind. Vite resolves the relative path at build time and inlines the sheet; the
  built `dist/assets/index-*.css` carries `--family-gym`, the semantic set and the
  reduced-motion rules, and contains no unresolved `@import`.
- The hand-copied dark values, `--acid*`, `--faint`, `--orange`, `--danger`,
  `--surface-raised/-soft`, `--accent-ink`, `--focus/-outer`, `--glow`, `--dots`,
  `--shadow*` are gone. The light scheme is a `:root:not(.dark)` override that redefines
  every token the components read (surfaces, lines, ink, accent, good/bad/warn/info, chart
  categories, shadows) so one component stylesheet serves both schemes.
- Warn and danger fills come from the token sheet's `--warn-soft` / `--bad-soft`
  (`color-mix` of the semantic colour); no Tailwind `red-500` / `orange-500` tints remain.
- Workout-type colours are `--type-push/pull/legs/full-body/upper/other` mapped onto the
  family map (`--family-home`, `--family-ofc`, `--family-poker-2`, `--family-cards`,
  `--family-blackjack`); `WorkoutCalendar.tsx` no longer carries a hex map.
- One radius scale: Tailwind's `--radius-*` is reset to the token sheet's `sm/md/lg/pill`.
  Weights are 500/600/700/800 only (`--font-weight-*` reset); the font stack is the token
  sheet's `--font-sans`, unchanged.
- Root font size is the browser default; `font-variant-numeric: tabular-nums` on `:root`.
- The ambient hub aura is static; section reveals use `@starting-style` with
  `html.is-ready`, never `animation-fill-mode: backwards`.
- No `!important` in the Gym stylesheet (the eight in the built file are the token
  sheet's reduced-motion and `[hidden]` rules plus Tailwind's own `[hidden]` preflight rule).
- 16px inputs on coarse pointers; `scroll-padding-bottom` under the fixed tab bar so
  `scrollIntoView` / focus never lands beneath it; a one-row 44px tab bar on landscape
  phones (`max-height: 560px`).

### `gym/index.html`

- Pre-paint inline script sets `.dark` from `localStorage["gym-theme"]`, else
  `prefers-color-scheme` (dark unless the OS says light), and adds `html.is-ready`.
- `viewport-fit=cover`; `theme-color` starts at `#08090d` and is switched by the script and
  by `AppShell` (`#f4f6fa` in light mode); an SVG favicon in the family accent;
  `data-family="gym"` on `<html>`.

### Primitives (`gym/src/components/ui.tsx`, `toast.tsx`, `confirm.tsx`, `ErrorBoundary.tsx`)

- `Button` (`variant: primary | secondary | ghost | danger`, `size: sm | md | lg | icon`,
  `block`, `dashed`) and `ButtonLink`; every `!` Tailwind override is gone (76 → 0).
- `Chip` (`aria-pressed`) and `SegmentedControl` (`role="group"`, `aria-pressed` options)
  replace the four hand-built chip rows (Workouts type + context, Exercises category,
  Suggested duration).
- `ProgressBar` (`role="progressbar"`, `--value`/`--bar-color`) replaces the three inline
  progress bars (Dashboard ×2, Goals, plus the mobile menu's bench goal).
- `Toast` / `ToastProvider` / `ToastViewport`: one polite `role="status"` stack and one
  assertive `role="alert"` stack rendered once by `AppShell`, replacing the inline `<p>`
  save messages on both Add pages and Settings' fixed toast; dismiss control, pause on
  hover/focus, safe-area inset. Copy and save failures now produce an alert toast.
- `ConfirmDialog` / `useConfirm`: one native `<dialog>` (`showModal`, Escape, backdrop,
  focus return; the kit's bottom sheet on phones) with a verb and a danger variant,
  replacing every `window.confirm` (Workouts delete, Nutrition delete, Settings clear,
  Add workout clear form).
- `SearchField` replaces the two absolute-icon search inputs.
- `Toggle` is a 44px `role="switch"` row with a 44×24 track and warn/danger tones; set
  and exercise remove buttons are 44px icon buttons.
- `ErrorBoundary` around `Suspense` (keyed by route) with Try again / Reload.
- `ScoreControl`: the legend holds only text and the value pill; Clear sits beside the
  group. The test contract (`role="radio"`, `aria-checked`, names 0…6, ArrowRight,
  `6 · severe`) is unchanged and `gym/tests/ui.test.tsx` passes.

### Shell (`AppShell.tsx`)

- `.skip-link` to `main#main[tabindex="-1"]`; `#main-content` kept inside it.
- `.topbar` with `.crumbs` (MS mark → Projects → Gym Tracker → current view on desktop),
  the bench-goal badge, the theme toggle (`aria-pressed`) and the menu button.
- Sidebar rows and the mobile sheet use `.nav-row` with `aria-current="page"`; the
  mobile menu is a native `<dialog class="dialog dialog--sheet">` (`#mobile-menu` kept).
- Theme state initialises from the same rule as the pre-paint script, persists to
  `localStorage["gym-theme"]` and updates `theme-color`.

### Pages

- Copy: marketing taglines replaced by plain titles (Dashboard, Training calendar,
  Exercise progress, Goals & milestones, Session builder, Nutrition & recovery, Training
  notes, Log a workout, Log nutrition, Data & settings); the first-person assistant
  paragraph removed from Settings; "honestly undated" copy removed.
- Type floor 0.75rem: every `text-[0.58–0.7rem]` is `text-xs`; labels hide rather than
  shrink on phones (calendar weekdays collapse to initials, type pills to dots).
- Outcomes use `--good/--bad/--warn/--info` (readiness gauge, badges, warnings); the accent
  is for navigation, selection and the primary action.
- `WorkoutCard`: the expander is a button holding only the summary line.
- Calendar cells carry `aria-pressed` and `aria-current="date"`; the compact dashboard
  calendar shows the selected day's entries under the grid.

## Logic changes (allowed by a finding in the notes)

- `router.tsx` `Link`: `window.scrollTo` uses `behavior: "auto"` when
  `prefers-reduced-motion: reduce` matches (notes §3.21 / audit problem 6: JS scroll
  options ignore the CSS override). Guarded for the jsdom harness.
- Save and copy on the Add pages and Settings are wrapped in try/catch and report through
  the toast (audit: "save and copy failures … produce no message").
- Theme initialisation consults `prefers-color-scheme` (audit problem 1). A user with no
  saved preference and an OS in light mode now gets the light scheme; previously every
  cold load was dark. The screenshot baselines therefore render light (Playwright's default
  colour scheme is light); the dark scheme is verified by the state renders below.

## Verification

- `cd gym && npm run format:check && npm run lint && npm run typecheck && npm test`: all
  pass (70 tests), Node 22 (`engines` requires ≥ 22).
- `npm run build`, `sh scripts/assemble-site.sh _site`, `SHELL_PAGES=/gym/ node
  scripts/shell-browser.cjs`: ok at 1440×900, 375×812, 844×390 (no overflow, 0 text
  nodes under 12px, 0 targets under 44px, skip link and `main#main` present). The sweep
  lists Gym as "legacy" because it does not link `shared/app.css` by URL, so its
  target/focus-ring checks were run by a scratchpad script instead.
- Scratchpad state renders: ten routes × three viewports × dark and light, plus the
  mobile menu sheet, confirm dialogs (Settings clear, Workouts delete, Add clear form),
  toasts, Add preview, and empty search states: no overflow, no text under 12px, no
  targets under 44px, a ring on the first 25 tabbable elements, exactly two live regions,
  no page errors. The same pass at a 24px root font is clean.
- `node scripts/run-tests.mjs` passes (Gym is excluded from the css-literals and shell
  tests by design; nothing under `shared/` changed).

## Deferred (the content half of Step 7, outside this slice)

- Dashboard derived from state and half as long; "Log workout" as a floating mobile
  primary action (it is the fifth tab and the sidebar primary today).
- Add pages: sticky mobile action bar, per-field errors (`aria-invalid`,
  `aria-describedby`), unsaved-changes guard or draft, suggested plan carried into the
  log form via query string, nutrition edit, not-found state for `?edit=` of an unknown id.
- The `aria-hidden` Recharts legend (audit problem 9) and the Recharts magic numbers.
- Reconciling Gym's kit mirror with `shared/app.css` (see
  `docs/redesign/shared-requests/redesign-gym-shell.md`).
