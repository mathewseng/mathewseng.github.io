import { describe, expect, it } from "vitest";

import {
  calculateReadiness,
  getNextWorkoutType,
  suggestWorkout,
  WORKOUT_DURATION_OPTIONS,
} from "../src/lib/workoutSuggestions";
import type { ReadinessInput } from "../src/lib/types";

const healthy: ReadinessInput = {
  energy: 6,
  sleepQuality: 6,
  soreness: 0,
  appetite: 6,
  illness: 0,
  travelImpact: 0,
  backPain: 0,
  generalPain: 0,
  daysSinceLastWorkout: 2,
  lastWorkoutType: "push",
};

describe("numeric readiness", () => {
  it("scores a fully recovered 0–6 check-in deterministically", () => {
    expect(calculateReadiness(healthy)).toEqual({
      score: 6,
      level: "high",
      reasons: ["Energy is high."],
      missingSignals: [],
    });
    expect(calculateReadiness(healthy)).toEqual(calculateReadiness({ ...healthy }));
  });

  it("treats missing data as neutral and reports exactly what is missing", () => {
    const assessment = calculateReadiness({
      energy: 4,
      sleepQuality: 4,
    });

    expect(assessment.score).toBeGreaterThanOrEqual(0);
    expect(assessment.score).toBeLessThanOrEqual(6);
    expect(assessment.missingSignals).toContain("illness");
    expect(assessment.missingSignals).toContain("backPain");
  });

  it("rotates Push → Pull → Legs without assuming weekdays", () => {
    expect(getNextWorkoutType("push")).toBe("pull");
    expect(getNextWorkoutType("pull")).toBe("legs");
    expect(getNextWorkoutType("legs")).toBe("push");
    expect(getNextWorkoutType(undefined)).toBe("push");
  });
});

describe("readiness-based suggestions", () => {
  it("returns the next healthy PPL session with transparent guardrails", () => {
    const suggestion = suggestWorkout(healthy, {
      desiredDurationMinutes: 60,
    });

    expect(suggestion.sessionType).toBe("pull");
    expect(suggestion.workoutType).toBe("pull");
    expect(suggestion.volumeMultiplier).toBe(1);
    expect(suggestion.exercises[0]).toMatchObject({
      exerciseId: "strict-pull-up",
      sets: 5,
    });
    expect(suggestion.guardrails.join(" ")).toMatch(
      /Do not plan repeated failed attempts or a one-repetition maximum test/,
    );
  });

  it("reduces volume for low energy, poor sleep, soreness, and mild illness", () => {
    const suggestion = suggestWorkout({
      ...healthy,
      energy: 1,
      sleepQuality: 1,
      soreness: 5,
      illness: 2,
      lastWorkoutType: "legs",
    });

    expect(suggestion.sessionType).toBe("full-body");
    expect(suggestion.volumeMultiplier).toBe(0.6);
    expect(suggestion.exercises.every((item) => item.sets <= 3)).toBe(true);
    expect(suggestion.reasons.join(" ")).toMatch(/Illness impact reduces/);
  });

  it("uses an easy return session after travel or a long gap", () => {
    const suggestion = suggestWorkout({
      ...healthy,
      travelImpact: 4,
      daysSinceLastWorkout: 10,
    });

    expect(suggestion.title).toBe("Easy full-body recovery session");
    expect(suggestion.sessionType).toBe("full-body");
    expect(suggestion.reasons.join(" ")).toMatch(/seven-day training gap/);
    expect(suggestion.exercises[0]?.rirRange).toEqual([3, 4]);
  });

  it("modifies a leg day around active back symptoms", () => {
    const suggestion = suggestWorkout({
      ...healthy,
      backPain: 4,
      lastWorkoutType: "pull",
    });
    const exerciseIds = suggestion.exercises.map((item) => item.exerciseId);

    expect(suggestion.sessionType).toBe("legs");
    expect(suggestion.title).toBe("Back-modified leg session");
    expect(exerciseIds).toContain("leg-press");
    expect(exerciseIds).not.toContain("romanian-deadlift");
    expect(exerciseIds).not.toContain("smith-squat");
    expect(suggestion.warnings.join(" ")).toMatch(/deadlifts/);
  });

  it("does not suggest training through severe illness or pain", () => {
    const suggestion = suggestWorkout({
      ...healthy,
      illness: 5,
    });

    expect(suggestion.sessionType).toBe("rest");
    expect(suggestion.exercises).toEqual([]);
    expect(suggestion.volumeMultiplier).toBe(0);
    expect(suggestion.warnings.join(" ")).toMatch(/Skip the workout/);
  });

  it("offers 30–90 minute sessions in 15-minute increments", () => {
    expect(WORKOUT_DURATION_OPTIONS).toEqual([30, 45, 60, 75, 90]);
  });

  it("fits 30-minute sessions by trimming exercises and sets", () => {
    const suggestion = suggestWorkout(healthy, {
      desiredDurationMinutes: 30,
    });

    expect(suggestion.desiredDurationMinutes).toBe(30);
    expect(suggestion.exercises).toHaveLength(4);
    expect(suggestion.exercises.every((item) => item.sets <= 2)).toBe(true);
  });

  it("preserves longer 75- and 90-minute selections", () => {
    expect(
      suggestWorkout(healthy, { desiredDurationMinutes: 75 }).desiredDurationMinutes,
    ).toBe(75);
    expect(
      suggestWorkout(healthy, { desiredDurationMinutes: 90 }).desiredDurationMinutes,
    ).toBe(90);
  });
});
