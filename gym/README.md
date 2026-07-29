# Gym — Personal Training Dashboard

`gym/` is the personal workout-tracking project inside the `mathewseng.github.io` repository. It is a static, mobile-first dashboard built for:

<https://mathewseng.github.io/gym/>

It turns the human-readable training history in this directory into an interactive calendar, progress dashboard, goal tracker, readiness-aware workout planner, and nutrition log. It requires no backend, account, paid service, API key, or application secret.

## Features

- Calendar view of dated workouts and nutrition entries
- Separate undated-history area so unknown dates are never invented
- Chronological workout history with Push / Pull / Legs and context filters
- Exercise history, rep and load progression, completed volume, and estimated 1RM where appropriate
- Confirmed personal records kept separate from estimates and failed attempts
- Goal milestones for bench, pull-ups, muscle growth, consistency, carries, and back-safe leg training
- Transparent suggested workouts based on recent rotation and optional 0–6 readiness ratings
- Nutrition, body weight, calories, macros, water, creatine, and supplement tracking
- Travel, illness, soreness, sleep, energy, appetite, and pain context
- Data-quality badges for complete, partial, estimated, and ambiguous records
- Mobile-first workout and nutrition entry
- Dark and light themes
- Versioned local storage, validated JSON backup/restore, and Markdown export

## Context Scale

Workout and readiness context never uses yes/no fields. Every dimension is an optional integer from 0 through 6:

- Energy, sleep quality, and appetite: `0 = lowest/worst`, `6 = highest/best`
- Soreness, illness, travel impact, back pain, and general pain: `0 = none`, `6 = worst`

Zero is a recorded rating. A blank value is unknown. Historical descriptions are not converted to ratings unless the user supplies the number.

Mechanical set state—completed, failed attempt, technical failure, warm-up, ramp-up, or per-side—may remain boolean because it describes what happened to a set, not recovery context.

## Technology

- Vite
- React
- Strict TypeScript
- Tailwind CSS
- Recharts
- A small dependency-free React `HashRouter` tailored to static GitHub Pages
- Vitest
- React Testing Library
- localStorage
- GitHub Actions and GitHub Pages

Vite is configured with the repository subpath:

```ts
export default defineConfig({
  base: "/gym/",
});
```

## Local Development

From the containing `mathewseng.github.io` checkout:

```bash
cd gym
npm install
npm run dev
```

Open the local URL printed by Vite.

For a clean lockfile-based install:

```bash
cd gym
npm ci
```

## Verification

Run each quality gate:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Preview the production build under the configured base path:

```bash
npm run preview
```

## GitHub Pages Deployment

Deployment is handled by the workflow in `.github/workflows/`. It installs from the lockfile, checks formatting and lint, checks TypeScript, runs tests, builds the app, uploads the Pages artifact, and deploys it.

Required repository settings:

1. In the `mathewseng.github.io` repository, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Ensure GitHub Actions is enabled for the repository.
4. Allow the workflow to deploy to the `github-pages` environment if repository or organization policy requires approval.

The production application is expected at `/gym/`; hash-based routes appear after `#` and do not require server rewrites.

## Repository Data and Documents

| File/Folder            | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `logs/workouts/*.json` | Canonical structured workout records, one workout per file  |
| `PROFILE.md`           | Athlete, equipment, training background, and constraints    |
| `LOGS.md`              | Human-readable supplied workout history                     |
| `GOALS.md`             | Targets, standards, milestones, and current status          |
| `NOTES.md`             | Equipment, form, programming, recovery, and ambiguity notes |
| `NUTRITION.md`         | Known nutrition and supplement observations and guardrails  |
| `PROGRAM.md`           | Current Push / Pull / Legs and recovery-session templates   |
| `EXERCISES.md`         | Stable exercise identifiers and equipment identity rules    |
| `DATA_MODEL.md`        | Type and calculation contract                               |
| `DECISIONS.md`         | Architecture and product decisions                          |
| `CHANGELOG.md`         | User-visible project changes                                |
| `DISCLAIMER.md`        | Health, training, and supplement disclaimer                 |

The Markdown documents are the human-readable source of truth. Workout objects are
stored individually in `logs/workouts/` and loaded automatically by the
application. Update `LOGS.md` and the matching JSON record together.

## Historical Data Rules

- All Smith-machine weights already include the 25 lb Smith bar.
- Smith-machine and free-weight barbell records stay separate.
- Unknown dates, repetitions, equipment, or per-side status remain unknown.
- Failed attempts do not count as completed repetitions or volume.
- Warm-up and ramp-up sets are visible but do not automatically become working sets.
- Per-side volume requires explicit configuration.
- Charts skip missing values rather than treating them as zero.
- Machine values remain machine-specific when identity is known.

## Adding a Workout in the Site

1. Open **Add** and choose **Workout**.
2. Enter a date and workout type.
3. Add exercises and sets.
4. Record weight, reps, RIR, and mechanical set state as applicable.
5. Optionally rate readiness/context dimensions from 0 through 6.
6. Preview the record and correct any validation messages.
7. Save it to this browser.
8. Export Markdown or a JSON backup if the record should be kept outside this browser.

Local entries can be edited or deleted after confirmation.

## Adding Nutrition

1. Open **Add** and choose **Nutrition**.
2. Enter the date and only the measurements actually known.
3. Add supplement observations as doses, not recommendations.
4. Review any neutral high-dose creatine notice.
5. Save locally and export a backup when needed.

The site does not invent calorie or protein targets.

## Updating Goals

Goal changes created in the browser are local. For a durable seed-data change:

1. Update `GOALS.md`.
2. Update the matching entry in `src/data/goals.ts`.
3. Update benchmarks only when a completed record supports the change.
4. Run all verification commands.

## Updating Seed Data

When a new workout is supplied in conversation:

1. Preserve the user's exact values, wording, and ambiguity.
2. Append the record to `LOGS.md`.
3. Add one matching `logs/workouts/<workout-id>.json` file; do not add the workout to a monolithic source array.
4. Update supported benchmarks, charts, goal status, and `CHANGELOG.md` when applicable.
5. Keep the JSON filename equal to the workout ID and assign the next unique chronology index.
6. Do not manufacture missing dates, context scores, equipment, or repetitions.
7. Run formatting, lint, TypeScript, tests, and the production build.
8. Commit and push the verified update to `main` as requested.

This is the standing maintenance workflow for future daily workouts.

## Browser Storage and Synchronization

User-created entries are stored only in the current browser:

- They do not automatically synchronize across devices.
- Clearing browser data can remove unexported entries.
- Private/incognito storage may be temporary.
- A successful local save is not the same as committing the record to GitHub.

Use **Export all data** regularly to download a versioned JSON backup. Markdown export is intended for human review and repository updates.

## Import, Export, and Recovery

- **JSON export:** complete versioned browser-data backup
- **JSON import:** validates schema version, IDs, dates, exercise references, set state, context ranges, and numeric values
- **Markdown export:** reviewable workout or nutrition record suitable for incorporation into source documents
- **Copy Markdown:** places the generated record on the clipboard

To recover from a bad import:

1. Do not make additional edits.
2. Use the application's pre-import backup/restore option if available.
3. Otherwise import the last known-good JSON backup.
4. If browser storage was cleared and no export exists, the local-only entries cannot be recovered from GitHub.
5. Seed history in the repository remains available by reloading the deployed application.

## Important Limits

- Workout suggestions are explainable planning rules, not medical advice or individualized coaching.
- Supplement tracking is observational and does not prescribe a dose.
- Descriptive chart overlays do not establish that travel, illness, sleep, or creatine caused a performance change.
- Review `DISCLAIMER.md` before using the site to make health or training decisions.
