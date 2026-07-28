import { programTemplateById, programTemplates } from "./program";

/**
 * Static templates used by the explainable suggestion engine. The engine may
 * choose among them, but it must always show the matching reason to the user.
 */
export const suggestedWorkoutTemplates = programTemplates;

export const suggestionRules = {
  rotation: {
    push: "pull",
    pull: "legs",
    legs: "push",
    "full-body": "push",
    upper: "legs",
    other: "push",
  },
  lowReadiness: {
    energyAtOrBelow: 2,
    sleepQualityAtOrBelow: 2,
    sorenessAtOrAbove: 4,
    illnessAtOrAbove: 2,
    travelImpactAtOrAbove: 4,
    generalPainAtOrAbove: 4,
    templateId: "easy-full-body",
    pushTemplateId: "low-readiness-push",
  },
  backSymptoms: {
    backPainAtOrAbove: 2,
    templateId: "back-active-legs",
  },
  guardrails: [
    "Do not recommend one-repetition maximum testing by default.",
    "Do not recommend repeated failed attempts.",
    "Lower intensity and volume for illness, poor sleep, significant soreness, or recent travel.",
    "Do not suggest training through sharp pain.",
    "Avoid back-loading movements when back pain is active.",
    "Show the user why a template was selected and allow an override.",
  ],
} as const;

export const defaultSuggestedWorkout =
  programTemplateById.get("easy-full-body") ?? programTemplates[0];
