import type { ReadinessInput, Scale0To6, WorkoutType } from "./types";

export const WORKOUT_DURATION_OPTIONS = [30, 45, 60, 75, 90] as const;
export type WorkoutDurationMinutes = (typeof WORKOUT_DURATION_OPTIONS)[number];

export type ReadinessLevel = "high" | "moderate" | "low" | "recovery";
export type SuggestedSessionType = WorkoutType | "rest";

export interface ReadinessAssessment {
  score: number;
  level: ReadinessLevel;
  reasons: string[];
  missingSignals: Array<keyof ReadinessInput>;
}

export interface SuggestedExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repRange?: readonly [number, number];
  reps?: number;
  weightLb?: number;
  rirRange: readonly [number, number];
  durationRangeSeconds?: readonly [number, number];
  optional?: boolean;
  alternatives?: string[];
  notes?: string;
}

export interface SuggestionOptions {
  desiredDurationMinutes?: WorkoutDurationMinutes;
  requestedType?: WorkoutType;
}

export interface WorkoutSuggestion {
  sessionType: SuggestedSessionType;
  workoutType?: WorkoutType;
  title: string;
  desiredDurationMinutes: number;
  readiness: ReadinessAssessment;
  volumeMultiplier: number;
  exercises: SuggestedExercise[];
  reasons: string[];
  warnings: string[];
  guardrails: string[];
}

const NEUTRAL_RATING: Scale0To6 = 3;

function rating(input: ReadinessInput, key: keyof ReadinessInput): Scale0To6 {
  const value = input[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6
    ? (value as Scale0To6)
    : NEUTRAL_RATING;
}

function roundedScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateReadiness(input: ReadinessInput): ReadinessAssessment {
  const favorable = [
    { key: "energy" as const, weight: 1.2 },
    { key: "sleepQuality" as const, weight: 1.2 },
    { key: "appetite" as const, weight: 0.35 },
  ];
  const adverse = [
    { key: "soreness" as const, weight: 0.8 },
    { key: "illness" as const, weight: 1.5 },
    { key: "travelImpact" as const, weight: 0.8 },
    { key: "backPain" as const, weight: 1.1 },
    { key: "generalPain" as const, weight: 1.1 },
  ];
  let weightedScore = 0;
  let totalWeight = 0;

  for (const signal of favorable) {
    weightedScore += rating(input, signal.key) * signal.weight;
    totalWeight += signal.weight;
  }
  for (const signal of adverse) {
    weightedScore += (6 - rating(input, signal.key)) * signal.weight;
    totalWeight += signal.weight;
  }

  let score = weightedScore / totalWeight;
  const illness = rating(input, "illness");
  const backPain = rating(input, "backPain");
  const generalPain = rating(input, "generalPain");
  if (illness >= 5) {
    score = Math.min(score, 1);
  }
  if (backPain >= 6 || generalPain >= 6) {
    score = Math.min(score, 0.5);
  }

  const normalizedScore = roundedScore(Math.max(0, Math.min(6, score)));
  const level: ReadinessLevel =
    normalizedScore >= 4.75
      ? "high"
      : normalizedScore >= 3.5
        ? "moderate"
        : normalizedScore >= 2
          ? "low"
          : "recovery";

  const reasons: string[] = [];
  if (rating(input, "energy") <= 2) {
    reasons.push("Energy is below the middle of the 0–6 scale.");
  } else if (rating(input, "energy") >= 5) {
    reasons.push("Energy is high.");
  }
  if (rating(input, "sleepQuality") <= 2) {
    reasons.push("Sleep quality supports a lighter session.");
  }
  if (rating(input, "soreness") >= 4) {
    reasons.push("Soreness is elevated.");
  }
  if (illness >= 2) {
    reasons.push("Illness impact is present.");
  }
  if (rating(input, "travelImpact") >= 3) {
    reasons.push("Travel or the recent return is affecting readiness.");
  }
  if (backPain >= 2) {
    reasons.push("Back symptoms require exercise modifications.");
  }
  if (generalPain >= 3) {
    reasons.push("General pain is elevated.");
  }
  if (reasons.length === 0) {
    reasons.push("Recorded recovery signals are balanced.");
  }

  const numericKeys: Array<keyof ReadinessInput> = [
    "energy",
    "sleepQuality",
    "soreness",
    "appetite",
    "illness",
    "travelImpact",
    "backPain",
    "generalPain",
  ];

  return {
    score: normalizedScore,
    level,
    reasons,
    missingSignals: numericKeys.filter((key) => typeof input[key] !== "number"),
  };
}

export const calculateReadinessScore = (input: ReadinessInput): number =>
  calculateReadiness(input).score;

export function getNextWorkoutType(
  lastWorkoutType: WorkoutType | undefined,
): WorkoutType {
  switch (lastWorkoutType) {
    case "push":
      return "pull";
    case "pull":
      return "legs";
    case "legs":
      return "push";
    case "full-body":
    case "upper":
    case "other":
    case undefined:
      return "push";
  }
}

function exercise(
  exerciseId: string,
  name: string,
  sets: number,
  repRange: readonly [number, number],
  rirRange: readonly [number, number],
  extra: Partial<SuggestedExercise> = {},
): SuggestedExercise {
  return {
    exerciseId,
    name,
    sets,
    repRange,
    rirRange,
    ...extra,
  };
}

function healthyTemplate(type: WorkoutType): SuggestedExercise[] {
  switch (type) {
    case "push":
      return [
        exercise("smith-flat-bench", "Smith-machine flat bench", 3, [6, 8], [1, 3], {
          weightLb: 95,
          notes:
            "Warm up first. Aim for at least 21 completed working repetitions; do not test a maximum.",
        }),
        exercise(
          "smith-incline-bench",
          "Smith-machine incline bench",
          3,
          [8, 10],
          [1, 2],
          { weightLb: 65 },
        ),
        exercise("shoulder-press", "Shoulder press", 3, [8, 12], [1, 3]),
        exercise("triceps-pushdown", "Triceps pushdown", 3, [10, 12], [0, 2], {
          weightLb: 30,
        }),
        exercise("cable-lateral-raise", "Cable lateral raise", 3, [12, 20], [0, 2]),
        exercise(
          "overhead-triceps-extension",
          "Overhead triceps extension",
          2,
          [10, 12],
          [0, 2],
          { weightLb: 15, optional: true },
        ),
      ];
    case "pull":
      return [
        exercise("strict-pull-up", "Strict pull-up", 5, [3, 4], [2, 3], {
          notes:
            "Use submaximal sets and add one total repetition when form stays strict.",
        }),
        exercise("lat-pulldown", "Lat pulldown", 3, [8, 12], [1, 3]),
        exercise("chest-supported-row", "Chest-supported row", 3, [8, 12], [1, 3], {
          alternatives: ["standing-cable-row", "machine-row"],
        }),
        exercise("face-pull", "Rear-delt work", 3, [12, 20], [0, 2], {
          alternatives: ["reverse-cable-fly", "rear-delt-machine"],
        }),
        exercise("incline-curl", "Curl", 3, [8, 15], [0, 2], {
          alternatives: ["spider-curl", "hammer-curl"],
        }),
        {
          exerciseId: "farmers-carry",
          name: "Farmer’s carry",
          sets: 3,
          rirRange: [2, 4],
          durationRangeSeconds: [30, 60],
          optional: true,
        },
      ];
    case "legs":
      return [
        exercise("leg-press", "Leg press", 3, [6, 10], [2, 3], {
          alternatives: ["goblet-squat", "smith-squat"],
        }),
        exercise("split-squat", "Split squat", 3, [8, 12], [2, 3]),
        exercise("hamstring-curl", "Hamstring curl", 3, [8, 15], [1, 3]),
        exercise("leg-extension", "Leg extension", 3, [10, 15], [0, 2]),
        exercise("calf-raise", "Calf raise", 3, [10, 20], [0, 2]),
        exercise("pallof-press", "Core bracing", 2, [8, 12], [3, 4], {
          alternatives: ["plank"],
        }),
      ];
    case "full-body":
    case "upper":
    case "other":
      return recoveryTemplate();
  }
}

function recoveryTemplate(): SuggestedExercise[] {
  return [
    exercise("lat-pulldown", "Lat pulldown", 2, [10, 10], [3, 4]),
    exercise("smith-flat-bench", "Smith-machine flat bench", 2, [8, 8], [3, 4], {
      weightLb: 75,
      alternatives: ["incline-bench-machine"],
    }),
    exercise("leg-press", "Leg press", 2, [10, 10], [3, 4], {
      alternatives: ["goblet-squat"],
    }),
    exercise("standing-cable-row", "Standing cable row", 2, [10, 10], [3, 4]),
    exercise("cable-lateral-raise", "Lateral raise", 2, [12, 15], [3, 4]),
    exercise("triceps-pushdown", "Optional arms", 2, [10, 15], [3, 4], {
      optional: true,
      alternatives: ["incline-curl"],
    }),
  ];
}

function backSafeLegTemplate(): SuggestedExercise[] {
  return [
    exercise("leg-press", "Supported leg press", 2, [8, 12], [3, 4], {
      notes: "Use a comfortable range and stop if the movement reproduces symptoms.",
    }),
    exercise("hamstring-curl", "Seated or lying hamstring curl", 2, [10, 15], [2, 4]),
    exercise("leg-extension", "Leg extension", 2, [10, 15], [2, 4]),
    exercise("calf-raise", "Supported calf raise", 2, [12, 20], [2, 4]),
    exercise("pallof-press", "Gentle core bracing", 2, [8, 10], [4, 5], {
      optional: true,
    }),
  ];
}

function normalizeDuration(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 45;
  }

  return (
    WORKOUT_DURATION_OPTIONS.find((duration) => value <= duration) ??
    WORKOUT_DURATION_OPTIONS.at(-1)!
  );
}

function fitDuration(
  exercises: readonly SuggestedExercise[],
  minutes: number,
): SuggestedExercise[] {
  const limit = minutes <= 30 ? 4 : exercises.length;
  const setCap = minutes <= 30 ? 2 : minutes <= 45 ? 3 : Number.POSITIVE_INFINITY;
  return exercises.slice(0, limit).map((item) => ({
    ...item,
    sets: Math.min(item.sets, setCap),
  }));
}

function value(input: ReadinessInput, key: keyof ReadinessInput): number {
  const candidate = input[key];
  return typeof candidate === "number" ? candidate : 0;
}

export function suggestWorkout(
  input: ReadinessInput,
  options: SuggestionOptions = {},
): WorkoutSuggestion {
  const readiness = calculateReadiness(input);
  const desiredDurationMinutes = normalizeDuration(options.desiredDurationMinutes);
  const warnings: string[] = [];
  const guardrails = [
    "Keep compound work around 1–3 reps in reserve.",
    "Do not plan repeated failed attempts or a one-repetition maximum test.",
    "Stop any exercise that causes sharp or worsening pain.",
  ];

  if (
    value(input, "illness") >= 5 ||
    value(input, "generalPain") >= 6 ||
    value(input, "backPain") >= 6
  ) {
    warnings.push(
      "The recorded illness or pain impact is severe. Skip the workout and seek qualified medical care for concerning or neurological symptoms.",
    );
    return {
      sessionType: "rest",
      title: "Rest and reassess",
      desiredDurationMinutes,
      readiness,
      volumeMultiplier: 0,
      exercises: [],
      reasons: [
        ...readiness.reasons,
        "A severe 0–6 symptom rating triggers the no-training guardrail.",
      ],
      warnings,
      guardrails,
    };
  }

  const nextType = options.requestedType ?? getNextWorkoutType(input.lastWorkoutType);
  const returningAfterGap =
    value(input, "travelImpact") >= 3 || (input.daysSinceLastWorkout ?? 0) >= 7;
  const illnessAdjustment = value(input, "illness") >= 2;
  const needsRecovery =
    readiness.level === "recovery" ||
    readiness.level === "low" ||
    returningAfterGap ||
    illnessAdjustment;

  let workoutType: WorkoutType = needsRecovery ? "full-body" : nextType;
  let exercises = needsRecovery ? recoveryTemplate() : healthyTemplate(workoutType);
  let title = needsRecovery
    ? "Easy full-body recovery session"
    : `${workoutType[0]?.toLocaleUpperCase() ?? ""}${workoutType.slice(1)} workout`;

  if (value(input, "backPain") >= 2 && nextType === "legs") {
    workoutType = "legs";
    title = "Back-modified leg session";
    exercises = backSafeLegTemplate();
    warnings.push(
      "Avoid heavy deadlifts, Romanian deadlifts, unsupported loading, and any movement that reproduces back symptoms.",
    );
  } else if (value(input, "backPain") >= 2) {
    exercises = exercises.filter(
      (item) => item.exerciseId !== "goblet-squat" && item.exerciseId !== "smith-squat",
    );
    warnings.push(
      "Keep movements supported and avoid exercises that reproduce back symptoms.",
    );
  }

  const volumeMultiplier =
    needsRecovery || value(input, "backPain") >= 2
      ? 0.6
      : readiness.level === "moderate"
        ? 0.85
        : 1;
  exercises = fitDuration(exercises, desiredDurationMinutes);

  return {
    sessionType: workoutType,
    workoutType,
    title,
    desiredDurationMinutes,
    readiness,
    volumeMultiplier,
    exercises,
    reasons: [
      ...readiness.reasons,
      ...(returningAfterGap
        ? ["A travel impact or seven-day training gap favors a return session."]
        : []),
      ...(illnessAdjustment ? ["Illness impact reduces both load and volume."] : []),
      `The ${desiredDurationMinutes}-minute duration sets the exercise and set count.`,
    ],
    warnings,
    guardrails,
  };
}

export const generateWorkoutSuggestion = suggestWorkout;
