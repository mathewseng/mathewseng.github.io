import type { NutritionEntry, NutritionObservation, Scale0To6 } from "../lib/types";

export const nutritionEntries: NutritionEntry[] = [
  {
    id: "nutrition-2026-09-02-body-weight",
    date: "2026-09-02",
    bodyWeightLb: 150,
    notes:
      "Current body weight reported after returning from the Barcelona work trip. Weigh-in time and conditions were not supplied, so this is one observation rather than a trend.",
    dataQuality: "partial",
  },
];

export const nutritionObservations: NutritionObservation[] = [
  {
    id: "body-weight",
    title: "Current reported body weight",
    value: 150,
    unit: "lb",
    status: "reported",
    notes: "Reported at 150 lb on September 2, 2026, after the Barcelona work trip.",
    dataQuality: "complete",
  },
  {
    id: "nutrition-objective",
    title: "Primary nutrition objective",
    status: "reported",
    notes: "Support muscle growth, strength, recovery, and consistent training.",
    dataQuality: "complete",
  },
  {
    id: "calorie-intake",
    title: "Daily calorie intake",
    status: "unknown",
    notes: "Exact daily calories are not yet recorded.",
    dataQuality: "partial",
  },
  {
    id: "protein-intake",
    title: "Daily protein intake",
    status: "unknown",
    notes: "Exact daily protein intake is not yet recorded.",
    dataQuality: "partial",
  },
  {
    id: "water-intake",
    title: "Daily water intake",
    status: "unknown",
    notes: "Exact daily water intake is not yet recorded.",
    dataQuality: "partial",
  },
  {
    id: "creatine-reported-dose",
    title: "Reported creatine intake",
    valueRange: [15, 20],
    unit: "g/day",
    status: "reported",
    notes:
      "Personal observation only, not a recommendation. The date this dose began, creatine type, and whether doses are divided are unknown.",
    dataQuality: "estimated",
  },
  {
    id: "creatine-travel-pause",
    title: "Creatine pause during travel",
    value: 10,
    unit: "approximately days",
    status: "paused",
    notes:
      "No creatine was taken during the approximately 10-day travel period. Exact dates were not supplied, so no dated entries are fabricated.",
    dataQuality: "estimated",
  },
];

export const creatineNotice = {
  title: "High-dose context",
  reportedDose: "15–20 g/day",
  message:
    "The reported 15–20 g/day resembles commonly studied short loading protocols. Common research protocols use approximately 20 g/day, often divided, for about 5–7 days, followed by approximately 3–5 g/day for maintenance. This is general background, not personalized dosing advice.",
  safety:
    "Do not assume prolonged high-dose use is appropriate. Consider discussing it with a qualified clinician, particularly when kidney disease, relevant medications, dehydration risk, or other medical concerns may be present.",
  guardrails: [
    "Treat supplement entries as personal observations, not medical recommendations.",
    "Do not diagnose or provide personalized dosing.",
    "Do not claim supplements replace adequate food, sleep, or training.",
    "Do not claim the travel pause caused a workout result.",
    "Show paused days neutrally, without labeling them as failures.",
    "Only calculate adherence against a target the user explicitly chooses.",
  ],
} as const;

export const nutritionScaleFields: ReadonlyArray<{
  key: "appetite" | "mealQuality" | "illness" | "travelImpact";
  label: string;
  lowLabel: string;
  highLabel: string;
  defaultValue?: Scale0To6;
}> = [
  {
    key: "appetite",
    label: "Appetite",
    lowLabel: "Very low",
    highLabel: "Very high",
  },
  {
    key: "mealQuality",
    label: "Meal quality",
    lowLabel: "Poor",
    highLabel: "Excellent",
  },
  {
    key: "illness",
    label: "Illness impact",
    lowLabel: "None",
    highLabel: "Severe",
  },
  {
    key: "travelImpact",
    label: "Travel impact",
    lowLabel: "None",
    highLabel: "Severe",
  },
];
