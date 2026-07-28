import type { ExerciseEntry, ExerciseSet, Workout } from "./types";

export type PerSideVolumePolicy = "preserve" | "double";

export interface CalculationOptions {
  /**
   * Per-side loads are preserved by default because the source value must not
   * silently be doubled. Choose "double" only when that is the intended policy.
   */
  perSidePolicy?: PerSideVolumePolicy;
  /** Backwards-friendly shorthand for perSidePolicy: "double". */
  multiplyPerSide?: boolean;
  includeWarmups?: boolean;
}

export interface WorkoutTotals {
  completedReps: number;
  completedVolumeLb: number;
  /** Alias used by compact UI cards. */
  volumeLb: number;
  calculableSetCount: number;
  excludedSetCount: number;
}

export interface WeeklyTrainingFrequency {
  weekStart: string;
  workoutCount: number;
  workoutIds: string[];
}

function setsFrom(
  source: ExerciseEntry | readonly ExerciseSet[],
): readonly ExerciseSet[] {
  return Array.isArray(source) ? source : (source as ExerciseEntry).sets;
}

function isFiniteNonnegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isSuccessfulSet(set: ExerciseSet): set is ExerciseSet & { reps: number } {
  return (
    set.completed === true &&
    set.failedAttempt !== true &&
    isFiniteNonnegative(set.reps) &&
    Number.isInteger(set.reps)
  );
}

export function calculateCompletedReps(
  source: ExerciseEntry | readonly ExerciseSet[],
  options: Pick<CalculationOptions, "includeWarmups"> = {},
): number {
  return setsFrom(source).reduce((total, set) => {
    if (
      !isSuccessfulSet(set) ||
      (options.includeWarmups === false && set.warmup === true)
    ) {
      return total;
    }

    return total + set.reps;
  }, 0);
}

export function calculateSetVolume(
  set: ExerciseSet,
  options: CalculationOptions = {},
): number | undefined {
  if (
    !isSuccessfulSet(set) ||
    !isFiniteNonnegative(set.weightLb) ||
    (options.includeWarmups === false && set.warmup === true)
  ) {
    return undefined;
  }

  const shouldDouble =
    options.perSidePolicy === "double" || options.multiplyPerSide === true;
  const multiplier = set.perSide === true && shouldDouble ? 2 : 1;
  return set.weightLb * set.reps * multiplier;
}

export function calculateVolume(
  source: ExerciseEntry | readonly ExerciseSet[],
  options: CalculationOptions = {},
): number {
  return setsFrom(source).reduce(
    (total, set) => total + (calculateSetVolume(set, options) ?? 0),
    0,
  );
}

export interface OneRepMaxOptions {
  enabled?: boolean;
  maxReps?: number;
  includeRampUp?: boolean;
  decimals?: number;
}

/**
 * Returns an Epley estimate, or undefined when the source set is not suitable.
 */
export function estimateOneRepMax(
  set: ExerciseSet,
  options: OneRepMaxOptions = {},
): number | undefined {
  const maxReps = options.maxReps ?? 12;
  const decimals = options.decimals ?? 1;

  if (
    options.enabled === false ||
    !isSuccessfulSet(set) ||
    set.warmup === true ||
    (set.rampUp === true && options.includeRampUp !== true) ||
    !isFiniteNonnegative(set.weightLb) ||
    set.weightLb === 0 ||
    set.reps === 0 ||
    set.reps > maxReps ||
    !Number.isInteger(set.reps)
  ) {
    return undefined;
  }

  const estimate = set.weightLb * (1 + set.reps / 30);
  const multiplier = 10 ** decimals;
  return Math.round(estimate * multiplier) / multiplier;
}

export function calculateWorkoutTotals(
  workout: Workout,
  options: CalculationOptions = {},
): WorkoutTotals {
  let completedReps = 0;
  let completedVolumeLb = 0;
  let calculableSetCount = 0;
  let excludedSetCount = 0;

  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (
        isSuccessfulSet(set) &&
        !(options.includeWarmups === false && set.warmup === true)
      ) {
        completedReps += set.reps;
      }

      const setVolume = calculateSetVolume(set, options);
      if (setVolume === undefined) {
        excludedSetCount += 1;
      } else {
        completedVolumeLb += setVolume;
        calculableSetCount += 1;
      }
    }
  }

  return {
    completedReps,
    completedVolumeLb,
    volumeLb: completedVolumeLb,
    calculableSetCount,
    excludedSetCount,
  };
}

function parseIsoDate(date: string | undefined): Date | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mondayFor(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  result.setUTCDate(result.getUTCDate() - daysSinceMonday);
  return result;
}

export function getWeeklyTrainingFrequency(
  workouts: readonly Workout[],
): WeeklyTrainingFrequency[] {
  const weeks = new Map<string, string[]>();

  for (const workout of workouts) {
    const date = parseIsoDate(workout.date);
    if (!date) {
      continue;
    }

    const weekStart = formatIsoDate(mondayFor(date));
    const workoutIds = weeks.get(weekStart) ?? [];
    workoutIds.push(workout.id);
    weeks.set(weekStart, workoutIds);
  }

  return [...weeks.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, workoutIds]) => ({
      weekStart,
      workoutCount: workoutIds.length,
      workoutIds,
    }));
}
