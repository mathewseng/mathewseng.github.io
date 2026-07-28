import { describe, expect, it } from "vitest";

import { exercises } from "../src/data/exercises";
import { benchGoal } from "../src/data/goals";
import { workouts } from "../src/data/workouts";
import { getRepProgression } from "../src/lib/progression";
import { validateWorkout } from "../src/lib/validation";

describe("seed data integration", () => {
  it("keeps the Smith-machine bench target at 145 lb", () => {
    expect(benchGoal.targetValue).toBe(145);
    expect(benchGoal.milestones?.at(-1)).toEqual(
      expect.objectContaining({
        id: "bench-145-1",
        label: "145 lb × 1",
        value: 145,
      }),
    );
  });

  it("keeps every historical workout valid against the exercise registry", () => {
    const knownExerciseIds = exercises.map((exercise) => exercise.id);
    const errors = workouts.flatMap((workout) =>
      validateWorkout(workout, { knownExerciseIds }).errors.map((item) => ({
        workoutId: workout.id,
        ...item,
      })),
    );

    expect(errors).toEqual([]);
  });

  it("reproduces the documented July Smith-bench comparison from seed data", () => {
    const points = getRepProgression(workouts, "smith-flat-bench", 95, {
      machineId: "primary-smith-machine",
    }).filter((point) =>
      ["push-2026-07-14", "push-2026-07-16"].includes(point.workoutId),
    );

    expect(points).toEqual([
      expect.objectContaining({
        workoutId: "push-2026-07-14",
        setReps: [7, 7, 5],
        completedReps: 19,
        completedVolumeLb: 1_805,
      }),
      expect.objectContaining({
        workoutId: "push-2026-07-16",
        setReps: [7, 7, 6],
        completedReps: 20,
        completedVolumeLb: 1_900,
      }),
    ]);
  });
});
