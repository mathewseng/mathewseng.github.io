# Changelog

All notable changes to the `/gym` project are recorded here.

## 2026-08-13 — August 12 Push Workout Log

### Added

- Added the August 12 push workout with Smith bench and incline bench, four cable movements, and two triceps movements.

### Changed

- Updated the 95 lb Smith-bench record to 8, 7, 8 for 23 completed repetitions and 2,185 lb volume.
- Advanced the next bench target to 8, 8, 8 while keeping the confirmed 145 lb goal unchanged.
- Updated dashboard charts, current metrics, improvement comparisons, and next-session guidance to reflect the completed push day.

## 2026-08-11 — August 10 Leg Workout Log

### Added

- Added the August 10 leg workout with Smith squats, Smith RDLs, leg press, calf raises, standing dumbbell overhead presses, and triceps pushdowns.
- Established precise Smith-squat and leg-press baselines and equipment-specific dumbbell overhead-press and calf-raise references.

### Changed

- Updated the dashboard’s next-session guidance from pull to push after the completed leg day.
- Updated the back-safe leg and carrying goals to build from the recorded lower-body loads while preserving the missing back-pain response as unknown.

## 2026-08-03 — Push Workout Log

### Added

- Added the August 3 push workout with all five supplied 0–6 context scores, eleven exercises, and aggregate core totals.
- Added high cable chest press, mid cable fly, leg raise, and reverse crunch to the exercise registry.

### Changed

- Updated the 95 lb Smith-bench record to 7, 7, 7 for 21 completed repetitions and 1,995 lb volume.
- Preserved the failed eighth repetition of the final bench set without counting it as completed work.
- Updated the triceps-pushdown reference to four sets of 10 and the overhead-extension reference to 25 lb × 10, 10.

## 2026-07-29 — Push Workout Date Correction

### Fixed

- Corrected the travel-and-mild-illness push workout from July 28 to July 27 across its JSON identity, set IDs, calendar date, charts, benchmarks, and human-readable log.

## 2026-07-29 — Per-Workout JSON Logs

### Changed

- Moved all nine committed workouts into `logs/workouts/`, with one JSON object per workout.
- Made the application discover and load workout JSON files automatically.
- Added filename, chronology, uncertainty, context-scale, and per-side storage rules for future daily logs.
- Added regression coverage ensuring every committed workout has exactly one matching JSON file.

## 2026-07-28 — Pull Workout Log

### Added

- Added the completed pull workout with face pulls, pull-ups, lat pulldowns, dumbbell curls, reverse cable flies, standing cable rows, Smith-machine RDL technique work, and cable ab crunches.
- Recorded back pain as 0/6 before the RDL practice and preserved the approximate 100-repetition total without inventing a set breakdown.
- Added standing cable row and cable ab crunch to the exercise registry.
- Recorded that the gym does not have a seated cable-row station and added standing cable-row and chest-supported-row substitutions.

### Changed

- Updated the lat-pulldown benchmark to 130 lb × 8, with 115 lb × 10 as the current 10-repetition reference.
- Made same-day workout ordering use chronology so the later pull session appears as the latest log.

## 2026-07-28 — Mobile & Accessibility Audit

### Changed

- Corrected the primary Smith-machine bench goal from 140 lb to 145 lb across the dashboard, goal ladder, supporting indicators, documentation, metadata, and social preview.
- Fixed the surface-style cascade that made accent-panel text unreadable in light and dark themes.
- Increased text, form-border, focus-ring, and warm-status contrast.
- Added complete mobile navigation, larger touch targets, a phone-friendly 0–6 score grid, compact calendar markers, and a selected-day summary.
- Made the calendar's initial and “Latest” dates follow the newest dated workout or nutrition record.
- Gave secondary chart metrics their own scale and visible legend so volume no longer flattens repetition trends.
- Reduced the mobile exercise-picker height and moved focus to the selected exercise result.

## 2026-07-28 — Initial Release

### Added

- Imported all eight supplied historical workout records, including dated, undated, partial, failed-attempt, ramp-up, and ambiguous entries.
- Added the training profile, six goals, current Push / Pull / Legs program, exercise registry, equipment notes, and form standards.
- Added a mobile-first dashboard with calendar-based workout browsing, progress views, personal records, goal milestones, and missing-data indicators.
- Added an explainable suggested-workout engine for Push, Pull, Legs, full-body, and easier recovery sessions.
- Added optional 0–6 workout/readiness context ratings. Energy and sleep use `6 = best`; symptom and disruption fields use `6 = worst`. No boolean fields are used in `WorkoutContext` or `ReadinessInput`.
- Added nutrition, body-weight, water, macro, and supplement tracking.
- Represented the reported 15–20 g/day creatine observation and the approximately 10-day travel pause without inventing dates or prescribing a dose.
- Added travel, illness, soreness, sleep, energy, and back-pain context.
- Added JSON backup/import and Markdown export for locally created records.
- Added localStorage persistence with schema versioning and migration support.
- Added GitHub Pages deployment for the `/gym/` base path.
- Added automated checks for formatting, linting, TypeScript, tests, and production build.

### Data Integrity

- Smith-machine records remain separate from free-weight barbell records.
- All supplied Smith-machine weights include the 25 lb Smith bar.
- Unknown values remain unknown.
- Failed repetitions are excluded from completed reps and volume.
- Per-side volume is never silently multiplied.
