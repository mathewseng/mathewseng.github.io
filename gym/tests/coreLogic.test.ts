import { describe, expect, it } from "vitest";

import {
  calculateCompletedReps,
  calculateVolume,
  calculateWorkoutTotals,
  estimateOneRepMax,
} from "../src/lib/calculations";
import {
  detectPersonalRecords,
  getExercisePersonalRecords,
} from "../src/lib/personalRecords";
import {
  compareExerciseSessions,
  getRepProgression,
  shouldIncreaseLoad,
} from "../src/lib/progression";
import type { ExerciseEntry, ExerciseSet, Workout } from "../src/lib/types";

function set(id: string, values: Partial<ExerciseSet> = {}): ExerciseSet {
  return {
    id,
    completed: true,
    ...values,
  };
}

function exercise(
  exerciseId: string,
  sets: ExerciseSet[],
  values: Partial<ExerciseEntry> = {},
): ExerciseEntry {
  return {
    exerciseId,
    name: exerciseId,
    sets,
    ...values,
  };
}

function workout(
  id: string,
  chronologyIndex: number,
  exercises: ExerciseEntry[],
  date?: string,
): Workout {
  return {
    id,
    chronologyIndex,
    date,
    title: id,
    type: "push",
    exercises,
    dataQuality: "complete",
  };
}

describe("completed repetitions and volume", () => {
  it("reproduces the July 14 and July 16 Smith-bench totals", () => {
    const july14 = [
      set("1", { weightLb: 95, reps: 7 }),
      set("2", { weightLb: 95, reps: 7 }),
      set("3", { weightLb: 95, reps: 5 }),
    ];
    const july16 = [
      set("4", { weightLb: 95, reps: 7 }),
      set("5", { weightLb: 95, reps: 7 }),
      set("6", { weightLb: 95, reps: 6 }),
    ];

    expect(calculateCompletedReps(july14)).toBe(19);
    expect(calculateVolume(july14)).toBe(1_805);
    expect(calculateCompletedReps(july16)).toBe(20);
    expect(calculateVolume(july16)).toBe(1_900);
    expect(compareExerciseSessions(july14, july16)).toMatchObject({
      completedRepChange: 1,
      volumeChangeLb: 95,
      improved: true,
    });
  });

  it("does not count failed attempted repetitions", () => {
    const sets = [
      set("completed", { weightLb: 95, reps: 7 }),
      set("failed", {
        weightLb: 95,
        attemptedReps: 1,
        completed: false,
        failedAttempt: true,
      }),
      set("invalid-combination", {
        weightLb: 135,
        reps: 1,
        completed: true,
        failedAttempt: true,
      }),
    ];

    expect(calculateCompletedReps(sets)).toBe(7);
    expect(calculateVolume(sets)).toBe(665);
  });

  it("preserves per-side weight unless doubling is explicitly selected", () => {
    const perSide = [set("lateral", { weightLb: 7.5, reps: 10, perSide: true })];

    expect(calculateVolume(perSide)).toBe(75);
    expect(calculateVolume(perSide, { perSidePolicy: "double" })).toBe(150);
    expect(calculateVolume(perSide, { multiplyPerSide: true })).toBe(150);
  });

  it("skips missing data instead of plotting or calculating it as zero", () => {
    const incomplete = [
      set("missing-weight", { reps: 10 }),
      set("missing-reps", { weightLb: 75 }),
      set("known", { weightLb: 30, reps: 10 }),
    ];
    const totals = calculateWorkoutTotals(
      workout("incomplete", 0, [exercise("triceps-pushdown", incomplete)]),
    );

    expect(calculateVolume(incomplete)).toBe(300);
    expect(calculateCompletedReps(incomplete)).toBe(20);
    expect(totals).toMatchObject({
      completedReps: 20,
      completedVolumeLb: 300,
      volumeLb: 300,
      calculableSetCount: 1,
      excludedSetCount: 2,
    });
  });
});

describe("estimated one-repetition maximum", () => {
  it("uses Epley and labels unsuitable sets by returning undefined", () => {
    expect(estimateOneRepMax(set("working", { weightLb: 95, reps: 7 }))).toBe(117.2);
    expect(
      estimateOneRepMax(
        set("failed", {
          weightLb: 135,
          completed: false,
          failedAttempt: true,
          attemptedReps: 1,
        }),
      ),
    ).toBeUndefined();
    expect(
      estimateOneRepMax(set("warmup", { weightLb: 25, reps: 10, warmup: true })),
    ).toBeUndefined();
    expect(
      estimateOneRepMax(set("high-rep", { weightLb: 30, reps: 13 })),
    ).toBeUndefined();
    expect(
      estimateOneRepMax(set("disabled", { weightLb: 95, reps: 7 }), {
        enabled: false,
      }),
    ).toBeUndefined();
  });
});

describe("progression", () => {
  const workouts = [
    workout(
      "july-14",
      1,
      [
        exercise("smith-flat-bench", [
          set("a", { weightLb: 95, reps: 7 }),
          set("b", { weightLb: 95, reps: 7 }),
          set("c", { weightLb: 95, reps: 5 }),
        ]),
      ],
      "2026-07-14",
    ),
    workout(
      "july-16",
      2,
      [
        exercise("smith-flat-bench", [
          set("d", { weightLb: 95, reps: 7 }),
          set("e", { weightLb: 95, reps: 7 }),
          set("f", { weightLb: 95, reps: 6 }),
        ]),
      ],
      "2026-07-16",
    ),
  ];

  it("returns rep progression at an exact load", () => {
    expect(getRepProgression(workouts, "smith-flat-bench", 95)).toEqual([
      expect.objectContaining({
        workoutId: "july-14",
        setReps: [7, 7, 5],
        completedReps: 19,
        completedVolumeLb: 1_805,
      }),
      expect.objectContaining({
        workoutId: "july-16",
        setReps: [7, 7, 6],
        completedReps: 20,
        completedVolumeLb: 1_900,
      }),
    ]);
  });

  it("requires a complete rep buffer before increasing load", () => {
    expect(shouldIncreaseLoad([8, 8, 8])).toBe(true);
    expect(shouldIncreaseLoad([8, 8, 7])).toBe(false);
    expect(shouldIncreaseLoad([10, 10], 8, 3)).toBe(false);
  });
});

describe("personal records", () => {
  it("keeps Smith and free-weight barbell records separate", () => {
    const mixed = [
      workout("smith", 1, [
        exercise("bench-press", [set("smith-set", { weightLb: 115, reps: 1 })], {
          equipment: "Smith machine",
          machineId: "smith-a",
        }),
      ]),
      workout("barbell", 2, [
        exercise("bench-press", [set("barbell-set", { weightLb: 95, reps: 5 })], {
          equipment: "Barbell",
        }),
      ]),
    ];

    const records = getExercisePersonalRecords(mixed, "bench-press");
    expect(records).toHaveLength(2);
    expect(
      records.find((record) => record.equipment === "Smith machine")
        ?.heaviestSuccessfulSet?.weightLb,
    ).toBe(115);
    expect(
      records.find((record) => record.equipment === "Barbell")?.heaviestSuccessfulSet
        ?.weightLb,
    ).toBe(95);
    expect(records[0]?.identityKey).not.toBe(records[1]?.identityKey);
  });

  it("detects heaviest, reps-at-weight, session, volume, and pull-up PRs", () => {
    const history = [
      workout("pull-1", 1, [
        exercise("strict-pull-up", [
          set("p1", { reps: 5 }),
          set("p2", { reps: 5 }),
          set("p3", { reps: 3 }),
          set("p4", {
            completed: false,
            failedAttempt: true,
            attemptedReps: 1,
          }),
        ]),
        exercise("lat-pulldown", [
          set("l1", { weightLb: 90, reps: 10 }),
          set("l2", { weightLb: 110, reps: 10 }),
        ]),
      ]),
    ];

    const records = detectPersonalRecords(history);
    const pullUps = records.find((record) => record.exerciseId === "strict-pull-up");
    const pulldown = records.find((record) => record.exerciseId === "lat-pulldown");

    expect(pullUps?.bestSuccessfulSet?.reps).toBe(5);
    expect(pullUps?.bestSessionCompletedReps?.value).toBe(13);
    expect(pulldown?.heaviestSuccessfulSet).toMatchObject({
      weightLb: 110,
      reps: 10,
    });
    expect(pulldown?.highestRepsAtWeight).toEqual(
      expect.arrayContaining([expect.objectContaining({ weightLb: 110, reps: 10 })]),
    );
    expect(pulldown?.bestSessionVolumeLb?.value).toBe(2_000);
  });

  it("keeps an entirely missing session unknown instead of creating a zero PR", () => {
    const records = getExercisePersonalRecords(
      [
        workout("unknown", 1, [
          exercise("triceps-pushdown", [set("missing", { weightLb: 30 })]),
        ]),
      ],
      "triceps-pushdown",
    );

    expect(records[0]?.bestSessionCompletedReps).toBeUndefined();
    expect(records[0]?.bestSessionVolumeLb).toBeUndefined();
  });
});
