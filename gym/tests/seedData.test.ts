import { describe, expect, it } from "vitest";

import { currentBenchmarks } from "../src/data/benchmarks";
import { exercises } from "../src/data/exercises";
import { benchGoal } from "../src/data/goals";
import { nutritionEntries } from "../src/data/nutrition";
import { profile } from "../src/data/profile";
import { workouts, workoutsNewestFirst } from "../src/data/workouts";
import { calculateWorkoutTotals } from "../src/lib/calculations";
import { getRepProgression } from "../src/lib/progression";
import type { Workout } from "../src/lib/types";
import { validateNutritionEntry, validateWorkout } from "../src/lib/validation";

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

  it("records the post-Barcelona body weight without inferring a trend", () => {
    expect(profile).toMatchObject({
      bodyWeightLb: 150,
      bodyWeightApproximate: false,
    });
    expect(nutritionEntries).toEqual([
      expect.objectContaining({
        id: "nutrition-2026-09-02-body-weight",
        date: "2026-09-02",
        bodyWeightLb: 150,
        dataQuality: "partial",
      }),
    ]);
    expect(
      nutritionEntries.flatMap((entry) => validateNutritionEntry(entry).errors),
    ).toEqual([]);
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
      value: 30,
      workoutId: "push-2026-08-31",
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
      value: 135,
      workoutId: "legs-2026-09-03",
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
      workoutId: "push-2026-08-31",
    });
  });

  it("preserves the August 31 travel-return workout, time, and progress", () => {
    const workout = workouts.find((item) => item.id === "push-2026-08-31");
    const benchProgress = getRepProgression(workouts, "smith-flat-bench", 95, {
      machineId: "primary-smith-machine",
    }).find((point) => point.workoutId === "push-2026-08-31");
    const incline = workout?.exercises.find(
      (entry) => entry.exerciseId === "smith-incline-bench",
    );
    const pushdown = workout?.exercises.find(
      (entry) => entry.exerciseId === "triceps-pushdown",
    );
    const overhead = workout?.exercises.find(
      (entry) => entry.exerciseId === "overhead-triceps-extension",
    );

    expect(workout).toMatchObject({
      date: "2026-08-31",
      startTime: "23:20",
      durationMinutes: 60,
      type: "push",
      chronologyIndex: 13,
      dataQuality: "partial",
      context: {
        sourceLabels: expect.arrayContaining([
          "returned-from-two-week-work-travel",
          "barcelona-travel",
        ]),
      },
    });
    expect(workout?.context).not.toHaveProperty("travelImpact");
    expect(benchProgress).toMatchObject({
      setReps: [7, 7, 9],
      completedReps: 23,
      completedVolumeLb: 2_185,
    });
    expect(incline?.sets.map((set) => set.reps)).toEqual([8, 8, 9]);
    expect(pushdown?.sets.map((set) => set.reps)).toEqual([8, 10, 8]);
    expect(overhead?.sets.map((set) => set.reps)).toEqual([9, 10, 8]);
    expect(overhead?.dataQuality).toBe("ambiguous");
  });

  it("preserves the September 1 pull workout and cable ambiguity", () => {
    const workout = workouts.find((item) => item.id === "pull-2026-09-01");
    const pullUps = workout?.exercises.find(
      (entry) => entry.exerciseId === "strict-pull-up",
    );
    const straightArmPulldown = workout?.exercises.find(
      (entry) => entry.exerciseId === "straight-arm-cable-pulldown",
    );
    const abCrunch = workout?.exercises.find(
      (entry) => entry.exerciseId === "cable-ab-crunch",
    );
    const cableCurl = workout?.exercises.find(
      (entry) => entry.exerciseId === "cable-biceps-curl",
    );
    const reverseFly = workout?.exercises.find(
      (entry) => entry.exerciseId === "reverse-cable-fly",
    );
    const spiderCurl = workout?.exercises.find(
      (entry) => entry.exerciseId === "spider-curl",
    );
    const abCrunchBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "cable-ab-crunch-top-set",
    );

    expect(workout).toMatchObject({
      date: "2026-09-01",
      startTime: "23:20",
      durationMinutes: 75,
      type: "pull",
      chronologyIndex: 14,
      dataQuality: "partial",
      context: {
        sourceLabels: expect.arrayContaining([
          "post-barcelona-travel",
          "second-consecutive-training-day",
        ]),
      },
    });
    expect(workout?.context).not.toHaveProperty("travelImpact");
    expect(pullUps?.sets.map((set) => set.reps)).toEqual([5, 4, 3]);
    expect(straightArmPulldown?.sets).toEqual([
      expect.objectContaining({ weightLb: 30, reps: 10 }),
      expect.objectContaining({ weightLb: 35, reps: 10 }),
      expect.objectContaining({ weightLb: 40, reps: 10 }),
    ]);
    expect(abCrunch?.sets.at(-1)).toMatchObject({ weightLb: 80, reps: 10 });
    expect(cableCurl?.sets.map((set) => set.reps)).toEqual([10, 10, 10]);
    expect(reverseFly?.sets.every((set) => set.perSide === undefined)).toBe(true);
    expect(reverseFly?.dataQuality).toBe("ambiguous");
    expect(spiderCurl?.sets).toEqual([
      expect.objectContaining({ weightLb: 20, reps: 10 }),
    ]);
    expect(calculateWorkoutTotals(workout!)).toMatchObject({
      completedReps: 212,
      completedVolumeLb: 5_350,
      calculableSetCount: 19,
      excludedSetCount: 3,
    });
    expect(abCrunchBenchmark).toMatchObject({
      value: 80,
      workoutId: "pull-2026-09-01",
    });
  });

  it("records the September 3 short leg workout and separate sauna recovery", () => {
    const workout = workouts.find((item) => item.id === "legs-2026-09-03");
    const squat = workout?.exercises.find((entry) => entry.exerciseId === "smith-squat");
    const rdl = workout?.exercises.find(
      (entry) => entry.exerciseId === "romanian-deadlift",
    );
    const squatProgress = getRepProgression(workouts, "smith-squat", 135, {
      machineId: "primary-smith-machine",
    }).find((point) => point.workoutId === "legs-2026-09-03");
    const squatBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "smith-squat-baseline",
    );
    const rdlBenchmark = currentBenchmarks.find(
      (benchmark) => benchmark.id === "smith-rdl-working-baseline",
    );

    expect(workout).toMatchObject({
      date: "2026-09-03",
      startTime: "23:15",
      durationMinutes: 25,
      type: "legs",
      chronologyIndex: 15,
      dataQuality: "partial",
      context: {
        sourceLabels: expect.arrayContaining([
          "short-leg-session",
          "post-workout-dry-sauna",
        ]),
      },
    });
    expect(workout?.context).not.toHaveProperty("backPain");
    expect(squat?.sets).toEqual([
      expect.objectContaining({ weightLb: 25, reps: 10, warmup: true }),
      expect.objectContaining({ weightLb: 115, reps: 10 }),
      expect.objectContaining({ weightLb: 135, reps: 8 }),
      expect.objectContaining({ weightLb: 135, reps: 6 }),
    ]);
    expect(rdl?.sets).toEqual([
      expect.objectContaining({ weightLb: 25, reps: 10, warmup: true }),
      expect.objectContaining({ weightLb: 75, reps: 10 }),
      expect.objectContaining({ weightLb: 75, reps: 10 }),
      expect.objectContaining({ weightLb: 75, reps: 10 }),
    ]);
    expect(squatProgress).toMatchObject({
      setReps: [8, 6],
      completedReps: 14,
      completedVolumeLb: 1_890,
    });
    expect(calculateWorkoutTotals(workout!)).toMatchObject({
      completedReps: 74,
      completedVolumeLb: 5_790,
      calculableSetCount: 8,
      excludedSetCount: 0,
    });
    expect(squatBenchmark).toMatchObject({
      value: 135,
      workoutId: "legs-2026-09-03",
    });
    expect(rdlBenchmark).toMatchObject({
      value: 75,
      workoutId: "legs-2026-09-03",
    });
    expect(workoutsNewestFirst[0]?.id).toBe("legs-2026-09-03");
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
