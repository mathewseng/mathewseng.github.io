import { describe, expect, it } from "vitest";

import { parsePlan, planToSearch } from "../src/lib/planHandoff";

const known = new Set(["leg-press", "split-squat", "strict-pull-up"]);

describe("suggested plan hand-off", () => {
  it("round-trips type, duration, title and exercises through the query string", () => {
    const search = planToSearch({
      type: "legs",
      durationMinutes: 45,
      title: "Back-modified leg session",
      exercises: [
        { exerciseId: "leg-press", sets: 2, weightLb: 140 },
        { exerciseId: "split-squat", sets: 3 },
      ],
    });
    expect(search.startsWith("?")).toBe(true);
    expect(parsePlan(new URLSearchParams(search), known)).toEqual({
      type: "legs",
      durationMinutes: 45,
      title: "Back-modified leg session",
      exercises: [
        { exerciseId: "leg-press", sets: 2, weightLb: 140 },
        { exerciseId: "split-squat", sets: 3 },
      ],
    });
  });

  it("returns undefined when the query carries no plan", () => {
    expect(parsePlan(new URLSearchParams("?date=2026-07-28"), known)).toBeUndefined();
  });

  it("drops unknown types, unknown exercises and malformed numbers", () => {
    const plan = parsePlan(
      new URLSearchParams(
        "?type=cardio&duration=-5&exercises=leg-press:99,made-up:3,strict-pull-up:abc:-1",
      ),
      known,
    );
    expect(plan).toEqual({
      type: undefined,
      durationMinutes: undefined,
      title: undefined,
      exercises: [
        { exerciseId: "leg-press", sets: 10 },
        { exerciseId: "strict-pull-up", sets: 1 },
      ],
    });
  });
});
