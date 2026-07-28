import { describe, expect, it } from "vitest";

import {
  exportAllMarkdown,
  nutritionEntriesToMarkdown,
  workoutToMarkdown,
  workoutsToMarkdown,
} from "../src/lib/markdownExport";
import {
  SCHEMA_VERSION,
  STORAGE_KEY,
  addNutritionEntry,
  addWorkout,
  createEmptyAppData,
  deleteWorkout,
  exportDataAsJson,
  importDataFromJson,
  loadAppData,
  migrateAppData,
  saveAppData,
  updateWorkout,
  type StorageLike,
} from "../src/lib/storage";
import type { ExerciseSet, NutritionEntry, Workout } from "../src/lib/types";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function set(id: string, values: Partial<ExerciseSet> = {}): ExerciseSet {
  return { id, completed: true, ...values };
}

function workout(id = "workout-1"): Workout {
  return {
    id,
    date: "2026-07-28",
    chronologyIndex: 1,
    title: "Push after travel",
    type: "push",
    dataQuality: "partial",
    context: {
      energy: 2,
      sleepQuality: 3,
      soreness: 4,
      illness: 2,
      travelImpact: 5,
      backPain: 0,
      generalPain: 1,
    },
    exercises: [
      {
        exerciseId: "smith-flat-bench",
        name: "Smith-machine flat bench",
        equipment: "Smith machine",
        machineId: "smith-a",
        sets: [
          set("warmup", {
            weightLb: 25,
            reps: 10,
            warmup: true,
          }),
          set("working", { weightLb: 95, reps: 5, rir: 2 }),
          set("failed", {
            weightLb: 105,
            attemptedReps: 1,
            completed: false,
            failedAttempt: true,
          }),
          set("unknown-reps", { weightLb: 75 }),
        ],
      },
      {
        exerciseId: "cable-lateral-raise",
        name: "Cable lateral raise",
        sets: [
          set("per-side", {
            weightLb: 10,
            reps: 15,
            perSide: true,
          }),
        ],
      },
    ],
    notes: "Performance is contextual, not a definite regression.",
  };
}

function nutrition(id = "nutrition-1"): NutritionEntry {
  return {
    id,
    date: "2026-07-28",
    bodyWeightLb: 140,
    proteinG: 150,
    creatineG: 15,
    travelImpact: 2,
    illness: 1,
    dataQuality: "complete",
  };
}

describe("versioned local persistence", () => {
  it("saves and loads current schema data", () => {
    const storage = new MemoryStorage();
    const data = createEmptyAppData();
    data.workouts.push(workout());

    saveAppData(data, storage);

    expect(storage.getItem(STORAGE_KEY)).toContain(`"schemaVersion":${SCHEMA_VERSION}`);
    expect(loadAppData(storage).workouts[0]?.id).toBe("workout-1");
  });

  it("supports workout and nutrition CRUD", () => {
    const storage = new MemoryStorage();

    addWorkout(workout(), storage);
    addNutritionEntry(nutrition(), storage);
    expect(loadAppData(storage).workouts).toHaveLength(1);
    expect(loadAppData(storage).nutritionEntries).toHaveLength(1);

    updateWorkout({ ...workout(), title: "Edited push" }, storage);
    expect(loadAppData(storage).workouts[0]?.title).toBe("Edited push");

    deleteWorkout("workout-1", storage);
    expect(loadAppData(storage).workouts).toEqual([]);
  });

  it("exports and restores a validated JSON backup", () => {
    const source = createEmptyAppData();
    source.workouts.push(workout());
    source.nutritionEntries.push(nutrition());
    const json = exportDataAsJson(source);
    const destination = new MemoryStorage();

    expect(JSON.parse(json)).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      workouts: [{ id: "workout-1" }],
      nutritionEntries: [{ id: "nutrition-1" }],
    });
    const restored = importDataFromJson(json, destination);
    expect(restored.workouts[0]?.id).toBe("workout-1");
    expect(loadAppData(destination).nutritionEntries[0]?.proteinG).toBe(150);
  });

  it("migrates version 1 booleans without inventing symptom severity", () => {
    const migrated = migrateAppData({
      schemaVersion: 1,
      workouts: [
        {
          id: "legacy-workout",
          date: "2026-07-01",
          title: "Legacy",
          type: "push",
          dataQuality: "complete",
          context: {
            energy: 4,
            sleep: 2,
            sick: true,
            traveling: false,
            backPain: true,
          },
          exercises: [
            {
              exerciseId: "smith-flat-bench",
              name: "Smith bench",
              sets: [{ id: "legacy-set", weightLb: 95, reps: 5 }],
            },
          ],
        },
      ],
      nutrition: [
        {
          id: "legacy-nutrition",
          date: "2026-07-01",
          sick: false,
          traveling: true,
          dataQuality: "complete",
        },
      ],
      goals: [],
      notes: ["Keep form consistent"],
      settings: {},
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.workouts[0]?.chronologyIndex).toBe(0);
    expect(migrated.workouts[0]?.context).toMatchObject({
      energy: 4,
      sleepQuality: 2,
      travelImpact: 0,
      sourceLabels: [
        "legacy-illness-present-severity-unknown",
        "legacy-backPain-present-severity-unknown",
      ],
    });
    expect(migrated.workouts[0]?.context).not.toHaveProperty("illness");
    expect(migrated.workouts[0]?.context).not.toHaveProperty("backPain");
    expect(migrated.workouts[0]?.context).not.toHaveProperty("sick");
    expect(migrated.nutritionEntries[0]).toMatchObject({
      illness: 0,
      dataQuality: "partial",
    });
    expect(migrated.nutritionEntries[0]).not.toHaveProperty("travelImpact");
    expect(migrated.nutritionEntries[0]?.notes).toMatch(
      /travel flag was present; impact severity was not recorded/i,
    );
    expect(migrated.notes[0]).toMatchObject({
      title: "Migrated note",
      body: "Keep form consistent",
    });
  });

  it("rejects malformed JSON and unsupported future schemas", () => {
    const storage = new MemoryStorage();

    expect(() => importDataFromJson("{", storage)).toThrow(/not valid JSON/);
    expect(() =>
      importDataFromJson(
        JSON.stringify({
          ...createEmptyAppData(),
          schemaVersion: SCHEMA_VERSION + 1,
        }),
        storage,
      ),
    ).toThrow(/Unsupported schema version/);
  });
});

describe("Markdown export", () => {
  it("preserves workout context, failures, missing reps, and per-side policy", () => {
    const markdown = workoutToMarkdown(workout());

    expect(markdown).toContain("## 2026-07-28 — Push after travel");
    expect(markdown).toContain("- Illness impact: 2/6");
    expect(markdown).toContain("- Travel impact: 5/6");
    expect(markdown).toContain("- 105 lb: failed attempt (1 attempted rep)");
    expect(markdown).toContain("- 75 lb: completed, repetitions not recorded");
    expect(markdown).toContain("- 10 lb per side × 15");
    expect(markdown).toContain("_(warm-up)_");
  });

  it("exports full workout and nutrition documents with stable headings", () => {
    const workoutMarkdown = workoutsToMarkdown([workout()]);
    const nutritionMarkdown = nutritionEntriesToMarkdown([nutrition()]);

    expect(workoutMarkdown.startsWith("# Gym Training Log")).toBe(true);
    expect(nutritionMarkdown).toContain("# Nutrition and Supplement Log");
    expect(nutritionMarkdown).toContain("- Creatine: 15 g");
    expect(nutritionMarkdown).toContain("- Travel impact: 2/6");
  });

  it("creates a combined Markdown handoff for committing to GitHub", () => {
    const data = createEmptyAppData();
    data.workouts.push(workout());
    data.nutritionEntries.push(nutrition());
    data.notes.push({
      id: "note-1",
      title: "Machine identity",
      body: "Keep Smith and barbell records separate.",
      createdAt: "2026-07-28",
    });

    const markdown = exportAllMarkdown(data);
    expect(markdown).toContain("# Gym Data Export");
    expect(markdown).toContain("# Workouts");
    expect(markdown).toContain("# Nutrition");
    expect(markdown).toContain("# Local Notes");
    expect(markdown).toContain("Keep Smith and barbell records separate.");
  });
});
