# Changelog

All notable changes to the `/gym` project are recorded here.

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
