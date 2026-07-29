import type { Workout } from "../lib/types";

/**
 * Source workouts in the order they were recorded.
 *
 * chronologyIndex preserves relative ordering, including same-day sessions and
 * the five undated sessions. Undated sessions must never be assigned fabricated
 * calendar dates.
 */
const workoutLogModules = import.meta.glob<Workout>("../../logs/workouts/*.json", {
  eager: true,
  import: "default",
});

/**
 * Canonical workout records are stored as one JSON object per file. Sorting by
 * chronologyIndex preserves the supplied order for undated and same-day logs.
 */
export const workouts = Object.values(workoutLogModules).sort(
  (a, b) => a.chronologyIndex - b.chronologyIndex,
);

export const datedWorkouts = workouts.filter(
  (workout): workout is (typeof workouts)[number] & { date: string } =>
    workout.date !== undefined,
);

export const undatedWorkouts = workouts.filter((workout) => workout.date === undefined);

export function compareWorkoutsNewestFirst(a: Workout, b: Workout): number {
  if (a.date && b.date) {
    const dateOrder = b.date.localeCompare(a.date);
    return dateOrder || b.chronologyIndex - a.chronologyIndex;
  }
  if (a.date) return -1;
  if (b.date) return 1;
  return b.chronologyIndex - a.chronologyIndex;
}

export const workoutsNewestFirst = [...workouts].sort(compareWorkoutsNewestFirst);

export const workoutById = new Map(
  workouts.map((workout) => [workout.id, workout] as const),
);
