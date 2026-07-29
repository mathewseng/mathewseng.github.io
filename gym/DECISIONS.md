# Architecture and Product Decisions

## Decision Log

### 2026-07-28 — Project Location and Public Path

- **Decision:** The gym dashboard is the `/gym` project inside the `mathewseng.github.io` repository, located in the repository's `gym/` directory.
- **Consequence:** It builds for and is published at `https://mathewseng.github.io/gym/`. Vite uses `base: "/gym/"`, and deployment runs from the containing site repository.

### 2026-07-28 — Static-Only Architecture

- **Decision:** Use a static Vite, React, and TypeScript application on GitHub Pages.
- **Reason:** The project must not require a backend, database, authentication service, paid service, secret, or API key.
- **Consequence:** Browser-created entries remain local until exported and committed.

### 2026-07-28 — Hash-Based Routing

- **Decision:** Use `HashRouter`.
- **Reason:** Hash routing works reliably under a GitHub Pages repository subpath without server rewrites.

### 2026-07-28 — Markdown Is the Human-Readable Source of Truth

- **Decision:** The root Markdown files in `gym/` contain the canonical human-readable profile, history, goals, notes, nutrition observations, program, exercise registry, model, decisions, changes, and disclaimer.
- **Consequence:** Relevant content is mirrored in structured TypeScript seed data. When canonical facts change, update both representations in the same change.

### 2026-07-28 — Local Persistence and Explicit Export

- **Decision:** Use versioned `localStorage` for new workouts, nutrition entries, notes, goal changes, and settings.
- **Decision:** Support validated JSON import/export and Markdown export/copy.
- **Consequence:** There is no automatic cloud synchronization. Clearing browser storage can delete entries that were not exported.

### 2026-07-28 — Calendar and Undated History

- **Decision:** Provide a calendar for dated training and nutrition records, plus a separate undated-history section.
- **Reason:** A calendar makes consistency and recovery patterns visible, but placing unknown sessions on invented dates would corrupt the source record.

### 2026-07-28 — Numeric Context, No Workout/Readiness Booleans

- **Decision:** Every workout/readiness context dimension is optional and uses an integer from 0 through 6.
- **Direction:** Energy, sleep, and appetite use `6 = best`; soreness, illness, travel impact, back pain, and general pain use `6 = worst`.
- **Consequence:** `WorkoutContext` and `ReadinessInput` contain no boolean context flags. Zero is an explicit observation; absence means unknown. Mechanical set-state properties may remain boolean.

### 2026-07-28 — Equipment Identities Stay Separate

- **Decision:** Smith-machine and free-weight barbell exercises remain separate.
- **Decision:** Different machines can retain distinct machine identifiers.
- **Reason:** Bar weight, cable ratios, resistance curves, and stability demands differ.

### 2026-07-28 — Unknown Means Unknown

- **Decision:** Do not invent dates, reps, equipment, per-hand status, context scores, or nutrition values.
- **Consequence:** Partial, estimated, and ambiguous records receive visible quality labels, and charts skip unknown values rather than plotting zero.

### 2026-07-28 — Per-Side Volume Is Explicit

- **Decision:** Preserve the reported per-side load and require explicit user choice before multiplying it for volume.
- **Reason:** Historical entries are not consistently labeled, and silent multiplication would create misleading comparisons.

### 2026-07-28 — Suggestions Are Transparent Rules

- **Decision:** Workout suggestions use deterministic, explainable rules based on rotation, readiness, recovery, duration, and recent performance.
- **Consequence:** The interface explains why a suggestion changed and does not make fake AI or coaching claims.

### 2026-07-28 — Supplement Tracking Is Observational

- **Decision:** Track creatine and other supplements without personalized medical prescribing.
- **Consequence:** The known 15–20 g/day report is presented neutrally, the roughly 10-day travel pause remains an undated range annotation, and elevated values trigger review language rather than a diagnosis or block.

### 2026-07-28 — Ongoing Workout Update Workflow

- **Decision:** When the user provides a new daily workout, treat it as a request to add that factual record to `LOGS.md`, add one matching JSON record under `logs/workouts/`, update derived benchmarks only when supported, run verification, and push the completed change to `main`.
- **Consequence:** Preserve the user's original values and ambiguities; do not silently normalize uncertain equipment or per-side loads. Browser-local entries are not considered committed history until they are exported and incorporated into the repository.

### 2026-07-29 — One JSON File per Workout

- **Decision:** Store each committed workout as one `logs/workouts/<workout-id>.json` object and discover the folder automatically at build time.
- **Reason:** Daily additions stay isolated, reviewable, and less likely to create merge conflicts than one growing TypeScript array.
- **Consequence:** The filename must match the workout ID, chronology indices remain unique, and `LOGS.md` stays synchronized as the human-readable history.
