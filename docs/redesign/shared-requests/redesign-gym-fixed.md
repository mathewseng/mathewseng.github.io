# Shared requests from `redesign/gym-fixed`

Adds to `redesign-gym-shell.md`. Nothing here changes `shared/` or `scripts/`.

## Token requests

- **`--type-other` and `--type-ink`.** `gym/src/index.css` holds them as literals
  (`#9aa7b7` and `#0b0d12`, the dark `--muted` and `--on-accent`) because Gym's light
  scheme overrides `--muted` and `--on-accent`, and these two must stay the same in both
  schemes (the workout-type fills sit under dark ink in light and dark alike). Proposal for
  `shared/tokens.css`, beside the family map, which already holds the other scheme-fixed
  colours:

  ```css
  --ink-on-fill: #0b0d12; /* dark ink on family-map fills in any scheme */
  --neutral-fill: #9aa7b7; /* neutral family-map fill ("other") */
  ```

  Gym would then write `--type-other: var(--neutral-fill); --type-ink: var(--ink-on-fill);`.

## Component candidates (from the pages half, listed here because `shared-requests/` was outside that branch's files)

- **`.action-bar`**: a fixed bottom bar holding a status and the primary action, measured
  into `--action-bar-h` by a ResizeObserver, which lifts the toast stack and the scroll
  padding. Under `@media (max-height: 560px)` it becomes a right-side column under the
  measured topbar (`--topbar-h`) and publishes `--action-bar-w` instead, so content and
  toasts step aside. This is the brief's `.action-stage`. Implementation:
  `gym/src/index.css` (Mobile action bar) and `ActionBar` in `gym/src/components/ui.tsx`.
  Pages: Gym's Dashboard, Add workout and Add nutrition. It suits every page with a
  primary action on phones.
- **`.field-error`**: an icon and a message under a control, paired with `aria-invalid`
  and `aria-describedby`. `gym/src/index.css` (Field errors).

## Screenshot harness

- The `/gym/` baselines depend on the calendar date: the Dashboard hero ("11 days ago"),
  the suggestion (a gap of 7 days or more becomes a recovery session) and the calendar's
  today ring all come from the local date. A frozen clock for `/gym/` in
  `scripts/screenshots.cjs` (for example
  `await page.clock.setFixedTime(new Date("2026-10-17T12:00:00"))` before `goto`) would make
  them stable. The baselines committed on 2026-10-17 match that date.
