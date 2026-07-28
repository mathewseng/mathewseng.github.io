# Gym Data Model

This document defines the human-readable contract for the structured TypeScript data used by the site.

## Context Rating Contract

Every workout/readiness context dimension is optional and uses an integer from 0 through 6. `WorkoutContext` and `ReadinessInput` contain no boolean context flags.

```ts
type Scale0To6 = 0 | 1 | 2 | 3 | 4 | 5 | 6;
```

Direction is explicit:

| Dimension     | 0            | 6            |
| ------------- | ------------ | ------------ |
| Energy        | Lowest/worst | Highest/best |
| Sleep quality | Lowest/worst | Highest/best |
| Appetite      | Lowest/worst | Highest/best |
| Soreness      | None         | Worst        |
| Illness       | None         | Worst        |
| Travel impact | None         | Worst        |
| Back pain     | None         | Worst        |
| General pain  | None         | Worst        |

Zero means the athlete explicitly recorded the absence of a symptom/disruption or the lowest positive-state rating. `undefined` means not recorded. Missing historical context must never be converted to zero, and words such as “mildly sick” must not be assigned a score without user input.

## Core Type Contract

```ts
type DataQuality = "complete" | "partial" | "estimated" | "ambiguous";

type WorkoutType = "push" | "pull" | "legs" | "full-body" | "upper" | "other";

type WorkoutContext = {
  energy?: Scale0To6;
  sleepQuality?: Scale0To6;
  soreness?: Scale0To6;
  appetite?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  backPain?: Scale0To6;
  generalPain?: Scale0To6;
  daysSinceLastWorkout?: number;
  notes?: string;
  sourceLabels?: string[];
};

type ExerciseSet = {
  id: string;
  weightLb?: number;
  reps?: number;
  attemptedReps?: number;
  rir?: Scale0To6;
  rirRange?: readonly [Scale0To6, Scale0To6];
  completed: boolean;
  failedAttempt?: boolean;
  technicalFailure?: boolean;
  warmup?: boolean;
  rampUp?: boolean;
  perSide?: boolean;
  durationSeconds?: number;
  distanceFeet?: number;
  assistedWeightLb?: number;
  notes?: string;
  dataQuality?: DataQuality;
};

type ExerciseEntry = {
  exerciseId: string;
  name: string;
  equipment?: string;
  machineId?: string;
  sets: ExerciseSet[];
  notes?: string;
  dataQuality?: DataQuality;
};

type Workout = {
  id: string;
  date?: string;
  type: WorkoutType;
  title: string;
  context?: WorkoutContext;
  exercises: ExerciseEntry[];
  notes?: string;
  dataQuality: DataQuality;
  chronologyIndex: number;
};

type GoalStatus =
  | "not-started"
  | "building-foundation"
  | "in-progress"
  | "near-milestone"
  | "achieved"
  | "paused"
  | "limited";

type Goal = {
  id: string;
  title: string;
  category:
    "strength" | "hypertrophy" | "skill" | "consistency" | "recovery" | "nutrition";
  status: GoalStatus;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  milestones?: GoalMilestone[];
  supportingExercises?: string[];
  successCriteria?: string[];
  progressionRules?: string[];
  safetyNotes?: string[];
  notes?: string;
};

type GoalMilestone = {
  id: string;
  label: string;
  value?: number;
  unit?: string;
  achieved?: boolean;
};

type NutritionEntry = {
  id: string;
  date: string;
  bodyWeightLb?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  waterOz?: number;
  creatineG?: number;
  otherSupplements?: Array<{
    name: string;
    dose?: number;
    unit?: string;
    notes?: string;
  }>;
  appetite?: Scale0To6;
  mealQuality?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  notes?: string;
  dataQuality: DataQuality;
};

type ReadinessInput = {
  energy?: Scale0To6;
  sleepQuality?: Scale0To6;
  soreness?: Scale0To6;
  appetite?: Scale0To6;
  illness?: Scale0To6;
  travelImpact?: Scale0To6;
  backPain?: Scale0To6;
  generalPain?: Scale0To6;
  daysSinceLastWorkout?: number;
  lastWorkoutType?: WorkoutType;
};
```

Mechanical set state may remain boolean. That includes `completed`, `failedAttempt`, `technicalFailure`, `warmup`, `rampUp`, and `perSide`. These properties describe the set record; they are not readiness or recovery ratings.

## Data Quality

- `complete`: all fields needed for the represented claim are known.
- `partial`: one or more expected fields are missing.
- `estimated`: a value was calculated or explicitly reported as an estimate.
- `ambiguous`: the source supports multiple interpretations, such as an unknown per-hand load.

Quality applies to the specific record. A workout can be partial while an individual set within it is complete.

## Historical Ordering

- Dates use ISO `YYYY-MM-DD` when known.
- Undated workouts omit `date`.
- `chronologyIndex` preserves supplied narrative order without fabricating a date.
- Calendar views put undated records in an “Undated history” area, not on an invented day.

## Set-State Invariants

- A failed attempted repetition is not a completed repetition.
- A pure failed-attempt record cannot also be a completed set.
- `attemptedReps` may describe unsuccessful attempts but is excluded from completed-repetition and volume calculations.
- Warm-up and ramp-up sets remain in history but are excluded from estimated-1RM analysis by default.
- A missing repetition count remains missing even if the set is known to have been completed.
- Per-side input preserves the original entered load.

## Calculations

### Completed Repetitions

```text
sum(reps for completed sets with known reps)
```

Failed attempted repetitions are excluded.

### Completed Volume

```text
sum(weightLb × reps for qualifying completed sets)
```

Rules:

- Exclude failed attempts.
- Exclude sets missing weight or reps.
- Do not assume per-side multiplication.
- Allow configurable multiplication only after an explicit per-side choice.
- Preserve the original load.
- Do not plot missing volume as zero.

### Estimated One-Repetition Maximum

Optional Epley estimate:

```text
estimated1RM = weight × (1 + reps / 30)
```

Rules:

- Label the result as estimated.
- Do not use failed attempts.
- Do not use warm-ups.
- Do not use sets above 12 repetitions by default.
- Keep Smith-machine and free-weight barbell estimates separate.
- Allow estimates to be disabled.

## Personal Records

Supported record types:

- Heaviest successful set
- Highest reps at a given weight
- Best session total
- Best completed volume
- Best pull-up set
- Best pull-up session total
- Best body-weight trend milestone
- Most consistent training week

Estimates do not replace confirmed records.

## Storage Envelope

Browser-created data uses a versioned envelope:

```ts
type StoredGymData = {
  schemaVersion: number;
  exportedAt: string;
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  notes: unknown[];
  goals: Goal[];
  settings: Record<string, unknown>;
};
```

Imports must validate the version and contents before replacing current data. The application should create a recoverable pre-import backup.

## Validation

Validate:

- ISO dates
- Values on the inclusive 0–6 scale
- Nonnegative weights, repetitions, durations, distances, nutrition quantities, and RIR
- Duplicate IDs
- Import schema version
- Unknown exercise identifiers
- Impossible completed-and-failed combinations
- Per-side values and volume configuration
- Missing required identity fields
- Excessively high supplement values

Creatine values at or above 15 g/day display a neutral review notice. They are not blocked, diagnosed, or automatically recommended.
