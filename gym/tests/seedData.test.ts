import { describe, expect, it } from "vitest";

import { currentBenchmarks } from "../src/data/benchmarks";
import { exercises } from "../src/data/exercises";
import { benchGoal } from "../src/data/goals";
import { workouts, workoutsNewestFirst } from "../src/data/workouts";
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

  it("preserves the completed July 28 pull workout and its uncertainty", () => {
    const workout = workouts.find((item) => item.id === "pull-2026-07-28");
    const reverseFly = workout?.exercises.find(
      (entry) => entry.exerciseId === "reverse-cable-fly",
    );
    const cableRow = workout?.exercises.find(
      (entry) => entry.exerciseId === "standing-cable-row",
    );
    const rdl = workout?.exercises.find(
      (entry) => entry.exerciseId === "romanian-deadlift",
    );
    const pulldownBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "lat-pulldown-top-set",
    );

    expect(workout).toMatchObject({
      chronologyIndex: 9,
      date: "2026-07-28",
      type: "pull",
      dataQuality: "partial",
      context: { backPain: 0 },
    });
    expect(reverseFly?.dataQuality).toBe("ambiguous");
    expect(cableRow?.sets.every((set) => "perSide" in set && set.perSide === true)).toBe(
      true,
    );
    expect(rdl?.sets).toEqual([
      expect.objectContaining({
        weightLb: 25,
        reps: 100,
        dataQuality: "estimated",
      }),
    ]);
    expect(workoutsNewestFirst[0]?.id).toBe("pull-2026-07-28");
    expect(pulldownBenchmark).toMatchObject({
      value: 130,
      workoutId: "pull-2026-07-28",
    });
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
