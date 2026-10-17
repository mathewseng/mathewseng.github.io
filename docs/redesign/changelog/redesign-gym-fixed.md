# `redesign/gym-fixed`: Gym review fixes

Branched from `redesign/gym-pages` (07ddb6c). This branch fixes the findings of the
independent review of that branch. Everything else is as described in
`redesign-gym-shell.md` and `redesign-gym-pages.md`.

## Review fixes

| # | Severity | Finding | What was done |
| --- | --- | --- | --- |
| 1 | P1 | Clear form reset the date, type and title (to today and Push), even in edit mode, so "Update workout" moved a saved entry to today | Fixed. `AddWorkout` Clear form again resets only what it reset before the redesign: exercises (back to one blank), context scores, notes, start time (now) and duration. Date, type, title and data quality stay, so an edit keeps its own date and a `?date=` form keeps that day. Add nutrition's Clear form (new in the redesign) keeps the date and resets everything else. The confirm text now says what stays: "… The date, type and title stay." and "… The date stays." Checked: save on 2026-10-03, edit, change the type to legs, Clear form. The H1 says "Update workout", the date is 2026-10-03, the type is legs and the duration is blank. |
| 2 | P2 | On landscape phones the action bar stayed a bottom bar, so the fixed chrome took 171 of 390px | Fixed as the brief's mobile model describes. Under `@media (max-height: 560px)` the `.action-bar` becomes a right-side column (`min(13rem, 34vw)`) between the sticky topbar and the tab bar, with the primary action at the bottom. `ActionBar` measures the topbar into `--topbar-h`. In column mode it publishes `--action-bar-w` (with `--action-bar-h: 0`). `#main-content` pads its inline end by that width, and the toast stack centres in the remaining width. Measured at 844×390 on Dashboard, Add workout and Add nutrition: the topbar is 57px and the tab bar 53px, and content gets the full 280px between them, 636px wide. At 667×375 and 1100×500 (a short desktop window, Add pages only) it works the same. With a 24px root at 844×390 the column is 287px wide, starts under the 61px topbar and nothing overflows. Rotating to 390×844 and back switches between the bottom bar and the column, and the measurements follow. Portrait phones are unchanged (bottom bar, 61px). |
| 3 | P3 | Leaving through browser Back pushed an extra history entry, so the next Back went back to the abandoned form | Fixed. Leave now calls `history.back()` instead of assigning `location.hash`. The restored entry always sits right after the one the user went to (for Back and for Forward), so this steps onto the target. Checked at 844×390: #/ → Add → type → Back → Leave lands on #/, and a second Back leaves the app (it does not return to #/add). A guarded Forward → Leave lands on the forward page, and Back then returns to the previous entry as usual. Keep editing keeps the form. This is a small logic change in `router.tsx`, required by this finding. |
| 4 | P3 | The "Started from the suggested plan" banner stayed after Clear form | Fixed. `plan` is now state, and Clear form clears it. Checked: Suggested → Start with this plan shows the banner; after Clear form it is gone. |
| 5 | P3 | Alert toasts disappeared after 5 s, including save, restore and clipboard failures | Fixed. A toast with tone `alert` no longer starts a timer. It stays until it is dismissed, or until three newer toasts push it out of the stack. Neutral and good toasts still expire after 5 s. Checked: a failed save (duration -5) still shows its alert after 6 s, and Dismiss removes it. |
| 6 | P3 | Two new colour literals (`--type-other`, `--type-ink`) in `gym/src/index.css` | Deferred to the integrator. They stay the same in both schemes on purpose, and no shared token holds those values in both (Gym's light scheme overrides `--muted` and `--on-accent`). Requested as two scheme-fixed tokens in `docs/redesign/shared-requests/redesign-gym-fixed.md`. `gym/` is outside the css-literals test. |
| 7 | P3 | The dashboard baseline screenshot depends on the calendar date | Not fixable on this branch, because `scripts/screenshots.cjs` is outside its files. Noted here, and a frozen clock for `/gym/` is requested in the shared-requests file. The baselines `gym-1440x900.png` and `gym-375x812.png` are unchanged (`--compare` reports 0 changed on 2026-10-17) and match that date. On other days the hero copy, the suggestion and the today ring will differ. |

CSS: `gym/src/index.css` +41 lines (the landscape column and the `#main-content` inline
padding). No test was changed.

## Verification

- `cd gym && npm ci && npm run format:check && npm run lint && npm run typecheck &&
  npm test` passes on Node 22.23 (8 files, 73 tests). `npm run build` passes.
- `node scripts/run-tests.mjs`: 451 pass, 0 fail.
- `sh scripts/assemble-site.sh _site`. `SHELL_PAGES=/gym/ node scripts/shell-browser.cjs`
  and the same with `SHELL_ROOT_FONT=24` pass at 1440×900, 375×812 and 844×390: 0 text
  under 12px, 0 small targets, skip link and `main#main` present. Gym is still reported
  as "legacy".
- `node scripts/screenshots.cjs --compare --only /gym/`: 0 changed. Both pictures were
  looked at. The baselines were not re-copied because they are identical.
- Scratchpad state scripts (`f1.cjs`, `f2.cjs`), dark and light, at 844×390 (also at 24px
  root), 667×375, 375×812, 390×844 after rotation, 1100×500 and 1440×900: the landscape
  column geometry with no overflow, the persistent alert toast, the Back and Forward
  leave paths, Clear form in edit mode, the plan banner, and the nutrition Clear form
  keeping the date.
