# `redesign/gym-pages` — Step 7 (Gym), pages half

Page: `/gym/` (one built React app; the views touched are `#/` Dashboard, `#/add`,
`#/add-nutrition`, `#/suggested`, `#/workouts`, `#/nutrition`, plus the shell's tab bar
and toast). Built on top of `redesign/gym-shell` (see `redesign-gym-shell.md` for the
token sheet, primitives and shell).

## What changed

### Dashboard (`src/pages/Dashboard.tsx`)

- Everything derives from `useAppState()` with `personalRecords.ts`, `progression.ts`
  and `workoutSuggestions.ts`; the hand-written chart series, hero copy, badges, metric
  values and ledger literals are gone.
- Cut to one hero (the suggested next session, from `suggestWorkout` with the default
  readiness scores, the last logged type and the days since it), four metrics (best
  bench set, pull-up best set, sessions in the last four weeks with the best week, body
  weight from the latest nutrition log), the compact calendar, two charts (Smith bench
  e1RM, strict pull-ups) and the numeric goals. Phone page height 6,363 → 3,403px.
- "Log workout" is the phone/tablet primary action in a fixed action bar (with "Plan
  session" beside it); desktop keeps it in the header and the sidebar.
- "Start with this plan" carries the suggestion into the log form (below).

### Add workout / Add nutrition (`AddWorkout.tsx`, `AddNutrition.tsx`)

- Sticky action bar under 1280px with the status ("N issues" jumps to the first one) and
  Save; desktop keeps the summary aside.
- Per-field errors: `aria-invalid` + `aria-describedby` pointing at a visible message
  under each field, in addition to the summary list; summary items focus their field;
  a failed save focuses the first invalid field and raises an alert toast.
- Save, Copy Markdown and both downloads are wrapped; a refused write or clipboard shows
  an alert toast with what to do next.
- Unsaved-changes guard: `useNavigationGuard` in `router.tsx` asks through the
  ConfirmDialog ("Leave without saving?") on Link clicks, the tab bar, the sidebar and
  Back/Forward, and `beforeunload` covers reload and close.
- Clear form opens a danger ConfirmDialog and resets every field (date, type, title,
  exercises, sets, scores, notes) and the dirty baseline.
- `?edit=` of an unknown id, or of a bundled seed workout, renders a "not found" state
  with links to the calendar and a fresh log instead of silently creating a new entry.
- Nutrition entries are editable: `AddNutrition` reads `?edit=`, the Nutrition list has
  an Edit link on local entries, and an edit keeps the entry's id.

### Plan hand-off (`src/lib/planHandoff.ts`, tested in `tests/planHandoff.test.ts`)

- `#/add?type=…&duration=…&title=…&exercises=id:sets[:weightLb],…` from Suggested's and
  the Dashboard's "Start with this plan"; AddWorkout parses it (unknown types, unknown
  exercise ids and bad numbers are dropped), fills type, duration, title, exercises, set
  counts and planned loads, leaves reps blank and says so in a note.

### Calendar (`WorkoutCalendar.tsx`)

- `role="grid"` with rows and a roving tabindex; arrows, Home/End, PageUp/PageDown move
  focus (across months); cells keep `aria-pressed` and `aria-current="date"`.
- On phones and tablets selecting a day focuses the selected-day heading and scrolls it
  into view (the Exercises.tsx pattern), so the selection is announced; the compact
  dashboard calendar scrolls its summary into view.
- Full per-type legend plus the nutrition ring; `?date=` opens a day.

### WorkoutCard

- The heading sits outside the expander; the button holds only the summary line and a
  chevron labelled "Show sets"/"Hide sets" (visually hidden on phones).

### Fixes in this run (after the interrupted one)

- `ProgressChart`: Recharts animates in JS, which the CSS reduced-motion rule cannot
  reach, so the draw-in is off under `prefers-reduced-motion`, and it runs 400ms instead
  of 1,500ms; the screenshot harness was capturing half-drawn dashed lines (three runs
  are now byte-identical).
- Toast: the timer restarted on every AppShell re-render (a fresh dismiss callback each
  render), so toasts stayed up for minutes across route changes; the timer now lives on
  the toast. Hover pause listens to mouse pointers only (a tap froze toasts on phones).
- 24px root font: the five tab labels overlapped and the Dashboard's "Log workout" ran
  off a 375px screen. Tab labels sit in `.tab-bar-label`, hidden visually by a
  rem-based container query only when five no longer fit; the action bar wraps.
- Scroll padding at the top so a heading focused under the sticky topbar is not covered;
  the score grids use auto-fit columns; the Exercises list column is capped at 35%.

## Logic changes (allowed by a finding in notes 3.21)

- `router.tsx` gains a navigation blocker (the leave guard), and `Link` scroll uses
  `behavior: "auto"` under reduced motion.
- The exercise editor keys by a form-only client key (it remounted and lost focus when
  the exercise changed); a nutrition entry keeps one id on save.
- Chart animation is gated by reduced motion; toast timers no longer reset on re-render.

## Verification

- `cd gym && npm ci && npm run format:check && npm run lint && npm run typecheck &&
  npm test` (8 files, 73 tests) and `npm run build`: pass on Node 22.23.
- `node scripts/run-tests.mjs`: 451 pass.
- `sh scripts/assemble-site.sh _site`; `SHELL_PAGES=/gym/ node scripts/shell-browser.cjs`
  and the same with `SHELL_ROOT_FONT=24`: ok at 1440×900, 375×812, 844×390 (0 text under
  12px, 0 small targets, skip link and `main#main`). Gym is reported as "legacy" because
  it does not link `shared/app.css` by URL (it imports the tokens through Vite).
- Scratchpad state script (375 dark, 1440 light): validation errors with focus,
  `aria-invalid`/`aria-describedby` and the alert toast; the leave guard on a tab click
  and on Back, Keep editing and Leave; Clear form confirm and full reset; toasts expire
  across route changes; not-found for unknown workout and nutrition ids; the plan
  hand-off (six exercises, duration); nutrition save then Edit prefilled; calendar
  `?date=`, roving tab stop, ArrowRight/PageDown/PageUp, Enter selects and the phone
  focus moves to the day heading; seven grid rows; the WorkoutCard expander; two live
  regions; no page errors. A 24px-root pass over Dashboard, both Add pages, Calendar and
  Suggested at 375, 844×390 and 1440: no overflow and no target under 36px.
- Screenshot baselines `gym-1440x900.png` and `gym-375x812.png` replaced after review.
  They are the light scheme (the harness reports `prefers-color-scheme: light`), and
  the full-page phone capture draws the fixed action and tab bars mid-page and the
  desktop sticky sidebar only 900px tall: both are artefacts of full-page capture.

## Deferred

- The Recharts legend is still `aria-hidden` (audit problem 9); the sr-only table
  carries the same information. The Recharts magic numbers (margin -18, widths 46/42)
  remain.
- No localStorage draft: the brief allows a guard or a draft, and the guard is in place.
- The desktop selected-day panel is not focused on selection (it is beside the grid and
  the cell's `aria-pressed` already changes); only phones and tablets move focus.
- Shared requests: Gym cannot link `shared/app.css` (Tailwind layers); see
  `docs/redesign/shared-requests/redesign-gym-shell.md`. This run adds two candidates,
  listed below for the integrator because `shared-requests/` is outside this branch's
  files: a fixed bottom `.action-bar` (status + primary action, measured into
  `--action-bar-h`, lifts the toast stack) and `.field-error` (icon + message under a
  control, paired with `aria-invalid`/`aria-describedby`).
