import { describe, expect, it } from "vitest";

import { currentBenchmarks } from "../src/data/benchmarks";
import { exercises } from "../src/data/exercises";
import { benchGoal } from "../src/data/goals";
import { workouts, workoutsNewestFirst } from "../src/data/workouts";
import { getRepProgression } from "../src/lib/progression";
import type { Workout } from "../src/lib/types";
import { validateWorkout } from "../src/lib/validation";

const workoutLogModules = import.meta.glob<Workout>("../logs/workouts/*.json", {
  eager: true,
  import: "default",
});

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

  it("stores exactly one workout in each matching JSON log file", () => {
    const fileEntries = Object.entries(workoutLogModules);
    const fileWorkoutIds = fileEntries.map(([, workout]) => workout.id).sort();
    const loadedWorkoutIds = workouts.map((workout) => workout.id).sort();

    expect(fileEntries).toHaveLength(workouts.length);
    expect(fileWorkoutIds).toEqual(loadedWorkoutIds);

    for (const [path, workout] of fileEntries) {
      expect(Array.isArray(workout)).toBe(false);
      expect(path.endsWith(`/${workout.id}.json`)).toBe(true);
    }
  });

  it("places the corrected push workout on July 27", () => {
    expect(workouts.find((workout) => workout.id === "push-2026-07-27")).toMatchObject({
      date: "2026-07-27",
      type: "push",
    });
    expect(workouts.some((workout) => workout.id === "push-2026-07-28")).toBe(false);
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
    expect(pulldownBenchmark).toMatchObject({
      value: 130,
      workoutId: "pull-2026-07-28",
    });
  });

  it("preserves the August 3 push results and failed eighth bench rep", () => {
    const workout = workouts.find((item) => item.id === "push-2026-08-03");
    const benchProgress = getRepProgression(workouts, "smith-flat-bench", 95, {
      machineId: "primary-smith-machine",
    }).find((point) => point.workoutId === "push-2026-08-03");
    const bench = workout?.exercises.find(
      (entry) => entry.exerciseId === "smith-flat-bench",
    );
    const incline = workout?.exercises.find(
      (entry) => entry.exerciseId === "smith-incline-bench",
    );
    const overheadBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "overhead-triceps-reference",
    );

    expect(workout).toMatchObject({
      date: "2026-08-03",
      type: "push",
      chronologyIndex: 10,
      dataQuality: "partial",
      context: {
        energy: 3,
        sleepQuality: 2,
        soreness: 0,
        illness: 0,
        backPain: 1,
      },
    });
    expect(benchProgress).toMatchObject({
      setReps: [7, 7, 7],
      completedReps: 21,
      completedVolumeLb: 1_995,
    });
    expect(bench?.sets.filter((set) => set.failedAttempt)).toEqual([
      expect.objectContaining({
        weightLb: 95,
        attemptedReps: 1,
        completed: false,
      }),
    ]);
    expect(incline?.sets.map((set) => set.reps)).toEqual([8, 8, 8]);
    expect(overheadBenchmark).toMatchObject({
      value: 25,
      workoutId: "push-2026-08-03",
    });
  });

  it("preserves the August 10 lower-body baselines and per-hand loads", () => {
    const workout = workouts.find((item) => item.id === "legs-2026-08-10");
    const squatProgress = getRepProgression(workouts, "smith-squat", 115, {
      machineId: "primary-smith-machine",
    }).find((point) => point.workoutId === "legs-2026-08-10");
    const legPressProgress = getRepProgression(workouts, "leg-press", 140).find(
      (point) => point.workoutId === "legs-2026-08-10",
    );
    const calfRaise = workout?.exercises.find(
      (entry) => entry.exerciseId === "calf-raise",
    );
    const overheadPress = workout?.exercises.find(
      (entry) => entry.exerciseId === "shoulder-press",
    );
    const squatBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "smith-squat-baseline",
    );
    const legPressBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "leg-press-baseline",
    );

    expect(workout).toMatchObject({
      date: "2026-08-10",
      type: "legs",
      chronologyIndex: 11,
      dataQuality: "partial",
    });
    expect(workout?.context).toBeUndefined();
    expect(squatProgress).toMatchObject({
      setReps: [10, 10, 10],
      completedReps: 30,
      completedVolumeLb: 3_450,
    });
    expect(legPressProgress).toMatchObject({
      setReps: [10, 10, 10],
      completedReps: 30,
      completedVolumeLb: 4_200,
    });
    expect(calfRaise?.sets.slice(1).every((set) => set.perSide === true)).toBe(true);
    expect(overheadPress).toMatchObject({
      equipment: "Dumbbells",
      sets: [
        expect.objectContaining({ weightLb: 20, reps: 10, perSide: true }),
        expect.objectContaining({ weightLb: 20, reps: 10, perSide: true }),
        expect.objectContaining({ weightLb: 20, reps: 10, perSide: true }),
      ],
    });
    expect(squatBenchmark).toMatchObject({
      value: 115,
      workoutId: "legs-2026-08-10",
    });
    expect(legPressBenchmark).toMatchObject({
      value: 140,
      workoutId: "legs-2026-08-10",
    });
  });

  it("preserves the August 12 push progress and cable uncertainty", () => {
    const workout = workouts.find((item) => item.id === "push-2026-08-12");
    const benchProgress = getRepProgression(workouts, "smith-flat-bench", 95, {
      machineId: "primary-smith-machine",
    }).find((point) => point.workoutId === "push-2026-08-12");
    const incline = workout?.exercises.find(
      (entry) => entry.exerciseId === "smith-incline-bench",
    );
    const highCablePress = workout?.exercises.find(
      (entry) => entry.exerciseId === "high-cable-chest-press",
    );
    const lateralRaise = workout?.exercises.find(
      (entry) => entry.exerciseId === "cable-lateral-raise",
    );
    const benchBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "flat-bench-95-volume",
    );

    expect(workout).toMatchObject({
      date: "2026-08-12",
      type: "push",
      chronologyIndex: 12,
      dataQuality: "partial",
    });
    expect(workout?.context).toBeUndefined();
    expect(benchProgress).toMatchObject({
      setReps: [8, 7, 8],
      completedReps: 23,
      completedVolumeLb: 2_185,
    });
    expect(incline?.sets.map((set) => set.reps)).toEqual([9, 8, 8]);
    expect(highCablePress?.sets).toEqual([
      expect.objectContaining({ weightLb: 20, reps: 20 }),
      expect.objectContaining({ weightLb: 25, reps: 12 }),
      expect.objectContaining({ weightLb: 25, reps: 10 }),
    ]);
    expect(highCablePress?.dataQuality).toBe("ambiguous");
    expect(lateralRaise?.sets.every((set) => set.perSide === undefined)).toBe(true);
    expect(benchBenchmark).toMatchObject({
      value: 2_185,
      workoutId: "push-2026-08-12",
    });
    expect(workoutsNewestFirst[0]?.id).toBe("push-2026-08-12");
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
