import {
  calculateCompletedReps,
  calculateVolume,
  estimateOneRepMax,
  isSuccessfulSet,
  type CalculationOptions,
} from "./calculations";
import type { ExerciseEntry, ExerciseSet, Workout } from "./types";

export interface ExerciseIdentity {
  exerciseId: string;
  equipment?: string;
  machineId?: string;
}

export interface ProgressionOptions extends CalculationOptions {
  equipment?: string;
  machineId?: string;
  includeRampUp?: boolean;
}

export interface ExerciseProgressionPoint {
  workoutId: string;
  date?: string;
  chronologyIndex: number;
  exerciseId: string;
  equipment?: string;
  machineId?: string;
  identityKey: string;
  completedReps: number;
  completedVolumeLb: number;
  bestWeightLb?: number;
  bestSetReps?: number;
  estimatedOneRepMaxLb?: number;
  failedAttempts: number;
}

export interface RepProgressionPoint {
  workoutId: string;
  date?: string;
  chronologyIndex: number;
  weightLb: number;
  setReps: number[];
  completedReps: number;
  completedVolumeLb: number;
}

export interface SessionComparison {
  previousCompletedReps: number;
  currentCompletedReps: number;
  completedRepChange: number;
  previousVolumeLb: number;
  currentVolumeLb: number;
  volumeChangeLb: number;
  improved: boolean;
}

function normalizeIdentityPart(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() || "unspecified";
}

/**
 * Equipment and machine identity are part of an exercise key so Smith-machine
 * and free-barbell performances can never be silently merged.
 */
export function getExerciseIdentityKey(identity: ExerciseIdentity): string {
  return [
    identity.exerciseId.trim().toLocaleLowerCase(),
    normalizeIdentityPart(identity.equipment),
    normalizeIdentityPart(identity.machineId),
  ].join("::");
}

function entryMatches(
  entry: ExerciseEntry,
  exerciseId: string,
  options: ProgressionOptions,
): boolean {
  return (
    entry.exerciseId === exerciseId &&
    (options.equipment === undefined ||
      normalizeIdentityPart(entry.equipment) ===
        normalizeIdentityPart(options.equipment)) &&
    (options.machineId === undefined ||
      normalizeIdentityPart(entry.machineId) === normalizeIdentityPart(options.machineId))
  );
}

function workingSets(entry: ExerciseEntry, options: ProgressionOptions): ExerciseSet[] {
  return entry.sets.filter(
    (set) =>
      set.warmup !== true && (options.includeRampUp === true || set.rampUp !== true),
  );
}

function highest(values: readonly number[]): number | undefined {
  return values.length > 0 ? Math.max(...values) : undefined;
}

function progressionPoint(
  workout: Workout,
  entry: ExerciseEntry,
  options: ProgressionOptions,
): ExerciseProgressionPoint {
  const sets = workingSets(entry, options);
  const successful = sets.filter(isSuccessfulSet);
  const e1rms = successful
    .map((set) =>
      estimateOneRepMax(set, {
        includeRampUp: options.includeRampUp,
      }),
    )
    .filter((value): value is number => value !== undefined);
  const weightedSets = successful.filter(
    (set): set is ExerciseSet & { reps: number; weightLb: number } =>
      typeof set.weightLb === "number" && Number.isFinite(set.weightLb),
  );

  return {
    workoutId: workout.id,
    date: workout.date,
    chronologyIndex: workout.chronologyIndex,
    exerciseId: entry.exerciseId,
    equipment: entry.equipment,
    machineId: entry.machineId,
    identityKey: getExerciseIdentityKey(entry),
    completedReps: calculateCompletedReps(sets),
    completedVolumeLb: calculateVolume(sets, options),
    bestWeightLb: highest(weightedSets.map((set) => set.weightLb)),
    bestSetReps: highest(successful.map((set) => set.reps)),
    estimatedOneRepMaxLb: highest(e1rms),
    failedAttempts: sets.filter((set) => set.failedAttempt === true).length,
  };
}

export function getExerciseProgression(
  workouts: readonly Workout[],
  exerciseId: string,
  options: ProgressionOptions = {},
): ExerciseProgressionPoint[] {
  const points: ExerciseProgressionPoint[] = [];

  for (const workout of workouts) {
    for (const entry of workout.exercises) {
      if (entryMatches(entry, exerciseId, options)) {
        points.push(progressionPoint(workout, entry, options));
      }
    }
  }

  return points.sort((left, right) => left.chronologyIndex - right.chronologyIndex);
}

export function getRepProgression(
  workouts: readonly Workout[],
  exerciseId: string,
  weightLb: number,
  options: ProgressionOptions = {},
): RepProgressionPoint[] {
  const points: RepProgressionPoint[] = [];

  for (const workout of workouts) {
    for (const entry of workout.exercises) {
      if (!entryMatches(entry, exerciseId, options)) {
        continue;
      }

      const sets = workingSets(entry, options)
        .filter(isSuccessfulSet)
        .filter((set) => set.weightLb === weightLb);
      if (sets.length === 0) {
        continue;
      }

      points.push({
        workoutId: workout.id,
        date: workout.date,
        chronologyIndex: workout.chronologyIndex,
        weightLb,
        setReps: sets.map((set) => set.reps),
        completedReps: calculateCompletedReps(sets),
        completedVolumeLb: calculateVolume(sets, options),
      });
    }
  }

  return points.sort((left, right) => left.chronologyIndex - right.chronologyIndex);
}

function entrySets(
  source: ExerciseEntry | readonly ExerciseSet[],
): readonly ExerciseSet[] {
  return Array.isArray(source) ? source : (source as ExerciseEntry).sets;
}

export function compareExerciseSessions(
  previous: ExerciseEntry | readonly ExerciseSet[],
  current: ExerciseEntry | readonly ExerciseSet[],
  options: CalculationOptions = {},
): SessionComparison {
  const previousSets = entrySets(previous);
  const currentSets = entrySets(current);
  const previousCompletedReps = calculateCompletedReps(previousSets);
  const currentCompletedReps = calculateCompletedReps(currentSets);
  const previousVolumeLb = calculateVolume(previousSets, options);
  const currentVolumeLb = calculateVolume(currentSets, options);
  const completedRepChange = currentCompletedReps - previousCompletedReps;
  const volumeChangeLb = currentVolumeLb - previousVolumeLb;

  return {
    previousCompletedReps,
    currentCompletedReps,
    completedRepChange,
    previousVolumeLb,
    currentVolumeLb,
    volumeChangeLb,
    improved: completedRepChange > 0 || volumeChangeLb > 0,
  };
}

export function shouldIncreaseLoad(
  source: readonly number[] | readonly ExerciseSet[],
  targetReps = 8,
  minSets = 3,
): boolean {
  if (
    !Number.isInteger(targetReps) ||
    targetReps < 1 ||
    !Number.isInteger(minSets) ||
    minSets < 1
  ) {
    return false;
  }

  const repetitions =
    source.length > 0 && typeof source[0] === "number"
      ? (source as readonly number[])
      : (source as readonly ExerciseSet[])
          .filter(isSuccessfulSet)
          .filter((set) => set.warmup !== true && set.rampUp !== true)
          .map((set) => set.reps);

  return (
    repetitions.length >= minSets &&
    repetitions.slice(0, minSets).every((reps) => reps >= targetReps)
  );
}
