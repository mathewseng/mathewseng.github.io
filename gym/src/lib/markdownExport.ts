import type { PersistedGymData } from "./storage";
import type {
  ExerciseEntry,
  ExerciseSet,
  NutritionEntry,
  Workout,
  WorkoutContext,
} from "./types";
import { formatWorkoutStartTime } from "./workoutTime";

export interface MarkdownExportOptions {
  includeDataQuality?: boolean;
  title?: string;
}

function inline(value: string): string {
  return value.replace(/\r?\n+/g, " ").trim();
}

function weightLabel(set: ExerciseSet): string | undefined {
  if (set.weightLb === undefined) {
    return undefined;
  }
  return `${set.weightLb} lb${set.perSide === true ? " per side" : ""}`;
}

function setMarkers(set: ExerciseSet): string[] {
  const markers: string[] = [];
  if (set.warmup === true) {
    markers.push("warm-up");
  }
  if (set.rampUp === true) {
    markers.push("ramp-up");
  }
  if (set.technicalFailure === true) {
    markers.push("technical failure");
  }
  if (set.dataQuality && set.dataQuality !== "complete") {
    markers.push(set.dataQuality);
  }
  return markers;
}

export function exerciseSetToMarkdown(set: ExerciseSet): string {
  const weight = weightLabel(set);
  let description: string;

  if (set.failedAttempt === true) {
    const attempts =
      set.attemptedReps === undefined
        ? ""
        : ` (${set.attemptedReps} attempted ${set.attemptedReps === 1 ? "rep" : "reps"})`;
    description = `${weight ?? "Unknown load"}: failed attempt${attempts}`;
  } else if (set.completed === true && set.reps !== undefined) {
    description = weight
      ? `${weight} × ${set.reps}`
      : `${set.reps} completed ${set.reps === 1 ? "rep" : "reps"}`;
  } else if (set.completed === true) {
    description = `${weight ?? "Unknown load"}: completed, repetitions not recorded`;
  } else {
    description = `${weight ?? "Unknown load"}: incomplete set`;
  }

  if (set.durationSeconds !== undefined) {
    description += ` · ${set.durationSeconds} sec`;
  }
  if (set.distanceFeet !== undefined) {
    description += ` · ${set.distanceFeet} ft`;
  }
  if (set.rir !== undefined) {
    description += ` · ${set.rir} RIR`;
  } else if (set.rirRange !== undefined) {
    description += ` · ${set.rirRange[0]}–${set.rirRange[1]} RIR`;
  }

  const markers = setMarkers(set);
  if (markers.length > 0) {
    description += ` _(${markers.join(", ")})_`;
  }
  if (set.notes) {
    description += ` — ${inline(set.notes)}`;
  }
  return `- ${description}`;
}

export function exerciseEntryToMarkdown(entry: ExerciseEntry): string {
  const identity = [
    entry.equipment,
    entry.machineId ? `machine: ${entry.machineId}` : undefined,
  ].filter((value): value is string => Boolean(value));
  const lines = [
    `### ${inline(entry.name)}`,
    ...(identity.length > 0 ? [`_${identity.join(" · ")}_`, ""] : []),
    ...(entry.sets.length > 0
      ? entry.sets.map(exerciseSetToMarkdown)
      : ["- No sets recorded"]),
  ];
  if (entry.notes) {
    lines.push("", `Notes: ${inline(entry.notes)}`);
  }
  if (entry.dataQuality && entry.dataQuality !== "complete") {
    lines.push(`Data quality: ${entry.dataQuality}`);
  }
  return lines.join("\n");
}

const CONTEXT_LABELS: ReadonlyArray<readonly [keyof WorkoutContext, string]> = [
  ["energy", "Energy"],
  ["sleepQuality", "Sleep quality"],
  ["soreness", "Soreness"],
  ["appetite", "Appetite"],
  ["illness", "Illness impact"],
  ["travelImpact", "Travel impact"],
  ["backPain", "Back pain"],
  ["generalPain", "General pain"],
];

function contextToMarkdown(context: WorkoutContext): string[] {
  const ratings = CONTEXT_LABELS.flatMap(([key, label]) => {
    const value = context[key];
    return typeof value === "number" ? [`- ${label}: ${value}/6`] : [];
  });
  if (context.daysSinceLastWorkout !== undefined) {
    ratings.push(`- Days since last workout: ${context.daysSinceLastWorkout}`);
  }
  if (context.notes) {
    ratings.push(`- Notes: ${inline(context.notes)}`);
  }
  return ratings.length > 0 ? ["### Context", ...ratings, ""] : [];
}

export function workoutToMarkdown(
  workout: Workout,
  options: MarkdownExportOptions = {},
): string {
  const date = workout.date ?? "Date unknown";
  const lines = [
    `## ${date} — ${inline(workout.title)}`,
    "",
    `- Type: ${workout.type}`,
    `- Start time: ${
      workout.startTime ? formatWorkoutStartTime(workout.startTime) : "not recorded"
    }`,
    ...(workout.durationMinutes === undefined
      ? []
      : [`- Duration: ${workout.durationMinutes} minutes`]),
    ...(options.includeDataQuality === false
      ? []
      : [`- Data quality: ${workout.dataQuality}`]),
    "",
    ...(workout.context ? contextToMarkdown(workout.context) : []),
    ...workout.exercises.flatMap((entry, index) => [
      exerciseEntryToMarkdown(entry),
      ...(index < workout.exercises.length - 1 ? [""] : []),
    ]),
  ];
  if (workout.notes) {
    lines.push("", `Workout notes: ${inline(workout.notes)}`);
  }
  return lines.join("\n").trimEnd();
}

export function workoutsToMarkdown(
  workouts: readonly Workout[],
  options: MarkdownExportOptions = {},
): string {
  const title = options.title ?? "Gym Training Log";
  const ordered = [...workouts].sort(
    (left, right) => left.chronologyIndex - right.chronologyIndex,
  );
  return [
    `# ${inline(title)}`,
    "",
    ...(ordered.length > 0
      ? ordered.flatMap((workout, index) => [
          workoutToMarkdown(workout, options),
          ...(index < ordered.length - 1 ? ["", "---", ""] : []),
        ])
      : ["_No workout entries recorded._"]),
  ].join("\n");
}

function nutritionValue(
  label: string,
  value: number | undefined,
  unit: string,
): string[] {
  return value === undefined ? [] : [`- ${label}: ${value}${unit}`];
}

export function nutritionEntryToMarkdown(
  entry: NutritionEntry,
  options: MarkdownExportOptions = {},
): string {
  const lines = [
    `## ${entry.date}`,
    "",
    ...nutritionValue("Morning body weight", entry.bodyWeightLb, " lb"),
    ...nutritionValue("Calories", entry.calories, " kcal"),
    ...nutritionValue("Protein", entry.proteinG, " g"),
    ...nutritionValue("Carbohydrates", entry.carbsG, " g"),
    ...nutritionValue("Fat", entry.fatG, " g"),
    ...nutritionValue("Fiber", entry.fiberG, " g"),
    ...nutritionValue("Water", entry.waterOz, " oz"),
    ...nutritionValue("Creatine", entry.creatineG, " g"),
    ...nutritionValue("Appetite", entry.appetite, "/6"),
    ...nutritionValue("Meal quality", entry.mealQuality, "/6"),
    ...nutritionValue("Illness impact", entry.illness, "/6"),
    ...nutritionValue("Travel impact", entry.travelImpact, "/6"),
  ];
  if (entry.otherSupplements && entry.otherSupplements.length > 0) {
    lines.push("", "### Other supplements");
    for (const supplement of entry.otherSupplements) {
      const dose =
        supplement.dose === undefined
          ? ""
          : ` — ${supplement.dose}${supplement.unit ? ` ${supplement.unit}` : ""}`;
      lines.push(`- ${inline(supplement.name)}${dose}`);
    }
  }
  if (entry.notes) {
    lines.push("", `Notes: ${inline(entry.notes)}`);
  }
  if (options.includeDataQuality !== false) {
    lines.push("", `Data quality: ${entry.dataQuality}`);
  }
  return lines.join("\n").trimEnd();
}

export function nutritionEntriesToMarkdown(
  entries: readonly NutritionEntry[],
  options: MarkdownExportOptions = {},
): string {
  const title = options.title ?? "Nutrition and Supplement Log";
  const ordered = [...entries].sort((left, right) => left.date.localeCompare(right.date));
  return [
    `# ${inline(title)}`,
    "",
    ...(ordered.length > 0
      ? ordered.flatMap((entry, index) => [
          nutritionEntryToMarkdown(entry, options),
          ...(index < ordered.length - 1 ? ["", "---", ""] : []),
        ])
      : ["_No nutrition entries recorded._"]),
  ].join("\n");
}

export function exportAllMarkdown(data: PersistedGymData): string {
  const sections = [
    "# Gym Data Export",
    "",
    workoutsToMarkdown(data.workouts, { title: "Workouts" }),
    "",
    "---",
    "",
    nutritionEntriesToMarkdown(data.nutritionEntries, {
      title: "Nutrition",
    }),
  ];
  if (data.notes.length > 0) {
    sections.push("", "---", "", "# Local Notes", "");
    for (const note of data.notes) {
      sections.push(`## ${inline(note.title)}`, "", note.body.trim(), "");
    }
  }
  return sections.join("\n").trimEnd();
}

export async function copyMarkdownToClipboard(markdown: string): Promise<void> {
  if (!globalThis.navigator?.clipboard) {
    throw new Error("Clipboard access is not available in this browser.");
  }
  await globalThis.navigator.clipboard.writeText(markdown);
}
