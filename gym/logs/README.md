# Repository Workout Logs

Canonical committed workout records live in `logs/workouts/`.

## Storage Rules

- Store exactly one workout object in each JSON file.
- Name each file `<workout-id>.json`; the filename must match the object's `id`.
- Keep `chronologyIndex` unique so undated and same-day sessions retain their supplied order.
- Use an ISO `YYYY-MM-DD` date only when the date is known.
- Store a known local workout start time as 24-hour `HH:mm` in `startTime`.
- Store a known elapsed duration as a positive whole number in `durationMinutes`.
- Preserve unknown values by omitting them rather than inventing defaults.
- Record workout/readiness context on the documented 0–6 scale.
- Mark per-side loads explicitly with `"perSide": true`.
- Preserve partial, estimated, and ambiguous details with `dataQuality` and notes.

The application automatically loads every `logs/workouts/*.json` file. `LOGS.md`
remains the human-readable history and should be updated alongside the matching
JSON record.
