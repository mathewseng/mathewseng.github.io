# Shared requests from `redesign/gym-shell`

Gym is a Vite + React + Tailwind v4 app, so it cannot link `shared/app.css` the way the
static pages do: Tailwind's cascade layers, its preflight and the light scheme would
fight a second base stylesheet. Instead `gym/src/index.css` imports `shared/tokens.css`
(Vite inlines it into the built stylesheet) and carries a Tailwind-layered mirror of the
kit, using the **same class names and the same tokens** as `shared/app.css` so the two
can be reconciled later without touching markup. Nothing here changes `shared/`.

## Components that mirror `shared/app.css` (candidates for a single source)

| Gym class (in `gym/src/index.css`) | app.css equivalent | Difference worth folding back |
| --- | --- | --- |
| `.btn`, `.btn--primary/ghost/danger`, `.btn--sm/md/lg/icon`, `.btn--block`, `.btn--dashed` | `.btn` family | `.btn--dashed` (dashed "Add set / Add exercise" affordance) and `.btn--block` do not exist in the kit. |
| `.chip`, `.chip[aria-pressed="true"]` | `.chip` | Gym's pressed chip is an accent fill with a check glyph; the kit's uses a tone class. |
| `.segmented`, `.segmented--block` | `.segmented` | Gym's segmented uses `button[aria-pressed]` (SegmentedControl), the kit's uses radio `label`s; the sweep already accepts both. `--block` (stretch to the container) is Gym-only. |
| `.switch-row`, `.switch-track`, `.switch-row--warn/danger` | `.switch`, `.switch-row` | A 44px pill row with the label *inside* the button and a tone for warn/danger toggles (Warm-up, Failed attempt). The kit's `.switch` is the bare 44×24 control. |
| `.progress`, `.progress-label`, `.bar`, `.bar--lg` | `.progress`, `.bar` | Same contract (`--value`, `--bar-color`); Gym adds `.bar--lg` (12px). |
| `.badge`, `.badge--accent/good/warn/danger/quality` | `.badge` | `.badge--danger` is the kit's `.badge--bad`; `.badge--quality` (dashed, for partial / estimated data) is Gym-only. |
| `.dialog`, `.dialog--sheet`, `.dialog-head/body/foot` | `.dialog` family | Same markup contract. Gym's `.dialog-foot` right-aligns buttons; the kit's sticky footer is equivalent. |
| `.toast-stack`, `.toast`, `.toast--alert`, `.toast--good` | `.toast` family | Gym places the polite stack above the mobile tab bar (`bottom: 76px + safe-area`) and at 16px on desktop. A `--toast-bottom` variable on the kit's stack would let pages with a fixed bottom bar lift it. |
| `.field`, `.check`, `.label` | `.field`, `.check`, `.field-label` | `.label` is the kit's `.field-label` under Gym's old name (kept for the TSX). |
| `.empty-state` | `.empty-state` | Identical. |
| `.skip-link`, `.topbar`, `.crumbs`, `.mark`, `.crumb-sep`, `.crumb-current` | same | Identical values; Gym renders `.topbar` inside a sidebar layout rather than as the full-width shell row. |
| `.eyebrow`, `.eyebrow-accent` | `.eyebrow` | `.eyebrow-accent` (accent colour with a 22px leading rule) is Gym-only and would suit tool heads site-wide. |

## Gym-only pieces that could become kit components

- `.nav-row` (44px sidebar / sheet navigation row with `aria-current` styling and an icon slot).
- `.tab-bar` / `.tab-bar-item` (fixed bottom tab bar with safe-area padding and a one-row
  landscape variant under `max-height: 560px`).
- `.calendar-grid` / `.calendar-cell` / `.day-number` / `.type-pill` / `.type-dot` (month grid
  with `aria-pressed` cells and family-map workout-type colours).
- `.surface-feature`, `.surface-warn`, `.surface-danger` (panel tones; the kit's `.panel`
  has no tone modifiers).
- `.well` (an inset `--surface-3` block with `--r-md`).

## Token requests

- Gym defines `--type-push/pull/legs/full-body/upper/other` and `--type-ink` from the
  family map in its own stylesheet. If the hubs ever show workout types, those six names
  belong in `shared/tokens.css`.
- Gym's light scheme (`:root:not(.dark)`) re-derives every token for white surfaces
  (`--accent #2f62d8`, `--good #1f9d74`, `--bad #c2413b`, `--warn #b8571f`, `--info #1d6fb8`,
  `--cat-1..6`). Those values are a tested starting point for the
  `:root[data-theme="light"]` hook left in `tokens.css`.
