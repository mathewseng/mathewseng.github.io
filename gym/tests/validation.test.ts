import { describe, expect, it } from "vitest";

import { createEmptyAppData } from "../src/lib/storage";
import type { Workout } from "../src/lib/types";
import {
  isScale0To6,
  isValidIsoDate,
  validateAppData,
  validateNutritionEntry,
  validateReadinessInput,
  validateWorkout,
} from "../src/lib/validation";
import { isValidWorkoutStartTime } from "../src/lib/workoutTime";

function validWorkout(): Workout {
  return {
    id: "workout-1",
    date: "2026-07-28",
    startTime: "23:20",
    durationMinutes: 60,
    chronologyIndex: 1,
    title: "Push",
    type: "push",
    dataQuality: "complete",
    context: {
      energy: 0,
      sleepQuality: 6,
      soreness: 0,
      appetite: 6,
      illness: 0,
      travelImpact: 0,
      backPain: 0,
      generalPain: 0,
    },
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-machine flat bench",
        equipment: "Smith machine",
        sets: [
          {
            id: "set-1",
            completed: true,
            weightLb: 95,
            reps: 7,
            rir: 2,
          },
        ],
      },
    ],
  };
}

describe("date and 0–6 rating validation", () => {
  it("accepts real ISO dates and rejects calendar overflow", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("07/28/2026")).toBe(false);
  });

  it("accepts valid local workout times and rejects invalid clock values", () => {
    expect(isValidWorkoutStartTime("00:00")).toBe(true);
    expect(isValidWorkoutStartTime("23:59")).toBe(true);
    expect(isValidWorkoutStartTime("11:20 PM")).toBe(false);
    expect(isValidWorkoutStartTime("24:00")).toBe(false);
  });

  it("accepts both endpoints of the numeric scale and rejects booleans", () => {
    expect(isScale0To6(0)).toBe(true);
    expect(isScale0To6(6)).toBe(true);
    expect(isScale0To6(7)).toBe(false);
    expect(isScale0To6(true)).toBe(false);
  });

  it("accepts canonical numeric workout context", () => {
    expect(validateWorkout(validWorkout())).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  it("rejects legacy booleans in WorkoutContext instead of coercing on entry", () => {
    const raw = validWorkout() as unknown as Record<string, unknown>;
    raw.context = {
      energy: 4,
      sleepQuality: 4,
      soreness: 2,
      illness: true,
      travelImpact: false,
      backPain: true,
      generalPain: 0,
    };

    const validation = validateWorkout(raw);
    expect(validation.valid).toBe(false);
    expect(
      validation.errors.filter((item) => item.code === "invalid-0-to-6-rating"),
    ).toHaveLength(3);
    expect(validation.errors.map((item) => item.path)).toEqual(
      expect.arrayContaining([
        "context.illness",
        "context.travelImpact",
        "context.backPain",
      ]),
    );

    const readiness = validateReadinessInput({
      energy: 4,
      sleepQuality: 4,
      soreness: 2,
      illness: true,
      travelImpact: false,
      backPain: true,
      generalPain: 0,
    });
    expect(readiness.valid).toBe(false);
    expect(
      readiness.errors.filter((item) => item.code === "invalid-0-to-6-rating"),
    ).toHaveLength(3);
  });
});

describe("workout validation", () => {
  it("validates local start time and positive whole-minute duration", () => {
    const raw = validWorkout();
    raw.startTime = "25:10";
    raw.durationMinutes = 0;

    const validation = validateWorkout(raw);
    expect(validation.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["invalid-start-time", "invalid-workout-duration"]),
    );
  });

  it("validates nonnegative load/reps, RIR, duplicate IDs, and impossible failure state", () => {
    const raw = validWorkout();
    raw.exercises[0]!.sets = [
      {
        id: "duplicate",
        completed: true,
        failedAttempt: true,
        weightLb: -5,
        reps: -1,
        rir: 7 as never,
      },
      {
        id: "duplicate",
        completed: true,
        weightLb: 95,
        reps: 5,
      },
    ];
    const result = validateWorkout(raw);

    expect(result.valid).toBe(false);
    expect(result.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "invalid-nonnegative-number",
        "invalid-0-to-6-rating",
        "duplicate-id",
        "completed-and-failed",
      ]),
    );
  });

  it("rejects unknown exercises while preserving explicit ambiguous registry IDs", () => {
    const unknown = validWorkout();
    unknown.exercises[0]!.exerciseId = "made-up-machine";
    expect(validateWorkout(unknown).errors.map((item) => item.code)).toContain(
      "unknown-exercise-id",
    );

    const ambiguous = validWorkout();
    ambiguous.exercises[0]!.exerciseId = "lateral-raise-unspecified";
    expect(validateWorkout(ambiguous).valid).toBe(true);
  });

  it("warns for missing dates/data and per-side values without inventing them", () => {
    const partial = validWorkout();
    partial.date = undefined;
    partial.exercises[0]!.sets = [
      {
        id: "partial",
        completed: true,
        perSide: true,
      },
    ];
    const result = validateWorkout(partial);

    expect(result.valid).toBe(true);
    expect(result.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["missing-date", "missing-reps", "per-side-missing-weight"]),
    );
  });
});

describe("nutrition and import validation", () => {
  it("uses a non-blocking review notice at 15 g and rejects implausible values", () => {
    const review = validateNutritionEntry({
      id: "nutrition-review",
      date: "2026-07-28",
      creatineG: 15,
      illness: 0,
      travelImpact: 0,
      dataQuality: "complete",
    });
    expect(review.valid).toBe(true);
    expect(review.warnings.map((item) => item.code)).toContain("creatine-dose-review");

    const implausible = validateNutritionEntry({
      id: "nutrition-error",
      date: "2026-07-28",
      creatineG: 101,
      dataQuality: "complete",
    });
    expect(implausible.valid).toBe(false);
    expect(implausible.errors.map((item) => item.code)).toContain(
      "implausibly-high-supplement-value",
    );
  });

  it("rejects duplicate IDs and schema mismatches in imports", () => {
    const data = createEmptyAppData();
    data.workouts.push(validWorkout());
    data.nutritionEntries.push({
      id: "workout-1",
      date: "2026-07-28",
      dataQuality: "complete",
    });

    const duplicate = validateAppData(data);
    expect(duplicate.valid).toBe(false);
    expect(duplicate.errors.map((item) => item.code)).toContain("duplicate-id");

    const wrongVersion = validateAppData({
      ...createEmptyAppData(),
      schemaVersion: 99,
    });
    expect(wrongVersion.errors.map((item) => item.code)).toContain(
      "unsupported-schema-version",
    );
  });
});
