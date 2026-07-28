import type {
  Goal,
  NutritionEntry,
  ReadinessInput,
  Scale0To6,
  Workout,
  WorkoutContext,
} from "./types";

export type ValidationSeverity = "error" | "warning";

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationOptions {
  knownExerciseIds?: ReadonlySet<string> | readonly string[];
  expectedSchemaVersion?: number;
}

export interface ImportDataShape {
  schemaVersion: number;
  workouts: Workout[];
  nutritionEntries: NutritionEntry[];
  goals: Goal[];
  notes: unknown[];
  settings: Record<string, unknown>;
}

export const BUILT_IN_EXERCISE_IDS = new Set([
  "smith-flat-bench",
  "smith-incline-bench",
  "incline-bench-machine",
  "dumbbell-bench",
  "barbell-bench",
  "shoulder-press",
  "machine-chest-press",
  "strict-pull-up",
  "lat-pulldown",
  "seated-cable-row",
  "chest-supported-row",
  "machine-row",
  "face-pull",
  "reverse-cable-fly",
  "triceps-pushdown",
  "overhead-triceps-extension",
  "spider-curl",
  "incline-curl",
  "hammer-curl",
  "cable-lateral-raise",
  "dumbbell-lateral-raise",
  "cable-front-raise",
  "rear-delt-machine",
  "goblet-squat",
  "smith-squat",
  "leg-press",
  "split-squat",
  "lunge",
  "leg-extension",
  "hamstring-curl",
  "romanian-deadlift",
  "hip-thrust",
  "calf-raise",
  "farmers-carry",
  "front-loaded-carry",
  "zercher-carry",
  "plank",
  "pallof-press",
  "hanging-leg-raise",
  "ab-wheel",
  "shoulder-cable-work",
  "lateral-raise-unspecified",
]);

function issue(
  path: string,
  code: string,
  message: string,
  severity: ValidationSeverity = "error",
): ValidationIssue {
  return { path, code, message, severity };
}

function result(issues: readonly ValidationIssue[]): ValidationResult {
  const errors = issues.filter((item) => item.severity === "error");
  const warnings = issues.filter((item) => item.severity === "warning");
  return { valid: errors.length === 0, issues: [...issues], errors, warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidIsoDate(date: unknown): date is string {
  if (typeof date !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function isScale0To6(value: unknown): value is Scale0To6 {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function checkNonnegativeNumber(
  value: unknown,
  path: string,
  label: string,
  issues: ValidationIssue[],
  integer = false,
): void {
  if (value === undefined) {
    return;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isInteger(value))
  ) {
    issues.push(
      issue(
        path,
        "invalid-nonnegative-number",
        `${label} must be a finite nonnegative${integer ? " integer" : ""}.`,
      ),
    );
  }
}

function checkRating(
  value: unknown,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isScale0To6(value)) {
    issues.push(
      issue(
        path,
        "invalid-0-to-6-rating",
        `${label} must be an integer from 0 to 6; booleans are not valid context values.`,
      ),
    );
  }
}

function checkDuplicateId(
  id: unknown,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
): void {
  if (typeof id !== "string" || id.trim() === "") {
    issues.push(issue(path, "missing-id", "A non-empty ID is required."));
    return;
  }
  if (seen.has(id)) {
    issues.push(issue(path, "duplicate-id", `Duplicate ID: ${id}.`));
  } else {
    seen.add(id);
  }
}

function knownIds(options: ValidationOptions): ReadonlySet<string> {
  const supplied = options.knownExerciseIds;
  if (!supplied) {
    return BUILT_IN_EXERCISE_IDS;
  }
  return supplied instanceof Set ? supplied : new Set(supplied);
}

const WORKOUT_CONTEXT_FIELDS = [
  "energy",
  "sleepQuality",
  "soreness",
  "appetite",
  "illness",
  "travelImpact",
  "backPain",
  "generalPain",
] as const;

export function validateWorkoutContext(
  context: WorkoutContext | unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(context)) {
    return result([
      issue("context", "invalid-context", "Workout context must be an object."),
    ]);
  }
  for (const field of WORKOUT_CONTEXT_FIELDS) {
    checkRating(context[field], field, field, issues);
  }
  checkNonnegativeNumber(
    context.daysSinceLastWorkout,
    "daysSinceLastWorkout",
    "Days since last workout",
    issues,
    true,
  );
  return result(issues);
}

export function validateReadinessInput(
  input: ReadinessInput | unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return result([
      issue("readiness", "invalid-readiness", "Readiness input must be an object."),
    ]);
  }
  for (const field of WORKOUT_CONTEXT_FIELDS) {
    checkRating(input[field], field, field, issues);
  }
  checkNonnegativeNumber(
    input.daysSinceLastWorkout,
    "daysSinceLastWorkout",
    "Days since last workout",
    issues,
    true,
  );
  if (
    input.lastWorkoutType !== undefined &&
    !["push", "pull", "legs", "full-body", "upper", "other"].includes(
      String(input.lastWorkoutType),
    )
  ) {
    issues.push(
      issue(
        "lastWorkoutType",
        "invalid-workout-type",
        "Previous workout type is invalid.",
      ),
    );
  }
  return result(issues);
}

export function validateWorkout(
  workout: Workout | unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(workout)) {
    return result([issue("workout", "invalid-workout", "Workout must be an object.")]);
  }

  if (typeof workout.id !== "string" || workout.id.trim() === "") {
    issues.push(issue("id", "missing-id", "Workout ID is required."));
  }
  if (typeof workout.title !== "string" || workout.title.trim() === "") {
    issues.push(issue("title", "missing-title", "Workout title is required."));
  }
  const workoutTypes = ["push", "pull", "legs", "full-body", "upper", "other"];
  if (!workoutTypes.includes(String(workout.type))) {
    issues.push(issue("type", "invalid-workout-type", "Workout type is invalid."));
  }
  if (workout.date === undefined) {
    issues.push(
      issue(
        "date",
        "missing-date",
        "The workout date is unknown and will remain undated.",
        "warning",
      ),
    );
  } else if (!isValidIsoDate(workout.date)) {
    issues.push(issue("date", "invalid-date", "Date must be a real YYYY-MM-DD date."));
  }
  checkNonnegativeNumber(
    workout.chronologyIndex,
    "chronologyIndex",
    "Chronology index",
    issues,
    true,
  );

  if (workout.context !== undefined) {
    if (!isRecord(workout.context)) {
      issues.push(
        issue("context", "invalid-context", "Workout context must be an object."),
      );
    } else {
      for (const field of WORKOUT_CONTEXT_FIELDS) {
        checkRating(workout.context[field], `context.${field}`, field, issues);
      }
      checkNonnegativeNumber(
        workout.context.daysSinceLastWorkout,
        "context.daysSinceLastWorkout",
        "Days since last workout",
        issues,
        true,
      );
    }
  }

  if (!Array.isArray(workout.exercises)) {
    issues.push(issue("exercises", "invalid-exercises", "Exercises must be an array."));
    return result(issues);
  }

  const setIds = new Set<string>();
  const allowedExerciseIds = knownIds(options);
  for (const [exerciseIndex, exerciseValue] of workout.exercises.entries()) {
    const exercisePath = `exercises[${exerciseIndex}]`;
    if (!isRecord(exerciseValue)) {
      issues.push(issue(exercisePath, "invalid-exercise", "Exercise must be an object."));
      continue;
    }
    if (
      typeof exerciseValue.exerciseId !== "string" ||
      !allowedExerciseIds.has(exerciseValue.exerciseId)
    ) {
      issues.push(
        issue(
          `${exercisePath}.exerciseId`,
          "unknown-exercise-id",
          `Unknown exercise ID: ${String(exerciseValue.exerciseId)}.`,
        ),
      );
    }
    if (typeof exerciseValue.name !== "string" || exerciseValue.name.trim() === "") {
      issues.push(
        issue(
          `${exercisePath}.name`,
          "missing-exercise-name",
          "Exercise name is required.",
        ),
      );
    }
    if (!Array.isArray(exerciseValue.sets)) {
      issues.push(
        issue(`${exercisePath}.sets`, "invalid-sets", "Exercise sets must be an array."),
      );
      continue;
    }

    for (const [setIndex, setValue] of exerciseValue.sets.entries()) {
      const setPath = `${exercisePath}.sets[${setIndex}]`;
      if (!isRecord(setValue)) {
        issues.push(issue(setPath, "invalid-set", "Set must be an object."));
        continue;
      }
      checkDuplicateId(setValue.id, `${setPath}.id`, setIds, issues);
      checkNonnegativeNumber(setValue.weightLb, `${setPath}.weightLb`, "Weight", issues);
      checkNonnegativeNumber(
        setValue.reps,
        `${setPath}.reps`,
        "Repetitions",
        issues,
        true,
      );
      checkNonnegativeNumber(
        setValue.attemptedReps,
        `${setPath}.attemptedReps`,
        "Attempted repetitions",
        issues,
        true,
      );
      checkRating(setValue.rir, `${setPath}.rir`, "RIR", issues);
      checkNonnegativeNumber(
        setValue.durationSeconds,
        `${setPath}.durationSeconds`,
        "Duration",
        issues,
      );
      checkNonnegativeNumber(
        setValue.distanceFeet,
        `${setPath}.distanceFeet`,
        "Distance",
        issues,
      );
      checkNonnegativeNumber(
        setValue.assistedWeightLb,
        `${setPath}.assistedWeightLb`,
        "Assisted weight",
        issues,
      );

      if (typeof setValue.completed !== "boolean") {
        issues.push(
          issue(
            `${setPath}.completed`,
            "invalid-completed",
            "Set completion must be true or false.",
          ),
        );
      }
      if (setValue.completed === true && setValue.failedAttempt === true) {
        issues.push(
          issue(
            setPath,
            "completed-and-failed",
            "A set cannot be both completed and a failed attempt. Record the failed repetition separately.",
          ),
        );
      }
      if (setValue.completed === true && setValue.reps === undefined) {
        issues.push(
          issue(
            `${setPath}.reps`,
            "missing-reps",
            "Completed set has no repetition count, so repetitions and volume cannot be calculated.",
            "warning",
          ),
        );
      }
      if (setValue.failedAttempt === true && setValue.attemptedReps === undefined) {
        issues.push(
          issue(
            `${setPath}.attemptedReps`,
            "missing-attempted-reps",
            "Failed attempt has no attempted-repetition count.",
            "warning",
          ),
        );
      }
      if (setValue.perSide !== undefined && typeof setValue.perSide !== "boolean") {
        issues.push(
          issue(
            `${setPath}.perSide`,
            "invalid-per-side",
            "Per-side must be true, false, or omitted when unknown.",
          ),
        );
      }
      if (setValue.perSide === true && setValue.weightLb === undefined) {
        issues.push(
          issue(
            `${setPath}.weightLb`,
            "per-side-missing-weight",
            "Per-side is marked but the weight is missing.",
            "warning",
          ),
        );
      }
      if (Array.isArray(setValue.rirRange)) {
        const [minimum, maximum] = setValue.rirRange;
        checkRating(minimum, `${setPath}.rirRange[0]`, "Minimum RIR", issues);
        checkRating(maximum, `${setPath}.rirRange[1]`, "Maximum RIR", issues);
        if (
          typeof minimum === "number" &&
          typeof maximum === "number" &&
          minimum > maximum
        ) {
          issues.push(
            issue(
              `${setPath}.rirRange`,
              "invalid-rir-range",
              "RIR range minimum cannot exceed its maximum.",
            ),
          );
        }
      }
    }
  }

  return result(issues);
}

export function validateNutritionEntry(
  entry: NutritionEntry | unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(entry)) {
    return result([
      issue(
        "nutritionEntry",
        "invalid-nutrition-entry",
        "Nutrition entry must be an object.",
      ),
    ]);
  }
  if (typeof entry.id !== "string" || entry.id.trim() === "") {
    issues.push(issue("id", "missing-id", "Nutrition entry ID is required."));
  }
  if (!isValidIsoDate(entry.date)) {
    issues.push(issue("date", "invalid-date", "Date must be a real YYYY-MM-DD date."));
  }

  const nonnegativeFields = [
    "bodyWeightLb",
    "calories",
    "proteinG",
    "carbsG",
    "fatG",
    "fiberG",
    "waterOz",
    "creatineG",
  ] as const;
  for (const field of nonnegativeFields) {
    checkNonnegativeNumber(entry[field], field, field, issues);
  }
  const ratingFields = ["appetite", "mealQuality", "illness", "travelImpact"] as const;
  for (const field of ratingFields) {
    checkRating(entry[field], field, field, issues);
  }
  if (typeof entry.creatineG === "number" && entry.creatineG >= 15) {
    issues.push(
      issue(
        "creatineG",
        "creatine-dose-review",
        "A dose at or above 15 g/day resembles a short loading protocol. Review the duration and personal plan with a qualified clinician; this notice does not block the entry.",
        "warning",
      ),
    );
  }
  if (typeof entry.creatineG === "number" && entry.creatineG > 100) {
    issues.push(
      issue(
        "creatineG",
        "implausibly-high-supplement-value",
        "Creatine value exceeds the import safety limit of 100 g/day.",
      ),
    );
  }
  if (entry.otherSupplements !== undefined) {
    if (!Array.isArray(entry.otherSupplements)) {
      issues.push(
        issue(
          "otherSupplements",
          "invalid-supplements",
          "Other supplements must be an array.",
        ),
      );
    } else {
      for (const [index, supplement] of entry.otherSupplements.entries()) {
        if (!isRecord(supplement)) {
          issues.push(
            issue(
              `otherSupplements[${index}]`,
              "invalid-supplement",
              "Supplement must be an object.",
            ),
          );
          continue;
        }
        if (typeof supplement.name !== "string" || supplement.name.trim() === "") {
          issues.push(
            issue(
              `otherSupplements[${index}].name`,
              "missing-supplement-name",
              "Supplement name is required.",
            ),
          );
        }
        checkNonnegativeNumber(
          supplement.dose,
          `otherSupplements[${index}].dose`,
          "Supplement dose",
          issues,
        );
        if (typeof supplement.dose === "number" && supplement.dose > 10_000) {
          issues.push(
            issue(
              `otherSupplements[${index}].dose`,
              "excessively-high-supplement-value",
              "Supplement dose is unusually high; verify the value and unit.",
              "warning",
            ),
          );
        }
      }
    }
  }
  return result(issues);
}

function prefixIssues(prefix: string, validation: ValidationResult): ValidationIssue[] {
  return [...validation.errors, ...validation.warnings].map((item) => ({
    ...item,
    path: `${prefix}.${item.path}`,
  }));
}

export function validateAppData(
  payload: unknown,
  options: ValidationOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  if (!isRecord(payload)) {
    return result([issue("data", "invalid-import", "Imported data must be an object.")]);
  }
  const expectedSchemaVersion = options.expectedSchemaVersion ?? 2;
  if (
    typeof payload.schemaVersion !== "number" ||
    !Number.isInteger(payload.schemaVersion)
  ) {
    issues.push(
      issue(
        "schemaVersion",
        "missing-schema-version",
        "A numeric schema version is required.",
      ),
    );
  } else if (payload.schemaVersion !== expectedSchemaVersion) {
    issues.push(
      issue(
        "schemaVersion",
        "unsupported-schema-version",
        `Expected schema version ${expectedSchemaVersion}, received ${payload.schemaVersion}.`,
      ),
    );
  }

  const collectionNames = ["workouts", "nutritionEntries", "goals", "notes"] as const;
  for (const name of collectionNames) {
    if (!Array.isArray(payload[name])) {
      issues.push(issue(name, "invalid-collection", `${name} must be an array.`));
    }
  }
  if (!isRecord(payload.settings)) {
    issues.push(issue("settings", "invalid-settings", "Settings must be an object."));
  }

  const globalIds = new Set<string>();
  if (Array.isArray(payload.workouts)) {
    for (const [index, workout] of payload.workouts.entries()) {
      if (isRecord(workout)) {
        checkDuplicateId(workout.id, `workouts[${index}].id`, globalIds, issues);
      }
      issues.push(
        ...prefixIssues(`workouts[${index}]`, validateWorkout(workout, options)),
      );
      if (isRecord(workout) && Array.isArray(workout.exercises)) {
        for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
          if (!isRecord(exercise) || !Array.isArray(exercise.sets)) {
            continue;
          }
          for (const [setIndex, set] of exercise.sets.entries()) {
            if (isRecord(set)) {
              checkDuplicateId(
                set.id,
                `workouts[${index}].exercises[${exerciseIndex}].sets[${setIndex}].id`,
                globalIds,
                issues,
              );
            }
          }
        }
      }
    }
  }
  if (Array.isArray(payload.nutritionEntries)) {
    for (const [index, entry] of payload.nutritionEntries.entries()) {
      if (isRecord(entry)) {
        checkDuplicateId(entry.id, `nutritionEntries[${index}].id`, globalIds, issues);
      }
      issues.push(
        ...prefixIssues(`nutritionEntries[${index}]`, validateNutritionEntry(entry)),
      );
    }
  }
  for (const collectionName of ["goals", "notes"] as const) {
    const collection = payload[collectionName];
    if (!Array.isArray(collection)) {
      continue;
    }
    for (const [index, value] of collection.entries()) {
      if (!isRecord(value)) {
        issues.push(
          issue(
            `${collectionName}[${index}]`,
            "invalid-item",
            `${collectionName} item must be an object.`,
          ),
        );
        continue;
      }
      checkDuplicateId(value.id, `${collectionName}[${index}].id`, globalIds, issues);
    }
  }

  return result(issues);
}

export const validateImportPayload = validateAppData;

export class ImportValidationError extends Error {
  readonly validation: ValidationResult;

  constructor(validation: ValidationResult) {
    super(validation.errors.map((item) => `${item.path}: ${item.message}`).join("\n"));
    this.name = "ImportValidationError";
    this.validation = validation;
  }
}

export function assertValidImport(
  payload: unknown,
  options: ValidationOptions = {},
): asserts payload is ImportDataShape {
  const validation = validateAppData(payload, options);
  if (!validation.valid) {
    throw new ImportValidationError(validation);
  }
}
