import {
  calculateCompletedReps,
  calculateVolume,
  estimateOneRepMax,
  getWeeklyTrainingFrequency,
  isSuccessfulSet,
  type CalculationOptions,
} from "./calculations";
import { getExerciseIdentityKey, type ExerciseIdentity } from "./progression";
import type { ExerciseEntry, ExerciseSet, Workout } from "./types";

export interface SetRecord {
  workoutId: string;
  date?: string;
  setId: string;
  weightLb?: number;
  reps: number;
}

export interface SessionRecord {
  workoutId: string;
  date?: string;
  value: number;
}

export interface RepsAtWeightRecord {
  weightLb: number;
  reps: number;
  workoutId: string;
  date?: string;
  setId: string;
}

export interface ExercisePersonalRecords extends ExerciseIdentity {
  identityKey: string;
  name: string;
  heaviestSuccessfulSet?: SetRecord;
  bestSuccessfulSet?: SetRecord;
  highestRepsAtWeight: RepsAtWeightRecord[];
  bestSessionCompletedReps?: SessionRecord;
  bestSessionVolumeLb?: SessionRecord;
  bestEstimatedOneRepMaxLb?: SessionRecord;
}

export interface PersonalRecordOptions extends CalculationOptions {
  includeWarmups?: boolean;
  includeRampUp?: boolean;
  equipment?: string;
  machineId?: string;
}

export interface BestTrainingWeek {
  weekStart: string;
  workoutCount: number;
  workoutIds: string[];
}

interface ExerciseAccumulator {
  identity: ExerciseIdentity;
  name: string;
  sessions: Map<
    string,
    {
      workout: Workout;
      sets: Array<ExerciseSet & { reps: number }>;
    }
  >;
}

function eligibleSets(
  entry: ExerciseEntry,
  options: PersonalRecordOptions,
): Array<ExerciseSet & { reps: number }> {
  return entry.sets
    .filter(isSuccessfulSet)
    .filter(
      (set) =>
        (options.includeWarmups === true || set.warmup !== true) &&
        (options.includeRampUp === true || set.rampUp !== true),
    );
}

function asSetRecord(workout: Workout, set: ExerciseSet & { reps: number }): SetRecord {
  return {
    workoutId: workout.id,
    date: workout.date,
    setId: set.id,
    weightLb: set.weightLb,
    reps: set.reps,
  };
}

function isBetterWeightedSet(
  candidate: ExerciseSet & { reps: number },
  current: SetRecord | undefined,
): boolean {
  if (typeof candidate.weightLb !== "number") {
    return false;
  }
  if (current?.weightLb === undefined) {
    return true;
  }
  return (
    candidate.weightLb > current.weightLb ||
    (candidate.weightLb === current.weightLb && candidate.reps > current.reps)
  );
}

function isBetterBestSet(
  candidate: ExerciseSet & { reps: number },
  current: SetRecord | undefined,
): boolean {
  if (!current) {
    return true;
  }

  const candidateWeight = candidate.weightLb ?? 0;
  const currentWeight = current.weightLb ?? 0;
  if (candidateWeight === 0 && currentWeight === 0) {
    return candidate.reps > current.reps;
  }

  const candidateEstimate = estimateOneRepMax(candidate) ?? candidateWeight;
  const currentEstimate =
    currentWeight > 0 ? currentWeight * (1 + current.reps / 30) : current.reps;
  return candidateEstimate > currentEstimate;
}

function buildRecord(
  accumulator: ExerciseAccumulator,
  options: PersonalRecordOptions,
): ExercisePersonalRecords {
  let heaviestSuccessfulSet: SetRecord | undefined;
  let bestSuccessfulSet: SetRecord | undefined;
  let bestSessionCompletedReps: SessionRecord | undefined;
  let bestSessionVolumeLb: SessionRecord | undefined;
  let bestEstimatedOneRepMaxLb: SessionRecord | undefined;
  const repsAtWeight = new Map<number, RepsAtWeightRecord>();

  for (const { workout, sets } of accumulator.sessions.values()) {
    const sessionReps = calculateCompletedReps(sets);
    const sessionVolume = calculateVolume(sets, options);
    const sessionEstimates: number[] = [];

    if (
      sets.length > 0 &&
      (!bestSessionCompletedReps || sessionReps > bestSessionCompletedReps.value)
    ) {
      bestSessionCompletedReps = {
        workoutId: workout.id,
        date: workout.date,
        value: sessionReps,
      };
    }
    if (
      sessionVolume > 0 &&
      (!bestSessionVolumeLb || sessionVolume > bestSessionVolumeLb.value)
    ) {
      bestSessionVolumeLb = {
        workoutId: workout.id,
        date: workout.date,
        value: sessionVolume,
      };
    }

    for (const set of sets) {
      if (isBetterWeightedSet(set, heaviestSuccessfulSet)) {
        heaviestSuccessfulSet = asSetRecord(workout, set);
      }
      if (isBetterBestSet(set, bestSuccessfulSet)) {
        bestSuccessfulSet = asSetRecord(workout, set);
      }

      if (typeof set.weightLb === "number") {
        const current = repsAtWeight.get(set.weightLb);
        if (!current || set.reps > current.reps) {
          repsAtWeight.set(set.weightLb, {
            weightLb: set.weightLb,
            reps: set.reps,
            workoutId: workout.id,
            date: workout.date,
            setId: set.id,
          });
        }
      }

      const estimate = estimateOneRepMax(set);
      if (estimate !== undefined) {
        sessionEstimates.push(estimate);
      }
    }

    const sessionBestEstimate =
      sessionEstimates.length > 0 ? Math.max(...sessionEstimates) : undefined;
    if (
      sessionBestEstimate !== undefined &&
      (!bestEstimatedOneRepMaxLb || sessionBestEstimate > bestEstimatedOneRepMaxLb.value)
    ) {
      bestEstimatedOneRepMaxLb = {
        workoutId: workout.id,
        date: workout.date,
        value: sessionBestEstimate,
      };
    }
  }

  return {
    ...accumulator.identity,
    identityKey: getExerciseIdentityKey(accumulator.identity),
    name: accumulator.name,
    heaviestSuccessfulSet,
    bestSuccessfulSet,
    highestRepsAtWeight: [...repsAtWeight.values()].sort(
      (left, right) => left.weightLb - right.weightLb,
    ),
    bestSessionCompletedReps,
    bestSessionVolumeLb,
    bestEstimatedOneRepMaxLb,
  };
}

function buildAccumulators(
  workouts: readonly Workout[],
  exerciseId: string | undefined,
  options: PersonalRecordOptions,
): Map<string, ExerciseAccumulator> {
  const accumulators = new Map<string, ExerciseAccumulator>();

  for (const workout of workouts) {
    for (const entry of workout.exercises) {
      if (
        (exerciseId !== undefined && entry.exerciseId !== exerciseId) ||
        (options.equipment !== undefined &&
          entry.equipment?.toLocaleLowerCase() !==
            options.equipment.toLocaleLowerCase()) ||
        (options.machineId !== undefined &&
          entry.machineId?.toLocaleLowerCase() !== options.machineId.toLocaleLowerCase())
      ) {
        continue;
      }

      const identity: ExerciseIdentity = {
        exerciseId: entry.exerciseId,
        equipment: entry.equipment,
        machineId: entry.machineId,
      };
      const identityKey = getExerciseIdentityKey(identity);
      const sets = eligibleSets(entry, options);
      let accumulator = accumulators.get(identityKey);
      if (!accumulator) {
        accumulator = {
          identity,
          name: entry.name,
          sessions: new Map(),
        };
        accumulators.set(identityKey, accumulator);
      }

      const existingSession = accumulator.sessions.get(workout.id);
      if (existingSession) {
        existingSession.sets.push(...sets);
      } else {
        accumulator.sessions.set(workout.id, {
          workout,
          sets: [...sets],
        });
      }
    }
  }

  return accumulators;
}

export function getExercisePersonalRecords(
  workouts: readonly Workout[],
  exerciseId: string,
  options: PersonalRecordOptions = {},
): ExercisePersonalRecords[] {
  return [...buildAccumulators(workouts, exerciseId, options).values()].map(
    (accumulator) => buildRecord(accumulator, options),
  );
}

export function detectPersonalRecords(
  workouts: readonly Workout[],
  options: PersonalRecordOptions = {},
): ExercisePersonalRecords[] {
  return [...buildAccumulators(workouts, undefined, options).values()]
    .map((accumulator) => buildRecord(accumulator, options))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getBestTrainingWeek(
  workouts: readonly Workout[],
): BestTrainingWeek | undefined {
  return getWeeklyTrainingFrequency(workouts).reduce<BestTrainingWeek | undefined>(
    (best, week) => {
      if (
        !best ||
        week.workoutCount > best.workoutCount ||
        (week.workoutCount === best.workoutCount && week.weekStart > best.weekStart)
      ) {
        return week;
      }
      return best;
    },
    undefined,
  );
}
