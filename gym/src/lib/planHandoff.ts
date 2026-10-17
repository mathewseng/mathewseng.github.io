import type { WorkoutType } from "./types";
import type { WorkoutSuggestion } from "./workoutSuggestions";

/**
 * Carries a suggested session into the log form through the hash query string:
 * `#/add?type=legs&duration=45&title=…&exercises=leg-press:3,split-squat:3:40`.
 * Each exercise is `exerciseId:sets[:weightLb]`; reps stay blank because a plan
 * gives a range, and a logged set records what actually happened.
 */
export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  weightLb?: number;
}

export interface PlanHandoff {
  type?: WorkoutType;
  durationMinutes?: number;
  title?: string;
  exercises: PlannedExercise[];
}

const WORKOUT_TYPES: readonly WorkoutType[] = [
  "push",
  "pull",
  "legs",
  "full-body",
  "upper",
  "other",
];
const MAX_SETS = 10;

export function planToSearch(plan: PlanHandoff): string {
  const params = new URLSearchParams();
  if (plan.type) params.set("type", plan.type);
  if (plan.durationMinutes) params.set("duration", String(plan.durationMinutes));
  if (plan.title) params.set("title", plan.title);
  if (plan.exercises.length) {
    params.set(
      "exercises",
      plan.exercises
        .map((item) =>
          [item.exerciseId, item.sets, item.weightLb]
            .filter((part) => part !== undefined)
            .join(":"),
        )
        .join(","),
    );
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The query string for "Start with this plan". */
export function suggestionToSearch(suggestion: WorkoutSuggestion): string {
  return planToSearch({
    type: suggestion.workoutType,
    durationMinutes: suggestion.desiredDurationMinutes,
    title: suggestion.title,
    exercises: suggestion.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      sets: item.sets,
      weightLb: item.weightLb,
    })),
  });
}

function positiveNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Reads a plan from the query string. Unknown types, unknown exercise IDs and
 * malformed numbers are dropped rather than trusted. Returns undefined when the
 * query carries no plan at all.
 */
export function parsePlan(
  params: URLSearchParams,
  knownExerciseIds: ReadonlySet<string>,
): PlanHandoff | undefined {
  const rawType = params.get("type");
  const rawDuration = params.get("duration");
  const rawTitle = params.get("title");
  const rawExercises = params.get("exercises");
  if (!rawType && !rawDuration && !rawTitle && !rawExercises) return undefined;

  const type = WORKOUT_TYPES.find((option) => option === rawType);
  const duration = positiveNumber(rawDuration ?? undefined);
  const exercises: PlannedExercise[] = [];
  for (const token of (rawExercises ?? "").split(",")) {
    const [exerciseId, rawSets, rawWeight] = token.split(":");
    if (!exerciseId || !knownExerciseIds.has(exerciseId)) continue;
    const sets = Math.min(MAX_SETS, Math.round(positiveNumber(rawSets) ?? 1));
    const weightLb = positiveNumber(rawWeight);
    exercises.push({ exerciseId, sets, ...(weightLb ? { weightLb } : {}) });
  }

  return {
    type,
    durationMinutes: duration !== undefined ? Math.round(duration) : undefined,
    title: rawTitle?.trim().slice(0, 120) || undefined,
    exercises,
  };
}
